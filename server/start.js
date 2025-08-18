#!/usr/bin/env node

// CursorRemote startup selection script
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import i18n from './src/config/i18n-config.js';

console.clear();
console.log(i18n.__('startup.selector_title') + '\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(i18n.__('startup.select_mode'));
console.log('');
console.log(i18n.__('startup.stable_mode'));
console.log(i18n.__('startup.stable_features'));
console.log('');
console.log(i18n.__('startup.monitoring_mode'));
console.log(i18n.__('startup.monitoring_features'));
console.log('');
console.log(i18n.__('startup.basic_mode'));
console.log(i18n.__('startup.basic_features'));
console.log('');

rl.question(i18n.__('startup.input_prompt'), (answer) => {
  const choice = answer.trim() || '1';
  
  let script;
  let description;
  
  switch (choice) {
    case '1':
      script = 'start-stable.js';
      description = i18n.__('startup.mode_stable');
      break;
    case '2':
      script = 'auto-restart.js';
      description = i18n.__('startup.mode_monitoring');
      break;
    case '3':
      script = 'src/services/supabaseService.js';
      description = i18n.__('startup.mode_basic');
      break;
    default:
      console.log(i18n.__('startup.invalid_choice_default'));
      script = 'start-stable.js';
      description = i18n.__('startup.mode_stable');
  }
  
  console.log('\n' + i18n.__('startup.launching', { description, script }) + '\n');
  
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
    console.log('\n' + i18n.__('service.exited_code', { code }));
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