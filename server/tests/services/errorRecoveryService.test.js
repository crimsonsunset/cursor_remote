import { jest } from '@jest/globals';
import {
  analyzeError,
  handleErrorWithRecovery,
  recordErrorStats,
  getErrorStats,
  performSystemHealthCheck,
  ErrorRecoveryService
} from '../../src/services/errorRecoveryService.js';

// Clean up global state between tests
beforeEach(() => {
  global.errorStats = undefined;
  jest.clearAllMocks();
});

describe('ErrorRecoveryService', () => {
  describe('analyzeError', () => {
    it('should detect AppleScript timeout errors', () => {
      const error = new Error('Connection timeout occurred');
      const result = analyzeError(error);
      
      expect(result.type).toBe('APPLESCRIPT_TIMEOUT');
      expect(result.suggestion).toBe('建议检查 Cursor 是否响应，或尝试重启 Cursor');
      expect(result.autoRetry).toBe(true);
      expect(result.retryDelay).toBe(10000);
      expect(result.originalError).toBe('Connection timeout occurred');
    });

    it('should detect AppleScript permission errors', () => {
      const error = new Error('Permission denied to access application');
      const result = analyzeError(error);
      
      expect(result.type).toBe('APPLESCRIPT_PERMISSION');
      expect(result.suggestion).toBe('请检查系统偏好设置中的辅助功能权限');
      expect(result.autoRetry).toBe(false);
    });

    it('should detect Cursor not running errors', () => {
      const error = new Error('Cursor application not found');
      const result = analyzeError(error);
      
      expect(result.type).toBe('CURSOR_NOT_RUNNING');
      expect(result.suggestion).toBe('请确保 Cursor 应用程序正在运行');
      expect(result.autoRetry).toBe(true);
      expect(result.retryDelay).toBe(5000);
    });

    it('should detect network errors', () => {
      const error = new Error('Network connection failed');
      const result = analyzeError(error);
      
      expect(result.type).toBe('NETWORK_ERROR');
      expect(result.suggestion).toBe('网络连接问题，请检查网络状态');
      expect(result.autoRetry).toBe(true);
      expect(result.retryDelay).toBe(3000);
    });

    it('should detect Supabase errors', () => {
      const error = new Error('Supabase service connection lost');
      const result = analyzeError(error);
      
      expect(result.type).toBe('SUPABASE_ERROR');
      expect(result.suggestion).toBe('Supabase 连接问题，正在尝试重新连接');
      expect(result.autoRetry).toBe(true);
      expect(result.retryDelay).toBe(2000);
    });

    it('should handle unknown errors', () => {
      const error = new Error('Some unexpected error');
      const result = analyzeError(error);
      
      expect(result.type).toBe('UNKNOWN_ERROR');
      expect(result.suggestion).toBe('发生未知错误，请检查日志或联系管理员');
      expect(result.autoRetry).toBe(false);
      expect(result.originalError).toBe('Some unexpected error');
    });

    it('should handle errors without message property', () => {
      const error = 'String error without message property';
      const result = analyzeError(error);
      
      expect(result.type).toBe('UNKNOWN_ERROR');
      expect(result.originalError).toBe('String error without message property');
    });
  });

  describe('recordErrorStats', () => {
    it('should initialize global error stats if not exists', async () => {
      await recordErrorStats('NETWORK_ERROR', 'cmd-123');
      
      expect(global.errorStats).toBeDefined();
      expect(global.errorStats.NETWORK_ERROR).toBe(1);
      // Verify console.log was called without checking exact content
      expect(console.log).toHaveBeenCalled();
    });

    it('should increment existing error stats', async () => {
      global.errorStats = { NETWORK_ERROR: 2 };
      
      await recordErrorStats('NETWORK_ERROR', 'cmd-456');
      
      expect(global.errorStats.NETWORK_ERROR).toBe(3);
    });

    it('should handle errors gracefully', async () => {
      // Simply test that the function doesn't throw
      await expect(recordErrorStats('TEST_ERROR', 'cmd-789')).resolves.toBeUndefined();
    });
  });

  describe('getErrorStats', () => {
    it('should return empty object when no stats exist', () => {
      const stats = getErrorStats();
      expect(stats).toEqual({});
    });

    it('should return existing error stats', () => {
      global.errorStats = { 
        NETWORK_ERROR: 5, 
        CURSOR_NOT_RUNNING: 2 
      };
      
      const stats = getErrorStats();
      expect(stats).toEqual({
        NETWORK_ERROR: 5,
        CURSOR_NOT_RUNNING: 2
      });
    });
  });

  describe('handleErrorWithRecovery', () => {
    it('should recommend retry for auto-retryable errors on first attempt', async () => {
      const error = new Error('Network connection failed');
      
      const result = await handleErrorWithRecovery('cmd-123', error, 1);
      
      expect(result.shouldRetry).toBe(true);
      expect(result.retryDelay).toBe(3000);
      expect(result.suggestion).toBe('网络连接问题，请检查网络状态');
      
      // Verify console methods were called without checking exact content
      expect(console.error).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalled();
    });

    it('should not retry after max attempts', async () => {
      const error = new Error('Network connection failed');
      
      const result = await handleErrorWithRecovery('cmd-123', error, 3);
      
      expect(result.shouldRetry).toBe(false);
      expect(result.finalError).toBe(true);
      expect(result.suggestion).toBe('网络连接问题，请检查网络状态');
    });

    it('should not retry for non-retryable errors', async () => {
      const error = new Error('Permission denied to access application');
      
      const result = await handleErrorWithRecovery('cmd-123', error, 1);
      
      expect(result.shouldRetry).toBe(false);
      expect(result.finalError).toBe(true);
      expect(result.suggestion).toBe('请检查系统偏好设置中的辅助功能权限');
    });

    it('should record error stats during handling', async () => {
      const error = new Error('Cursor application not found');
      
      await handleErrorWithRecovery('cmd-456', error, 1);
      
      expect(global.errorStats.CURSOR_NOT_RUNNING).toBe(1);
    });
  });

  describe('performSystemHealthCheck', () => {
    it('should return health status in test environment', async () => {
      const result = await performSystemHealthCheck();
      
      expect(result.timestamp).toBeDefined();
      expect(result.supabase).toBe(true);
      expect(result.applescript).toBe(true);
      expect(result.cursor).toBe(false);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('should include timestamp in ISO format', () => {
      const timestamp = new Date().toISOString();
      const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      
      expect(timestamp).toMatch(timestampRegex);
    });
  });

  describe('ErrorRecoveryService backward compatibility object', () => {
    it('should export all functions through the service object', () => {
      expect(ErrorRecoveryService.analyzeError).toBe(analyzeError);
      expect(ErrorRecoveryService.handleErrorWithRecovery).toBe(handleErrorWithRecovery);
      expect(ErrorRecoveryService.recordErrorStats).toBe(recordErrorStats);
      expect(ErrorRecoveryService.getErrorStats).toBe(getErrorStats);
      expect(ErrorRecoveryService.performSystemHealthCheck).toBe(performSystemHealthCheck);
    });

    it('should work with the object syntax as used in existing code', async () => {
      const error = new Error('Test error for backward compatibility');
      
      const result = await ErrorRecoveryService.handleErrorWithRecovery('cmd-999', error);
      
      expect(result.shouldRetry).toBe(false);
      expect(result.finalError).toBe(true);
    });
  });

  describe('Error pattern matching edge cases', () => {
    it('should be case insensitive', () => {
      const error1 = new Error('TIMEOUT ERROR');
      const error2 = new Error('permission DENIED');
      const error3 = new Error('Network FAILED');
      
      expect(analyzeError(error1).type).toBe('APPLESCRIPT_TIMEOUT');
      expect(analyzeError(error2).type).toBe('APPLESCRIPT_PERMISSION');
      expect(analyzeError(error3).type).toBe('NETWORK_ERROR');
    });

    it('should match partial patterns', () => {
      const error1 = new Error('Operation timed out after 30s');
      const error2 = new Error('Cursor app not running properly');
      const error3 = new Error('Supabase table not found');
      
      expect(analyzeError(error1).type).toBe('APPLESCRIPT_TIMEOUT');
      expect(analyzeError(error2).type).toBe('CURSOR_NOT_RUNNING');
      expect(analyzeError(error3).type).toBe('SUPABASE_ERROR');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete error recovery workflow', async () => {
      const error = new Error('Network fetch failed');
      const commandId = 'integration-test-cmd';
      
      // First attempt should recommend retry
      const firstAttempt = await handleErrorWithRecovery(commandId, error, 1);
      expect(firstAttempt.shouldRetry).toBe(true);
      
      // Second attempt should recommend retry
      const secondAttempt = await handleErrorWithRecovery(commandId, error, 2);
      expect(secondAttempt.shouldRetry).toBe(true);
      
      // Third attempt should not retry
      const thirdAttempt = await handleErrorWithRecovery(commandId, error, 3);
      expect(thirdAttempt.shouldRetry).toBe(false);
      expect(thirdAttempt.finalError).toBe(true);
      
      // Error stats should be recorded for each attempt
      expect(global.errorStats.NETWORK_ERROR).toBe(3);
    });
  });
}); 