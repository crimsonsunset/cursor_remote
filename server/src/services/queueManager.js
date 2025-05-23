// 命令队列管理器 - 支持优先级和批处理
export class CommandQueueManager {
  constructor() {
    this.highPriorityQueue = [];
    this.normalPriorityQueue = [];
    this.lowPriorityQueue = [];
    this.isProcessing = false;
    this.maxConcurrentCommands = 1; // 目前保持单线程处理
  }

  addCommand(command, priority = 'normal') {
    const enrichedCommand = {
      ...command,
      priority,
      addedAt: Date.now(),
      estimatedDuration: this.estimateCommandDuration(command.command_text)
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

    console.log(`[QueueManager] Command ${command.id} added with ${priority} priority. Queue sizes: H:${this.highPriorityQueue.length}, N:${this.normalPriorityQueue.length}, L:${this.lowPriorityQueue.length}`);
  }

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

  estimateCommandDuration(commandText) {
    // 基于命令长度和类型估算处理时间
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

  getQueueStats() {
    return {
      high: this.highPriorityQueue.length,
      normal: this.normalPriorityQueue.length,
      low: this.lowPriorityQueue.length,
      total: this.highPriorityQueue.length + this.normalPriorityQueue.length + this.lowPriorityQueue.length,
      isProcessing: this.isProcessing
    };
  }

  clearExpiredCommands(maxAge = 30 * 60 * 1000) { // 30分钟超时
    const now = Date.now();
    const filterExpired = (cmd) => (now - cmd.addedAt) < maxAge;
    
    this.highPriorityQueue = this.highPriorityQueue.filter(filterExpired);
    this.normalPriorityQueue = this.normalPriorityQueue.filter(filterExpired);
    this.lowPriorityQueue = this.lowPriorityQueue.filter(filterExpired);
  }
}

export const globalCommandQueue = new CommandQueueManager();
