#!/usr/bin/env node

// CursorRemote 启动选择脚本
import { spawn } from 'node:child_process';
import readline from 'node:readline';

console.clear();
console.log('🚀 CursorRemote 启动选择器\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('请选择启动模式：');
console.log('');
console.log('1. 稳定模式 (start-stable.js) - 推荐日常使用');
console.log('   ✅ 禁用心跳检查，最稳定');
console.log('   ✅ 依赖 Supabase 自身重连');
console.log('   ✅ 最少的日志噪音');
console.log('');
console.log('2. 监控模式 (auto-restart.js) - 推荐生产环境');
console.log('   ✅ 自动重启监控');
console.log('   ✅ 已优化，忽略心跳误报');
console.log('   ✅ 适合长期运行');
console.log('');
console.log('3. 基础模式 (supabaseService.js) - 开发测试');
console.log('   ✅ 最基础的服务');
console.log('   ✅ 心跳检查默认禁用');
console.log('   ✅ 适合调试');
console.log('');

rl.question('请输入选择 (1/2/3) [默认: 1]: ', (answer) => {
  const choice = answer.trim() || '1';
  
  let script;
  let description;
  
  switch (choice) {
    case '1':
      script = 'start-stable.js';
      description = '稳定模式';
      break;
    case '2':
      script = 'auto-restart.js';
      description = '监控模式';
      break;
    case '3':
      script = 'src/services/supabaseService.js';
      description = '基础模式';
      break;
    default:
      console.log('❌ 无效选择，使用默认稳定模式');
      script = 'start-stable.js';
      description = '稳定模式';
  }
  
  console.log(`\n🚀 启动 ${description} (${script})...\n`);
  
  // 启动选择的脚本
  const child = spawn('node', [script], {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  
  child.on('error', (error) => {
    console.error('❌ 启动失败:', error.message);
    process.exit(1);
  });
  
  child.on('exit', (code) => {
    console.log(`\n📋 服务已退出，退出代码: ${code}`);
    process.exit(code);
  });
  
  // 转发信号
  process.on('SIGINT', () => {
    child.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
  });
  
  rl.close();
}); 