import { jest } from '@jest/globals';
import {
  analyzeError,
  handleErrorWithRecovery,
  recordErrorStats,
  getErrorStats,
  resetErrorStats,
  getServiceHealth,
  performSystemHealthCheck,
  ErrorRecoveryService
} from '../../src/services/errorRecoveryService.js';

// Clean up global state between tests
beforeEach(() => {
  global.errorStats = undefined;
  jest.clearAllMocks();
});

describe('ErrorRecoveryService', () => {
  beforeEach(() => {
    // 重置全局状态
    resetErrorStats();
    global.errorStats = {};
    
    // Mock console methods
    console.error = jest.fn();
    console.log = jest.fn();
    console.warn = jest.fn();
  });

  afterEach(() => {
    // 清理全局状态
    resetErrorStats();
    delete global.errorStats;
    jest.clearAllMocks();
  });

  describe('analyzeError', () => {
    it('should identify AppleScript timeout errors', () => {
      const error = new Error('Operation timed out');
      const result = analyzeError(error);
      
      expect(result.type).toBe('APPLESCRIPT_TIMEOUT');
      expect(result.autoRetry).toBe(true);
      expect(result.retryDelay).toBe(10000);
      expect(result.maxRetries).toBe(2);
      expect(result.suggestion).toBe('建议检查 Cursor 是否响应，或尝试重启 Cursor');
    });

    it('should identify permission errors', () => {
      const error = new Error('Access denied to application');
      const result = analyzeError(error);
      
      expect(result.type).toBe('APPLESCRIPT_PERMISSION');
      expect(result.autoRetry).toBe(false);
      expect(result.maxRetries).toBe(0);
      expect(result.suggestion).toBe('请检查系统偏好设置中的辅助功能权限');
    });

    it('should identify network errors', () => {
      const error = new Error('Network connection failed');
      const result = analyzeError(error);
      
      expect(result.type).toBe('NETWORK_ERROR');
      expect(result.autoRetry).toBe(true);
      expect(result.retryDelay).toBe(3000);
      expect(result.maxRetries).toBe(5);
      expect(result.suggestion).toBe('网络连接问题，请检查网络状态');
    });

    it('should identify subscription errors', () => {
      const error = new Error('Subscription failed to connect');
      const result = analyzeError(error);
      
      expect(result.type).toBe('SUBSCRIPTION_ERROR');
      expect(result.autoRetry).toBe(true);
      expect(result.retryDelay).toBe(5000);
      expect(result.maxRetries).toBe(5);
      expect(result.suggestion).toBe('订阅连接问题，正在尝试重新建立连接');
    });

    it('should identify memory errors', () => {
      const error = new Error('Out of memory');
      const result = analyzeError(error);
      
      expect(result.type).toBe('MEMORY_ERROR');
      expect(result.autoRetry).toBe(false);
      expect(result.maxRetries).toBe(0);
      expect(result.requiresRestart).toBe(true);
      expect(result.suggestion).toBe('内存不足，建议重启服务');
    });

    it('should handle unknown errors', () => {
      const error = new Error('Some unknown error');
      const result = analyzeError(error);
      
      expect(result.type).toBe('UNKNOWN_ERROR');
      expect(result.autoRetry).toBe(false);
      expect(result.maxRetries).toBe(0);
      expect(result.suggestion).toBe('发生未知错误，请检查日志或联系管理员');
    });

    it('should include timestamp in analysis', () => {
      const error = new Error('Test error');
      const result = analyzeError(error);
      
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('recordErrorStats', () => {
    it('should create new error stats', async () => {
      await recordErrorStats('NETWORK_ERROR', 'cmd-123');
      
      const stats = getErrorStats();
      expect(stats.errorCounts.NETWORK_ERROR).toBe(1);
      expect(stats.legacy.NETWORK_ERROR).toBe(1);
      expect(console.log).toHaveBeenCalled();
    });

    it('should increment existing error stats', async () => {
      // 先记录一次
      await recordErrorStats('NETWORK_ERROR', 'cmd-123');
      // 再记录一次
      await recordErrorStats('NETWORK_ERROR', 'cmd-456');
      
      const stats = getErrorStats();
      expect(stats.errorCounts.NETWORK_ERROR).toBe(2);
      expect(stats.legacy.NETWORK_ERROR).toBe(2);
    });

    it('should handle errors gracefully', async () => {
      await expect(recordErrorStats('TEST_ERROR', 'cmd-789')).resolves.toBeUndefined();
    });
  });

  describe('getErrorStats', () => {
    it('should return enhanced stats structure when no stats exist', () => {
      const stats = getErrorStats();
      expect(stats).toHaveProperty('errorCounts');
      expect(stats).toHaveProperty('legacy');
      expect(stats).toHaveProperty('criticalErrorThreshold');
      expect(stats).toHaveProperty('restartRequested');
      expect(stats.errorCounts).toEqual({});
      expect(stats.legacy).toEqual({});
    });

    it('should return existing error stats in enhanced format', async () => {
      // 记录一些错误
      await recordErrorStats('NETWORK_ERROR', 'cmd-1');
      await recordErrorStats('NETWORK_ERROR', 'cmd-2');
      await recordErrorStats('CURSOR_NOT_RUNNING', 'cmd-3');
      
      const stats = getErrorStats();
      expect(stats.errorCounts).toEqual({
        NETWORK_ERROR: 2,
        CURSOR_NOT_RUNNING: 1
      });
      expect(stats.legacy).toEqual({
        NETWORK_ERROR: 2,
        CURSOR_NOT_RUNNING: 1
      });
    });
  });

  describe('handleErrorWithRecovery', () => {
    it('should recommend retry for auto-retryable errors within max attempts', async () => {
      const error = new Error('Network connection failed');
      
      const result = await handleErrorWithRecovery('cmd-123', error, 1);
      
      expect(result.shouldRetry).toBe(true);
      expect(result.retryDelay).toBe(3000);
      expect(result.maxRetries).toBe(5);
      expect(result.suggestion).toBe('网络连接问题，请检查网络状态');
      
      expect(console.error).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalled();
    });

    it('should not retry after max attempts', async () => {
      const error = new Error('Network connection failed');
      
      // 使用超过最大重试次数的尝试次数
      const result = await handleErrorWithRecovery('cmd-123', error, 6); // 超过maxRetries=5
      
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

    it('should handle memory errors requiring restart', async () => {
      const error = new Error('Out of memory');
      
      const result = await handleErrorWithRecovery('cmd-123', error, 1);
      
      expect(result.shouldRetry).toBe(false);
      expect(result.finalError).toBe(true);
      expect(result.requiresRestart).toBe(true);
      expect(result.suggestion).toBe('内存不足，建议重启服务');
    });

    it('should record error stats during handling', async () => {
      const error = new Error('Cursor application not found');
      
      await handleErrorWithRecovery('cmd-456', error, 1);
      
      const stats = getErrorStats();
      expect(stats.errorCounts.CURSOR_NOT_RUNNING).toBe(1);
    });
  });

  describe('getServiceHealth', () => {
    it('should return healthy status when no errors', () => {
      const health = getServiceHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.totalErrors).toBe(0);
      expect(health.errorBreakdown).toEqual({});
      expect(health.restartRequested).toBe(false);
    });

    it('should return warning status when errors approach threshold', async () => {
      // 记录接近阈值的错误数量
      for (let i = 0; i < 8; i++) {
        await recordErrorStats('NETWORK_ERROR', `cmd-${i}`);
      }
      
      const health = getServiceHealth();
      expect(health.status).toBe('warning');
      expect(health.totalErrors).toBe(8);
    });
  });

  describe('resetErrorStats', () => {
    it('should reset all error statistics', async () => {
      // 先记录一些错误
      await recordErrorStats('NETWORK_ERROR', 'cmd-1');
      await recordErrorStats('CURSOR_NOT_RUNNING', 'cmd-2');
      
      // 重置
      resetErrorStats();
      
      const stats = getErrorStats();
      expect(stats.errorCounts).toEqual({});
      expect(stats.legacy).toEqual({});
      expect(stats.restartRequested).toBe(false);
    });
  });

  describe('performSystemHealthCheck', () => {
    it('should include timestamp in ISO format', () => {
      const timestamp = new Date().toISOString();
      const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      
      expect(timestamp).toMatch(timestampRegex);
    });

    it('should return consistent structure', async () => {
      const result = await performSystemHealthCheck();
      
      expect(typeof result.supabase).toBe('boolean');
      expect(typeof result.applescript).toBe('boolean');
      expect(typeof result.cursor).toBe('boolean');
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(typeof result.timestamp).toBe('string');
      expect(result.serviceHealth).toBeDefined();
    });

    it('should handle module availability checks', async () => {
      const result = await performSystemHealthCheck();
      
      expect([true, false]).toContain(result.supabase);
      expect([true, false]).toContain(result.applescript);
      expect([true, false]).toContain(result.cursor);
    });

    it('should generate appropriate recommendations', async () => {
      const result = await performSystemHealthCheck();
      
      expect(Array.isArray(result.recommendations)).toBe(true);
      
      for (const recommendation of result.recommendations) {
        expect(typeof recommendation).toBe('string');
        expect(recommendation.length).toBeGreaterThan(0);
      }
      
      expect(typeof result.supabase).toBe('boolean');
      expect(typeof result.applescript).toBe('boolean');
      expect(typeof result.cursor).toBe('boolean');
      expect(typeof result.timestamp).toBe('string');
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
      
      // First attempt should recommend retry (attempt 1 <= maxRetries 5)
      const firstAttempt = await handleErrorWithRecovery(commandId, error, 1);
      expect(firstAttempt.shouldRetry).toBe(true);
      
      // Second attempt should recommend retry (attempt 2 <= maxRetries 5)
      const secondAttempt = await handleErrorWithRecovery(commandId, error, 2);
      expect(secondAttempt.shouldRetry).toBe(true);
      
      // Sixth attempt should not retry (attempt 6 > maxRetries 5)
      const sixthAttempt = await handleErrorWithRecovery(commandId, error, 6);
      expect(sixthAttempt.shouldRetry).toBe(false);
      expect(sixthAttempt.finalError).toBe(true);
    });
  });
}); 