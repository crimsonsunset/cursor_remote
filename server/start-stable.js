#!/usr/bin/env node

// 稳定模式启动脚本 - 禁用心跳检查，依赖 Supabase 自身的重连机制
import { SupabaseService, SupabaseConfig } from './src/services/supabaseService.js';
import dotenv from 'dotenv';

dotenv.config();

console.log('🚀 CursorRemote 稳定模式启动中...\n');

// 创建稳定配置（禁用心跳检查）
const config = new SupabaseConfig({
  url: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_KEY,
  enableHeartbeatCheck: false, // 明确禁用心跳检查
  maxConnectionAttempts: 10,
  connectionRetryDelay: 5000,
  maxSubscriptionRetries: 15
});

// 创建自定义日志器
const logger = {
  log: (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${msg}`);
  },
  warn: (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    console.warn(`[${timestamp}] ⚠️  ${msg}`);
  },
  error: (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    console.error(`[${timestamp}] ❌ ${msg}`);
  }
};

async function startStableService() {
  try {
    // 验证配置
    config.validate();
    console.log('✅ 配置验证通过');
    
    // 显示配置信息
    console.log('📊 稳定模式配置:');
    console.log(`   - 心跳检查: ❌ 禁用`);
    console.log(`   - 最大连接尝试: ${config.maxConnectionAttempts}次`);
    console.log(`   - 连接重试延迟: ${config.connectionRetryDelay / 1000}秒`);
    console.log(`   - 最大订阅重试: ${config.maxSubscriptionRetries}次`);
    console.log('   - 依赖: Supabase 自身重连机制');
    console.log('');
    
    // 创建服务实例
    const service = new SupabaseService(config, logger);
    
    // 初始化服务
    console.log('🚀 初始化服务...');
    const initialized = await service.initialize();
    
    if (!initialized) {
      console.error('❌ 服务初始化失败');
      process.exit(1);
    }
    
    console.log('✅ 服务初始化成功');
    console.log('🔄 服务运行中...');
    console.log('💡 稳定模式：依赖 Supabase 自身的重连机制，不进行额外的心跳检查');
    console.log('按 Ctrl+C 停止服务\n');
    
    // 定期显示状态（降低频率）
    const statusInterval = setInterval(() => {
      const status = service.getStatus();
      
      console.log(`📊 服务状态:`);
      console.log(`   - 连接状态: ${status.isConnected ? '✅ 已连接' : '❌ 未连接'}`);
      console.log(`   - 客户端可用: ${status.hasClient ? '✅ 是' : '❌ 否'}`);
      console.log(`   - 连接尝试: ${status.connectionAttempts}`);
      console.log(`   - 连续失败: ${status.consecutiveFailures}次`);
      
      if (status.lastSuccessfulConnection) {
        const timeSinceSuccess = Math.round((Date.now() - status.lastSuccessfulConnection.getTime()) / 1000);
        console.log(`   - 最后成功: ${timeSinceSuccess}秒前`);
      }
      
      console.log('');
    }, 60000); // 每分钟显示一次状态
    
    // 优雅关闭处理
    const gracefulShutdown = async () => {
      console.log('\n🛑 正在关闭服务...');
      clearInterval(statusInterval);
      await service.shutdown();
      console.log('✅ 服务已关闭');
      process.exit(0);
    };
    
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
    
  } catch (error) {
    console.error('❌ 启动失败:', error.message);
    process.exit(1);
  }
}

// 启动服务
startStableService().catch(error => {
  console.error('❌ 启动过程中发生错误:', error);
  process.exit(1);
}); 