#!/usr/bin/env node

// Supabase Service Status Monitor
import { ensureSupabaseConnection } from './src/services/supabaseService.js';
import i18n from './src/config/i18n-config.js';

console.clear();
console.log(i18n.__('monitor.service_starting') + '\n');

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
  console.log(i18n.__('monitor.service_header'));
  console.log('═══════════════════════════════════════════════');
  console.log(i18n.__('monitor.runtime', { uptime: uptimeDisplay }));
  console.log(i18n.__('monitor.check_count', { count: stats.totalChecks }));
  console.log('───────────────────────────────────────────────');
  
  try {
    const isConnected = await ensureSupabaseConnection();
    stats.totalChecks++;
    
    if (isConnected) {
      stats.successfulConnections++;
      stats.consecutiveFailures = 0;
      stats.lastSuccessTime = now;
      
      console.log(i18n.__('monitor.connection_normal'));
      console.log(i18n.__('monitor.connection_healthy'));
    } else {
      stats.failedConnections++;
      stats.consecutiveFailures++;
      stats.longestFailureStreak = Math.max(stats.longestFailureStreak, stats.consecutiveFailures);
      
      console.log(i18n.__('monitor.connection_abnormal'));
      console.log(i18n.__('monitor.connection_failed'));
    }
  } catch (error) {
    stats.failedConnections++;
    stats.consecutiveFailures++;
    stats.longestFailureStreak = Math.max(stats.longestFailureStreak, stats.consecutiveFailures);
    
    console.log(i18n.__('monitor.connection_error'));
    console.log(i18n.__('monitor.connection_error_msg', { message: error.message }));
  }
  
  // 显示详细统计
  console.log('───────────────────────────────────────────────');
  console.log(i18n.__('monitor.connection_stats_header'));
  console.log(i18n.__('monitor.stats_success', { count: stats.successfulConnections, rate: ((stats.successfulConnections / Math.max(stats.totalChecks, 1)) * 100).toFixed(1) }));
  console.log(i18n.__('monitor.stats_failed', { count: stats.failedConnections, rate: ((stats.failedConnections / Math.max(stats.totalChecks, 1)) * 100).toFixed(1) }));
  console.log(i18n.__('monitor.stats_consecutive_failures', { count: stats.consecutiveFailures }));
  console.log(i18n.__('monitor.stats_longest_failure_streak', { count: stats.longestFailureStreak }));
  
  if (stats.lastSuccessTime) {
    const timeSinceSuccess = Math.floor((now - stats.lastSuccessTime) / 1000);
    console.log(i18n.__('monitor.last_success_time', { seconds: timeSinceSuccess }));
  } else {
    console.log(i18n.__('monitor.last_success_never'));
  }
  
  console.log('───────────────────────────────────────────────');
  console.log(i18n.__('monitor.exit_hint'));
  console.log(i18n.__('monitor.next_check', { time: now.toLocaleTimeString() }));
};

// 立即显示状态
displayStatus();

// 每5秒更新状态
const monitorTimer = setInterval(displayStatus, 5000);

// 处理优雅退出
const gracefulExit = () => {
  console.clear();
  console.log('═══════════════════════════════════════════════');
  console.log(i18n.__('monitor.monitor_stopped_final'));
  console.log('═══════════════════════════════════════════════');
  
  const runtime = Math.floor((new Date() - stats.startTime) / 1000);
  const runtimeDisplay = `${Math.floor(runtime / 60)}分${runtime % 60}秒`;
  
  console.log(i18n.__('monitor.total_runtime', { runtime: runtimeDisplay }));
  console.log(i18n.__('monitor.total_checks', { count: stats.totalChecks }));
  console.log(i18n.__('monitor.success_rate', { rate: ((stats.successfulConnections / Math.max(stats.totalChecks, 1)) * 100).toFixed(1) }));
  console.log('───────────────────────────────────────────────');
  console.log(i18n.__('monitor.monitoring_ended'));
  
  clearInterval(monitorTimer);
  process.exit(0);
};

process.on('SIGINT', gracefulExit);
process.on('SIGTERM', gracefulExit); 