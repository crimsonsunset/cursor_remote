// 测试环境设置文件
import { jest } from '@jest/globals';

// 设置测试环境
process.env.NODE_ENV = 'test';

// 禁用所有 console 输出以减少测试日志
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

// 全局清理函数
global.testCleanup = [];

// 跟踪所有活跃的异步操作
global.activeTimers = new Set();
global.activePromises = new Set();

// Mock Supabase client 的订阅清理
const mockCleanupSubscriptions = () => {
  // 清理任何活跃的 WebSocket 连接
  if (global.WebSocket?.prototype) {
    // 模拟关闭所有 WebSocket 连接
  }
};

// 安全的计时器清理
const clearAllTimers = () => {
  try {
    jest.clearAllTimers();
    jest.useRealTimers(); // 确保使用真实定时器
  } catch (error) {
    // 静默处理计时器清理错误
  }
  
  // 清理活跃的计时器记录
  global.activeTimers.clear();
};

// 强制清理所有可能的异步操作
const forceCleanup = () => {
  // 清理所有可能的定时器
  clearAllTimers();
  
  // 清理所有模拟
  jest.clearAllMocks();
  jest.restoreAllMocks();
  
  // 清理全局状态
  if (global.errorStats) {
    global.errorStats = undefined;
  }
  
  // 清理任何可能的事件监听器
  if (process.removeAllListeners) {
    try {
      // 不要移除所有监听器，只移除测试相关的
      // process.removeAllListeners();
    } catch (error) {
      // 静默处理
    }
  }
  
  // 清理模块缓存中的特定模块（谨慎使用）
  try {
    // 不要清理所有模块缓存，只清理可能有副作用的模块
    const moduleKeys = Object.keys(require.cache || {});
    const problematicModules = moduleKeys.filter(key => 
      key.includes('supabaseService') || 
      key.includes('commandController') ||
      key.includes('queueManager')
    );
    
    // 实际上不删除缓存，因为这可能导致其他问题
    // problematicModules.forEach(key => delete require.cache[key]);
  } catch (error) {
    // 静默处理
  }
};

// 在每个测试前重置
beforeEach(() => {
  jest.clearAllMocks();
  clearAllTimers();
  global.activePromises.clear();
});

// 在每个测试后清理
afterEach(async () => {
  // 执行注册的清理函数
  while (global.testCleanup.length > 0) {
    const cleanup = global.testCleanup.pop();
    try {
      await cleanup();
    } catch (error) {
      // 静默处理清理错误
    }
  }
  
  // 清理模拟的订阅
  mockCleanupSubscriptions();
  
  // 清理计时器
  clearAllTimers();
  
  // 清理所有模拟
  jest.clearAllMocks();
  
  // 等待所有活跃的Promise完成
  if (global.activePromises.size > 0) {
    try {
      await Promise.allSettled(Array.from(global.activePromises));
    } catch (error) {
      // 静默处理Promise清理错误
    }
    global.activePromises.clear();
  }
  
  // 强制垃圾回收（如果可用）
  if (global.gc) {
    try {
      global.gc();
    } catch (error) {
      // 静默处理
    }
  }
  
  // 等待多个事件循环以确保所有异步操作完成
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
});

// 在所有测试完成后的最终清理
afterAll(async () => {
  // 强制清理
  forceCleanup();
  
  // 清理全局状态
  global.testCleanup = [];
  global.activeTimers.clear();
  global.activePromises.clear();
  
  // 给异步操作一些时间来完成
  await new Promise(resolve => setImmediate(resolve));
  
  // 最终清理
  mockCleanupSubscriptions();
  
  // 再次强制清理
  forceCleanup();
  
  // 最后的垃圾回收
  if (global.gc) {
    try {
      global.gc();
    } catch (error) {
      // 静默处理
    }
  }
  
  // 等待多个事件循环
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}); 