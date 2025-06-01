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
    this.supabaseClient = options.supabaseClient || null; // 用于轮询备用机制
    this.connectionManager = options.connectionManager || null; // 连接管理器
    
    // 配置选项
    this.appleScriptTimeoutDuration = options.appleScriptTimeoutDuration || 600000; // 10 minutes
    this.defaultEditor = options.defaultEditor || "Cursor";
    this.supabaseProjectId = options.supabaseProjectId || process.env.SUPABASE_PROJECT_ID;
    
    // 内部状态
    this.isInitialized = false;
    
    // 测试友好的依赖项
    this.timer = options.timer || {
      setTimeout: setTimeout.bind(global),
      clearTimeout: clearTimeout.bind(global)
    };
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
  async setupResultListener(commandId, callback, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const subscription = await this.subscribeToResultForCommand(commandId, callback);
        
        if (subscription) {
          return subscription; 
        }
        
        this.logger.warn(`[CommandController] Failed to setup result subscription on attempt ${attempt}/${maxAttempts}`);
        if (attempt < maxAttempts) {
          await new Promise(res => this.timer.setTimeout(res, 2000));
        }
      } catch (err) {
        this.logger.error(`[CommandController] Error setting up result subscription on attempt ${attempt}/${maxAttempts}:`, err);
        if (attempt < maxAttempts) {
          await new Promise(res => this.timer.setTimeout(res, 2000));
        }
      }
    }
    throw new Error(`Failed to setup result subscription after ${maxAttempts} attempts`);
  }

  /**
   * 轮询检查命令结果（备用机制）
   */
  async pollForResult(commandId, maxAttempts = 120, intervalMs = 5000) {
    this.logger.log(`[CommandController] Starting polling for command ${commandId} (${maxAttempts} attempts, ${intervalMs}ms interval)`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // 直接查询results表
        const client = this.connectionManager?.getClient() || await this.getSupabaseClient();
        if (!client) {
          this.logger.warn(`[CommandController] No Supabase client available for polling attempt ${attempt}/${maxAttempts}`);
          await new Promise(res => this.timer.setTimeout(res, intervalMs));
          continue;
        }

        const { data, error } = await client
          .from('results')
          .select('*')
          .eq('command_id', commandId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          this.logger.error(`[CommandController] Error polling for result ${commandId} (attempt ${attempt}/${maxAttempts}):`, error);
        } else if (data && data.length > 0) {
          this.logger.log(`[CommandController] Found result for command ${commandId} via polling on attempt ${attempt}:`, data[0]);
          return data[0];
        }

        // 每10次尝试记录一次进度
        if (attempt % 10 === 0) {
          this.logger.log(`[CommandController] Polling progress for command ${commandId}: ${attempt}/${maxAttempts} attempts completed`);
        }

        // 等待下一次轮询
        if (attempt < maxAttempts) {
          await new Promise(res => this.timer.setTimeout(res, intervalMs));
        }
      } catch (err) {
        this.logger.error(`[CommandController] Exception during polling for command ${commandId} (attempt ${attempt}/${maxAttempts}):`, err);
        if (attempt < maxAttempts) {
          await new Promise(res => this.timer.setTimeout(res, intervalMs));
        }
      }
    }
    
    // 在抛出错误前，尝试检查命令状态
    try {
      const client = this.connectionManager?.getClient() || await this.getSupabaseClient();
      if (client) {
        const { data: commandData, error: commandError } = await client
          .from('commands')
          .select('status, last_error')
          .eq('id', commandId)
          .single();
        
        if (!commandError && commandData) {
          this.logger.warn(`[CommandController] Command ${commandId} status: ${commandData.status}, last_error: ${commandData.last_error || 'none'}`);
        }
      }
    } catch (statusCheckError) {
      this.logger.warn(`[CommandController] Failed to check command status for ${commandId}:`, statusCheckError);
    }
    
    throw new Error(`Polling timeout: No result found for command ${commandId} after ${maxAttempts} attempts (${(maxAttempts * intervalMs) / 1000}s total)`);
  }

  /**
   * 获取Supabase客户端（用于轮询）
   */
  async getSupabaseClient() {
    // 尝试从注入的服务获取客户端
    if (this.supabaseClient) {
      return this.supabaseClient;
    }
    
    // 尝试从默认服务获取
    try {
      const { supabaseService } = await import('../services/supabaseService.js');
      return supabaseService?.getClient();
    } catch (error) {
      this.logger.error('[CommandController] Failed to get Supabase client:', error);
      return null;
    }
  }

  /**
   * 创建结果等待Promise（增强版，包含轮询备用机制）
   */
  createResultPromise(commandId) {
    return new Promise((resolve, reject) => {
      let resultSubscription = null;
      let timeoutId = null;
      let pollTimeoutId = null;
      let isResolved = false;
      
      // 定义清理函数
      const cleanup = () => {
        if (resultSubscription) {
          this.clearResultSubscription(resultSubscription);
          resultSubscription = null;
        }
        if (timeoutId) {
          this.timer.clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (pollTimeoutId) {
          this.timer.clearTimeout(pollTimeoutId);
          pollTimeoutId = null;
        }
      };
      
      // 定义解析函数（防止重复解析）
      const safeResolve = (result) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          resolve(result);
        }
      };
      
      // 定义拒绝函数（防止重复拒绝）
      const safeReject = (error) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(error);
        }
      };
      
      // 定义订阅回调函数
      const subscriptionCallback = (payload) => {
        this.logger.log(`[CommandController] Received result for command ${commandId} via subscription:`, payload.new);
        safeResolve(payload.new);
      };
      
      // 启动轮询备用机制（延迟启动，给订阅一些时间）
      const startPollingBackup = () => {
        pollTimeoutId = this.timer.setTimeout(async () => {
          if (isResolved) return;
          
          this.logger.log(`[CommandController] Starting polling backup for command ${commandId} (subscription may be slow)`);
          try {
            // 使用更长的轮询时间，因为任务可能需要更长时间完成
            const result = await this.pollForResult(commandId, 60, 5000); // 5分钟轮询
            safeResolve(result);
          } catch (pollError) {
            this.logger.warn(`[CommandController] Polling backup failed for command ${commandId}:`, pollError.message);
            this.logger.warn(`[CommandController] This may indicate the command is taking longer than expected or failed to execute`);
            // 不要因为轮询失败就拒绝Promise，让主超时处理
          }
        }, 60000); // 60秒后启动轮询备用（给订阅更多时间）
      };
      
      // 使用立即执行的异步函数处理异步逻辑
      (async () => {
        try {
          resultSubscription = await this.setupResultListener(commandId, subscriptionCallback);
          
          if (!resultSubscription) {
            // 如果订阅失败，立即启动轮询
            this.logger.warn(`[CommandController] Subscription failed for command ${commandId}, starting polling immediately`);
            try {
              // 使用更长的轮询时间，因为没有订阅作为备份
              const result = await this.pollForResult(commandId, 120, 5000); // 10分钟轮询
              safeResolve(result);
              return;
            } catch (pollError) {
              this.logger.error(`[CommandController] Both subscription and polling failed for command ${commandId}`);
              this.logger.error(`[CommandController] This may indicate a serious connectivity issue or the command failed to execute`);
              safeReject(new Error(`Failed to initialize result subscription and polling for command ${commandId}: ${pollError.message}`));
              return;
            }
          }
          
          // 启动轮询备用机制
          startPollingBackup();
          
          // 设置主超时
          timeoutId = this.timer.setTimeout(() => {
            safeReject(new Error(`Timeout: Did not receive result for command ${commandId} within ${this.appleScriptTimeoutDuration / 1000}s`));
          }, this.appleScriptTimeoutDuration);
          
        } catch (err) {
          safeReject(err);
        }
      })();
    });
  }

  /**
   * 执行单个命令（重构后的原executeCommand）
   */
  async executeCommand(commandData, startTime = Date.now()) {
    const commandId = commandData.id;
    const originalCommandText = commandData.command_text;
    const chatMode = commandData.raw_command?.chatMode || "agent";
    const targetEditor = commandData.raw_command?.target_editor || process.env.DEFAULT_EDITOR || this.defaultEditor;
    let resultSubscription = null;

    if (!this.supabaseProjectId) {
      const errorMsg = 'Server configuration error: SUPABASE_PROJECT_ID missing.';
      this.logger.error('[CommandController] CRITICAL: SUPABASE_PROJECT_ID is not defined. Cannot construct augmented command.');
      await this.updateCommandStatus(commandId, 'error', errorMsg);
      await this.analyticsService.recordCommandEnd(commandId, false, Date.now() - startTime, errorMsg);
      return;
    }

    this.logger.log(`[CommandController] Executing command ${commandId}: ${originalCommandText.substring(0, 50)}...`);

    try {
      // 首先检查命令是否仍然存在于数据库中
      try {
        const client = this.connectionManager?.getClient() || await this.getSupabaseClient();
        if (client) {
          const { data: commandExists, error: checkError } = await client
            .from('commands')
            .select('id, status')
            .eq('id', commandId)
            .single();

          if (checkError || !commandExists) {
            this.logger.warn(`[CommandController] Command ${commandId} no longer exists in database, skipping execution`);
            return; // 静默跳过，不记录错误
          }

          // 检查命令状态，如果已经完成或出错，则跳过
          if (commandExists.status === 'completed' || commandExists.status === 'error') {
            this.logger.warn(`[CommandController] Command ${commandId} already in final state (${commandExists.status}), skipping execution`);
            return;
          }
        }
      } catch (existenceCheckError) {
        this.logger.warn(`[CommandController] Failed to check command existence for ${commandId}:`, existenceCheckError.message);
        // 继续执行，因为这可能只是网络问题
      }

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
      
      // 为命令添加处理器函数
      const commandWithHandler = {
        ...commandData,
        handler: () => this.executeCommand(commandData, startTime)
      };
      
      // 添加到队列
      const result = await this.queueManager.addCommand(commandWithHandler, priority);
      
      if (result) {
        this.logger.log(`[CommandController] Command ${commandId} added to queue with priority ${priority}`);
        return true;
      }
      
      this.logger.error(`[CommandController] Failed to add command ${commandId} to queue`);
      return false;
    } catch (error) {
      this.logger.error(`[CommandController] Error adding command ${commandId} to queue:`, error);
      await this.updateCommandStatus(commandId, 'error', `Queue error: ${error.message}`);
      await this.analyticsService.recordCommandEnd(commandId, false, Date.now() - startTime, error.message);
      return false;
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
      this.logger.log('[CommandController] Cleanup completed');
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