#!/usr/bin/env node

// 自动重启监控脚本 - 检测服务状态并在需要时重启
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
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
  checkInterval: 60000, // 1分钟检查一次
  failureThreshold: 3, // 连续失败3次后重启
  restartCooldown: 30000, // 重启后30秒冷却期
  maxRestarts: 5, // 最大重启次数
  resetInterval: 3600000 // 1小时后重置重启计数
};

// 监控状态
const state = {
  consecutiveFailures: 0,
  restartCount: 0,
  lastRestartTime: null,
  lastSuccessTime: null,
  isServiceRunning: false,
  serviceProcess: null,
  startTime: new Date()
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
      .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()); // 超过10分钟的pending命令
    
    if (stuckError) {
      console.warn('⚠️ 无法查询卡住的命令:', stuckError.message);
    } else if (stuckCommands && stuckCommands.length > 0) {
      console.warn(`⚠️ 发现 ${stuckCommands.length} 个长时间未处理的命令`);
      return {
        success: false,
        reason: `Found ${stuckCommands.length} stuck pending commands`,
        details: { stuckCommands: stuckCommands.length }
      };
    }
    
    return {
      success: true,
      details: {
        recentCommands: recentCommands?.length || 0,
        stuckCommands: stuckCommands?.length || 0
      }
    };
    
  } catch (error) {
    return {
      success: false,
      reason: error.message,
      details: { error: error.message }
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
    
    let startupTimeout = setTimeout(() => {
      console.error('❌ 服务启动超时');
      serviceProcess.kill();
      reject(new Error('Service startup timeout'));
    }, 30000); // 30秒启动超时
    
    serviceProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Service] ${output.trim()}`);
      
      // 检测服务启动成功的标志
      if (output.includes('Service initialization completed') || 
          output.includes('Supabase client initialized')) {
        clearTimeout(startupTimeout);
        state.isServiceRunning = true;
        state.serviceProcess = serviceProcess;
        console.log('✅ 服务启动成功');
        resolve(serviceProcess);
      }
    });
    
    serviceProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.error(`[Service Error] ${output.trim()}`);
    });
    
    serviceProcess.on('exit', (code, signal) => {
      clearTimeout(startupTimeout);
      state.isServiceRunning = false;
      state.serviceProcess = null;
      
      if (code === 0) {
        console.log('ℹ️ 服务正常退出');
      } else {
        console.error(`❌ 服务异常退出 (code: ${code}, signal: ${signal})`);
      }
    });
    
    serviceProcess.on('error', (error) => {
      clearTimeout(startupTimeout);
      console.error('❌ 服务启动失败:', error.message);
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
const restartService = async () => {
  const now = new Date();
  
  // 检查冷却期
  if (state.lastRestartTime && (now - state.lastRestartTime) < config.restartCooldown) {
    console.log('⏳ 重启冷却期中，跳过重启');
    return false;
  }
  
  // 检查重启次数限制
  if (state.restartCount >= config.maxRestarts) {
    console.error(`❌ 已达到最大重启次数 (${config.maxRestarts})，停止自动重启`);
    return false;
  }
  
  try {
    console.log(`🔄 执行第 ${state.restartCount + 1} 次重启...`);
    
    // 停止当前服务
    await stopService();
    
    // 等待一段时间
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 启动新服务
    await startService();
    
    state.restartCount++;
    state.lastRestartTime = now;
    state.consecutiveFailures = 0;
    
    console.log('✅ 服务重启成功');
    return true;
    
  } catch (error) {
    console.error('❌ 服务重启失败:', error.message);
    return false;
  }
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
  console.log(`🔄 重启次数: ${state.restartCount}/${config.maxRestarts}`);
  console.log(`❌ 连续失败: ${state.consecutiveFailures}/${config.failureThreshold}`);
  
  if (state.lastRestartTime) {
    const timeSinceRestart = Math.floor((now - state.lastRestartTime) / 1000);
    console.log(`🕐 最后重启: ${timeSinceRestart}秒前`);
  }
  
  if (state.lastSuccessTime) {
    const timeSinceSuccess = Math.floor((now - state.lastSuccessTime) / 1000);
    console.log(`✅ 最后成功: ${timeSinceSuccess}秒前`);
  }
  
  console.log('───────────────────────────────────────────────');
  console.log('按 Ctrl+C 退出监控');
  console.log('═══════════════════════════════════════════════');
};

// 主监控循环
const monitorLoop = async () => {
  displayStatus();
  
  // 重置重启计数器（每小时）
  if (state.restartCount > 0 && 
      state.lastRestartTime && 
      (Date.now() - state.lastRestartTime) > config.resetInterval) {
    console.log('🔄 重置重启计数器');
    state.restartCount = 0;
  }
  
  // 测试服务健康状态
  const healthResult = await testServiceHealth();
  
  if (healthResult.success) {
    state.consecutiveFailures = 0;
    state.lastSuccessTime = new Date();
    
    if (Math.random() < 0.1) { // 10% 概率显示成功信息
      console.log(`✅ 服务健康检查通过 (最近命令: ${healthResult.details.recentCommands})`);
    }
  } else {
    state.consecutiveFailures++;
    console.error(`❌ 服务健康检查失败 (${state.consecutiveFailures}/${config.failureThreshold}): ${healthResult.reason}`);
    
    // 达到失败阈值时重启服务
    if (state.consecutiveFailures >= config.failureThreshold) {
      console.warn('⚠️ 连续失败次数达到阈值，准备重启服务...');
      
      const restartSuccess = await restartService();
      if (!restartSuccess) {
        console.error('❌ 自动重启失败，请手动检查服务状态');
      }
    }
  }
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
  console.log('');
  
  // 注册信号处理器
  process.on('SIGINT', gracefulExit);
  process.on('SIGTERM', gracefulExit);
  
  // 启动初始服务
  try {
    await startService();
  } catch (error) {
    console.error('❌ 初始服务启动失败:', error.message);
    process.exit(1);
  }
  
  // 开始监控循环
  setInterval(monitorLoop, config.checkInterval);
  
  // 立即执行一次检查
  setTimeout(monitorLoop, 5000); // 5秒后开始第一次检查
};

// 启动监控器
main().catch(error => {
  console.error('❌ 监控器启动失败:', error);
  process.exit(1);
}); 