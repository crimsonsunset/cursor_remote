#!/usr/bin/env node

// 自动重启监控脚本 - 检测服务状态并在需要时重启
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

console.clear();
console.log('🔄 CursorRemote 自动重启监控器启动中...\n');

// 监控配置
const config = {
  checkInterval: 120000, // 2分钟检查一次（从1分钟改为2分钟）
  failureThreshold: 5, // 连续失败5次后重启（从3次改为5次）
  restartCooldown: 120000, // 重启后2分钟冷却期（从30秒改为2分钟）
  maxRestarts: 5, // 减少最大重启次数到5次（从10次改为5次）
  resetInterval: 3600000, // 1小时后重置重启计数
  enableAutoRestart: process.env.ENABLE_AUTO_RESTART !== 'false', // 允许通过环境变量禁用自动重启
  
  // 新增：持续运行策略配置
  extendedCheckInterval: 600000, // 达到最大重启次数后，延长检查间隔到10分钟
  forceResetInterval: 21600000, // 6小时后强制重置重启计数（即使没有成功）
  emergencyRestartThreshold: 10, // 紧急重启阈值：连续失败10次后强制重启
  maxEmergencyRestarts: 3, // 紧急重启的最大次数
  emergencyResetInterval: 43200000, // 12小时后重置紧急重启计数
  
  criticalErrorPatterns: [
    /errorRecoveryService\.handleError is not a function/i,
    /TypeError.*is not a function/i,
    /Cannot read property.*of undefined/i,
    /ReferenceError/i,
    /Failed to ensure Supabase connection/i,
    /Max connection attempts.*reached/i,
    /ECONNREFUSED/i,
    /ENOTFOUND/i
    // 订阅相关的错误现在通过更智能的方式处理
    // 只有在频繁出现时才认为是严重错误
  ],
  
  // 新增：订阅问题检测配置
  subscriptionErrorPatterns: [
    /CHANNEL_ERROR/i,
    /subscription.*failed/i,
    /Subscription CLOSED/i,
    /Max retry attempts.*reached/i
  ],
  subscriptionErrorThreshold: parseInt(process.env.SUBSCRIPTION_ERROR_THRESHOLD) || 20, // 可通过环境变量调整
  subscriptionErrorWindow: 300000, // 5分钟窗口
  // 新增：更严格的重启条件
  stuckCommandThreshold: 30, // 30分钟未处理才算卡住（从10分钟改为30分钟）
  criticalErrorThreshold: 10, // 严重错误阈值提高到10个（从5个改为10个）
  criticalErrorWindow: 600000 // 严重错误检查窗口改为10分钟（从5分钟改为10分钟）
};

// 监控状态
const state = {
  consecutiveFailures: 0,
  restartCount: 0,
  lastRestartTime: null,
  lastSuccessTime: null,
  isServiceRunning: false,
  serviceProcess: null,
  startTime: new Date(),
  criticalErrorCount: 0,
  lastCriticalErrorTime: null,
  errorHistory: [],
  
  // 新增：持续运行状态
  emergencyRestartCount: 0,
  lastEmergencyRestartTime: null,
  lastForceResetTime: null,
  isInExtendedMode: false, // 是否处于延长检查模式
  totalFailuresSinceLastSuccess: 0, // 自上次成功以来的总失败次数
  
  // 新增：订阅错误追踪
  subscriptionErrors: [],
  subscriptionErrorCount: 0,
  lastSubscriptionErrorTime: null
};

// 创建测试客户端
const createTestClient = () => {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        'x-custom-app-name': 'CursorRemote-AutoRestart',
        'x-client-info': 'Auto Restart Monitor'
      }
    }
  });
};

// 检测服务输出中的关键错误
const detectCriticalErrors = (output) => {
  const errors = [];
  const subscriptionErrors = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    // 检测严重错误
    for (const pattern of config.criticalErrorPatterns) {
      if (pattern.test(line)) {
        errors.push({
          pattern: pattern.source,
          line: line.trim(),
          timestamp: new Date()
        });
      }
    }
    
    // 检测订阅错误
    for (const pattern of config.subscriptionErrorPatterns) {
      if (pattern.test(line)) {
        subscriptionErrors.push({
          pattern: pattern.source,
          line: line.trim(),
          timestamp: new Date()
        });
      }
    }
  }
  
  // 处理严重错误
  if (errors.length > 0) {
    state.criticalErrorCount += errors.length;
    state.lastCriticalErrorTime = new Date();
    state.errorHistory.push(...errors);
    
    // 保持错误历史在合理大小
    if (state.errorHistory.length > 50) {
      state.errorHistory = state.errorHistory.slice(-30);
    }
    
    console.error(`🚨 检测到 ${errors.length} 个严重错误:`);
    for (const error of errors) {
      console.error(`   - ${error.line}`);
    }
  }
  
  // 处理订阅错误
  if (subscriptionErrors.length > 0) {
    state.subscriptionErrors.push(...subscriptionErrors);
    state.subscriptionErrorCount += subscriptionErrors.length;
    state.lastSubscriptionErrorTime = new Date();
    
    // 清理旧的订阅错误记录（保留最近5分钟的）
    const cutoffTime = Date.now() - config.subscriptionErrorWindow;
    state.subscriptionErrors = state.subscriptionErrors.filter(err => err.timestamp.getTime() > cutoffTime);
    
    // 如果订阅错误频率过高，将其升级为严重错误
    const recentSubscriptionErrors = state.subscriptionErrors.filter(
      err => (Date.now() - err.timestamp.getTime()) < config.subscriptionErrorWindow
    );
    
    if (recentSubscriptionErrors.length >= config.subscriptionErrorThreshold) {
      console.warn(`⚠️ 检测到频繁的订阅错误 (${recentSubscriptionErrors.length}次)，升级为严重错误`);
      state.criticalErrorCount += Math.floor(recentSubscriptionErrors.length / 10); // 每10次订阅错误算1次严重错误
      state.lastCriticalErrorTime = new Date();
      // 清空订阅错误计数，避免重复计算
      state.subscriptionErrors = [];
      return true;
    } else {
      // 只记录但不触发重启
      if (subscriptionErrors.length > 5) { // 只有连续多次才显示
        console.warn(`⚠️ 检测到 ${subscriptionErrors.length} 个订阅错误（${recentSubscriptionErrors.length}/${config.subscriptionErrorThreshold}）`);
      }
    }
  }
  
  return errors.length > 0;
};

// 测试服务连接
const testServiceHealth = async () => {
  const testClient = createTestClient();
  
  try {
    // 测试基本连接
    const { data, error } = await testClient
      .from('commands')
      .select('id')
      .limit(1);
    
    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }
    
    // 测试最近是否有命令处理活动
    const { data: recentCommands, error: recentError } = await testClient
      .from('commands')
      .select('id, status, created_at')
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // 最近5分钟
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (recentError) {
      console.warn('⚠️ 无法查询最近命令:', recentError.message);
    }
    
    // 检查是否有pending状态的命令长时间未处理
    const { data: stuckCommands, error: stuckError } = await testClient
      .from('commands')
      .select('id, created_at')
      .eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - config.stuckCommandThreshold * 60 * 1000).toISOString()); // 使用配置的阈值
    
    if (stuckError) {
      console.warn('⚠️ 无法查询卡住的命令:', stuckError.message);
    } else if (stuckCommands && stuckCommands.length > 0) {
      console.warn(`⚠️ 发现 ${stuckCommands.length} 个长时间未处理的命令`);
      return {
        success: false,
        reason: `Found ${stuckCommands.length} stuck pending commands`,
        details: { stuckCommands: stuckCommands.length, shouldRestart: true }
      };
    }
    
    // 如果最近有严重错误且频率过高，建议重启
    if (state.criticalErrorCount > config.criticalErrorThreshold && 
        state.lastCriticalErrorTime && 
        (Date.now() - state.lastCriticalErrorTime.getTime()) < config.criticalErrorWindow) {
      return {
        success: false,
        reason: `Too many critical errors detected (${state.criticalErrorCount} in recent time)`,
        details: { criticalErrors: state.criticalErrorCount, shouldRestart: true }
      };
    }
    
    return {
      success: true,
      details: {
        recentCommands: recentCommands?.length || 0,
        stuckCommands: stuckCommands?.length || 0,
        criticalErrors: state.criticalErrorCount
      }
    };
    
  } catch (error) {
    return {
      success: false,
      reason: error.message,
      details: { error: error.message, shouldRestart: true }
    };
  }
};

// 启动服务
const startService = () => {
  return new Promise((resolve, reject) => {
    console.log('🚀 启动 CursorRemote 服务...');
    
    const serviceProcess = spawn('node', ['src/services/supabaseService.js'], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    });
    
    const startupTimeout = setTimeout(() => {
      console.error('❌ 服务启动超时');
      serviceProcess.kill();
      reject(new Error('Service startup timeout'));
    }, 30000); // 30秒启动超时
    
    serviceProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Service] ${output.trim()}`);
      
      // 检测严重错误
      detectCriticalErrors(output);
      
      // 检测服务启动成功的标志
      if (output.includes('Service initialization completed') || 
          output.includes('Supabase client initialized')) {
        clearTimeout(startupTimeout);
        state.isServiceRunning = true;
        state.serviceProcess = serviceProcess;
        state.criticalErrorCount = 0; // 重置错误计数
        console.log('✅ 服务启动成功');
        resolve(serviceProcess);
      }
    });
    
    serviceProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.error(`[Service Error] ${output.trim()}`);
      
      // 检测严重错误
      const hasCriticalError = detectCriticalErrors(output);
      
      // 如果检测到严重错误，立即触发重启检查
      if (hasCriticalError) {
        console.warn('🚨 检测到严重错误，将在下次检查时考虑重启服务');
        state.consecutiveFailures++; // 增加失败计数
      }
    });
    
    serviceProcess.on('exit', (code, signal) => {
      clearTimeout(startupTimeout);
      state.isServiceRunning = false;
      state.serviceProcess = null;
      
      if (code === 0) {
        console.log('ℹ️ 服务正常退出');
      } else {
        console.error(`❌ 服务异常退出 (code: ${code}, signal: ${signal})`);
        state.consecutiveFailures++;
      }
    });
    
    serviceProcess.on('error', (error) => {
      clearTimeout(startupTimeout);
      console.error('❌ 服务启动失败:', error.message);
      state.consecutiveFailures++;
      reject(error);
    });
  });
};

// 停止服务
const stopService = () => {
  return new Promise((resolve) => {
    if (!state.serviceProcess) {
      resolve();
      return;
    }
    
    console.log('🛑 停止服务...');
    
    // 发送 SIGTERM 信号
    state.serviceProcess.kill('SIGTERM');
    
    // 等待服务优雅关闭
    const gracefulTimeout = setTimeout(() => {
      console.warn('⚠️ 服务未在规定时间内关闭，强制终止');
      state.serviceProcess.kill('SIGKILL');
    }, 10000); // 10秒优雅关闭时间
    
    state.serviceProcess.on('exit', () => {
      clearTimeout(gracefulTimeout);
      state.isServiceRunning = false;
      state.serviceProcess = null;
      console.log('✅ 服务已停止');
      resolve();
    });
  });
};

// 重启服务
const restartService = async (isEmergencyRestart = false) => {
  const now = new Date();
  
  // 检查冷却期
  if (state.lastRestartTime && (now - state.lastRestartTime) < config.restartCooldown) {
    console.log('⏳ 重启冷却期中，跳过重启');
    return false;
  }
  
  // 检查重启次数限制
  if (!isEmergencyRestart && state.restartCount >= config.maxRestarts) {
    console.warn(`⚠️ 已达到最大重启次数 (${config.maxRestarts})，进入延长检查模式`);
    state.isInExtendedMode = true;
    return false;
  }
  
  // 检查紧急重启次数限制
  if (isEmergencyRestart && state.emergencyRestartCount >= config.maxEmergencyRestarts) {
    console.error(`❌ 已达到最大紧急重启次数 (${config.maxEmergencyRestarts})，等待自动重置`);
    return false;
  }
  
  try {
    const restartType = isEmergencyRestart ? '紧急' : '常规';
    const currentCount = isEmergencyRestart ? state.emergencyRestartCount + 1 : state.restartCount + 1;
    const maxCount = isEmergencyRestart ? config.maxEmergencyRestarts : config.maxRestarts;
    
    console.log(`🔄 执行第 ${currentCount} 次${restartType}重启 (${currentCount}/${maxCount})...`);
    
    // 停止当前服务
    await stopService();
    
    // 等待一段时间
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 启动新服务
    await startService();
    
    if (isEmergencyRestart) {
      state.emergencyRestartCount++;
      state.lastEmergencyRestartTime = now;
    } else {
      state.restartCount++;
    }
    
    state.lastRestartTime = now;
    state.consecutiveFailures = 0;
    state.totalFailuresSinceLastSuccess = 0;
    
    console.log(`✅ ${restartType}重启成功`);
    return true;
    
  } catch (error) {
    console.error(`❌ ${isEmergencyRestart ? '紧急' : '常规'}重启失败:`, error.message);
    return false;
  }
};

// 重置重启计数器
const resetRestartCounters = (reason = '定时重置') => {
  const now = new Date();
  const oldRestartCount = state.restartCount;
  const oldEmergencyCount = state.emergencyRestartCount;
  const oldSubscriptionErrors = state.subscriptionErrors.length;
  
  state.restartCount = 0;
  state.emergencyRestartCount = 0;
  state.isInExtendedMode = false;
  state.totalFailuresSinceLastSuccess = 0;
  state.lastForceResetTime = now;
  
  // 清理订阅错误记录
  state.subscriptionErrors = [];
  state.subscriptionErrorCount = 0;
  
  console.log(`🔄 重启计数器已重置 (${reason})`);
  console.log(`   常规重启: ${oldRestartCount} → 0`);
  console.log(`   紧急重启: ${oldEmergencyCount} → 0`);
  console.log(`   订阅错误: ${oldSubscriptionErrors} → 0`);
  console.log('   退出延长检查模式');
};

// 检查是否需要强制重置
const checkForceReset = () => {
  const now = Date.now();
  
  // 强制重置条件：6小时后无论如何都重置
  if (state.lastForceResetTime && (now - state.lastForceResetTime) > config.forceResetInterval) {
    resetRestartCounters('6小时强制重置');
    return true;
  }
  
  // 紧急重启计数重置：12小时后重置紧急重启计数
  if (state.lastEmergencyRestartTime && 
      (now - state.lastEmergencyRestartTime) > config.emergencyResetInterval) {
    const oldCount = state.emergencyRestartCount;
    state.emergencyRestartCount = 0;
    console.log(`🔄 紧急重启计数器已重置: ${oldCount} → 0 (12小时重置)`);
    return true;
  }
  
  return false;
};

// 显示状态
const displayStatus = () => {
  console.clear();
  
  const now = new Date();
  const uptime = Math.floor((now - state.startTime) / 1000);
  const uptimeDisplay = `${Math.floor(uptime / 3600)}时${Math.floor((uptime % 3600) / 60)}分${uptime % 60}秒`;
  
  console.log('═══════════════════════════════════════════════');
  console.log('🔄 CursorRemote 自动重启监控器');
  console.log('═══════════════════════════════════════════════');
  console.log(`⏰ 运行时间: ${uptimeDisplay}`);
  console.log(`🔧 服务状态: ${state.isServiceRunning ? '✅ 运行中' : '❌ 已停止'}`);
  console.log(`🔄 常规重启: ${state.restartCount}/${config.maxRestarts}`);
  console.log(`🚨 紧急重启: ${state.emergencyRestartCount}/${config.maxEmergencyRestarts}`);
  console.log(`❌ 连续失败: ${state.consecutiveFailures}/${config.failureThreshold}`);
  console.log(`📊 总失败数: ${state.totalFailuresSinceLastSuccess}`);
  console.log(`🚨 严重错误: ${state.criticalErrorCount}`);
  console.log(`📡 订阅错误: ${state.subscriptionErrors.length}/${config.subscriptionErrorThreshold}`);
  
  if (state.isInExtendedMode) {
    console.log('⏰ 模式: 延长检查模式 (10分钟间隔)');
  } else {
    console.log('⏰ 模式: 正常检查模式 (2分钟间隔)');
  }
  
  if (state.lastRestartTime) {
    const timeSinceRestart = Math.floor((now - state.lastRestartTime) / 1000);
    console.log(`🕐 最后重启: ${timeSinceRestart}秒前`);
  }
  
  if (state.lastSuccessTime) {
    const timeSinceSuccess = Math.floor((now - state.lastSuccessTime) / 1000);
    console.log(`✅ 最后成功: ${timeSinceSuccess}秒前`);
  }
  
  if (state.lastCriticalErrorTime) {
    const timeSinceError = Math.floor((now - state.lastCriticalErrorTime) / 1000);
    console.log(`🚨 最后错误: ${timeSinceError}秒前`);
  }
  
  // 显示下次重置时间
  if (state.lastForceResetTime) {
    const timeUntilReset = config.forceResetInterval - (now - state.lastForceResetTime);
    if (timeUntilReset > 0) {
      const hoursUntilReset = Math.floor(timeUntilReset / (1000 * 60 * 60));
      console.log(`⏳ 下次强制重置: ${hoursUntilReset}小时后`);
    }
  } else {
    const hoursUntilReset = Math.floor(config.forceResetInterval / (1000 * 60 * 60));
    console.log(`⏳ 首次强制重置: ${hoursUntilReset}小时后`);
  }
  
  // 显示最近的错误
  if (state.errorHistory.length > 0) {
    console.log('───────────────────────────────────────────────');
    console.log('🚨 最近的严重错误:');
    const recentErrors = state.errorHistory.slice(-3); // 显示最近3个错误
    for (const error of recentErrors) {
      const timeAgo = Math.floor((now - error.timestamp) / 1000);
      console.log(`   ${timeAgo}秒前: ${error.line.substring(0, 60)}...`);
    }
  }
  
  console.log('───────────────────────────────────────────────');
  console.log('按 Ctrl+C 退出监控');
  console.log('按 USR1 信号重置重启计数器');
  console.log('═══════════════════════════════════════════════');
};

// 主监控循环
const monitorLoop = async () => {
  displayStatus();
  
  // 检查是否需要强制重置
  checkForceReset();
  
  // 重置重启计数器（每小时，仅在有成功记录时）
  if (state.restartCount > 0 && 
      state.lastRestartTime && 
      state.lastSuccessTime &&
      (Date.now() - state.lastRestartTime) > config.resetInterval &&
      (Date.now() - state.lastSuccessTime) < config.resetInterval) {
    resetRestartCounters('1小时成功重置');
  }
  
  // 测试服务健康状态
  const healthResult = await testServiceHealth();
  
  if (healthResult.success) {
    state.consecutiveFailures = 0;
    state.totalFailuresSinceLastSuccess = 0;
    state.lastSuccessTime = new Date();
    
    // 如果在延长模式下成功，考虑退出延长模式
    if (state.isInExtendedMode && state.restartCount < config.maxRestarts) {
      console.log('✅ 服务恢复正常，退出延长检查模式');
      state.isInExtendedMode = false;
    }
    
    if (Math.random() < 0.1) { // 10% 概率显示成功信息
      console.log(`✅ 服务健康检查通过 (最近命令: ${healthResult.details.recentCommands}, 严重错误: ${healthResult.details.criticalErrors})`);
    }
  } else {
    state.consecutiveFailures++;
    state.totalFailuresSinceLastSuccess++;
    console.error(`❌ 服务健康检查失败 (${state.consecutiveFailures}/${config.failureThreshold}): ${healthResult.reason}`);
    
    // 检查是否应该立即重启（基于错误类型）
    const shouldImmediateRestart = healthResult.details?.shouldRestart && (
      state.criticalErrorCount > config.criticalErrorThreshold * 2 || // 严重错误过多（提高阈值）
      healthResult.reason.includes('stuck pending commands') || // 有卡住的命令
      healthResult.reason.includes('critical errors detected') // 检测到严重错误
    );
    
    // 检查是否需要紧急重启（在延长模式下）
    const needEmergencyRestart = state.isInExtendedMode && 
      state.totalFailuresSinceLastSuccess >= config.emergencyRestartThreshold &&
      state.emergencyRestartCount < config.maxEmergencyRestarts;
    
    // 达到失败阈值或需要立即重启时重启服务
    if (state.consecutiveFailures >= config.failureThreshold || shouldImmediateRestart || needEmergencyRestart) {
      if (!config.enableAutoRestart) {
        console.warn('⚠️ 检测到需要重启的条件，但自动重启已禁用');
        console.warn('💡 请手动重启服务或设置 ENABLE_AUTO_RESTART=true 启用自动重启');
        return;
      }
      
      let restartSuccess = false;
      
      if (needEmergencyRestart) {
        console.warn(`🚨 延长模式下连续失败 ${state.totalFailuresSinceLastSuccess} 次，执行紧急重启...`);
        restartSuccess = await restartService(true); // 紧急重启
      } else if (shouldImmediateRestart) {
        console.warn('🚨 检测到严重问题，立即重启服务...');
        restartSuccess = await restartService(false); // 常规重启
      } else {
        console.warn('⚠️ 连续失败次数达到阈值，准备重启服务...');
        restartSuccess = await restartService(false); // 常规重启
      }
      
      if (!restartSuccess) {
        if (state.isInExtendedMode) {
          console.error('❌ 重启失败，继续延长检查模式');
        } else {
          console.error('❌ 自动重启失败，请手动检查服务状态');
        }
      }
    }
  }
  
  // 动态调整下次检查间隔
  const nextCheckInterval = state.isInExtendedMode ? config.extendedCheckInterval : config.checkInterval;
  
  if (state.isInExtendedMode && Math.random() < 0.3) { // 30% 概率在延长模式下显示提示
    console.log(`⏰ 延长检查模式：下次检查将在 ${nextCheckInterval / 60000} 分钟后进行`);
  }
  
  return nextCheckInterval;
};

// 优雅退出
const gracefulExit = async () => {
  console.log('\n\n🛑 正在停止监控器...');
  
  if (state.isServiceRunning) {
    console.log('🛑 停止被监控的服务...');
    await stopService();
  }
  
  console.log('✅ 监控器已停止');
  process.exit(0);
};

// 主函数
const main = async () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ 环境变量未配置');
    console.error('请确保 .env 文件中包含 SUPABASE_URL 和 SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  
  console.log('🚀 启动自动重启监控器...');
  console.log(`📊 检查间隔: ${config.checkInterval / 1000}秒`);
  console.log(`⚠️ 失败阈值: ${config.failureThreshold}次`);
  console.log(`🔄 最大重启: ${config.maxRestarts}次`);
  console.log(`🚨 紧急重启: ${config.maxEmergencyRestarts}次`);
  console.log(`⏰ 延长间隔: ${config.extendedCheckInterval / 60000}分钟`);
  console.log(`🔧 自动重启: ${config.enableAutoRestart ? '✅ 启用' : '❌ 禁用'}`);
  if (!config.enableAutoRestart) {
    console.log('💡 要启用自动重启，请设置环境变量: ENABLE_AUTO_RESTART=true');
  }
  console.log('');
  
  // 注册信号处理器
  process.on('SIGINT', gracefulExit);
  process.on('SIGTERM', gracefulExit);
  
  // 注册USR1信号处理器用于手动重置重启计数器
  process.on('SIGUSR1', () => {
    console.log('\n📡 收到USR1信号，手动重置重启计数器...');
    resetRestartCounters('手动重置');
    displayStatus();
  });
  
  // 启动初始服务
  try {
    await startService();
    state.lastForceResetTime = new Date(); // 初始化强制重置时间
  } catch (error) {
    console.error('❌ 初始服务启动失败:', error.message);
    process.exit(1);
  }
  
  // 动态监控循环
  let currentInterval = config.checkInterval;
  
  const scheduleNextCheck = () => {
    setTimeout(async () => {
      try {
        const nextInterval = await monitorLoop();
        currentInterval = nextInterval || currentInterval;
      } catch (error) {
        console.error('❌ 监控循环出错:', error.message);
        currentInterval = config.checkInterval; // 出错时回到默认间隔
      }
      scheduleNextCheck(); // 递归调度下次检查
    }, currentInterval);
  };
  
  // 开始监控循环
  setTimeout(async () => {
    try {
      const nextInterval = await monitorLoop();
      currentInterval = nextInterval || currentInterval;
    } catch (error) {
      console.error('❌ 首次监控检查出错:', error.message);
    }
    scheduleNextCheck();
  }, 5000); // 5秒后开始第一次检查
};

// 启动监控器
main().catch(error => {
  console.error('❌ 监控器启动失败:', error);
  process.exit(1);
}); 