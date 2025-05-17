import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import runAppleScript from '../appleScriptRunner.js';

dotenv.config({ path: '.env' }); // Assumes .env is in the server/ directory

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseProjectId = process.env.SUPABASE_PROJECT_ID;

if (!supabaseUrl) {
  console.error('Error: SUPABASE_URL must be defined in your .env file');
}
if (!supabaseServiceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY must be defined in your .env file');
}
if (!supabaseProjectId) {
  console.error('Error: SUPABASE_PROJECT_ID must be defined in your .env file');
}

let supabase = null;

const handleNewCommand = async (payload) => {
  const newCommand = payload.new;
  console.log('[Server] New command received:', newCommand);

  if (!newCommand || !newCommand.id || !newCommand.command_text) {
    console.error('[Server] Received invalid command data, missing ID, or missing command_text.');
    return;
  }

  const commandId = newCommand.id;
  const originalCommandText = newCommand.command_text;
  const chatMode = newCommand.raw_command?.chatMode || "agent";

  console.log(`[Server] Updating command ${commandId} status to 'processing'...`);
  try {
    const { data: updateData, error: updateError } = await supabase
      .from('commands')
      .update({ status: 'processing' })
      .eq('id', commandId)
      .select();

    if (updateError) {
      console.error(`[Server] Error updating command ${commandId} to 'processing':`, updateError);
      return;
    }
    if (!updateData || updateData.length === 0) {
      console.warn(`[Server] Command ${commandId} not found when trying to update status to 'processing'.`);
      return;
    }
    console.log(`[Server] Command ${commandId} status updated to 'processing'.`);

    const commandIdToReport = commandId;
    // outputFilePath is removed as Cursor will write directly to Supabase.
    // const outputFilePath = `/tmp/cursor_response_${commandIdToReport}.md`; 

    const instructionForCursor = `\n\nIMPORTANT INSTRUCTION FOR AI MODEL (Using Supabase MCP Tools):\nMy original query to you is: "${originalCommandText}".\nThe unique ID for this command instance is: "${commandId}".\nThe Supabase Project ID for your MCP tool to use is: "${supabaseProjectId}".\n\nPlease perform the following steps:\n1. Formulate your complete answer ("your_answer_text") to my original query ("${originalCommandText}").\n2. After you have "your_answer_text", you MUST use your Supabase MCP tool \`mcp_supabase_execute_sql\`.\n3. For this tool call, use project_id: "${supabaseProjectId}".\n4. The SQL query you need to execute is an INSERT statement into the "results" table.\n5. Construct your SQL query. Take your complete answer ("your_answer_text") and prepare it for inclusion in the SQL string literal (let\'s call this '{your_answer_text_for_sql}'). To do this:\n     a. Replace every single quote character (') in "your_answer_text" with two single quote characters ('').\n     b. Actual newline characters in "your_answer_text" should be preserved as they are. Do NOT convert newlines into the literal string \'\\\\n\' or any other escaped sequence.\n   Then, form the SQL query: \`INSERT INTO results (command_id, result_text, is_error) VALUES ('${commandId}', '{your_answer_text_for_sql}', FALSE);\`\n6. Execute this SQL query using your \`mcp_supabase_execute_sql\` tool. This is a critical step to log your response.\n\nAfter completing these steps, you can then present "your_answer_text" to me as your primary response in our chat.\nPlease confirm you understand and will execute these steps, particularly the database logging part.`;
        
    const augmentedCommandText = originalCommandText + instructionForCursor;

    console.log(`[Server] Sending to AppleScriptRunner. Original text: "${originalCommandText}"`);
    // Updated log message, removed reference to outputFilePath
    console.log(`[Server] Full augmented command for Cursor (instructing Supabase DB write):\n--- START OF AUGMENTED COMMAND ---\n${augmentedCommandText}\n--- END OF AUGMENTED COMMAND ---`);
    
    const appleScriptSendConfirmation = await runAppleScript(augmentedCommandText, chatMode);

    if (appleScriptSendConfirmation.success) {
      // Updated log messages
      console.log(`[Server] Command ${commandId} (augmented with Supabase DB write instruction) successfully sent to Cursor via AppleScript.`);
      console.log(`[Server] Instructed Cursor to write its response directly to the Supabase 'results' table for command ID ${commandId}.`);
    } else {
      console.error(`[Server] Failed to send command ${commandId} to Cursor via AppleScript: ${appleScriptSendConfirmation.error}`);
      console.log(`[Server] Placeholder: Would record AppleScript send failure for ${commandId}, set status to error.`);
      // TODO: Implement US1.5 & US1.6 for this specific AppleScript failure path
    }

  } catch (e) {
    console.error(`[Server] An unexpected error occurred in handleNewCommand for command ${commandId}:`, e);
    // TODO: Potentially update command status to 'error' here too
  }
};

const subscribeToCommands = () => {
  if (!supabase) {
    console.error('[Server] Supabase client not initialized. Cannot subscribe to commands.');
    return null;
  }

  const commandsSubscription = supabase
    .channel('public:commands')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'commands', filter: 'status=eq.pending' },
      (payload) => {
        handleNewCommand(payload);
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Server] Successfully subscribed to new commands!');
      } else if (status === 'TIMED_OUT') {
        console.error('[Server] Subscription to commands timed out.');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[Server] Subscription to commands failed due to a channel error:', err);
      } else if (err) {
        console.error('[Server] Error subscribing to commands:', err);
      }
    });

  return commandsSubscription;
};

if (supabaseUrl && supabaseServiceKey && supabaseProjectId) {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
        detectSessionInUrl: false
      },
    });
    console.log('[Server] Supabase client initialized successfully. Ready to connect.');
    subscribeToCommands();
  } catch (error) {
    console.error('[Server] Error initializing Supabase client:', error.message);
  } 
} else {
  console.warn('[Server] Supabase client not initialized due to missing SUPABASE_URL, SUPABASE_SERVICE_KEY, or SUPABASE_PROJECT_ID.');
}

export default supabase;