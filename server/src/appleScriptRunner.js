import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Convert import.meta.url to __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 获取默认脚本路径
const getDefaultScriptPath = () => {
  return path.resolve(__dirname, '../../scripts/send_command_to_editor.scpt');
};

/**
 * AppleScript执行器类，支持依赖注入
 */
export class AppleScriptRunner {
  constructor(options = {}) {
    this.execFileAsync = options.execFileAsync || promisify(execFile);
    this.logger = options.logger || console;
    this.scriptPath = options.scriptPath || getDefaultScriptPath();
    this.defaultChatMode = options.defaultChatMode || "agent";
    this.defaultTargetEditor = options.defaultTargetEditor || "Cursor";
  }

  /**
   * 验证和规范化聊天模式
   */
  normalizeChatMode(chatMode) {
    const validModes = ["agent", "chat", "ask"];
    if (!validModes.includes(chatMode)) {
      this.logger.warn(`Invalid chatMode "${chatMode}" provided. Defaulting to "${this.defaultChatMode}".`);
      return this.defaultChatMode;
    }
    return chatMode;
  }

  /**
   * 规范化目标编辑器
   */
  normalizeTargetEditor(targetEditor) {
    const lowercasedEditor = targetEditor.toLowerCase();

    const editorMap = {
      'vscode': 'Visual Studio Code',
      'vscode-insiders': 'Visual Studio Code - Insiders',
      'cursor': 'Cursor'
    };

    const normalizedName = editorMap[lowercasedEditor];
    
    if (!normalizedName) {
      this.logger.warn(`[AppleScriptRunner] Received unknown target editor: '${targetEditor}'. Defaulting to '${this.defaultTargetEditor}'.`);
      return this.defaultTargetEditor;
    }
    
    return normalizedName;
  }

  /**
   * 构建AppleScript参数
   */
  buildScriptArgs(commandText, chatMode, targetEditor) {
    const normalizedChatMode = this.normalizeChatMode(chatMode);
    const normalizedTargetEditor = this.normalizeTargetEditor(targetEditor);
    
    return [commandText, normalizedChatMode, normalizedTargetEditor];
  }

  /**
   * 执行AppleScript
   */
  async runScript(commandText, initialChatMode = this.defaultChatMode, targetEditor = this.defaultTargetEditor) {
    if (!commandText) {
      return { success: false, error: 'Command text cannot be empty.' };
    }

    const scriptArgs = this.buildScriptArgs(commandText, initialChatMode, targetEditor);
    const [, chatMode, scriptTargetAppName] = scriptArgs;

    this.logger.log(`[AppleScriptRunner] Executing: osascript "${this.scriptPath}" "${commandText}" "${chatMode}" "${scriptTargetAppName}"`);

    try {
      const { stdout, stderr } = await this.execFileAsync('osascript', [this.scriptPath, ...scriptArgs]);

      if (stderr) {
        this.logger.error(`[AppleScriptRunner] Error during execution (stderr): ${stderr}`);
        return { success: false, error: `AppleScript execution stderr: ${stderr}` };
      }

      this.logger.log(`[AppleScriptRunner] Execution successful (stdout): ${stdout || '(empty)'}`);
      return { 
        success: true, 
        message: `Command "${commandText}" sent to ${scriptTargetAppName} in mode "${chatMode}". Output: ${stdout || '(empty)'}`,
        stdout: stdout || ''
      };

    } catch (error) {
      this.logger.error(`[AppleScriptRunner] Failed to execute AppleScript: ${error.message}`);
      this.logger.error(`[AppleScriptRunner] scriptPath: ${this.scriptPath}`);
      this.logger.error(`[AppleScriptRunner] arguments: ${scriptArgs.join(' ')}`);
      this.logger.error(`[AppleScriptRunner] error object: ${error}`);
      
      return { 
        success: false, 
        error: `Failed to execute AppleScript: ${error.message}. stdout: ${error.stdout || ""} stderr: ${error.stderr || ""}`,
        stdout: error.stdout || "",
        stderr: error.stderr || ""
      };
    }
  }
}

// 创建默认实例
let defaultRunner = null;

export const getAppleScriptRunner = (options = {}) => {
  if (!defaultRunner && process.env.NODE_ENV !== 'test') {
    defaultRunner = new AppleScriptRunner(options);
  }
  return defaultRunner;
};

/**
 * 向后兼容的默认导出函数
 */
const runAppleScript = async (commandText, initialChatMode = "agent", targetEditor = "Cursor") => {
  const runner = getAppleScriptRunner();
  return runner.runScript(commandText, initialChatMode, targetEditor);
};

export default runAppleScript; 