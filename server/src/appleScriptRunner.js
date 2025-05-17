import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Convert import.meta.url to __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execFileAsync = promisify(execFile);

// Construct the absolute path to the AppleScript
// It's in CursorRemote/scripts/send_chat.scpt
// appleScriptRunner.js is in CursorRemote/server/src/
// So, from __dirname (server/src), we go up two levels to CursorRemote, then into scripts.
const scriptPath = path.resolve(__dirname, '../../scripts/send_chat.scpt');

/**
 * Runs the send_chat.scpt AppleScript to send a message to Cursor.
 * @param {string} commandText The message to send to Cursor.
 * @param {string} [initialChatMode="agent"] The mode for Cursor ("agent", "chat", "ask").
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 *          A promise resolving to an object indicating script execution success or failure.
 */
const runAppleScript = async (commandText, initialChatMode = "agent") => {
  if (!commandText) {
    return { success: false, error: 'Command text cannot be empty.' };
  }

  let currentChatMode = initialChatMode;
  const validModes = ["agent", "chat", "ask"];
  if (!validModes.includes(currentChatMode)) {
    console.warn(`Invalid chatMode "${currentChatMode}" provided. Defaulting to "agent".`);
    currentChatMode = "agent";
  }

  const scriptArgs = [commandText, currentChatMode];

  console.log(`[AppleScriptRunner] Executing: osascript "${scriptPath}" "${commandText}" "${currentChatMode}"`);

  try {
    const { stdout, stderr } = await execFileAsync('osascript', [scriptPath, ...scriptArgs]);

    if (stderr) {
      console.error(`[AppleScriptRunner] Error during execution (stderr): ${stderr}`);
      // Even if there's stderr, osascript might still exit with 0.
      // We'll consider non-empty stderr a sign of a potential issue.
      return { success: false, error: `AppleScript execution stderr: ${stderr}` };
    }

    // The current send_chat.scpt doesn't output Cursor's response to stdout.
    // It only sends the command. So, stdout is likely empty or has minimal OS messages.
    console.log(`[AppleScriptRunner] Execution successful (stdout): ${stdout || '(empty)'}`);
    return { success: true, message: `Command "${commandText}" sent to Cursor in mode "${currentChatMode}". Output: ${stdout || '(empty)'}` };

  } catch (error) {
    // This catches errors if osascript exits with a non-zero code or fails to launch
    console.error(`[AppleScriptRunner] Failed to execute AppleScript: ${error.message}`);
    console.error(`[AppleScriptRunner] scriptPath: ${scriptPath}`);
    console.error(`[AppleScriptRunner] arguments: ${scriptArgs.join(' ')}`);
    console.error(`[AppleScriptRunner] error object: ${error}`);
    return { 
      success: false, 
      error: `Failed to execute AppleScript: ${error.message}. stdout: ${error.stdout || ""} stderr: ${error.stderr || ""}`
    };
  }
};

export default runAppleScript; 