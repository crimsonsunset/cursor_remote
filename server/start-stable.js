#!/usr/bin/env node

// Stable mode startup script - disables heartbeat check, relies on Supabase's own reconnection mechanism
import { SupabaseService, SupabaseConfig } from './src/services/supabaseService.js';
import dotenv from 'dotenv';
import i18n from './src/config/i18n-config.js';

dotenv.config();

console.log(i18n.__('stable.starting') + '\n');

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
    console.log(i18n.__('stable.config_validated'));
    
    // 显示配置信息
    console.log(i18n.__('stable.config_header'));
    console.log(i18n.__('stable.heartbeat_disabled'));
    console.log(i18n.__('stable.max_connection_attempts', { count: config.maxConnectionAttempts }));
    console.log(i18n.__('stable.connection_retry_delay', { seconds: config.connectionRetryDelay / 1000 }));
    console.log(i18n.__('stable.max_subscription_retries', { count: config.maxSubscriptionRetries }));
    console.log(i18n.__('stable.relies_on_supabase'));
    console.log('');
    
    // 创建服务实例
    const service = new SupabaseService(config, logger);
    
    // 初始化服务
    console.log(i18n.__('stable.initializing_service'));
    const initialized = await service.initialize();
    
    if (!initialized) {
      console.error(i18n.__('stable.initialization_failed'));
      process.exit(1);
    }
    
    console.log(i18n.__('stable.initialization_complete'));
    console.log(i18n.__('stable.service_ready'));
    console.log('💡 Stable mode: Relies on Supabase\'s own reconnection mechanism, no additional heartbeat checks');
    console.log('Press Ctrl+C to stop service\n');
    
    // 定期显示状态（降低频率）
    const statusInterval = setInterval(() => {
      const status = service.getStatus();
      
      console.log('📊 Service Status:');
      console.log(`   - Connection status: ${status.isConnected ? '✅ Connected' : '❌ Disconnected'}`);
      console.log(`   - Client available: ${status.hasClient ? '✅ Yes' : '❌ No'}`);
      console.log(`   - Connection attempts: ${status.connectionAttempts}`);
      console.log(`   - Consecutive failures: ${status.consecutiveFailures} times`);
      
      if (status.lastSuccessfulConnection) {
        const timeSinceSuccess = Math.round((Date.now() - status.lastSuccessfulConnection.getTime()) / 1000);
        console.log(`   - Last success: ${timeSinceSuccess} seconds ago`);
      }
      
      console.log('');
    }, 60000); // 每分钟显示一次状态
    
    // 优雅关闭处理
    const gracefulShutdown = async () => {
      console.log('\n' + i18n.__('stable.graceful_shutdown'));
      clearInterval(statusInterval);
      await service.shutdown();
      console.log(i18n.__('stable.service_stopped'));
      process.exit(0);
    };
    
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
    
  } catch (error) {
    console.error(i18n.__('stable.startup_failed'), error.message);
    process.exit(1);
  }
}

// 启动服务
startStableService().catch(error => {
  console.error('❌ Error during startup:', error);
  process.exit(1);
}); 