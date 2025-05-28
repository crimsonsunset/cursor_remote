import { jest } from '@jest/globals';
import { CommandController } from '../../src/controllers/commandController.js';

describe('CommandController', () => {
  let commandController;
  let mockOptions;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // 创建所有必需的模拟
    mockOptions = {
      logger: {
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn()
      },
      analyticsService: {
        initialize: jest.fn().mockResolvedValue(),
        recordCommandStart: jest.fn().mockResolvedValue(),
        recordCommandEnd: jest.fn().mockResolvedValue()
      },
      queueManager: {
        addCommand: jest.fn().mockResolvedValue(true),
        shutdown: jest.fn().mockResolvedValue()
      },
      appleScriptRunner: jest.fn().mockResolvedValue({
        success: true,
        output: 'success'
      }),
      errorRecoveryService: {
        handleErrorWithRecovery: jest.fn().mockResolvedValue()
      },
      timer: {
        setTimeout: jest.fn().mockReturnValue('timeout-id'),
        clearTimeout: jest.fn()
      },
      updateCommandStatus: jest.fn().mockResolvedValue(),
      subscribeToResultForCommand: jest.fn().mockResolvedValue({
        callback: jest.fn(),
        timeoutId: null
      }),
      clearResultSubscription: jest.fn(),
      supabaseProjectId: 'test-project-id',
      appleScriptTimeoutDuration: 1000
    };

    commandController = new CommandController(mockOptions);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    
    if (commandController) {
      try {
        await commandController.cleanup();
      } catch (error) {
        // 忽略清理错误
      }
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultController = new CommandController({
        queueManager: {
          addCommand: jest.fn(),
          shutdown: jest.fn()
        },
        timer: mockOptions.timer
      });
      
      expect(defaultController.analyticsService).toBeDefined();
      expect(defaultController.queueManager).toBeDefined();
      expect(defaultController.logger).toBe(console);
      expect(defaultController.appleScriptTimeoutDuration).toBe(600000);
      expect(defaultController.defaultEditor).toBe('Cursor');
      expect(defaultController.isInitialized).toBe(false);
    });

    it('should initialize with custom options', () => {
      expect(commandController.logger).toBe(mockOptions.logger);
      expect(commandController.analyticsService).toBe(mockOptions.analyticsService);
      expect(commandController.queueManager).toBe(mockOptions.queueManager);
      expect(commandController.supabaseProjectId).toBe('test-project-id');
      expect(commandController.appleScriptTimeoutDuration).toBe(1000);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const result = await commandController.initialize();
      
      expect(result).toBe(true);
      expect(commandController.isInitialized).toBe(true);
      expect(mockOptions.analyticsService.initialize).toHaveBeenCalled();
      expect(mockOptions.logger.log).toHaveBeenCalledWith('[CommandController] Initialized successfully');
    });

    it('should handle initialization failure', async () => {
      mockOptions.analyticsService.initialize.mockRejectedValue(new Error('Init failed'));
      
      const result = await commandController.initialize();
      
      expect(result).toBe(false);
      expect(commandController.isInitialized).toBe(false);
      expect(mockOptions.logger.error).toHaveBeenCalledWith('[CommandController] Failed to initialize:', expect.any(Error));
    });
  });

  describe('determineCommandPriority', () => {
    it('should return high priority for urgent commands', () => {
      const urgentCommands = [
        'urgent fix needed',
        'Fix the error',
        'critical issue',
        'Handle this error'
      ];

      for (const commandText of urgentCommands) {
        const result = commandController.determineCommandPriority({ command_text: commandText });
        expect(result).toBe('high');
      }
    });

    it('should return low priority for analysis commands', () => {
      const lowPriorityCommands = [
        'analyze the code',
        'document this function',
        'add comments here',
        'explain how this works'
      ];

      for (const commandText of lowPriorityCommands) {
        const result = commandController.determineCommandPriority({ command_text: commandText });
        expect(result).toBe('low');
      }
    });

    it('should return normal priority for regular commands', () => {
      const result = commandController.determineCommandPriority({ command_text: 'refactor this code' });
      expect(result).toBe('normal');
    });
  });

  describe('buildCursorInstruction', () => {
    it('should build correct instruction with project ID', () => {
      const instruction = commandController.buildCursorInstruction('test command', 'cmd-123');
      
      expect(instruction).toContain('test command');
      expect(instruction).toContain('cmd-123');
      expect(instruction).toContain('test-project-id');
      expect(instruction).toContain('mcp_supabase_execute_sql');
      expect(instruction).toContain('INSERT INTO results');
    });

    it('should throw error when project ID is missing', () => {
      // 绕过构造函数中的环境变量后备机制，使用模拟依赖避免真实timer
      const controllerWithoutProjectId = new CommandController({
        queueManager: {
          addCommand: jest.fn(),
          shutdown: jest.fn()
        },
        timer: mockOptions.timer
      });
      controllerWithoutProjectId.supabaseProjectId = null;
      
      expect(() => {
        controllerWithoutProjectId.buildCursorInstruction('test', 'cmd-123');
      }).toThrow('SUPABASE_PROJECT_ID is required but not configured');
    });
  });

  describe('setupResultListener', () => {
    it('should setup result listener successfully', async () => {
      const mockSubscription = { callback: jest.fn() };
      mockOptions.subscribeToResultForCommand.mockResolvedValue(mockSubscription);
      
      const result = await commandController.setupResultListener('cmd-123');
      
      expect(result).toBe(mockSubscription);
      expect(mockOptions.subscribeToResultForCommand).toHaveBeenCalledWith(
        'cmd-123',
        expect.any(Function)
      );
    });

    it('should throw error after max attempts', async () => {
      mockOptions.subscribeToResultForCommand.mockResolvedValue(null);
      
      await expect(commandController.setupResultListener('cmd-123', 1))
        .rejects.toThrow('Failed to setup result subscription after 1 attempts');
      
      expect(mockOptions.subscribeToResultForCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe('addCommandToQueue', () => {
    it('should add command to queue successfully', async () => {
      const commandData = {
        id: 'cmd-123',
        command_text: 'test command',
        priority: 'normal'
      };

      const result = await commandController.addCommandToQueue(commandData);

      expect(result).toBe(true);
      expect(mockOptions.queueManager.addCommand).toHaveBeenCalledWith(commandData, 'normal');
      expect(mockOptions.logger.log).toHaveBeenCalledWith(
        '[CommandController] Command cmd-123 added to queue with priority normal'
      );
    });

    it('should handle queue add failure', async () => {
      const commandData = {
        id: 'cmd-123',
        command_text: 'test command',
        priority: 'normal'
      };

      mockOptions.queueManager.addCommand.mockResolvedValue(false);

      const result = await commandController.addCommandToQueue(commandData);

      expect(result).toBe(false);
      expect(mockOptions.logger.error).toHaveBeenCalledWith(
        '[CommandController] Failed to add command cmd-123 to queue'
      );
    });

    it('should handle queue add error', async () => {
      const commandData = {
        id: 'cmd-123',
        command_text: 'test command',
        priority: 'normal'
      };

      const error = new Error('Queue error');
      mockOptions.queueManager.addCommand.mockRejectedValue(error);

      const result = await commandController.addCommandToQueue(commandData);

      expect(result).toBe(false);
      expect(mockOptions.logger.error).toHaveBeenCalledWith(
        '[CommandController] Error adding command cmd-123 to queue:', error
      );
    });
  });

  describe('executeCommand', () => {
    const mockCommandData = {
      id: 'cmd-123',
      command_text: 'test command',
      raw_command: {
        chatMode: 'agent',
        target_editor: 'Cursor'
      }
    };

    it('should handle AppleScript execution failure', async () => {
      mockOptions.appleScriptRunner.mockResolvedValue({
        success: false,
        error: 'AppleScript failed'
      });

      await commandController.executeCommand(mockCommandData);

      expect(mockOptions.updateCommandStatus).toHaveBeenCalledWith(
        'cmd-123',
        'error',
        'AppleScript execution failed: AppleScript failed'
      );
      expect(mockOptions.errorRecoveryService.handleErrorWithRecovery).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should cleanup successfully', async () => {
      await commandController.cleanup();

      expect(mockOptions.queueManager.shutdown).toHaveBeenCalled();
      expect(mockOptions.logger.log).toHaveBeenCalledWith('[CommandController] Cleanup completed');
    });

    it('should handle cleanup errors', async () => {
      const error = new Error('Cleanup failed');
      mockOptions.queueManager.shutdown.mockRejectedValue(error);

      await commandController.cleanup();

      expect(mockOptions.logger.error).toHaveBeenCalledWith('[CommandController] Error during cleanup:', error);
    });
  });
}); 