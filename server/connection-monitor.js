#!/usr/bin/env node

// Supabase connection monitoring and diagnostic tool
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import i18n from './src/config/i18n-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

console.clear();
console.log(i18n.__('info.connection_monitor_starting') + '\n');

// 监控统计
const stats = {
  totalChecks: 0,
  successfulConnections: 0,
  failedConnections: 0,
  consecutiveFailures: 0,
  longestFailureStreak: 0,
  lastSuccessTime: null,
  startTime: new Date(),
  connectionTimes: [],
  errorTypes: new Map()
};

let currentClient = null;
let isMonitoring = true;

// 创建新的客户端连接
const createNewClient = () => {
  if (currentClient) {
    try {
      currentClient.removeAllChannels();
    } catch (error) {
      console.warn(i18n.__('warnings.cleanup_error', { message: error.message }));
    }
  }
  
  currentClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        'x-custom-app-name': 'CursorRemote-Monitor',
        'x-client-info': 'Connection Monitor',
        'Cache-Control': 'no-cache'
      }
    },
    realtime: {
      timeout: 30000,
      heartbeatIntervalMs: 15000,
      reconnectAfterMs: (tries) => Math.min(tries * 500, 10000)
    }
  });
  
  return currentClient;
};

// 测试连接性能
const testConnection = async () => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await currentClient
      .from('commands')
      .select('id')
      .limit(1);
    
    const duration = Date.now() - startTime;
    stats.connectionTimes.push(duration);
    
    // 只保留最近100次的连接时间
    if (stats.connectionTimes.length > 100) {
      stats.connectionTimes.shift();
    }
    
    if (error) {
      throw new Error(error.message);
    }
    
    return { success: true, duration, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    return { success: false, duration, error: error.message };
  }
};

// 显示状态的函数
const displayStatus = async () => {
  console.clear();
  
  const now = new Date();
  const uptime = Math.floor((now - stats.startTime) / 1000);
  const uptimeDisplay = `${Math.floor(uptime / 60)}分${uptime % 60}秒`;
  
  console.log(i18n.__('info.separator_line'));
  console.log(i18n.__('info.service_monitor_header'));
  console.log(i18n.__('info.separator_line'));
  console.log(i18n.__('info.runtime', { uptime: uptimeDisplay }));
  console.log(i18n.__('info.check_count', { count: stats.totalChecks }));
  console.log('───────────────────────────────────────────────');
  
  // 连接状态
  const successRate = stats.totalChecks > 0 ? 
    ((stats.successfulConnections / stats.totalChecks) * 100).toFixed(1) : '0.0';
  
  console.log(i18n.__('connection.successful', { count: stats.successfulConnections, rate: successRate }));
  console.log(i18n.__('connection.failed', { count: stats.failedConnections }));
  console.log(i18n.__('connection.consecutive_failures', { count: stats.consecutiveFailures }));
  console.log(i18n.__('connection.longest_failure_streak', { count: stats.longestFailureStreak }));
  
  // 性能统计
  if (stats.connectionTimes.length > 0) {
    const avgTime = stats.connectionTimes.reduce((a, b) => a + b, 0) / stats.connectionTimes.length;
    const minTime = Math.min(...stats.connectionTimes);
    const maxTime = Math.max(...stats.connectionTimes);
    
    console.log('───────────────────────────────────────────────');
    console.log(i18n.__('connection.performance_header'));
    console.log(i18n.__('connection.avg_response', { time: avgTime.toFixed(0) }));
    console.log(i18n.__('connection.min_response', { time: minTime }));
    console.log(i18n.__('connection.max_response', { time: maxTime }));
  }
  
  // 错误类型统计
  if (stats.errorTypes.size > 0) {
    console.log('───────────────────────────────────────────────');
    console.log(i18n.__('connection.error_types_header'));
    for (const [errorType, count] of stats.errorTypes.entries()) {
      console.log(i18n.__('connection.error_type_count', { type: errorType, count }));
    }
  }
  
  // 最后成功时间
  if (stats.lastSuccessTime) {
    const timeSinceSuccess = Math.floor((now - stats.lastSuccessTime) / 1000);
    console.log('───────────────────────────────────────────────');
    console.log(i18n.__('connection.last_success_time', { seconds: timeSinceSuccess }));
  }
  
  console.log('───────────────────────────────────────────────');
  console.log(i18n.__('monitoring.exit_instructions'));
  console.log('═══════════════════════════════════════════════');
};

// 执行连接测试
const performCheck = async () => {
  if (!isMonitoring) return;
  
  stats.totalChecks++;
  
  // 每10次检查创建新客户端，模拟长期运行
  if (stats.totalChecks % 10 === 1) {
    console.log(i18n.__('connection.creating_new_client'));
    createNewClient();
  }
  
  const result = await testConnection();
  
  if (result.success) {
    stats.successfulConnections++;
    stats.consecutiveFailures = 0;
    stats.lastSuccessTime = new Date();
  } else {
    stats.failedConnections++;
    stats.consecutiveFailures++;
    
    if (stats.consecutiveFailures > stats.longestFailureStreak) {
      stats.longestFailureStreak = stats.consecutiveFailures;
    }
    
    // 记录错误类型
    const errorType = result.error.split(':')[0] || 'Unknown';
    stats.errorTypes.set(errorType, (stats.errorTypes.get(errorType) || 0) + 1);
    
    console.log(i18n.__('connection.connection_failed', { duration: result.duration, error: result.error }));
    
    // 连续失败3次时重新创建客户端
    if (stats.consecutiveFailures >= 3) {
      console.log(i18n.__('connection.too_many_failures'));
      createNewClient();
    }
  }
  
  await displayStatus();
};

// 优雅退出
const gracefulExit = () => {
  console.log('\n\n' + i18n.__('connection.stopping_monitor'));
  isMonitoring = false;
  
  if (currentClient) {
    try {
      currentClient.removeAllChannels();
    } catch (error) {
      console.warn('清理连接时出错:', error.message);
    }
  }
  
  console.log(i18n.__('connection.monitor_stopped'));
  process.exit(0);
};

// 主监控循环
const startMonitoring = async () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ 环境变量未配置');
    console.error('请确保 .env 文件中包含 SUPABASE_URL 和 SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  
  console.log(i18n.__('connection.starting_monitor'));
  console.log(`📡 URL: ${supabaseUrl}`);
  console.log(i18n.__('connection.service_key_display', { key: supabaseServiceKey.substring(0, 20) }));
  console.log('');
  
  // 创建初始客户端
  createNewClient();
  
  // 立即执行第一次检查
  await performCheck();
  
  // 每5秒执行一次检查
  const checkInterval = setInterval(async () => {
    if (isMonitoring) {
      await performCheck();
    } else {
      clearInterval(checkInterval);
    }
  }, 5000);
};

// 注册信号处理器
process.on('SIGINT', gracefulExit);
process.on('SIGTERM', gracefulExit);

// 启动监控
startMonitoring().catch(error => {
  console.error('❌ 监控启动失败:', error);
  process.exit(1);
}); 