#!/usr/bin/env node

// 调试Jest无法退出的问题
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 开始调试Jest退出问题...');

// 测试文件列表
const testFiles = [
  'tests/services/errorRecoveryService.test.js',
  'tests/services/queueManager.test.js', 
  'tests/services/analyticsService.test.js',
  'tests/services/appleScriptRunner.test.js',
  'tests/auto-restart.test.js',
  'tests/connection-monitor.test.js',
  'tests/controllers/commandController.test.js',
  'tests/services/supabaseService.test.js'
];

async function runSingleTest(testFile) {
  return new Promise((resolve) => {
    console.log(`\n📝 测试文件: ${testFile}`);
    
    const startTime = Date.now();
    const child = spawn('node', [
      '--experimental-vm-modules',
      'node_modules/.bin/jest',
      '--testPathPattern=' + testFile.replace('tests/', '').replace('.test.js', ''),
      '--detectOpenHandles',
      '--maxWorkers=1',
      '--verbose'
    ], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let exitedNormally = false;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('exit', (code) => {
      exitedNormally = true;
      const duration = Date.now() - startTime;
      console.log(`✅ ${testFile} 退出，代码: ${code}, 耗时: ${duration}ms`);
      resolve({ testFile, code, duration, stdout, stderr, exitedNormally });
    });

    // 设置超时
    setTimeout(() => {
      if (!exitedNormally) {
        console.log(`⚠️ ${testFile} 超时，强制终止`);
        child.kill('SIGKILL');
        resolve({ testFile, code: -1, duration: 15000, stdout, stderr, exitedNormally: false });
      }
    }, 15000); // 15秒超时
  });
}

async function main() {
  const results = [];
  
  for (const testFile of testFiles) {
    const result = await runSingleTest(testFile);
    results.push(result);
    
    if (!result.exitedNormally) {
      console.log(`❌ 发现问题文件: ${testFile}`);
      console.log('STDOUT:', result.stdout.slice(-500)); // 最后500字符
      console.log('STDERR:', result.stderr.slice(-500));
      break;
    }
  }
  
  console.log('\n📊 测试结果总结:');
  results.forEach(result => {
    const status = result.exitedNormally ? '✅' : '❌';
    console.log(`${status} ${result.testFile}: ${result.duration}ms`);
  });
  
  const problematicTests = results.filter(r => !r.exitedNormally);
  if (problematicTests.length > 0) {
    console.log('\n🚨 有问题的测试文件:');
    problematicTests.forEach(test => {
      console.log(`- ${test.testFile}`);
    });
  } else {
    console.log('\n🎉 所有单独测试都能正常退出！');
    console.log('问题可能在于多个测试文件一起运行时的交互。');
  }
}

main().catch(console.error); 