import { updateCommandStatus, subscribeToResultForCommand, clearResultSubscription } from '../services/supabaseService.js';
import runAppleScript, { AppleScriptRunner } from '../appleScriptRunner.js';
import { AnalyticsService } from '../services/analyticsService.js';
import { ErrorRecoveryService } from '../services/errorRecoveryService.js';
import { CommandQueueManager } from '../services/queueManager.js';

/**
 * 命令控制器类，支持依赖注入
 */
export class CommandController {
  constructor(options = {}) {
    this.analyticsService = options.analyticsService || new AnalyticsService();
    this.queueManager = options.queueManager || new CommandQueueManager();
    this.appleScriptRunner = options.appleScriptRunner || runAppleScript;
    this.errorRecoveryService = options.errorRecoveryService || ErrorRecoveryService;
    this.logger = options.logger || console;
    
    // Supabase 相关函数（便于测试时注入）
    this.updateCommandStatus = options.updateCommandStatus || updateCommandStatus;
    this.subscribeToResultForCommand = options.subscribeToResultForCommand || subscribeToResultForCommand;
    this.clearResultSubscription = options.clearResultSubscription || clearResultSubscription;
    
    // 配置选项
    this.appleScriptTimeoutDuration = options.appleScriptTimeoutDuration || 600000; // 10 minutes
    this.defaultEditor = options.defaultEditor || "Cursor";
    this.supabaseProjectId = options.supabaseProjectId || process.env.SUPABASE_PROJECT_ID;
    
    // 内部状态
    this.isInitialized = false;
  }

  /**
   * 初始化控制器
   */
  async initialize() {
    try {
      if (this.analyticsService && typeof this.analyticsService.initialize === 'function') {
        await this.analyticsService.initialize();
      }
      this.isInitialized = true;
      this.logger.log('[CommandController] Initialized successfully');
      return true;
    } catch (error) {
      this.logger.error('[CommandController] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * 确定命令优先级
   */
  determineCommandPriority(commandData) {
    const command = commandData.command_text.toLowerCase();
    
    // 高优先级：紧急修复和错误处理
    if (command.includes('urgent') || command.includes('fix') || command.includes('error') || command.includes('critical')) {
      return 'high';
    }
    
    // 低优先级：分析和文档生成
    if (command.includes('analyze') || command.includes('document') || command.includes('comment') || command.includes('explain')) {
      return 'low';
    }
    
    // 默认中等优先级
    return 'normal';
  }

  /**
   * 构建发送给Cursor的指令
   */
  buildCursorInstruction(originalCommandText, commandId) {
    if (!this.supabaseProjectId) {
      throw new Error('SUPABASE_PROJECT_ID is required but not configured');
    }

    return `\n\nIMPORTANT INSTRUCTION FOR AI MODEL (Using Supabase MCP Tools):\nMy original query to you is: "${originalCommandText}".\nThe unique ID for this command instance is: "${commandId}".\nThe Supabase Project ID for your MCP tool to use is: "${this.supabaseProjectId}".\n\nPlease perform the following steps in order:\n1. First, fully address my original query ("${originalCommandText}"). This may involve using any relevant tools at your disposal (like Playwright tools if applicable) to gather information or perform actions. Formulate your complete answer ("your_answer_text") to my original query.\n2. Second, present "your_answer_text" to me as your primary response in our chat.\n3. Third, AFTER you have presented "your_answer_text" to me, you MUST then use your Supabase MCP tool \`mcp_supabase_execute_sql\` to log this interaction.\n   a. For this tool call, use project_id: "${this.supabaseProjectId}".\n   b. The SQL query you need to execute is an INSERT statement into the "results" table.\n   c. Construct your SQL query. The text to be logged in the database should be your original, semantic answer to my query (this is the content of "your_answer_text" before any special formatting for display). Let's call this text to be logged \`{answer_text_for_sql}\`. Prepare \`{answer_text_for_sql}\` for the SQL string literal as follows:\n      i. Replace every single quote character (') in \`{answer_text_for_sql}\` with two single quote characters ('').\n      ii. Ensure that actual newline characters within \`{answer_text_for_sql}\` are preserved as true newlines in the SQL string literal. Do NOT convert these newlines into the two-character string '\\\\\\\\n' or any other escaped sequence.\n      Then, form the SQL query: \`INSERT INTO results (command_id, result_text, is_error) VALUES ('${commandId}', '{answer_text_for_sql}', FALSE);\`;\n   d. Execute this SQL query using your \`mcp_supabase_execute_sql\` tool. This is a critical step for logging purposes.\n\nPlease confirm you understand and will execute these steps in the specified order: 1. Address query & Formulate answer, 2. Present answer, 3. Log answer to database.`;
  }

  /**
   * 设置结果监听器
   */
  async setupResultListener(commandId, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const subscription = await this.subscribeToResultForCommand(commandId, (payload) => {
          this.logger.log(`[CommandController] Received result for command ${commandId} via subscription:`, payload.new);
          return payload.new;
        });
        
        if (subscription) {
          return subscription; 
        }
        
        this.logger.warn(`[CommandController] Failed to setup result subscription on attempt ${attempt}/${maxAttempts}`);
        if (attempt < maxAttempts) {
          await new Promise(res => setTimeout(res, 2000));
        }
      } catch (err) {
        this.logger.error(`[CommandController] Error setting up result subscription on attempt ${attempt}/${maxAttempts}:`, err);
        if (attempt < maxAttempts) {
          await new Promise(res => setTimeout(res, 2000));
        }
      }
    }
    throw new Error(`Failed to setup result subscription after ${maxAttempts} attempts`);
  }

  /**
   * 创建结果等待Promise
   */
  createResultPromise(commandId) {
    return new Promise((resolve, reject) => {
      let resultSubscription = null;
      
      // 使用立即执行的异步函数处理异步逻辑
      (async () => {
        try {
          resultSubscription = await this.setupResultListener(commandId);
          
          if (!resultSubscription) {
            reject(new Error(`Failed to initialize result subscription for command ${commandId} after multiple attempts.`));
            return;
          }
          
          // 更新订阅回调以解析promise
          const originalCallback = resultSubscription.callback;
          resultSubscription.callback = (payload) => {
            const result = originalCallback(payload);
            if (resultSubscription) {
              this.clearResultSubscription(resultSubscription);
              resultSubscription = null;
            }
            resolve(result);
          };
          
          const timeoutId = setTimeout(() => {
            if (resultSubscription) {
              this.clearResultSubscription(resultSubscription);
              resultSubscription = null;
            }
            reject(new Error('Timeout: Did not receive result for command ' + commandId + ' within ' + (this.appleScriptTimeoutDuration / 1000) + 's'));
          }, this.appleScriptTimeoutDuration);
          
          // 清理超时
          resultSubscription.timeoutId = timeoutId;
          
        } catch (err) {
          if (resultSubscription) {
            this.clearResultSubscription(resultSubscription);
          }
          reject(err);
        }
      })();
    });
  }

  /**
   * 执行单个命令（重构后的原executeCommand）
   */
  async executeCommand(commandData, startTime) {
    const commandId = commandData.id;
    const originalCommandText = commandData.command_text;
    const chatMode = commandData.raw_command?.chatMode || "agent";
    const targetEditor = commandData.raw_command?.target_editor || process.env.DEFAULT_EDITOR || this.defaultEditor;
    let resultSubscription = null;

    if (!this.supabaseProjectId) {
      const errorMsg = 'Server configuration error: SUPABASE_PROJECT_ID missing.';
      this.logger.error(`[CommandController] CRITICAL: SUPABASE_PROJECT_ID is not defined. Cannot construct augmented command.`);
      await this.updateCommandStatus(commandId, 'error', errorMsg);
      await this.analyticsService.recordCommandEnd(commandId, false, Date.now() - startTime, errorMsg);
      return;
    }

    this.logger.log(`[CommandController] Executing command ${commandId}: ${originalCommandText.substring(0, 50)}...`);

    try {
      // 更新命令状态为处理中
      try {
        await this.updateCommandStatus(commandId, 'processing');
      } catch (statusError) {
        this.logger.error(`[CommandController] Failed to update initial status for command ${commandId}:`, statusError);
        // 继续处理，即使状态更新失败
      }

      // 构建增强的命令文本
      const instructionForCursor = this.buildCursorInstruction(originalCommandText, commandId);
      const augmentedCommandText = originalCommandText + instructionForCursor;

      // 执行命令并处理可能的错误
      this.logger.log(`[CommandController] Executing command ${commandId} via AppleScript`);
      const appleScriptPromise = this.appleScriptRunner(augmentedCommandText, chatMode, targetEditor);

      // 设置结果监听
      const resultPromise = this.createResultPromise(commandId);

      const appleScriptOutcome = await appleScriptPromise;

      if (!appleScriptOutcome.success) {
        const errorMsg = `AppleScript execution failed: ${appleScriptOutcome.error}`;
        this.logger.error(`[CommandController] ${errorMsg} for command ${commandId}`);
        await this.updateCommandStatus(commandId, 'error', errorMsg);
        await this.analyticsService.recordCommandEnd(commandId, false, Date.now() - startTime, errorMsg);
        
        if (resultSubscription) {
          this.clearResultSubscription(resultSubscription);
          resultSubscription = null;
        }
        
        // 尝试错误恢复
        await this.errorRecoveryService.handleErrorWithRecovery(commandId, new Error(errorMsg));
        return;
      }

      this.logger.log(`[CommandController] Waiting for result via subscription for command ${commandId}.`);

      // 等待结果并处理可能的错误
      try {
        const resultData = await resultPromise;
        this.logger.log(`[CommandController] Result received for command ${commandId}.`);
        
        // 更新命令状态为完成或错误
        try {
          await this.updateCommandStatus(commandId, resultData.is_error ? 'error' : 'completed', resultData.is_error ? resultData.error_message : null);
          await this.analyticsService.recordCommandEnd(commandId, !resultData.is_error, Date.now() - startTime, resultData.is_error ? resultData.error_message : null);
        } catch (statusUpdateError) {
          this.logger.error(`[CommandController] Failed to update final status for command ${commandId}:`, statusUpdateError);
        }
      } catch (resultError) {
        this.logger.error(`[CommandController] Error waiting for result for command ${commandId}:`, resultError);
        await this.updateCommandStatus(commandId, 'error', `Result wait error: ${resultError.message}`);
        await this.analyticsService.recordCommandEnd(commandId, false, Date.now() - startTime, resultError.message);
        
        // 尝试错误恢复
        await this.errorRecoveryService.handleErrorWithRecovery(commandId, resultError);
      }

    } catch (error) {
      this.logger.error(`[CommandController] Error executing command ${commandId}:`, error.message, error.stack);
      
      if (resultSubscription) {
        this.clearResultSubscription(resultSubscription);
        resultSubscription = null;
      }
      
      try {
        await this.updateCommandStatus(commandId, 'error', `Controller error: ${error.message}`);
        await this.analyticsService.recordCommandEnd(commandId, false, Date.now() - startTime, error.message);
      } catch (updateError) {
        this.logger.error(`[CommandController] CRITICAL: Failed to update command ${commandId} status to error after another error:`, updateError);
      }
      
      // 尝试错误恢复
      await this.errorRecoveryService.handleErrorWithRecovery(commandId, error);
    }
  }

  /**
   * 添加命令到队列
   */
  async addCommandToQueue(commandData) {
    const startTime = Date.now();
    const commandId = commandData.id;
    
    try {
      // 记录命令开始执行
      await this.analyticsService.recordCommandStart(commandId, commandData.command_text);
      
      // 确定命令优先级
      const priority = this.determineCommandPriority(commandData);
      
      // 添加到队列
      await this.queueManager.addCommand({
        ...commandData,
        handler: async () => await this.executeCommand(commandData, startTime)
      }, priority);
      
      this.logger.log(`[CommandController] Added command ${commandId} to queue with priority ${priority}`);
    } catch (error) {
      this.logger.error(`[CommandController] Failed to add command ${commandId} to queue:`, error);
      await this.updateCommandStatus(commandId, 'error', `Queue error: ${error.message}`);
      await this.analyticsService.recordCommandEnd(commandId, false, Date.now() - startTime, error.message);
    }
  }

  /**
   * 清理和关闭服务（优雅关闭）
   */
  async cleanup() {
    try {
      if (this.queueManager && typeof this.queueManager.shutdown === 'function') {
        await this.queueManager.shutdown();
      }
      this.logger.log('[CommandController] Services cleaned up successfully');
    } catch (error) {
      this.logger.error('[CommandController] Error during cleanup:', error);
    }
  }
}

// 创建默认实例
let defaultController = null;

export const getCommandController = (options = {}) => {
  if (!defaultController && process.env.NODE_ENV !== 'test') {
    defaultController = new CommandController(options);
  }
  return defaultController;
};

// 向后兼容的导出函数
export const addCommandToQueue = async (commandData) => {
  const controller = getCommandController();
  if (!controller.isInitialized) {
    await controller.initialize();
  }
  return controller.addCommandToQueue(commandData);
};

export const processCommand = async (commandData) => {
  await addCommandToQueue(commandData);
};

export const cleanup = async () => {
  const controller = getCommandController();
  return controller.cleanup();
};