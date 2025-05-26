#!/usr/bin/env node

// Supabase 服务状态监控器
import { ensureSupabaseConnection } from './src/services/supabaseService.js';

console.clear();
console.log('🔍 Supabase 服务状态监控器启动中...\n');

// 监控统计
const stats = {
  totalChecks: 0,
  successfulConnections: 0,
  failedConnections: 0,
  consecutiveFailures: 0,
  longestFailureStreak: 0,
  lastSuccessTime: null,
  startTime: new Date()
};

// 显示状态的函数
const displayStatus = async () => {
  console.clear();
  
  const now = new Date();
  const uptime = Math.floor((now - stats.startTime) / 1000);
  const uptimeDisplay = `${Math.floor(uptime / 60)}分${uptime % 60}秒`;
  
  console.log('═══════════════════════════════════════════════');
  console.log('🚀 CursorRemote Supabase 服务状态监控');
  console.log('═══════════════════════════════════════════════');
  console.log(`⏰ 运行时间: ${uptimeDisplay}`);
  console.log(`📊 检查次数: ${stats.totalChecks}`);
  console.log('───────────────────────────────────────────────');
  
  try {
    const isConnected = await ensureSupabaseConnection();
    stats.totalChecks++;
    
    if (isConnected) {
      stats.successfulConnections++;
      stats.consecutiveFailures = 0;
      stats.lastSuccessTime = now;
      
      console.log('🟢 连接状态: 正常');
      console.log('✅ Supabase 连接健康');
    } else {
      stats.failedConnections++;
      stats.consecutiveFailures++;
      stats.longestFailureStreak = Math.max(stats.longestFailureStreak, stats.consecutiveFailures);
      
      console.log('🔴 连接状态: 异常');
      console.log('❌ Supabase 连接失败');
    }
  } catch (error) {
    stats.failedConnections++;
    stats.consecutiveFailures++;
    stats.longestFailureStreak = Math.max(stats.longestFailureStreak, stats.consecutiveFailures);
    
    console.log('🔴 连接状态: 错误');
    console.log(`❌ 错误: ${error.message}`);
  }
  
  // 显示详细统计
  console.log('───────────────────────────────────────────────');
  console.log('📈 连接统计:');
  console.log(`   成功: ${stats.successfulConnections} (${((stats.successfulConnections / Math.max(stats.totalChecks, 1)) * 100).toFixed(1)}%)`);
  console.log(`   失败: ${stats.failedConnections} (${((stats.failedConnections / Math.max(stats.totalChecks, 1)) * 100).toFixed(1)}%)`);
  console.log(`   当前连续失败: ${stats.consecutiveFailures}`);
  console.log(`   最长失败连续: ${stats.longestFailureStreak}`);
  
  if (stats.lastSuccessTime) {
    const timeSinceSuccess = Math.floor((now - stats.lastSuccessTime) / 1000);
    console.log(`   上次成功: ${timeSinceSuccess}秒前`);
  } else {
    console.log('   上次成功: 从未');
  }
  
  console.log('───────────────────────────────────────────────');
  console.log('💡 提示: 按 Ctrl+C 停止监控');
  console.log(`⏳ 下次检查: 5秒后 (${now.toLocaleTimeString()})`);
};

// 立即显示状态
displayStatus();

// 每5秒更新状态
const monitorTimer = setInterval(displayStatus, 5000);

// 处理优雅退出
const gracefulExit = () => {
  console.clear();
  console.log('═══════════════════════════════════════════════');
  console.log('🛑 Supabase 服务监控已停止');
  console.log('═══════════════════════════════════════════════');
  
  const runtime = Math.floor((new Date() - stats.startTime) / 1000);
  const runtimeDisplay = `${Math.floor(runtime / 60)}分${runtime % 60}秒`;
  
  console.log(`⏰ 总运行时间: ${runtimeDisplay}`);
  console.log(`📊 总检查次数: ${stats.totalChecks}`);
  console.log(`✅ 成功率: ${((stats.successfulConnections / Math.max(stats.totalChecks, 1)) * 100).toFixed(1)}%`);
  console.log('───────────────────────────────────────────────');
  console.log('👋 监控已结束，感谢使用！');
  
  clearInterval(monitorTimer);
  process.exit(0);
};

process.on('SIGINT', gracefulExit);
process.on('SIGTERM', gracefulExit); 