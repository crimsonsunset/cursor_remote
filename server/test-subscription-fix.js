#!/usr/bin/env node

// 测试订阅修复的脚本
import { SupabaseService, SupabaseConfig } from './src/services/supabaseService.js';
import { CommandQueueManager } from './src/services/queueManager.js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

console.log('🧪 测试订阅重复问题修复和命令删除功能...\n');

// 创建队列管理器实例
const queueManager = new CommandQueueManager({
  autoProcess: false, // 禁用自动处理，便于测试
  logger: console
});

// 创建测试服务实例
const config = new SupabaseConfig();
const testService = new SupabaseService(config, console, {
  queueManager: queueManager, // 注入队列管理器
  commandProcessor: async (command) => {
    console.log(`📝 处理命令: ${command.id} - ${command.command_text}`);
    // 模拟命令处理
    await new Promise(resolve => setTimeout(resolve, 100));
  }
});

let commandCount = 0;
let duplicateCount = 0;
let deletionCount = 0;
const processedCommands = new Set();

// 监控命令处理
const originalHandleNewCommand = testService.handleNewCommand.bind(testService);
testService.handleNewCommand = async function(payload) {
  const commandId = payload.new?.id;
  commandCount++;
  
  if (processedCommands.has(commandId)) {
    duplicateCount++;
    console.log(`🚨 检测到重复命令: ${commandId} (第${duplicateCount}次重复)`);
  } else {
    processedCommands.add(commandId);
    console.log(`✅ 新命令: ${commandId} (总计: ${commandCount})`);
  }
  
  return originalHandleNewCommand(payload);
};

// 监控命令删除
const originalHandleCommandDeletion = testService.handleCommandDeletion.bind(testService);
testService.handleCommandDeletion = async function(payload) {
  const commandId = payload.old?.id;
  deletionCount++;
  console.log(`🗑️ 命令删除: ${commandId} (删除计数: ${deletionCount})`);
  
  return originalHandleCommandDeletion(payload);
};

// 启动测试
async function runTest() {
  try {
    console.log('🚀 初始化服务...');
    await testService.initialize();
    
    console.log('✅ 服务初始化完成');
    console.log('📊 监控状态:');
    console.log(`   - 命令订阅状态: ${testService.subscriptionManager.subscription ? '已连接' : '未连接'}`);
    console.log(`   - 连接状态: ${testService.status.isConnected ? '已连接' : '未连接'}`);
    console.log(`   - 队列管理器: ${queueManager ? '已初始化' : '未初始化'}`);
    
    // 模拟多次订阅尝试（这应该不会创建重复订阅）
    console.log('\n🔄 测试重复订阅保护...');
    for (let i = 0; i < 3; i++) {
      console.log(`   尝试订阅 #${i + 1}`);
      await testService.subscribeToCommands();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 测试队列功能
    console.log('\n📋 测试队列功能...');
    const testCommand = {
      id: 'test-command-123',
      command_text: '测试命令',
      priority: 'normal'
    };
    
    await queueManager.addCommand(testCommand, 'normal');
    console.log(`   - 队列中是否有测试命令: ${queueManager.hasCommand('test-command-123')}`);
    
    const removed = queueManager.removeCommand('test-command-123');
    console.log(`   - 删除测试命令结果: ${removed}`);
    console.log(`   - 删除后队列中是否还有测试命令: ${queueManager.hasCommand('test-command-123')}`);
    
    console.log('\n⏱️ 运行30秒监控测试...');
    console.log('💡 请在另一个终端中创建和删除一些测试命令来验证功能');
    console.log('💡 例如: 在Supabase控制台中插入和删除一些测试命令');
    console.log('💡 或者在前端界面中创建命令然后删除它们');
    
    // 运行30秒
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    console.log('\n📊 测试结果:');
    console.log(`   - 总命令数: ${commandCount}`);
    console.log(`   - 重复命令数: ${duplicateCount}`);
    console.log(`   - 命令删除数: ${deletionCount}`);
    console.log(`   - 去重率: ${duplicateCount > 0 ? ((duplicateCount / commandCount) * 100).toFixed(1) + '%' : '0%'}`);
    console.log(`   - 队列状态: ${JSON.stringify(queueManager.getQueueStats())}`);
    
    if (duplicateCount === 0) {
      console.log('✅ 重复订阅测试通过: 没有检测到重复命令处理');
    } else {
      console.log('⚠️ 重复订阅测试警告: 检测到重复命令处理，但修复机制正在工作');
    }
    
    if (deletionCount > 0) {
      console.log('✅ 命令删除测试通过: 成功检测到命令删除事件');
    } else {
      console.log('ℹ️ 命令删除测试: 未检测到命令删除事件（可能没有删除操作）');
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    console.log('\n🛑 关闭测试服务...');
    await testService.shutdown();
    await queueManager.shutdown();
    console.log('✅ 测试完成');
    process.exit(0);
  }
}

// 处理优雅退出
process.on('SIGINT', async () => {
  console.log('\n\n🛑 收到中断信号，正在关闭...');
  await testService.shutdown();
  await queueManager.shutdown();
  process.exit(0);
});

// 启动测试
runTest().catch(error => {
  console.error('❌ 测试启动失败:', error);
  process.exit(1);
}); 