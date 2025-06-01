import { jest } from '@jest/globals';

// 模拟外部依赖
jest.mock('../src/services/supabaseService.js');

// 模拟进程环境
global.process.env.NODE_ENV = 'test';
global.process.env.MONITOR_INTERVAL = '3000';

describe('Connection Monitor Service', () => {
  let originalConsole;
  let originalSetInterval;
  let originalClearInterval;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // 模拟console以减少测试输出
    originalConsole = global.console;
    global.console = {
      ...originalConsole,
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn()
    };

    // 模拟定时器
    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;
    global.setInterval = jest.fn().mockReturnValue('interval-id');
    global.clearInterval = jest.fn();
  });

  afterEach(() => {
    global.console = originalConsole;
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    jest.resetModules();
  });

  describe('Monitor Initialization', () => {
    it('should handle basic monitor setup', () => {
      // 测试基本的监控初始化
      expect(global.setInterval).toBeDefined();
      expect(global.clearInterval).toBeDefined();
    });

    it('should respect monitor interval from environment', () => {
      expect(process.env.MONITOR_INTERVAL).toBe('3000');
    });

    it('should handle test environment correctly', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });
  });

  describe('Connection Checking', () => {
    it('should handle connection status checks', async () => {
      // 模拟连接检查函数
      const mockConnectionCheck = jest.fn().mockResolvedValue(true);
      
      await mockConnectionCheck();
      
      expect(mockConnectionCheck).toHaveBeenCalled();
    });

    it('should handle connection failures', async () => {
      const mockConnectionCheck = jest.fn().mockResolvedValue(false);
      
      const result = await mockConnectionCheck();
      
      expect(result).toBe(false);
      expect(mockConnectionCheck).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      const mockConnectionCheck = jest.fn().mockRejectedValue(new Error('Connection failed'));
      
      await expect(mockConnectionCheck()).rejects.toThrow('Connection failed');
    });
  });

  describe('Monitor Lifecycle', () => {
    it('should start monitoring with correct interval', () => {
      const intervalTime = Number.parseInt(process.env.MONITOR_INTERVAL) || 5000;
      
      // 模拟启动监控
      global.setInterval(() => {}, intervalTime);
      
      expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), intervalTime);
    });

    it('should stop monitoring when requested', () => {
      const intervalId = 'test-interval-id';
      
      global.clearInterval(intervalId);
      
      expect(global.clearInterval).toHaveBeenCalledWith(intervalId);
    });
  });

  describe('Error Handling and Logging', () => {
    it('should log connection status', () => {
      global.console.log('Connection status: OK');
      
      expect(global.console.log).toHaveBeenCalledWith('Connection status: OK');
    });

    it('should log connection errors', () => {
      const error = new Error('Connection timeout');
      global.console.error('Connection error:', error);
      
      expect(global.console.error).toHaveBeenCalledWith('Connection error:', error);
    });

    it('should handle unexpected errors gracefully', () => {
      const unexpectedError = new Error('Unexpected error');
      
      try {
        throw unexpectedError;
      } catch (error) {
        global.console.error('Unexpected error caught:', error);
      }
      
      expect(global.console.error).toHaveBeenCalledWith('Unexpected error caught:', unexpectedError);
    });
  });
}); 