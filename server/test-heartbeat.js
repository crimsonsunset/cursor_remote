#!/usr/bin/env node

// 心跳机制测试脚本
import { SupabaseService, SupabaseConfig } from './src/services/supabaseService.js';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔄 测试优化后的心跳机制...\n');

// 创建配置
const config = new SupabaseConfig({
  url: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_KEY,
  maxConnectionRetries: 3,
  connectionRetryDelay: 5000,
  maxSubscriptionRetries: 5,
  healthCheckInterval: 30000 // 30秒用于测试
});

// 创建自定义日志器来显示心跳信息
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
  },
  info: (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    console.info(`[${timestamp}] ℹ️  ${msg}`);
  },
  debug: (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    console.debug(`[${timestamp}] 🐛 ${msg}`);
  }
};

async function testHeartbeat() {
  try {
    // 验证配置
    if (!config.validate()) {
      console.error('❌ 配置验证失败');
      return;
    }

    console.log('✅ 配置验证通过');
    console.log(`📊 心跳检查间隔: ${config.healthCheckInterval / 1000}秒`);
    
    // 创建服务实例
    const service = new SupabaseService(config, logger);
    
    // 显示心跳配置
    console.log(`📊 订阅管理器配置:`);
    console.log(`   - 健康检查间隔: ${service.subscriptionManager.healthCheckInterval / 1000}秒`);
    console.log(`   - 心跳超时时间: ${service.subscriptionManager.heartbeatTimeout / 1000}秒`);
    console.log(`   - 最大丢失次数: ${service.subscriptionManager.maxMissedHeartbeats}次`);
    console.log('');

    // 初始化服务
    console.log('🚀 初始化服务...');
    const initialized = await service.initialize();
    
    if (!initialized) {
      console.error('❌ 服务初始化失败');
      return;
    }
    
    console.log('✅ 服务初始化成功');
    console.log('🔄 监控心跳状态...');
    console.log('按 Ctrl+C 停止监控\n');
    
    // 定期显示状态
    const statusInterval = setInterval(() => {
      const status = service.getStatus();
      const subscriptionManager = service.subscriptionManager;
      
      console.log(`📊 状态报告:`);
      console.log(`   - 连接状态: ${status.isConnected ? '✅ 已连接' : '❌ 未连接'}`);
      console.log(`   - 订阅状态: ${status.isSubscribed ? '✅ 已订阅' : '❌ 未订阅'}`);
      console.log(`   - 丢失心跳: ${subscriptionManager.missedHeartbeats}/${subscriptionManager.maxMissedHeartbeats}`);
      
      if (subscriptionManager.lastHeartbeat) {
        const timeSinceLastHeartbeat = Date.now() - subscriptionManager.lastHeartbeat;
        console.log(`   - 上次心跳: ${Math.round(timeSinceLastHeartbeat / 1000)}秒前`);
      } else {
        console.log(`   - 上次心跳: 无`);
      }
      
      console.log(`   - 连续失败: ${status.consecutiveFailures}次`);
      console.log('');
    }, 15000); // 每15秒显示一次状态
    
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
    console.error('❌ 测试过程中发生错误:', error);
    process.exit(1);
  }
}

// 启动测试
testHeartbeat().catch(error => {
  console.error('❌ 启动测试失败:', error);
  process.exit(1);
}); 