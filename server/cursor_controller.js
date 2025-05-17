/**
 * Cursor控制器模块
 * 
 * 负责与Cursor应用交互的核心模块：
 * 1. 使用AppleScript控制Cursor
 * 2. 发送消息并获取响应
 * 3. 执行特定动作
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');

// 将execFile转换为Promise
const execFileAsync = util.promisify(execFile);

// AppleScript脚本路径
const SCRIPTS_DIR = path.join(__dirname, '../scripts');
const SEND_CHAT_SCRIPT = path.join(SCRIPTS_DIR, 'send_chat.scpt');
const PERFORM_ACTION_SCRIPT = path.join(SCRIPTS_DIR, 'perform_action.scpt');

// 执行AppleScript
const runAppleScript = async (scriptPath, args = []) => {
  try {
    console.log(`执行AppleScript: ${scriptPath} 参数: ${args.join(', ')}`);
    const { stdout, stderr } = await execFileAsync('osascript', [scriptPath, ...args]);
    
    if (stderr) {
      console.error(`AppleScript错误: ${stderr}`);
    }
    
    return stdout.trim();
  } catch (error) {
    console.error('执行AppleScript出错:', error);
    throw new Error(`AppleScript执行失败: ${error.message}`);
  }
};

/**
 * 向Cursor发送聊天消息并获取回复
 * @param {string} message - 要发送给Cursor的消息
 * @returns {Promise<object>} - Cursor的响应
 */
const sendChat = async (message) => {
  try {
    // 确保脚本目录存在
    if (!fs.existsSync(SEND_CHAT_SCRIPT)) {
      throw new Error(`找不到AppleScript脚本: ${SEND_CHAT_SCRIPT}`);
    }
    
    // 执行AppleScript发送消息
    const response = await runAppleScript(SEND_CHAT_SCRIPT, [message]);
    
    return {
      success: true,
      source: 'cursor',
      type: 'chat',
      message: response
    };
  } catch (error) {
    console.error('发送聊天消息到Cursor失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 在Cursor中执行特定动作
 * @param {string} action - 要执行的动作名称
 * @returns {Promise<object>} - 执行结果
 */
const performAction = async (action) => {
  try {
    // 确保脚本存在
    if (!fs.existsSync(PERFORM_ACTION_SCRIPT)) {
      throw new Error(`找不到AppleScript脚本: ${PERFORM_ACTION_SCRIPT}`);
    }
    
    // 执行AppleScript执行动作
    const result = await runAppleScript(PERFORM_ACTION_SCRIPT, [action]);
    
    return {
      success: true,
      source: 'cursor',
      type: 'action',
      action: action,
      result: result
    };
  } catch (error) {
    console.error(`执行Cursor动作失败: ${action}`, error);
    return {
      success: false,
      action: action,
      error: error.message
    };
  }
};

module.exports = {
  sendChat,
  performAction
}; 