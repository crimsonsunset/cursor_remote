import { updateCommandStatus, subscribeToResultForCommand, clearResultSubscription } from '../services/supabaseService.js';
import runAppleScript from '../appleScriptRunner.js';

const appleScriptTimeoutDuration = 600000; // 10 minutes for AppleScript/Cursor to respond

export const processCommand = async (commandData) => {
  const commandId = commandData.id;
  const originalCommandText = commandData.command_text;
  const chatMode = commandData.raw_command?.chatMode || "agent";
  const targetEditor = commandData.raw_command?.target_editor || process.env.DEFAULT_EDITOR || "Cursor";
  const supabaseProjectId = process.env.SUPABASE_PROJECT_ID;
  let resultSubscription = null;

  if (!supabaseProjectId) {
    console.error("[CommandController] CRITICAL: SUPABASE_PROJECT_ID is not defined. Cannot construct augmented command.");
    await updateCommandStatus(commandId, 'error', 'Server configuration error: SUPABASE_PROJECT_ID missing.');
    return;
  }

  console.log(`[CommandController] Processing command ${commandId}: ${originalCommandText.substring(0, 100)}...`);

  try {
    // 更新命令状态为处理中
    try {
      await updateCommandStatus(commandId, 'processing');
      console.log(`[CommandController] Command ${commandId} status updated to 'processing'.`);
    } catch (statusError) {
      console.error(`[CommandController] Failed to update initial status for command ${commandId}:`, statusError);
      // 继续处理，即使状态更新失败
    }

    const instructionForCursor = `\n\nIMPORTANT INSTRUCTION FOR AI MODEL (Using Supabase MCP Tools):\nMy original query to you is: \"${originalCommandText}\".\nThe unique ID for this command instance is: \"${commandId}\".\nThe Supabase Project ID for your MCP tool to use is: \"${supabaseProjectId}\".\n\nPlease perform the following steps in order:\n1. First, fully address my original query (\"${originalCommandText}\"). This may involve using any relevant tools at your disposal (like Playwright tools if applicable) to gather information or perform actions. Formulate your complete answer (\"your_answer_text\") to my original query.\n2. Second, present \"your_answer_text\" to me as your primary response in our chat.\n3. Third, AFTER you have presented \"your_answer_text\" to me, you MUST then use your Supabase MCP tool \`mcp_supabase_execute_sql\` to log this interaction.\n   a. For this tool call, use project_id: \"${supabaseProjectId}\".\n   b. The SQL query you need to execute is an INSERT statement into the \"results\" table.\n   c. Construct your SQL query. The text to be logged in the database should be your original, semantic answer to my query (this is the content of \"your_answer_text\" before any special formatting for display). Let's call this text to be logged \`{answer_text_for_sql}\`. Prepare \`{answer_text_for_sql}\` for the SQL string literal as follows:\n      i. Replace every single quote character (') in \`{answer_text_for_sql}\` with two single quote characters ('').\n      ii. Ensure that actual newline characters within \`{answer_text_for_sql}\` are preserved as true newlines in the SQL string literal. Do NOT convert these newlines into the two-character string '\\\\\\\\n' or any other escaped sequence.\n      Then, form the SQL query: \`INSERT INTO results (command_id, result_text, is_error) VALUES ('${commandId}', '{answer_text_for_sql}', FALSE);\`;\n   d. Execute this SQL query using your \`mcp_supabase_execute_sql\` tool. This is a critical step for logging purposes.\n\nPlease confirm you understand and will execute these steps in the specified order: 1. Address query & Formulate answer, 2. Present answer, 3. Log answer to database.`;
    const augmentedCommandText = originalCommandText + instructionForCursor;

    console.log(`[CommandController] Sending augmented command to AppleScript for command ${commandId}.`);
    const appleScriptPromise = runAppleScript(augmentedCommandText, chatMode, targetEditor);

    // 设置结果监听，带重试机制
    const resultPromise = new Promise(async (resolve, reject) => {
      // 设置结果监听，带重试机制
      const setupResultListener = async (maxAttempts = 3) => {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const subscription = await subscribeToResultForCommand(commandId, (payload) => {
              console.log(`[CommandController] Received result for command ${commandId} via subscription:`, payload.new);
              if (resultSubscription) {
                clearResultSubscription(resultSubscription);
                resultSubscription = null; // Avoid trying to clear twice
              }
              resolve(payload.new);
            });
            
            if (subscription) {
              return subscription; 
            }
            
            console.warn(`[CommandController] Failed to setup result subscription on attempt ${attempt}/${maxAttempts}`);
            await new Promise(res => setTimeout(res, 2000)); // 等待2秒后重试
          } catch (err) {
            console.error(`[CommandController] Error setting up result subscription on attempt ${attempt}/${maxAttempts}:`, err);
            if (attempt < maxAttempts) {
              await new Promise(res => setTimeout(res, 2000)); // 等待2秒后重试
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
      console.error(`[CommandController] AppleScript execution failed for command ${commandId}: ${appleScriptOutcome.error}`);
      await updateCommandStatus(commandId, 'error', `AppleScript execution failed: ${appleScriptOutcome.error}`);
      if (resultSubscription) { // Clean up subscription if AS failed early
        clearResultSubscription(resultSubscription);
        resultSubscription = null; // Also set to null after clearing
      }
      return;
    }

    console.log(`[CommandController] AppleScript send successful for command ${commandId}. Waiting for result via subscription.`);

    // 等待结果并处理可能的错误
    try {
      const resultData = await resultPromise; // Wait for the result from the subscription
      console.log(`[CommandController] Result successfully received for command ${commandId}.`);
      
      // 更新命令状态为完成或错误
      try {
        await updateCommandStatus(commandId, resultData.is_error ? 'error' : 'completed', resultData.is_error ? resultData.error_message : null);
      } catch (statusUpdateError) {
        console.error(`[CommandController] Failed to update final status for command ${commandId}:`, statusUpdateError);
        // 最后的状态更新失败，但命令本身已成功处理
      }
    } catch (resultError) {
      console.error(`[CommandController] Error waiting for result for command ${commandId}:`, resultError);
      await updateCommandStatus(commandId, 'error', `Result wait error: ${resultError.message}`);
    }

  } catch (error) {
    console.error(`[CommandController] Error processing command ${commandId}:`, error.message, error.stack);
    // Ensure subscription is cleared if an error occurs during promise handling or elsewhere
    if (resultSubscription) {
      clearResultSubscription(resultSubscription);
      resultSubscription = null; // Set to null after clearing
    }
    try {
      // 尝试更新命令状态为错误
      await updateCommandStatus(commandId, 'error', `Controller error: ${error.message}`);
    } catch (updateError) {
      console.error(`[CommandController] CRITICAL: Failed to update command ${commandId} status to error after another error:`, updateError);
    }
  }
};