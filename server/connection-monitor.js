#!/usr/bin/env node

// Supabase 连接监控和诊断工具
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

console.clear();
console.log('🔍 Supabase 连接监控器启动中...\n');

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
      console.warn('清理旧连接时出错:', error.message);
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
  
  console.log('═══════════════════════════════════════════════');
  console.log('🚀 CursorRemote Supabase 连接监控器');
  console.log('═══════════════════════════════════════════════');
  console.log(`⏰ 运行时间: ${uptimeDisplay}`);
  console.log(`📊 检查次数: ${stats.totalChecks}`);
  console.log('───────────────────────────────────────────────');
  
  // 连接状态
  const successRate = stats.totalChecks > 0 ? 
    ((stats.successfulConnections / stats.totalChecks) * 100).toFixed(1) : '0.0';
  
  console.log(`✅ 成功连接: ${stats.successfulConnections} (${successRate}%)`);
  console.log(`❌ 失败连接: ${stats.failedConnections}`);
  console.log(`🔄 连续失败: ${stats.consecutiveFailures}`);
  console.log(`📈 最长失败: ${stats.longestFailureStreak}`);
  
  // 性能统计
  if (stats.connectionTimes.length > 0) {
    const avgTime = stats.connectionTimes.reduce((a, b) => a + b, 0) / stats.connectionTimes.length;
    const minTime = Math.min(...stats.connectionTimes);
    const maxTime = Math.max(...stats.connectionTimes);
    
    console.log('───────────────────────────────────────────────');
    console.log('⚡ 连接性能:');
    console.log(`   平均响应: ${avgTime.toFixed(0)}ms`);
    console.log(`   最快响应: ${minTime}ms`);
    console.log(`   最慢响应: ${maxTime}ms`);
  }
  
  // 错误类型统计
  if (stats.errorTypes.size > 0) {
    console.log('───────────────────────────────────────────────');
    console.log('🚨 错误类型统计:');
    for (const [errorType, count] of stats.errorTypes.entries()) {
      console.log(`   ${errorType}: ${count}次`);
    }
  }
  
  // 最后成功时间
  if (stats.lastSuccessTime) {
    const timeSinceSuccess = Math.floor((now - stats.lastSuccessTime) / 1000);
    console.log('───────────────────────────────────────────────');
    console.log(`🕐 最后成功: ${timeSinceSuccess}秒前`);
  }
  
  console.log('───────────────────────────────────────────────');
  console.log('按 Ctrl+C 退出监控');
  console.log('═══════════════════════════════════════════════');
};

// 执行连接测试
const performCheck = async () => {
  if (!isMonitoring) return;
  
  stats.totalChecks++;
  
  // 每10次检查创建新客户端，模拟长期运行
  if (stats.totalChecks % 10 === 1) {
    console.log('🔄 创建新客户端连接...');
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
    
    console.log(`❌ 连接失败 (${result.duration}ms): ${result.error}`);
    
    // 连续失败3次时重新创建客户端
    if (stats.consecutiveFailures >= 3) {
      console.log('🔄 连续失败过多，重新创建客户端...');
      createNewClient();
    }
  }
  
  await displayStatus();
};

// 优雅退出
const gracefulExit = () => {
  console.log('\n\n🛑 正在停止监控...');
  isMonitoring = false;
  
  if (currentClient) {
    try {
      currentClient.removeAllChannels();
    } catch (error) {
      console.warn('清理连接时出错:', error.message);
    }
  }
  
  console.log('✅ 监控已停止');
  process.exit(0);
};

// 主监控循环
const startMonitoring = async () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ 环境变量未配置');
    console.error('请确保 .env 文件中包含 SUPABASE_URL 和 SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  
  console.log('🚀 开始监控 Supabase 连接...');
  console.log(`📡 URL: ${supabaseUrl}`);
  console.log(`🔑 使用服务密钥: ${supabaseServiceKey.substring(0, 20)}...`);
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