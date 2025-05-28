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

// Mock Supabase client 的订阅清理
const mockCleanupSubscriptions = () => {
  // 清理任何活跃的 WebSocket 连接
  if (global.WebSocket?.prototype) {
    // 模拟关闭所有 WebSocket 连接
  }
};

// 在每个测试前重置
beforeEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
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
  
  jest.clearAllTimers();
  jest.clearAllMocks();
  
  // 强制垃圾回收（如果可用）
  if (global.gc) {
    global.gc();
  }
});

// 在所有测试完成后的最终清理
afterAll(async () => {
  // 清理任何剩余的异步操作
  jest.clearAllTimers();
  jest.clearAllMocks();
  
  // 清理全局状态（通过重新赋值而不是 delete）
  global.errorStats = undefined;
  global.testCleanup = [];
  
  // 给异步操作一些时间来完成，然后强制关闭
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 如果还有异步操作，强制清理
  if (process?.exit) {
    // 注意：这是最后的手段，正常情况下不应该需要这个
    // process.exit(0);
  }
}); 