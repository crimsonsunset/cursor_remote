import { updateCommandStatus, subscribeToResultForCommand, clearResultSubscription } from '../services/supabaseService.js';
import runAppleScript from '../appleScriptRunner.js';

const appleScriptTimeoutDuration = 120000; // 2 minutes for AppleScript/Cursor to respond

export const processCommand = async (commandData) => {
  const commandId = commandData.id;
  const originalCommandText = commandData.command_text;
  const chatMode = commandData.raw_command?.chatMode || "agent";
  const supabaseProjectId = process.env.SUPABASE_PROJECT_ID;

  if (!supabaseProjectId) {
    console.error("[CommandController] CRITICAL: SUPABASE_PROJECT_ID is not defined. Cannot construct augmented command.");
    await updateCommandStatus(commandId, 'error', 'Server configuration error: SUPABASE_PROJECT_ID missing.');
    return;
  }

  console.log(`[CommandController] Processing command ${commandId}: ${originalCommandText.substring(0, 100)}...`);

  try {
    await updateCommandStatus(commandId, 'processing');
    console.log(`[CommandController] Command ${commandId} status updated to 'processing'.`);

    const instructionForCursor = `\n\nIMPORTANT INSTRUCTION FOR AI MODEL (Using Supabase MCP Tools):\nMy original query to you is: \"${originalCommandText}\".\nThe unique ID for this command instance is: \"${commandId}\".\nThe Supabase Project ID for your MCP tool to use is: \"${supabaseProjectId}\".\n\nPlease perform the following steps:\n1. Formulate your complete answer (\"your_answer_text\") to my original query (\"${originalCommandText}\").\n2. After you have \"your_answer_text\", you MUST use your Supabase MCP tool \`mcp_supabase_execute_sql\`.\n3. For this tool call, use project_id: \"${supabaseProjectId}\".\n4. The SQL query you need to execute is an INSERT statement into the \"results\" table.\n5. Construct your SQL query. Take your complete answer (\"your_answer_text\") and prepare it for inclusion in the SQL string literal (let's call this '{your_answer_text_for_sql}'). To do this:\n     a. Replace every single quote character (') in \"your_answer_text\" with two single quote characters ('').\n     b. Actual newline characters in \"your_answer_text\" should be preserved as they are. Do NOT convert newlines into the literal string '\\\\n' or any other escaped sequence.\n   Then, form the SQL query: \`INSERT INTO results (command_id, result_text, is_error) VALUES ('${commandId}', '{your_answer_text_for_sql}', FALSE);\`;\n6. Execute this SQL query using your \`mcp_supabase_execute_sql\` tool. This is a critical step to log your response.\n\nAfter completing these steps, you can then present \"your_answer_text\" to me as your primary response in our chat.\nPlease confirm you understand and will execute these steps, particularly the database logging part.`;
    const augmentedCommandText = originalCommandText + instructionForCursor;

    console.log(`[CommandController] Sending augmented command to AppleScript for command ${commandId}.`);
    const appleScriptPromise = runAppleScript(augmentedCommandText, chatMode);

    let resultSubscription = null;
    const resultPromise = new Promise((resolve, reject) => {
      resultSubscription = subscribeToResultForCommand(commandId, (payload) => {
        console.log(`[CommandController] Received result for command ${commandId} via subscription:`, payload.new);
        if (resultSubscription) {
          clearResultSubscription(resultSubscription);
          resultSubscription = null; // Avoid trying to clear twice
        }
        resolve(payload.new);
      });

      if (!resultSubscription) { // If subscription failed to initialize
        reject(new Error(`Failed to initialize result subscription for command ${commandId}.`));
        return;
      }
      
      setTimeout(() => {
        if (resultSubscription) {
          clearResultSubscription(resultSubscription);
          resultSubscription = null;
        }
        reject(new Error(`Timeout: Did not receive result for command ${commandId} within ${appleScriptTimeoutDuration / 1000}s`));
      }, appleScriptTimeoutDuration);
    });

    const appleScriptOutcome = await appleScriptPromise;

    if (!appleScriptOutcome.success) {
      console.error(`[CommandController] AppleScript execution failed for command ${commandId}: ${appleScriptOutcome.error}`);
      await updateCommandStatus(commandId, 'error', `AppleScript execution failed: ${appleScriptOutcome.error}`);
      if (resultSubscription) { // Clean up subscription if AS failed early
        clearResultSubscription(resultSubscription);
      }
      return;
    }

    console.log(`[CommandController] AppleScript send successful for command ${commandId}. Waiting for result via subscription.`);

    const resultData = await resultPromise; // Wait for the result from the subscription

    console.log(`[CommandController] Result successfully received for command ${commandId}.`);
    await updateCommandStatus(commandId, resultData.is_error ? 'error' : 'completed', resultData.is_error ? resultData.error_message : null);

  } catch (error) {
    console.error(`[CommandController] Error processing command ${commandId}:`, error.message, error.stack);
    // Ensure subscription is cleared if an error occurs during promise handling or elsewhere
    if (resultSubscription) {
      clearResultSubscription(resultSubscription);
    }
    try {
      // Check if status was already set to error to avoid overwriting a more specific AppleScript error
      // This part might need more sophisticated error state checking if we want to preserve first error.
      await updateCommandStatus(commandId, 'error', `Controller error: ${error.message}`);
    } catch (updateError) {
      console.error(`[CommandController] CRITICAL: Failed to update command ${commandId} status to error after another error:`, updateError);
    }
  }
}; 