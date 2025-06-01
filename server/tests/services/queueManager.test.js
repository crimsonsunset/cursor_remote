import { jest } from '@jest/globals';
import { CommandQueueManager } from '../../src/services/queueManager.js';

describe('CommandQueueManager', () => {
  let queueManager;
  let mockLogger;
  let mockTimer;

  beforeEach(() => {
    // 创建模拟的 logger
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    // 创建模拟的 timer
    mockTimer = {
      setTimeout: jest.fn().mockImplementation((callback, delay) => {
        // 在测试中立即执行callback以避免挂起
        if (typeof callback === 'function') {
          setImmediate(callback);
        }
        return 'mock-timeout-id';
      }),
      setInterval: jest.fn(),
      clearInterval: jest.fn(),
      clearTimeout: jest.fn()
    };

    // 创建队列管理器实例，关闭自动处理以便测试
    queueManager = new CommandQueueManager({
      logger: mockLogger,
      timer: mockTimer,
      autoProcess: false,
      maxConcurrentCommands: 1,
      processInterval: 1000,
      commandDelay: 1000
    });
  });

  afterEach(async () => {
    // 清理
    if (queueManager && !queueManager.isShutdown) {
      try {
        // 强制设置isProcessing为false以防测试中有挂起的操作
        queueManager.isProcessing = false;
        await queueManager.shutdown();
      } catch (error) {
        // 静默处理清理错误
      }
    }
    
    // 清理所有模拟
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultManager = new CommandQueueManager({
        autoProcess: false,
        timer: mockTimer
      });
      
      expect(defaultManager.highPriorityQueue).toEqual([]);
      expect(defaultManager.normalPriorityQueue).toEqual([]);
      expect(defaultManager.lowPriorityQueue).toEqual([]);
      expect(defaultManager.isProcessing).toBe(false);
      expect(defaultManager.maxConcurrentCommands).toBe(1);
      expect(defaultManager.processInterval).toBe(1000);
      expect(defaultManager.commandDelay).toBe(1000);
      expect(defaultManager.isAutoProcessing).toBe(false);
      
      // 立即清理以防止测试间泄露
      defaultManager.shutdown();
    });

    it('should initialize with custom options', () => {
      const customOptions = {
        maxConcurrentCommands: 3,
        processInterval: 2000,
        commandDelay: 500,
        autoProcess: false,
        timer: mockTimer
      };
      
      const customManager = new CommandQueueManager(customOptions);
      
      expect(customManager.maxConcurrentCommands).toBe(3);
      expect(customManager.processInterval).toBe(2000);
      expect(customManager.commandDelay).toBe(500);
      expect(customManager.isAutoProcessing).toBe(false);
      
      // 立即清理以防止测试间泄露
      customManager.shutdown();
    });

    it('should use provided logger and timer', () => {
      expect(queueManager.logger).toBe(mockLogger);
      expect(queueManager.timer).toBe(mockTimer);
    });
  });

  describe('addCommand', () => {
    it('should add command to normal priority queue by default', async () => {
      const command = { id: 'test-1', command_text: 'test command' };
      
      const result = await queueManager.addCommand(command);
      
      expect(result).toBe(true);
      expect(queueManager.normalPriorityQueue).toHaveLength(1);
      expect(queueManager.normalPriorityQueue[0]).toMatchObject({
        id: 'test-1',
        command_text: 'test command',
        priority: 'normal',
        addedAt: expect.any(Number),
        estimatedDuration: expect.any(Number)
      });
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Command test-1 added with normal priority')
      );
    });

    it('should add command to high priority queue', async () => {
      const command = { id: 'high-1', command_text: 'urgent command' };
      
      const result = await queueManager.addCommand(command, 'high');
      
      expect(result).toBe(true);
      expect(queueManager.highPriorityQueue).toHaveLength(1);
      expect(queueManager.highPriorityQueue[0].priority).toBe('high');
    });

    it('should add command to low priority queue', async () => {
      const command = { id: 'low-1', command_text: 'background task' };
      
      const result = await queueManager.addCommand(command, 'low');
      
      expect(result).toBe(true);
      expect(queueManager.lowPriorityQueue).toHaveLength(1);
      expect(queueManager.lowPriorityQueue[0].priority).toBe('low');
    });

    it('should reject commands when shutdown', async () => {
      queueManager.isShutdown = true;
      const command = { id: 'test-1', command_text: 'test command' };
      
      const result = await queueManager.addCommand(command);
      
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[QueueManager] Cannot add command - queue is shutdown'
      );
    });

    it('should estimate command duration correctly', async () => {
      const command = { id: 'test-1', command_text: 'test command' };
      
      await queueManager.addCommand(command);
      
      const addedCommand = queueManager.normalPriorityQueue[0];
      expect(addedCommand.estimatedDuration).toBe(5000 + 'test command'.length * 10);
    });
  });

  describe('getNextCommand', () => {
    it('should return high priority command first', () => {
      queueManager.highPriorityQueue.push({ id: 'high-1', priority: 'high' });
      queueManager.normalPriorityQueue.push({ id: 'normal-1', priority: 'normal' });
      queueManager.lowPriorityQueue.push({ id: 'low-1', priority: 'low' });
      
      const command = queueManager.getNextCommand();
      
      expect(command.id).toBe('high-1');
      expect(queueManager.highPriorityQueue).toHaveLength(0);
    });

    it('should return normal priority command when no high priority', () => {
      queueManager.normalPriorityQueue.push({ id: 'normal-1', priority: 'normal' });
      queueManager.lowPriorityQueue.push({ id: 'low-1', priority: 'low' });
      
      const command = queueManager.getNextCommand();
      
      expect(command.id).toBe('normal-1');
      expect(queueManager.normalPriorityQueue).toHaveLength(0);
    });

    it('should return low priority command when others are empty', () => {
      queueManager.lowPriorityQueue.push({ id: 'low-1', priority: 'low' });
      
      const command = queueManager.getNextCommand();
      
      expect(command.id).toBe('low-1');
      expect(queueManager.lowPriorityQueue).toHaveLength(0);
    });

    it('should return null when all queues are empty', () => {
      const command = queueManager.getNextCommand();
      
      expect(command).toBeNull();
    });
  });

  describe('executeCommand', () => {
    it('should execute command with valid handler', async () => {
      const mockHandler = jest.fn().mockResolvedValue();
      const command = { id: 'test-1', handler: mockHandler };
      
      await queueManager.executeCommand(command);
      
      expect(mockHandler).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[QueueManager] Processing command test-1'
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[QueueManager] Completed command test-1'
      );
    });

    it('should handle command without handler', async () => {
      const command = { id: 'test-1' };
      
      await queueManager.executeCommand(command);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[QueueManager] Command test-1 has no valid handler'
      );
    });

    it('should handle command execution errors', async () => {
      const error = new Error('Execution failed');
      const mockHandler = jest.fn().mockRejectedValue(error);
      const command = { id: 'test-1', handler: mockHandler };
      
      await expect(queueManager.executeCommand(command)).rejects.toThrow('Execution failed');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[QueueManager] Error executing command test-1:',
        error
      );
    });

    it('should handle null command', async () => {
      await queueManager.executeCommand(null);
      
      // 应该没有错误或日志
      expect(mockLogger.log).not.toHaveBeenCalled();
    });
  });

  describe('processQueue', () => {
    it('should not process when already processing', async () => {
      queueManager.isProcessing = true;
      queueManager.normalPriorityQueue.push({ id: 'test-1', handler: jest.fn() });
      
      await queueManager.processQueue();
      
      expect(queueManager.normalPriorityQueue).toHaveLength(1);
    });

    it('should not process when shutdown', async () => {
      queueManager.isShutdown = true;
      queueManager.normalPriorityQueue.push({ id: 'test-1', handler: jest.fn() });
      
      await queueManager.processQueue();
      
      expect(queueManager.normalPriorityQueue).toHaveLength(1);
    });

    it('should process command and schedule delay', async () => {
      const mockHandler = jest.fn().mockResolvedValue();
      queueManager.normalPriorityQueue.push({ id: 'test-1', handler: mockHandler });
      
      await queueManager.processQueue();
      
      expect(mockHandler).toHaveBeenCalled();
      expect(queueManager.normalPriorityQueue).toHaveLength(0);
      expect(mockTimer.setTimeout).toHaveBeenCalledWith(
        expect.any(Function),
        1000
      );
    });

    it('should handle execution errors gracefully', async () => {
      const error = new Error('Execution failed');
      const mockHandler = jest.fn().mockRejectedValue(error);
      queueManager.normalPriorityQueue.push({ id: 'test-1', handler: mockHandler });
      
      await queueManager.processQueue();
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[QueueManager] Error processing queue:',
        error
      );
      expect(queueManager.isProcessing).toBe(false);
    });

    it('should not schedule delay when shutdown during processing', async () => {
      const mockHandler = jest.fn().mockImplementation(() => {
        queueManager.isShutdown = true;
        return Promise.resolve();
      });
      queueManager.normalPriorityQueue.push({ id: 'test-1', handler: mockHandler });
      
      await queueManager.processQueue();
      
      expect(queueManager.isProcessing).toBe(false);
      expect(mockTimer.setTimeout).not.toHaveBeenCalled();
    });
  });

  describe('startQueueProcessor and stopQueueProcessor', () => {
    it('should start queue processor', () => {
      queueManager.startQueueProcessor();
      
      expect(mockTimer.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        1000
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[QueueManager] Queue processor started'
      );
    });

    it('should not start processor when already running', () => {
      queueManager.intervalId = 'mock-interval-id';
      
      queueManager.startQueueProcessor();
      
      expect(mockTimer.setInterval).not.toHaveBeenCalled();
    });

    it('should not start processor when shutdown', () => {
      queueManager.isShutdown = true;
      
      queueManager.startQueueProcessor();
      
      expect(mockTimer.setInterval).not.toHaveBeenCalled();
    });

    it('should stop queue processor', () => {
      queueManager.intervalId = 'mock-interval-id';
      
      queueManager.stopQueueProcessor();
      
      expect(mockTimer.clearInterval).toHaveBeenCalledWith('mock-interval-id');
      expect(queueManager.intervalId).toBeNull();
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[QueueManager] Queue processor stopped'
      );
    });

    it('should handle stopping when not running', () => {
      queueManager.stopQueueProcessor();
      
      expect(mockTimer.clearInterval).not.toHaveBeenCalled();
    });
  });

  describe('hasCommands', () => {
    it('should return false when all queues are empty', () => {
      expect(queueManager.hasCommands()).toBe(false);
    });

    it('should return true when high priority queue has commands', () => {
      queueManager.highPriorityQueue.push({ id: 'test-1' });
      expect(queueManager.hasCommands()).toBe(true);
    });

    it('should return true when normal priority queue has commands', () => {
      queueManager.normalPriorityQueue.push({ id: 'test-1' });
      expect(queueManager.hasCommands()).toBe(true);
    });

    it('should return true when low priority queue has commands', () => {
      queueManager.lowPriorityQueue.push({ id: 'test-1' });
      expect(queueManager.hasCommands()).toBe(true);
    });
  });

  describe('estimateCommandDuration', () => {
    it('should return base time plus length factor for normal command', () => {
      const commandText = 'hello world';
      const expected = 5000 + commandText.length * 10;
      
      const duration = queueManager.estimateCommandDuration(commandText);
      
      expect(duration).toBe(expected);
    });

    it('should apply search command multiplier', () => {
      const commandText = '搜索相关文档';
      const expected = 5000 + commandText.length * 10 * 2;
      
      const duration = queueManager.estimateCommandDuration(commandText);
      
      expect(duration).toBe(expected);
    });

    it('should apply query command multiplier', () => {
      const commandText = '查询数据库信息';
      const expected = 5000 + commandText.length * 10 * 2;
      
      const duration = queueManager.estimateCommandDuration(commandText);
      
      expect(duration).toBe(expected);
    });

    it('should apply simple command multiplier', () => {
      const commandText = '简单的测试命令';
      const expected = 5000 + commandText.length * 10 * 0.5;
      
      const duration = queueManager.estimateCommandDuration(commandText);
      
      expect(duration).toBe(expected);
    });

    it('should apply quick command multiplier', () => {
      const commandText = '快速执行任务';
      const expected = 5000 + commandText.length * 10 * 0.5;
      
      const duration = queueManager.estimateCommandDuration(commandText);
      
      expect(duration).toBe(expected);
    });
  });

  describe('getQueueStats', () => {
    it('should return correct stats', () => {
      queueManager.highPriorityQueue.push({ id: 'high-1' });
      queueManager.normalPriorityQueue.push({ id: 'normal-1' }, { id: 'normal-2' });
      queueManager.lowPriorityQueue.push({ id: 'low-1' });
      queueManager.isProcessing = true;
      queueManager.intervalId = 'mock-id';
      
      const stats = queueManager.getQueueStats();
      
      expect(stats).toEqual({
        high: 1,
        normal: 2,
        low: 1,
        total: 4,
        isProcessing: true,
        isShutdown: false,
        hasProcessor: true
      });
    });
  });

  describe('clearExpiredCommands', () => {
    it('should remove expired commands', () => {
      const now = Date.now();
      const oldCommand = { id: 'old-1', addedAt: now - 60 * 60 * 1000 }; // 1 hour ago
      const newCommand = { id: 'new-1', addedAt: now };
      
      queueManager.normalPriorityQueue.push(oldCommand, newCommand);
      
      const removedCount = queueManager.clearExpiredCommands(30 * 60 * 1000); // 30 minutes
      
      expect(removedCount).toBe(1);
      expect(queueManager.normalPriorityQueue).toHaveLength(1);
      expect(queueManager.normalPriorityQueue[0].id).toBe('new-1');
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[QueueManager] Cleared 1 expired commands'
      );
    });

    it('should not log when no commands removed', () => {
      const now = Date.now();
      const newCommand = { id: 'new-1', addedAt: now };
      
      queueManager.normalPriorityQueue.push(newCommand);
      
      const removedCount = queueManager.clearExpiredCommands();
      
      expect(removedCount).toBe(0);
      expect(mockLogger.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Cleared')
      );
    });
  });

  describe('clearAllQueues', () => {
    it('should clear all queues and return count', () => {
      queueManager.highPriorityQueue.push({ id: 'high-1' });
      queueManager.normalPriorityQueue.push({ id: 'normal-1' }, { id: 'normal-2' });
      queueManager.lowPriorityQueue.push({ id: 'low-1' });
      
      const clearedCount = queueManager.clearAllQueues();
      
      expect(clearedCount).toBe(4);
      expect(queueManager.highPriorityQueue).toHaveLength(0);
      expect(queueManager.normalPriorityQueue).toHaveLength(0);
      expect(queueManager.lowPriorityQueue).toHaveLength(0);
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[QueueManager] Cleared all queues (4 commands removed)'
      );
    });
  });

  describe('getQueue', () => {
    beforeEach(() => {
      queueManager.highPriorityQueue.push({ id: 'high-1' });
      queueManager.normalPriorityQueue.push({ id: 'normal-1' });
      queueManager.lowPriorityQueue.push({ id: 'low-1' });
    });

    it('should return copy of high priority queue', () => {
      const queue = queueManager.getQueue('high');
      
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe('high-1');
      expect(queue).not.toBe(queueManager.highPriorityQueue);
    });

    it('should return copy of normal priority queue', () => {
      const queue = queueManager.getQueue('normal');
      
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe('normal-1');
    });

    it('should return copy of low priority queue', () => {
      const queue = queueManager.getQueue('low');
      
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe('low-1');
    });

    it('should return normal queue for unknown priority', () => {
      const queue = queueManager.getQueue('unknown');
      
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe('normal-1');
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      queueManager.intervalId = 'mock-id';
      queueManager.isProcessing = false;
      
      const result = await queueManager.shutdown();
      
      expect(result).toBe(true);
      expect(queueManager.isShutdown).toBe(true);
      expect(mockTimer.clearInterval).toHaveBeenCalledWith('mock-id');
      expect(mockLogger.log).toHaveBeenCalledWith('[QueueManager] Starting shutdown...');
      expect(mockLogger.log).toHaveBeenCalledWith('[QueueManager] Shutdown completed');
    });

    it('should wait for processing to complete', async () => {
      queueManager.isProcessing = true;
      
      // 模拟处理在一段时间后完成
      setImmediate(() => {
        queueManager.isProcessing = false;
      });
      
      const result = await queueManager.shutdown(5000);
      
      expect(result).toBe(true);
      expect(queueManager.isShutdown).toBe(true);
    });

    it('should force stop on timeout', async () => {
      queueManager.isProcessing = true;
      
      const result = await queueManager.shutdown(50); // 很短的超时
      
      expect(result).toBe(true);
      expect(queueManager.isShutdown).toBe(true);
      expect(queueManager.isProcessing).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[QueueManager] Shutdown timeout - forcing stop'
      );
    });
  });

  describe('restart', () => {
    it('should restart after shutdown', () => {
      queueManager.isShutdown = true;
      queueManager.isAutoProcessing = true;
      
      const result = queueManager.restart();
      
      expect(result).toBe(true);
      expect(queueManager.isShutdown).toBe(false);
      expect(queueManager.isProcessing).toBe(false);
      expect(mockTimer.setInterval).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[QueueManager] Queue manager restarted'
      );
    });

    it('should not restart when not shutdown', () => {
      queueManager.isShutdown = false;
      
      const result = queueManager.restart();
      
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[QueueManager] Cannot restart - not in shutdown state'
      );
    });

    it('should not start processor when autoProcess is false', () => {
      queueManager.isShutdown = true;
      queueManager.isAutoProcessing = false;
      
      const result = queueManager.restart();
      
      expect(result).toBe(true);
      expect(mockTimer.setInterval).not.toHaveBeenCalled();
    });
  });

  describe('integration tests', () => {
    it('should process commands in priority order', async () => {
      const executionOrder = [];
      
      const highHandler = jest.fn().mockImplementation(() => {
        executionOrder.push('high');
        return Promise.resolve();
      });
      const normalHandler = jest.fn().mockImplementation(() => {
        executionOrder.push('normal');
        return Promise.resolve();
      });
      const lowHandler = jest.fn().mockImplementation(() => {
        executionOrder.push('low');
        return Promise.resolve();
      });
      
      await queueManager.addCommand({ id: 'low-1', handler: lowHandler }, 'low');
      await queueManager.addCommand({ id: 'high-1', handler: highHandler }, 'high');
      await queueManager.addCommand({ id: 'normal-1', handler: normalHandler }, 'normal');
      
      // 手动处理队列三次
      await queueManager.processQueue();
      // 模拟延迟完成后重置 processing 状态
      const timeoutCallback = mockTimer.setTimeout.mock.calls[0][0];
      timeoutCallback();
      
      await queueManager.processQueue();
      const timeoutCallback2 = mockTimer.setTimeout.mock.calls[1][0];
      timeoutCallback2();
      
      await queueManager.processQueue();
      
      expect(executionOrder).toEqual(['high', 'normal', 'low']);
    });

    it('should handle mixed successful and failed commands', async () => {
      const successHandler = jest.fn().mockResolvedValue();
      const failHandler = jest.fn().mockRejectedValue(new Error('Failed'));
      
      await queueManager.addCommand({ id: 'success-1', handler: successHandler });
      await queueManager.addCommand({ id: 'fail-1', handler: failHandler });
      
      // 第一个命令应该成功
      await queueManager.processQueue();
      expect(successHandler).toHaveBeenCalled();
      
      // 模拟延迟完成后重置 processing 状态
      const timeoutCallback = mockTimer.setTimeout.mock.calls[0][0];
      timeoutCallback();
      
      // 第二个命令应该失败但被处理
      await queueManager.processQueue();
      expect(failHandler).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[QueueManager] Error processing queue:',
        expect.any(Error)
      );
    });
  });
}); 