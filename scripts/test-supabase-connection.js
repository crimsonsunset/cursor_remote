#!/usr/bin/env node
import { ensureSupabaseConnection, updateCommandStatus, startConnectionHealthCheck } from '../server/src/services/supabaseService.js';

console.log('🔍 Starting Supabase connection stability test...\n');

// 测试基础连接
async function testBasicConnection() {
  console.log('📡 Testing basic connection...');
  try {
    // 等待服务初始化完成
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const connected = await ensureSupabaseConnection();
    if (connected) {
      console.log('✅ Basic connection test PASSED');
      return true;
    }
    console.log('❌ Basic connection test FAILED - could not establish connection');
    return false;
  } catch (error) {
    console.log('❌ Basic connection test ERROR:', error.message);
    return false;
  }
}

// 测试连接恢复
async function testConnectionRecovery() {
  console.log('🔄 Testing connection recovery...');
  let successCount = 0;
  const testCount = 5;
  
  for (let i = 0; i < testCount; i++) {
    try {
      const connected = await ensureSupabaseConnection();
      if (connected) {
        successCount++;
      }
      // 等待1秒再测试下一次
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log(`❌ Recovery test ${i + 1} failed:`, error.message);
    }
  }
  
  const successRate = (successCount / testCount) * 100;
  console.log(`📊 Connection recovery success rate: ${successRate}% (${successCount}/${testCount})`);
  
  if (successRate >= 80) {
    console.log('✅ Connection recovery test PASSED');
    return true;
  } else {
    console.log('❌ Connection recovery test FAILED');
    return false;
  }
}

// 生成有效的 UUID v4 格式
function generateTestUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 测试命令状态更新
async function testCommandStatusUpdate() {
  console.log('💾 Testing command status update...');
  
  // 创建一个有效的 UUID 格式的测试命令ID
  const testCommandId = generateTestUUID();
  console.log(`   Using test UUID: ${testCommandId}`);
  
  try {
    const result = await updateCommandStatus(testCommandId, 'processing', null);
    if (result && !result.error) {
      console.log('✅ Command status update test PASSED');
      return true;
    }
    console.log('❌ Command status update test FAILED:', result?.error?.message || 'Unknown error');
    return false;
  } catch (error) {
    console.log('❌ Command status update test ERROR:', error.message);
    return false;
  }
}

// 测试健康检查
function testHealthCheck() {
  console.log('💗 Testing health check mechanism...');
  
  try {
    // 启动健康检查（使用较短的间隔进行测试）
    const healthCheckInterval = startConnectionHealthCheck(5000); // 5秒间隔
    
    if (healthCheckInterval) {
      console.log('✅ Health check mechanism test PASSED');
      
      // 5秒后停止健康检查
      setTimeout(() => {
        clearInterval(healthCheckInterval);
        console.log('🛑 Health check test completed');
      }, 5000);
      
      return true;
    } else {
      console.log('❌ Health check mechanism test FAILED');
      return false;
    }
  } catch (error) {
    console.log('❌ Health check mechanism test ERROR:', error.message);
    return false;
  }
}

// 运行所有测试
async function runAllTests() {
  console.log('🚀 Running comprehensive Supabase connection tests...\n');
  
  const results = {
    basicConnection: await testBasicConnection(),
    connectionRecovery: await testConnectionRecovery(),
    commandStatusUpdate: await testCommandStatusUpdate(),
    healthCheck: testHealthCheck()
  };
  
  console.log('\n📋 Test Results Summary:');
  console.log('========================');
  
  for (const [test, passed] of Object.entries(results)) {
    const status = passed ? '✅ PASSED' : '❌ FAILED';
    const testName = test.replace(/([A-Z])/g, ' $1').toLowerCase();
    console.log(`${status} - ${testName}`);
  }
  
  const passedTests = Object.values(results).filter(Boolean).length;
  const totalTests = Object.keys(results).length;
  const overallScore = (passedTests / totalTests) * 100;
  
  console.log(`\n🎯 Overall Score: ${overallScore}% (${passedTests}/${totalTests} tests passed)`);
  
  if (overallScore >= 75) {
    console.log('🎉 Supabase connection stability: GOOD');
    process.exit(0);
  } else if (overallScore >= 50) {
    console.log('⚠️  Supabase connection stability: MODERATE - some issues detected');
    process.exit(1);
  } else {
    console.log('🚨 Supabase connection stability: POOR - significant issues detected');
    process.exit(2);
  }
}

// 处理优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 Test interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Test terminated');
  process.exit(143);
});

// 启动测试
runAllTests().catch(error => {
  console.error('💥 Test execution failed:', error);
  process.exit(1);
}); 