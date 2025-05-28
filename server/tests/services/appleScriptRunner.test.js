import { jest } from '@jest/globals';
import { AppleScriptRunner } from '../../src/appleScriptRunner.js';

describe('AppleScriptRunner', () => {
  let runner;
  let mockExecFileAsync;
  let mockLogger;

  beforeEach(() => {
    // 创建模拟的 execFileAsync 函数
    mockExecFileAsync = jest.fn();
    
    // 创建模拟的 logger
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    // 创建 AppleScriptRunner 实例
    runner = new AppleScriptRunner({
      execFileAsync: mockExecFileAsync,
      logger: mockLogger,
      scriptPath: '/mock/path/to/script.scpt',
      defaultChatMode: 'agent',
      defaultTargetEditor: 'Cursor'
    });
  });

  describe('constructor', () => {
    it('should initialize with provided options', () => {
      expect(runner.execFileAsync).toBe(mockExecFileAsync);
      expect(runner.logger).toBe(mockLogger);
      expect(runner.scriptPath).toBe('/mock/path/to/script.scpt');
      expect(runner.defaultChatMode).toBe('agent');
      expect(runner.defaultTargetEditor).toBe('Cursor');
    });

    it('should use default values when options are not provided', () => {
      const defaultRunner = new AppleScriptRunner();
      
      expect(defaultRunner.defaultChatMode).toBe('agent');
      expect(defaultRunner.defaultTargetEditor).toBe('Cursor');
      expect(defaultRunner.logger).toBe(console);
      expect(typeof defaultRunner.execFileAsync).toBe('function');
    });
  });

  describe('normalizeChatMode', () => {
    it('should return valid chat mode as is', () => {
      expect(runner.normalizeChatMode('agent')).toBe('agent');
      expect(runner.normalizeChatMode('chat')).toBe('chat');
      expect(runner.normalizeChatMode('ask')).toBe('ask');
    });

    it('should return default chat mode for invalid input', () => {
      const result = runner.normalizeChatMode('invalid');
      
      expect(result).toBe('agent');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid chatMode "invalid" provided. Defaulting to "agent".'
      );
    });

    it('should handle null and undefined input', () => {
      expect(runner.normalizeChatMode(null)).toBe('agent');
      expect(runner.normalizeChatMode(undefined)).toBe('agent');
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    });
  });

  describe('normalizeTargetEditor', () => {
    it('should normalize known editors correctly', () => {
      expect(runner.normalizeTargetEditor('vscode')).toBe('Visual Studio Code');
      expect(runner.normalizeTargetEditor('VSCode')).toBe('Visual Studio Code');
      expect(runner.normalizeTargetEditor('VSCODE')).toBe('Visual Studio Code');
      
      expect(runner.normalizeTargetEditor('vscode-insiders')).toBe('Visual Studio Code - Insiders');
      expect(runner.normalizeTargetEditor('VSCode-Insiders')).toBe('Visual Studio Code - Insiders');
      
      expect(runner.normalizeTargetEditor('cursor')).toBe('Cursor');
      expect(runner.normalizeTargetEditor('Cursor')).toBe('Cursor');
      expect(runner.normalizeTargetEditor('CURSOR')).toBe('Cursor');
    });

    it('should return default editor for unknown input', () => {
      const result = runner.normalizeTargetEditor('unknown-editor');
      
      expect(result).toBe('Cursor');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[AppleScriptRunner] Received unknown target editor: \'unknown-editor\'. Defaulting to \'Cursor\'.'
      );
    });

    it('should handle empty and special characters', () => {
      expect(runner.normalizeTargetEditor('')).toBe('Cursor');
      expect(runner.normalizeTargetEditor('!@#$')).toBe('Cursor');
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    });
  });

  describe('buildScriptArgs', () => {
    it('should build correct script arguments', () => {
      const args = runner.buildScriptArgs('test command', 'chat', 'vscode');
      
      expect(args).toEqual(['test command', 'chat', 'Visual Studio Code']);
    });

    it('should normalize invalid inputs', () => {
      const args = runner.buildScriptArgs('test command', 'invalid', 'unknown');
      
      expect(args).toEqual(['test command', 'agent', 'Cursor']);
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    });

    it('should handle complex command text', () => {
      const complexCommand = 'test "quoted" command with\nnewlines';
      const args = runner.buildScriptArgs(complexCommand, 'ask', 'cursor');
      
      expect(args[0]).toBe(complexCommand);
      expect(args[1]).toBe('ask');
      expect(args[2]).toBe('Cursor');
    });
  });

  describe('runScript', () => {
    beforeEach(() => {
      mockExecFileAsync.mockResolvedValue({ stdout: 'success', stderr: '' });
    });

    it('should reject empty command text', async () => {
      const result = await runner.runScript('');
      
      expect(result).toEqual({
        success: false,
        error: 'Command text cannot be empty.'
      });
      expect(mockExecFileAsync).not.toHaveBeenCalled();
    });

    it('should reject null command text', async () => {
      const result = await runner.runScript(null);
      
      expect(result).toEqual({
        success: false,
        error: 'Command text cannot be empty.'
      });
    });

    it('should execute script successfully', async () => {
      const result = await runner.runScript('test command', 'chat', 'vscode');
      
      expect(result).toEqual({
        success: true,
        message: 'Command "test command" sent to Visual Studio Code in mode "chat". Output: success',
        stdout: 'success'
      });
      
      expect(mockExecFileAsync).toHaveBeenCalledWith('osascript', [
        '/mock/path/to/script.scpt',
        'test command',
        'chat',
        'Visual Studio Code'
      ]);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[AppleScriptRunner] Executing: osascript "/mock/path/to/script.scpt" "test command" "chat" "Visual Studio Code"'
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[AppleScriptRunner] Execution successful (stdout): success'
      );
    });

    it('should use default parameters when not provided', async () => {
      const result = await runner.runScript('test command');
      
      expect(result.success).toBe(true);
      expect(mockExecFileAsync).toHaveBeenCalledWith('osascript', [
        '/mock/path/to/script.scpt',
        'test command',
        'agent',
        'Cursor'
      ]);
    });

    it('should handle empty stdout', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
      
      const result = await runner.runScript('test command');
      
      expect(result).toEqual({
        success: true,
        message: 'Command "test command" sent to Cursor in mode "agent". Output: (empty)',
        stdout: ''
      });
    });

    it('should handle stderr as error', async () => {
      mockExecFileAsync.mockResolvedValue({ 
        stdout: 'some output', 
        stderr: 'warning message' 
      });
      
      const result = await runner.runScript('test command');
      
      expect(result).toEqual({
        success: false,
        error: 'AppleScript execution stderr: warning message'
      });
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AppleScriptRunner] Error during execution (stderr): warning message'
      );
    });

    it('should handle execution errors', async () => {
      const executionError = new Error('Script not found');
      executionError.stdout = 'partial output';
      executionError.stderr = 'error details';
      
      mockExecFileAsync.mockRejectedValue(executionError);
      
      const result = await runner.runScript('test command');
      
      expect(result).toEqual({
        success: false,
        error: 'Failed to execute AppleScript: Script not found. stdout: partial output stderr: error details',
        stdout: 'partial output',
        stderr: 'error details'
      });
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AppleScriptRunner] Failed to execute AppleScript: Script not found'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AppleScriptRunner] scriptPath: /mock/path/to/script.scpt'
      );
    });

    it('should handle execution errors without stdout/stderr', async () => {
      const executionError = new Error('Network error');
      mockExecFileAsync.mockRejectedValue(executionError);
      
      const result = await runner.runScript('test command');
      
      expect(result.error).toContain('Failed to execute AppleScript: Network error');
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('should normalize invalid parameters during execution', async () => {
      const result = await runner.runScript('test command', 'invalid-mode', 'unknown-editor');
      
      expect(result.success).toBe(true);
      expect(mockExecFileAsync).toHaveBeenCalledWith('osascript', [
        '/mock/path/to/script.scpt',
        'test command',
        'agent',  // normalized from invalid-mode
        'Cursor'  // normalized from unknown-editor
      ]);
      
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex command with special characters', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: 'executed', stderr: '' });
      
      const complexCommand = 'Create a function that handles "quotes" and\nmultiline text with $pecial ch@rs';
      const result = await runner.runScript(complexCommand, 'ask', 'vscode-insiders');
      
      expect(result.success).toBe(true);
      expect(mockExecFileAsync).toHaveBeenCalledWith('osascript', [
        '/mock/path/to/script.scpt',
        complexCommand,
        'ask',
        'Visual Studio Code - Insiders'
      ]);
    });

    it('should handle multiple consecutive calls', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: 'ok', stderr: '' });
      
      const result1 = await runner.runScript('command 1');
      const result2 = await runner.runScript('command 2');
      const result3 = await runner.runScript('command 3');
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
      expect(mockExecFileAsync).toHaveBeenCalledTimes(3);
    });

    it('should maintain independence between different runner instances', () => {
      const runner2 = new AppleScriptRunner({
        execFileAsync: jest.fn(),
        logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
        defaultChatMode: 'chat',
        defaultTargetEditor: 'VSCode'
      });
      
      expect(runner.defaultChatMode).toBe('agent');
      expect(runner2.defaultChatMode).toBe('chat');
      expect(runner.defaultTargetEditor).toBe('Cursor');
      expect(runner2.defaultTargetEditor).toBe('VSCode');
    });
  });
}); 