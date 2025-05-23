import { updateCommandStatus, subscribeToResultForCommand, clearResultSubscription } from '../services/supabaseService.js';
import runAppleScript from '../appleScriptRunner.js';
import { AnalyticsService } from '../services/analyticsService.js';
import { ErrorRecoveryService } from '../services/errorRecoveryService.js';
import { CommandQueueManager } from '../services/queueManager.js';

const appleScriptTimeoutDuration = 600000; // 10 minutes for AppleScript/Cursor to respond

// 初始化服务实例
const analyticsService = new AnalyticsService();
const errorRecoveryService = new ErrorRecoveryService();
const queueManager = new CommandQueueManager();

// 添加命令到队列的入口函数
export const addCommandToQueue = async (commandData) => {
  const startTime = Date.now();
  const commandId = commandData.id;
  
  try {
    // 记录命令开始执行
    await analyticsService.recordCommandStart(commandId, commandData.command_text);
    
    // 确定命令优先级
    const priority = determineCommandPriority(commandData);
    
    // 添加到队列
    await queueManager.addCommand({
      ...commandData,
      priority,
      handler: async () => await executeCommand(commandData, startTime)
    });
    
    console.log(`[CommandController] Added command ${commandId} to queue with priority ${priority}`);
  } catch (error) {
    console.error(`[CommandController] Failed to add command ${commandId} to queue:`, error);
    await updateCommandStatus(commandId, 'error', `Queue error: ${error.message}`);
    await analyticsService.recordCommandEnd(commandId, false, Date.now() - startTime, error.message);
  }
};

// 确定命令优先级的辅助函数
const determineCommandPriority = (commandData) => {
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
  return 'medium';
};

// 实际执行命令的函数（重构后的原processCommand）
const executeCommand = async (commandData, startTime) => {
  const commandId = commandData.id;
  const originalCommandText = commandData.command_text;
  const chatMode = commandData.raw_command?.chatMode || "agent";
  const targetEditor = commandData.raw_command?.target_editor || process.env.DEFAULT_EDITOR || "Cursor";
  const supabaseProjectId = process.env.SUPABASE_PROJECT_ID;
  let resultSubscription = null;

  if (!supabaseProjectId) {
    const errorMsg = 'Server configuration error: SUPABASE_PROJECT_ID missing.';
    console.error(`[CommandController] CRITICAL: SUPABASE_PROJECT_ID is not defined. Cannot construct augmented command.`);
    await updateCommandStatus(commandId, 'error', errorMsg);
    await analyticsService.recordCommandEnd(commandId, false, Date.now() - startTime, errorMsg);
    return;
  }

  console.log(`[CommandController] Executing command ${commandId}: ${originalCommandText.substring(0, 50)}...`);

  try {
    // 更新命令状态为处理中
    try {
      await updateCommandStatus(commandId, 'processing');
    } catch (statusError) {
      console.error(`[CommandController] Failed to update initial status for command ${commandId}:`, statusError);
      // 继续处理，即使状态更新失败
    }

    const instructionForCursor = `\n\nIMPORTANT INSTRUCTION FOR AI MODEL (Using Supabase MCP Tools):\nMy original query to you is: \"${originalCommandText}\".\nThe unique ID for this command instance is: \"${commandId}\".\nThe Supabase Project ID for your MCP tool to use is: \"${supabaseProjectId}\".\n\nPlease perform the following steps in order:\n1. First, fully address my original query (\"${originalCommandText}\"). This may involve using any relevant tools at your disposal (like Playwright tools if applicable) to gather information or perform actions. Formulate your complete answer (\"your_answer_text\") to my original query.\n2. Second, present \"your_answer_text\" to me as your primary response in our chat.\n3. Third, AFTER you have presented \"your_answer_text\" to me, you MUST then use your Supabase MCP tool \`mcp_supabase_execute_sql\` to log this interaction.\n   a. For this tool call, use project_id: \"${supabaseProjectId}\".\n   b. The SQL query you need to execute is an INSERT statement into the \"results\" table.\n   c. Construct your SQL query. The text to be logged in the database should be your original, semantic answer to my query (this is the content of \"your_answer_text\" before any special formatting for display). Let's call this text to be logged \`{answer_text_for_sql}\`. Prepare \`{answer_text_for_sql}\` for the SQL string literal as follows:\n      i. Replace every single quote character (') in \`{answer_text_for_sql}\` with two single quote characters ('').\n      ii. Ensure that actual newline characters within \`{answer_text_for_sql}\` are preserved as true newlines in the SQL string literal. Do NOT convert these newlines into the two-character string '\\\\\\\\n' or any other escaped sequence.\n      Then, form the SQL query: \`INSERT INTO results (command_id, result_text, is_error) VALUES ('${commandId}', '{answer_text_for_sql}', FALSE);\`;\n   d. Execute this SQL query using your \`mcp_supabase_execute_sql\` tool. This is a critical step for logging purposes.\n\nPlease confirm you understand and will execute these steps in the specified order: 1. Address query & Formulate answer, 2. Present answer, 3. Log answer to database.`;
    const augmentedCommandText = originalCommandText + instructionForCursor;

    // 执行命令并处理可能的错误
    console.log(`[CommandController] Executing command ${commandId} via AppleScript`);
    const appleScriptPromise = runAppleScript(augmentedCommandText, chatMode, targetEditor);

    // 设置结果监听，带重试机制
    const resultPromise = new Promise(async (resolve, reject) => {
      const setupResultListener = async (maxAttempts = 3) => {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const subscription = await subscribeToResultForCommand(commandId, (payload) => {
              console.log(`[CommandController] Received result for command ${commandId} via subscription:`, payload.new);
              if (resultSubscription) {
                clearResultSubscription(resultSubscription);
                resultSubscription = null;
              }
              resolve(payload.new);
            });
            
            if (subscription) {
              return subscription; 
            }
            
            console.warn(`[CommandController] Failed to setup result subscription on attempt ${attempt}/${maxAttempts}`);
            await new Promise(res => setTimeout(res, 2000));
          } catch (err) {
            console.error(`[CommandController] Error setting up result subscription on attempt ${attempt}/${maxAttempts}:`, err);
            if (attempt < maxAttempts) {
              await new Promise(res => setTimeout(res, 2000));
            }
          }
        }
        throw new Error(`Failed to setup result subscription after ${maxAttempts} attempts`);
      };

      try {
        resultSubscription = await setupResultListener();
        
        if (!resultSubscription) {
          reject(new Error(`Failed to initialize result subscription for command ${commandId} after multiple attempts.`));
          return;
        }
        
        setTimeout(() => {
          if (resultSubscription) {
            clearResultSubscription(resultSubscription);
            resultSubscription = null;
          }
          reject(new Error(`Timeout: Did not receive result for command ${commandId} within ${appleScriptTimeoutDuration / 1000}s`));
        }, appleScriptTimeoutDuration);
      } catch (err) {
        reject(err);
      }
    });

    const appleScriptOutcome = await appleScriptPromise;

    if (!appleScriptOutcome.success) {
      const errorMsg = `AppleScript execution failed: ${appleScriptOutcome.error}`;
      console.error(`[CommandController] ${errorMsg} for command ${commandId}`);
      await updateCommandStatus(commandId, 'error', errorMsg);
      await analyticsService.recordCommandEnd(commandId, false, Date.now() - startTime, errorMsg);
      
      if (resultSubscription) {
        clearResultSubscription(resultSubscription);
        resultSubscription = null;
      }
      
      // 尝试错误恢复
      await errorRecoveryService.handleError(commandId, new Error(errorMsg), { commandData, originalCommandText });
      return;
    }

    console.log(`[CommandController] Waiting for result via subscription for command ${commandId}.`);

    // 等待结果并处理可能的错误
    try {
      const resultData = await resultPromise;
      console.log(`[CommandController] Result received for command ${commandId}.`);
      
      // 更新命令状态为完成或错误
      try {
        await updateCommandStatus(commandId, resultData.is_error ? 'error' : 'completed', resultData.is_error ? resultData.error_message : null);
        await analyticsService.recordCommandEnd(commandId, !resultData.is_error, Date.now() - startTime, resultData.is_error ? resultData.error_message : null);
      } catch (statusUpdateError) {
        console.error(`[CommandController] Failed to update final status for command ${commandId}:`, statusUpdateError);
      }
    } catch (resultError) {
      console.error(`[CommandController] Error waiting for result for command ${commandId}:`, resultError);
      await updateCommandStatus(commandId, 'error', `Result wait error: ${resultError.message}`);
      await analyticsService.recordCommandEnd(commandId, false, Date.now() - startTime, resultError.message);
      
      // 尝试错误恢复
      await errorRecoveryService.handleError(commandId, resultError, { commandData, originalCommandText });
    }

  } catch (error) {
    console.error(`[CommandController] Error executing command ${commandId}:`, error.message, error.stack);
    
    if (resultSubscription) {
      clearResultSubscription(resultSubscription);
      resultSubscription = null;
    }
    
    try {
      await updateCommandStatus(commandId, 'error', `Controller error: ${error.message}`);
      await analyticsService.recordCommandEnd(commandId, false, Date.now() - startTime, error.message);
    } catch (updateError) {
      console.error(`[CommandController] CRITICAL: Failed to update command ${commandId} status to error after another error:`, updateError);
    }
    
    // 尝试错误恢复
    await errorRecoveryService.handleError(commandId, error, { commandData, originalCommandText });
  }
};

// 保持向后兼容的processCommand函数
export const processCommand = async (commandData) => {
  await addCommandToQueue(commandData);
};

// 获取命令分析数据
export const getAnalytics = async (timeframe = '24h') => {
  try {
    return await analyticsService.getCommandStats(timeframe);
  } catch (error) {
    console.error('[CommandController] Error getting analytics:', error);
    throw error;
  }
};

// 获取队列状态
export const getQueueStatus = () => {
  try {
    return queueManager.getStatus();
  } catch (error) {
    console.error('[CommandController] Error getting queue status:', error);
    throw error;
  }
};

// 获取错误恢复报告
export const getErrorRecoveryReport = async (timeframe = '24h') => {
  try {
    return await errorRecoveryService.getRecoveryReport(timeframe);
  } catch (error) {
    console.error('[CommandController] Error getting error recovery report:', error);
    throw error;
  }
};

// 清理和关闭服务（优雅关闭）
export const cleanup = async () => {
  try {
    await queueManager.stop();
    console.log('[CommandController] Services cleaned up successfully');
  } catch (error) {
    console.error('[CommandController] Error during cleanup:', error);
  }
};