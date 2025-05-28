import { jest } from '@jest/globals';
import { AnalyticsService } from '../../src/services/analyticsService.js';

describe('AnalyticsService', () => {
  let service;
  let mockSupabaseService;
  let mockLogger;
  let mockSupabaseClient;

  beforeEach(() => {
    // 创建模拟的 Supabase 客户端 - 修复链式调用
    const mockChain = {
      eq: jest.fn().mockResolvedValue({ error: null })
    };
    
    mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockReturnValue(mockChain),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn(),
      gte: jest.fn().mockResolvedValue({ data: [], error: null })
    };

    // 创建模拟的 Supabase 服务
    mockSupabaseService = {
      ensureConnection: jest.fn(),
      getClient: jest.fn().mockReturnValue(mockSupabaseClient)
    };

    // 创建模拟的 logger
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    // 创建服务实例
    service = new AnalyticsService(mockSupabaseService, mockLogger);
  });

  describe('constructor', () => {
    it('should initialize with provided dependencies', () => {
      expect(service.supabaseService).toBe(mockSupabaseService);
      expect(service.logger).toBe(mockLogger);
      expect(service.isInitialized).toBe(false);
    });

    it('should use default console logger when none provided', () => {
      const serviceWithDefaults = new AnalyticsService();
      expect(serviceWithDefaults.logger).toBe(console);
    });
  });

  describe('initialize', () => {
    it('should mark service as initialized when supabaseService is provided', async () => {
      const result = await service.initialize();
      
      expect(result).toBe(true);
      expect(service.isInitialized).toBe(true);
    });

    it('should accept new supabaseService during initialization', async () => {
      const newMockService = { ensureConnection: jest.fn(), getClient: jest.fn() };
      
      const result = await service.initialize(newMockService);
      
      expect(result).toBe(true);
      expect(service.supabaseService).toBe(newMockService);
    });

    it('should not load dynamic service in test environment', async () => {
      const serviceWithoutDeps = new AnalyticsService(null, mockLogger);
      
      const result = await serviceWithoutDeps.initialize();
      
      expect(result).toBe(true);
      expect(serviceWithoutDeps.supabaseService).toBeNull();
    });
  });

  describe('isServiceAvailable', () => {
    it('should return false when not initialized', async () => {
      service.isInitialized = false;
      
      const result = await service.isServiceAvailable();
      
      expect(result).toBe(false);
    });

    it('should return false when no supabaseService', async () => {
      service.isInitialized = true;
      service.supabaseService = null;
      
      const result = await service.isServiceAvailable();
      
      expect(result).toBe(false);
    });

    it('should return true when connection is available', async () => {
      service.isInitialized = true;
      mockSupabaseService.ensureConnection.mockResolvedValue(true);
      
      const result = await service.isServiceAvailable();
      
      expect(result).toBe(true);
      expect(mockSupabaseService.ensureConnection).toHaveBeenCalled();
    });

    it('should return false when connection fails', async () => {
      service.isInitialized = true;
      mockSupabaseService.ensureConnection.mockResolvedValue(false);
      
      const result = await service.isServiceAvailable();
      
      expect(result).toBe(false);
    });

    it('should handle connection errors gracefully', async () => {
      service.isInitialized = true;
      mockSupabaseService.ensureConnection.mockRejectedValue(new Error('Connection error'));
      
      const result = await service.isServiceAvailable();
      
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[AnalyticsService] Supabase connection check failed:',
        expect.any(Error)
      );
    });
  });

  describe('recordCommandStart', () => {
    beforeEach(async () => {
      await service.initialize();
      mockSupabaseService.ensureConnection.mockResolvedValue(true);
    });

    it('should return service unavailable when service is not available', async () => {
      mockSupabaseService.ensureConnection.mockResolvedValue(false);
      
      const result = await service.recordCommandStart('test-id', 'test command');
      
      expect(result).toEqual({ success: false, reason: 'service_unavailable' });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[AnalyticsService] Service not available for start recording'
      );
    });

    it('should successfully record command start with extended info', async () => {
      mockSupabaseClient.insert.mockResolvedValue({ error: null });
      
      const result = await service.recordCommandStart('test-id', 'test command');
      
      expect(result).toEqual({ success: true, method: 'extended' });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('command_metrics');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        command_id: 'test-id',
        command_length: 12,
        success: false,
        created_at: expect.any(String),
        command_text: 'test command',
        start_time: expect.any(String)
      });
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[AnalyticsService] Command start recorded for test-id'
      );
    });

    it('should fall back to basic metrics when extended insert fails', async () => {
      mockSupabaseClient.insert
        .mockResolvedValueOnce({ error: new Error('Column not found') })
        .mockResolvedValueOnce({ error: null });
      
      const result = await service.recordCommandStart('test-id', 'test command');
      
      expect(result).toEqual({ success: true, method: 'basic' });
      expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[AnalyticsService] Used basic metrics fallback'
      );
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database error');
      mockSupabaseClient.insert.mockResolvedValue({ error: dbError });
      
      const result = await service.recordCommandStart('test-id', 'test command');
      
      expect(result).toEqual({ success: false, reason: 'database_error', error: dbError });
    });

    it('should handle unexpected errors', async () => {
      const unexpectedError = new Error('Unexpected error');
      // 重置 mock 以抛出错误
      mockSupabaseService.getClient.mockImplementation(() => {
        throw unexpectedError;
      });
      
      const result = await service.recordCommandStart('test-id', 'test command');
      
      expect(result).toEqual({ success: false, reason: 'unexpected_error', error: unexpectedError });
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AnalyticsService] Error recording command start:',
        unexpectedError
      );
    });

    it('should handle null or empty command text', async () => {
      mockSupabaseClient.insert.mockResolvedValue({ error: null });
      
      const result = await service.recordCommandStart('test-id', null);
      
      expect(result.success).toBe(true);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          command_length: 0,
          command_text: null
        })
      );
    });
  });

  describe('recordCommandEnd', () => {
    beforeEach(async () => {
      await service.initialize();
      mockSupabaseService.ensureConnection.mockResolvedValue(true);
    });

    it('should return service unavailable when service is not available', async () => {
      mockSupabaseService.ensureConnection.mockResolvedValue(false);
      
      const result = await service.recordCommandEnd('test-id', true, 1000);
      
      expect(result).toEqual({ success: false, reason: 'service_unavailable' });
    });

    it('should successfully record command end with extended info', async () => {
      const mockChain = { eq: jest.fn().mockResolvedValue({ error: null }) };
      mockSupabaseClient.update.mockReturnValue(mockChain);
      
      const result = await service.recordCommandEnd('test-id', true, 1000, 'Test error');
      
      expect(result).toEqual({ success: true, method: 'extended' });
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        end_time: expect.any(String),
        success: true,
        processing_duration: 1000,
        error_message: 'Test error'
      });
      expect(mockChain.eq).toHaveBeenCalledWith('command_id', 'test-id');
    });

    it('should fall back to basic update when extended update fails', async () => {
      const mockChainExtended = { eq: jest.fn().mockResolvedValue({ error: new Error('Column not found') }) };
      const mockChainBasic = { eq: jest.fn().mockResolvedValue({ error: null }) };
      
      mockSupabaseClient.update
        .mockReturnValueOnce(mockChainExtended)
        .mockReturnValueOnce(mockChainBasic);
      
      const result = await service.recordCommandEnd('test-id', false, 2000);
      
      expect(result).toEqual({ success: true, method: 'basic' });
      expect(mockSupabaseClient.update).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[AnalyticsService] Used basic update fallback'
      );
    });
  });

  describe('recordCommandMetrics', () => {
    beforeEach(async () => {
      await service.initialize();
      mockSupabaseService.ensureConnection.mockResolvedValue(true);
    });

    it('should successfully record complete metrics', async () => {
      mockSupabaseClient.insert.mockResolvedValue({ error: null });
      
      const result = await service.recordCommandMetrics('test-id', 'command', 1500, true);
      
      expect(result).toEqual({ success: true });
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        command_id: 'test-id',
        command_length: 7,
        processing_duration: 1500,
        success: true,
        created_at: expect.any(String)
      });
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Insert failed');
      mockSupabaseClient.insert.mockResolvedValue({ error: dbError });
      
      const result = await service.recordCommandMetrics('test-id', 'command', 1500, false);
      
      expect(result).toEqual({ success: false, reason: 'database_error', error: dbError });
    });
  });

  describe('getCommandStats', () => {
    beforeEach(async () => {
      await service.initialize();
      mockSupabaseService.ensureConnection.mockResolvedValue(true);
    });

    it('should return null when service is not available', async () => {
      mockSupabaseService.ensureConnection.mockResolvedValue(false);
      
      const result = await service.getCommandStats();
      
      expect(result).toBeNull();
    });

    it('should return calculated stats for valid data', async () => {
      const mockData = [
        { success: true, processing_duration: 1000, created_at: '2023-01-01T00:00:00Z' },
        { success: false, processing_duration: 2000, created_at: '2023-01-01T01:00:00Z' },
        { success: true, processing_duration: 1500, created_at: '2023-01-01T02:00:00Z' }
      ];
      
      mockSupabaseClient.gte.mockResolvedValue({ data: mockData, error: null });
      
      const result = await service.getCommandStats(12);
      
      expect(result).toEqual({
        total: 3,
        successful: 2,
        successRate: 66.66666666666666,
        avgDuration: 1500,
        totalDuration: 4500
      });
      
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith(
        'created_at',
        expect.any(String)
      );
    });

    it('should handle empty data gracefully', async () => {
      mockSupabaseClient.gte.mockResolvedValue({ data: [], error: null });
      
      const result = await service.getCommandStats();
      
      expect(result).toEqual({
        total: 0,
        successful: 0,
        successRate: 0,
        avgDuration: 0,
        totalDuration: 0
      });
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Query failed');
      mockSupabaseClient.gte.mockResolvedValue({ data: null, error: dbError });
      
      const result = await service.getCommandStats();
      
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AnalyticsService] Failed to fetch command stats:',
        dbError
      );
    });
  });

  describe('calculateStats', () => {
    it('should return zero stats for empty data', () => {
      const result = service.calculateStats([]);
      
      expect(result).toEqual({
        total: 0,
        successful: 0,
        successRate: 0,
        avgDuration: 0,
        totalDuration: 0
      });
    });

    it('should return zero stats for null data', () => {
      const result = service.calculateStats(null);
      
      expect(result).toEqual({
        total: 0,
        successful: 0,
        successRate: 0,
        avgDuration: 0,
        totalDuration: 0
      });
    });

    it('should calculate correct stats for mixed data', () => {
      const data = [
        { success: true, processing_duration: 1000 },
        { success: false, processing_duration: 2000 },
        { success: true, processing_duration: 1500 },
        { success: true, processing_duration: null } // 测试 null 值处理
      ];
      
      const result = service.calculateStats(data);
      
      expect(result).toEqual({
        total: 4,
        successful: 3,
        successRate: 75,
        avgDuration: 1125, // (1000 + 2000 + 1500 + 0) / 4
        totalDuration: 4500
      });
    });
  });

  describe('attemptInsert', () => {
    it('should succeed with extended method', async () => {
      mockSupabaseClient.insert.mockResolvedValue({ error: null });
      
      const result = await service.attemptInsert(mockSupabaseClient, { test: 'data' }, 'command');
      
      expect(result).toEqual({ success: true, method: 'extended' });
    });

    it('should fall back to basic method', async () => {
      mockSupabaseClient.insert
        .mockResolvedValueOnce({ error: new Error('Extended failed') })
        .mockResolvedValueOnce({ error: null });
      
      const result = await service.attemptInsert(mockSupabaseClient, { test: 'data' }, 'command');
      
      expect(result).toEqual({ success: true, method: 'basic' });
    });

    it('should fail when both methods fail', async () => {
      const error = new Error('Both failed');
      mockSupabaseClient.insert.mockResolvedValue({ error });
      
      const result = await service.attemptInsert(mockSupabaseClient, { test: 'data' }, 'command');
      
      expect(result).toEqual({ success: false, reason: 'database_error', error });
    });
  });

  describe('attemptUpdate', () => {
    it('should succeed with extended method', async () => {
      const mockChain = { eq: jest.fn().mockResolvedValue({ error: null }) };
      mockSupabaseClient.update.mockReturnValue(mockChain);
      
      const result = await service.attemptUpdate(mockSupabaseClient, 'test-id', {
        success: true,
        duration: 1000,
        errorMessage: null
      });
      
      expect(result).toEqual({ success: true, method: 'extended' });
    });

    it('should fall back to basic method', async () => {
      const mockChainExtended = { eq: jest.fn().mockResolvedValue({ error: new Error('Extended failed') }) };
      const mockChainBasic = { eq: jest.fn().mockResolvedValue({ error: null }) };
      
      mockSupabaseClient.update
        .mockReturnValueOnce(mockChainExtended)
        .mockReturnValueOnce(mockChainBasic);
      
      const result = await service.attemptUpdate(mockSupabaseClient, 'test-id', {
        success: false,
        duration: 2000,
        errorMessage: 'Error'
      });
      
      expect(result).toEqual({ success: true, method: 'basic' });
    });

    it('should fail when both methods fail', async () => {
      const error = new Error('Both methods failed');
      const mockChainExtended = { eq: jest.fn().mockResolvedValue({ error: new Error('Extended failed') }) };
      const mockChainBasic = { eq: jest.fn().mockResolvedValue({ error }) };
      
      mockSupabaseClient.update
        .mockReturnValueOnce(mockChainExtended)
        .mockReturnValueOnce(mockChainBasic);
      
      const result = await service.attemptUpdate(mockSupabaseClient, 'test-id', {
        success: false,
        duration: 2000,
        errorMessage: 'Error'
      });
      
      expect(result).toEqual({ success: false, reason: 'database_error', error });
    });

    it('should handle unexpected errors', async () => {
      const unexpectedError = new Error('Unexpected error');
      mockSupabaseClient.update.mockImplementation(() => {
        throw unexpectedError;
      });
      
      const result = await service.attemptUpdate(mockSupabaseClient, 'test-id', {
        success: false,
        duration: 2000,
        errorMessage: 'Error'
      });
      
      expect(result).toEqual({ success: false, reason: 'unexpected_error', error: unexpectedError });
    });
  });

  describe('Export functions coverage', () => {
    it('should test getAnalyticsService function', async () => {
      // 动态导入以测试导出函数
      const { getAnalyticsService, recordCommandStart, recordCommandEnd, recordCommandMetrics, getCommandStats } = await import('../../src/services/analyticsService.js');
      
      expect(typeof getAnalyticsService).toBe('function');
      expect(typeof recordCommandStart).toBe('function');
      expect(typeof recordCommandEnd).toBe('function');
      expect(typeof recordCommandMetrics).toBe('function');
      expect(typeof getCommandStats).toBe('function');
    });

    it('should test actual export function calls', async () => {
      // 保存原始环境变量
      const originalNodeEnv = process.env.NODE_ENV;
      
      // 模拟非测试环境以触发实际的服务创建
      process.env.NODE_ENV = 'production';
      
      // 重新导入模块以获取新的实例
      jest.resetModules();
      const { getAnalyticsService, recordCommandStart, recordCommandEnd, recordCommandMetrics, getCommandStats } = await import('../../src/services/analyticsService.js');
      
      // 测试getAnalyticsService创建默认实例
      const service1 = await getAnalyticsService();
      const service2 = await getAnalyticsService();
      
      // 应该返回同一个实例
      expect(service1).toBe(service2);
      expect(service1).toBeDefined();
      
      // 恢复环境变量
      process.env.NODE_ENV = originalNodeEnv;
      jest.resetModules();
    });
  });

  describe('getCommandStats exception handling', () => {
    beforeEach(async () => {
      await service.initialize();
      mockSupabaseService.ensureConnection.mockResolvedValue(true);
    });

    it('should handle unexpected errors in getCommandStats', async () => {
      const unexpectedError = new Error('Unexpected stats error');
      mockSupabaseService.getClient.mockImplementation(() => {
        throw unexpectedError;
      });
      
      const result = await service.getCommandStats(24);
      
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AnalyticsService] Error fetching stats:',
        unexpectedError
      );
    });
  });

  describe('recordCommandMetrics exception handling', () => {
    beforeEach(async () => {
      await service.initialize();
      mockSupabaseService.ensureConnection.mockResolvedValue(true);
    });

    it('should handle unexpected errors in recordCommandMetrics', async () => {
      const unexpectedError = new Error('Unexpected metrics error');
      mockSupabaseService.getClient.mockImplementation(() => {
        throw unexpectedError;
      });
      
      const result = await service.recordCommandMetrics('test-id', 'command', 1000, true);
      
      expect(result).toEqual({ success: false, reason: 'unexpected_error', error: unexpectedError });
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AnalyticsService] Error recording metrics:',
        unexpectedError
      );
    });
  });

  describe('attemptInsert exception handling', () => {
    it('should handle unexpected errors in attemptInsert', async () => {
      const unexpectedError = new Error('Unexpected insert error');
      mockSupabaseClient.insert.mockImplementation(() => {
        throw unexpectedError;
      });
      
      const result = await service.attemptInsert(mockSupabaseClient, { test: 'data' }, 'command');
      
      expect(result).toEqual({ success: false, reason: 'unexpected_error', error: unexpectedError });
    });
  });
}); 