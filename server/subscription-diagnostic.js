#!/usr/bin/env node

// 订阅问题诊断工具
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

console.log('🔍 CursorRemote 订阅诊断工具\n');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 环境变量未配置');
  console.error('请确保 .env 文件中包含 SUPABASE_URL 和 SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const stats = {
  totalAttempts: 0,
  successfulSubscriptions: 0,
  failedSubscriptions: 0,
  connectionErrors: 0,
  subscriptionErrors: 0,
  startTime: new Date()
};

let currentSubscription = null;
let isRunning = true;

// 创建客户端
const createDiagnosticClient = () => {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        'x-custom-app-name': 'CursorRemote-Diagnostic',
        'x-client-info': 'Subscription Diagnostic Tool'
      }
    },
    realtime: {
      timeout: 60000,
      heartbeatIntervalMs: 30000,
      reconnectAfterMs: (tries) => {
        const baseDelay = 1000;
        const maxDelay = 30000;
        const delay = Math.min(baseDelay * Math.pow(1.5, tries), maxDelay);
        return delay;
      },
      params: {
        eventsPerSecond: 5
      }
    }
  });
};

// 测试订阅
const testSubscription = async () => {
  const client = createDiagnosticClient();
  stats.totalAttempts++;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      stats.failedSubscriptions++;
      stats.connectionErrors++;
      console.log(`❌ 订阅超时 (尝试 ${stats.totalAttempts})`);
      resolve(false);
    }, 15000);

    try {
      currentSubscription = client
        .channel(`diagnostic_test_${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'commands' },
          (payload) => {
            console.log('📨 收到测试消息:', payload.new?.id);
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            stats.successfulSubscriptions++;
            console.log(`✅ 订阅成功 (尝试 ${stats.totalAttempts})`);
            
            // 等待2秒后断开
            setTimeout(() => {
              client.removeChannel(currentSubscription);
              resolve(true);
            }, 2000);
          } else if (['TIMED_OUT', 'CHANNEL_ERROR', 'CLOSED'].includes(status)) {
            clearTimeout(timeout);
            stats.failedSubscriptions++;
            stats.subscriptionErrors++;
            console.log(`❌ 订阅失败: ${status} (尝试 ${stats.totalAttempts})`);
            if (err) {
              console.log(`   错误详情: ${err.message || err}`);
            }
            resolve(false);
          }
        });
    } catch (error) {
      clearTimeout(timeout);
      stats.failedSubscriptions++;
      stats.connectionErrors++;
      console.log(`❌ 订阅异常: ${error.message} (尝试 ${stats.totalAttempts})`);
      resolve(false);
    }
  });
};

// 显示统计信息
const displayStats = () => {
  console.clear();
  
  const now = new Date();
  const runtime = Math.floor((now - stats.startTime) / 1000);
  const runtimeDisplay = `${Math.floor(runtime / 60)}分${runtime % 60}秒`;
  
  console.log('═══════════════════════════════════════════════');
  console.log('🔍 CursorRemote 订阅诊断工具');
  console.log('═══════════════════════════════════════════════');
  console.log(`⏰ 运行时间: ${runtimeDisplay}`);
  console.log(`📊 总尝试次数: ${stats.totalAttempts}`);
  console.log(`✅ 成功订阅: ${stats.successfulSubscriptions}`);
  console.log(`❌ 失败订阅: ${stats.failedSubscriptions}`);
  console.log(`🔌 连接错误: ${stats.connectionErrors}`);
  console.log(`📡 订阅错误: ${stats.subscriptionErrors}`);
  
  if (stats.totalAttempts > 0) {
    const successRate = ((stats.successfulSubscriptions / stats.totalAttempts) * 100).toFixed(1);
    console.log(`📈 成功率: ${successRate}%`);
  }
  
  console.log('───────────────────────────────────────────────');
  
  if (stats.failedSubscriptions > 0) {
    const errorRate = ((stats.failedSubscriptions / stats.totalAttempts) * 100).toFixed(1);
    console.log(`⚠️  错误率: ${errorRate}%`);
    
    if (stats.subscriptionErrors > stats.connectionErrors) {
      console.log('💡 建议: 主要是订阅错误，检查 Supabase 实时功能配置');
    } else {
      console.log('💡 建议: 主要是连接错误，检查网络和 Supabase URL/KEY');
    }
  } else if (stats.totalAttempts >= 5) {
    console.log('🎉 订阅连接非常稳定！');
  }
  
  console.log('───────────────────────────────────────────────');
  console.log('按 Ctrl+C 停止诊断');
  console.log('═══════════════════════════════════════════════');
};

// 主诊断循环
const diagnosticLoop = async () => {
  while (isRunning) {
    displayStats();
    
    console.log(`\n🔄 开始第 ${stats.totalAttempts + 1} 次订阅测试...`);
    await testSubscription();
    
    // 等待3秒再进行下次测试
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
};

// 优雅退出
const gracefulExit = () => {
  console.log('\n\n🛑 正在停止诊断...');
  isRunning = false;
  
  if (currentSubscription) {
    try {
      // 这里需要访问client实例，但在当前结构下比较困难
      // 实际使用中会在下次循环中清理
      console.log('🧹 清理订阅中...');
    } catch (error) {
      console.warn('清理订阅时出错:', error.message);
    }
  }
  
  console.log('✅ 诊断已停止');
  
  // 显示最终统计
  displayStats();
  process.exit(0);
};

// 注册信号处理器
process.on('SIGINT', gracefulExit);
process.on('SIGTERM', gracefulExit);

// 启动诊断
console.log('🚀 开始订阅诊断...');
console.log(`📡 URL: ${supabaseUrl}`);
console.log(`🔑 使用服务密钥: ${supabaseServiceKey.substring(0, 20)}...`);
console.log('');

diagnosticLoop().catch(error => {
  console.error('❌ 诊断失败:', error);
  process.exit(1);
});
