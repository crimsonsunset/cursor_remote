/**
 * 命令队列管理器 - 支持优先级和批处理
 * 重构为测试友好的版本，支持依赖注入
 */
export class CommandQueueManager {
  constructor(options = {}) {
    this.highPriorityQueue = [];
    this.normalPriorityQueue = [];
    this.lowPriorityQueue = [];
    this.isProcessing = false;
    this.maxConcurrentCommands = options.maxConcurrentCommands || 1;
    
    // 可注入的依赖
    this.logger = options.logger || console;
    this.timer = options.timer || {
      setTimeout: (fn, delay) => setTimeout(fn, delay),
      setInterval: (fn, interval) => setInterval(fn, interval),
      clearInterval: (id) => clearInterval(id),
      clearTimeout: (id) => clearTimeout(id)
    };
    
    // 配置选项
    this.processInterval = options.processInterval || 1000;
    this.commandDelay = options.commandDelay || 1000;
    this.isAutoProcessing = options.autoProcess !== false; // 默认启用自动处理
    
    // 内部状态
    this.intervalId = null;
    this.isShutdown = false;
    
    // 启动队列处理器（如果启用）
    if (this.isAutoProcessing) {
      this.startQueueProcessor();
    }
  }

  /**
   * 添加命令到队列
   */
  async addCommand(command, priority = 'normal') {
    if (this.isShutdown) {
      this.logger.warn('[QueueManager] Cannot add command - queue is shutdown');
      return false;
    }

    const enrichedCommand = {
      ...command,
      priority,
      addedAt: Date.now(),
      estimatedDuration: this.estimateCommandDuration(command.command_text || '')
    };

    switch (priority) {
      case 'high':
        this.highPriorityQueue.push(enrichedCommand);
        break;
      case 'low':
        this.lowPriorityQueue.push(enrichedCommand);
        break;
      default:
        this.normalPriorityQueue.push(enrichedCommand);
    }

    this.logger.log(`[QueueManager] Command ${command.id || 'unknown'} added with ${priority} priority. Queue sizes: H:${this.highPriorityQueue.length}, N:${this.normalPriorityQueue.length}, L:${this.lowPriorityQueue.length}`);
    
    // 触发队列处理（如果启用自动处理）
    if (this.isAutoProcessing) {
      this.processQueue();
    }
    
    return true;
  }

  /**
   * 获取下一个要处理的命令
   */
  getNextCommand() {
    // 优先级顺序：high -> normal -> low
    if (this.highPriorityQueue.length > 0) {
      return this.highPriorityQueue.shift();
    }
    if (this.normalPriorityQueue.length > 0) {
      return this.normalPriorityQueue.shift();
    }
    if (this.lowPriorityQueue.length > 0) {
      return this.lowPriorityQueue.shift();
    }
    return null;
  }

  /**
   * 处理队列中的命令
   */
  async processQueue() {
    if (this.isProcessing || this.isShutdown) {
      return; // 避免重复处理或在关闭状态下处理
    }

    this.isProcessing = true;
    
    try {
      const command = this.getNextCommand();
      if (command) {
        await this.executeCommand(command);
        
        // 延迟后继续处理下一个命令
        if (!this.isShutdown) {
          this.timer.setTimeout(() => {
            this.isProcessing = false;
            if (this.isAutoProcessing) {
              this.processQueue();
            }
          }, this.commandDelay);
        } else {
          this.isProcessing = false;
        }
      } else {
        this.isProcessing = false;
      }
    } catch (error) {
      this.logger.error('[QueueManager] Error processing queue:', error);
      this.isProcessing = false;
    }
  }

  /**
   * 执行单个命令
   */
  async executeCommand(command) {
    if (!command) {
      return;
    }

    this.logger.log(`[QueueManager] Processing command ${command.id || 'unknown'}`);
    
    try {
      if (command.handler && typeof command.handler === 'function') {
        await command.handler();
        this.logger.log(`[QueueManager] Completed command ${command.id || 'unknown'}`);
      } else {
        this.logger.warn(`[QueueManager] Command ${command.id || 'unknown'} has no valid handler`);
      }
    } catch (error) {
      this.logger.error(`[QueueManager] Error executing command ${command.id || 'unknown'}:`, error);
      throw error; // 重新抛出错误以便调用者处理
    }
  }

  /**
   * 启动队列处理器
   */
  startQueueProcessor() {
    if (this.intervalId || this.isShutdown) {
      return;
    }

    this.intervalId = this.timer.setInterval(() => {
      if (!this.isProcessing && this.hasCommands() && !this.isShutdown) {
        this.processQueue();
      }
    }, this.processInterval);
    
    this.logger.log('[QueueManager] Queue processor started');
  }

  /**
   * 停止队列处理器
   */
  stopQueueProcessor() {
    if (this.intervalId) {
      this.timer.clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.log('[QueueManager] Queue processor stopped');
    }
  }

  /**
   * 检查是否有待处理命令
   */
  hasCommands() {
    return this.highPriorityQueue.length > 0 || 
           this.normalPriorityQueue.length > 0 || 
           this.lowPriorityQueue.length > 0;
  }

  /**
   * 估算命令执行时间
   */
  estimateCommandDuration(commandText) {
    const baseTime = 5000; // 5秒基础时间
    const lengthFactor = commandText.length * 10; // 每字符10ms
    
    // 特殊命令类型调整
    if (commandText.includes('搜索') || commandText.includes('查询')) {
      return baseTime + lengthFactor * 2; // 搜索类命令可能需要更长时间
    }
    if (commandText.includes('简单') || commandText.includes('快速')) {
      return baseTime + lengthFactor * 0.5; // 简单命令预计更快
    }
    
    return baseTime + lengthFactor;
  }

  /**
   * 获取队列统计信息
   */
  getQueueStats() {
    return {
      high: this.highPriorityQueue.length,
      normal: this.normalPriorityQueue.length,
      low: this.lowPriorityQueue.length,
      total: this.highPriorityQueue.length + this.normalPriorityQueue.length + this.lowPriorityQueue.length,
      isProcessing: this.isProcessing,
      isShutdown: this.isShutdown,
      hasProcessor: !!this.intervalId
    };
  }

  /**
   * 清理过期命令
   */
  clearExpiredCommands(maxAge = 30 * 60 * 1000) { // 30分钟超时
    const now = Date.now();
    const filterExpired = (cmd) => (now - cmd.addedAt) < maxAge;
    
    const beforeCount = this.getQueueStats().total;
    
    this.highPriorityQueue = this.highPriorityQueue.filter(filterExpired);
    this.normalPriorityQueue = this.normalPriorityQueue.filter(filterExpired);
    this.lowPriorityQueue = this.lowPriorityQueue.filter(filterExpired);
    
    const afterCount = this.getQueueStats().total;
    const removedCount = beforeCount - afterCount;
    
    if (removedCount > 0) {
      this.logger.log(`[QueueManager] Cleared ${removedCount} expired commands`);
    }
    
    return removedCount;
  }

  /**
   * 清空所有队列
   */
  clearAllQueues() {
    const totalCommands = this.getQueueStats().total;
    
    this.highPriorityQueue = [];
    this.normalPriorityQueue = [];
    this.lowPriorityQueue = [];
    
    this.logger.log(`[QueueManager] Cleared all queues (${totalCommands} commands removed)`);
    return totalCommands;
  }

  /**
   * 获取指定优先级的队列
   */
  getQueue(priority) {
    switch (priority) {
      case 'high':
        return [...this.highPriorityQueue];
      case 'low':
        return [...this.lowPriorityQueue];
      default:
        return [...this.normalPriorityQueue];
    }
  }

  /**
   * 优雅关闭队列管理器
   */
  async shutdown(timeout = 5000) {
    this.logger.log('[QueueManager] Starting shutdown...');
    this.isShutdown = true;
    
    // 停止自动处理
    this.stopQueueProcessor();
    
    // 等待当前处理完成
    const startTime = Date.now();
    while (this.isProcessing && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => this.timer.setTimeout(resolve, 100));
    }
    
    if (this.isProcessing) {
      this.logger.warn('[QueueManager] Shutdown timeout - forcing stop');
      this.isProcessing = false;
    }
    
    this.logger.log('[QueueManager] Shutdown completed');
    return true;
  }

  /**
   * 重启队列管理器
   */
  restart() {
    if (!this.isShutdown) {
      this.logger.warn('[QueueManager] Cannot restart - not in shutdown state');
      return false;
    }
    
    this.isShutdown = false;
    this.isProcessing = false;
    
    if (this.isAutoProcessing) {
      this.startQueueProcessor();
    }
    
    this.logger.log('[QueueManager] Queue manager restarted');
    return true;
  }
}

// 创建默认实例（在非测试环境中）
let defaultQueueManager = null;

export const getQueueManager = (options = {}) => {
  if (!defaultQueueManager && process.env.NODE_ENV !== 'test') {
    defaultQueueManager = new CommandQueueManager(options);
  }
  return defaultQueueManager;
};

// 向后兼容的全局实例
export const globalCommandQueue = getQueueManager();
