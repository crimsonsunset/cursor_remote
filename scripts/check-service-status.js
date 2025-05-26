#!/usr/bin/env node
import { ensureSupabaseConnection } from '../server/src/services/supabaseService.js';

console.log('🔍 Checking SupabaseService status...\n');

async function quickStatusCheck() {
  try {
    console.log('📡 Testing connection...');
    
    // 等待服务初始化完成
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const startTime = Date.now();
    const connected = await ensureSupabaseConnection();
    const duration = Date.now() - startTime;
    
    if (connected) {
      console.log(`✅ Service is HEALTHY (${duration}ms response time)`);
      console.log('🔗 Connection: Active');
      console.log('🚀 Ready to process commands');
      return true;
    }
    console.log('❌ Service is UNHEALTHY');
    console.log('🔗 Connection: Failed');
    console.log('⚠️  Commands may not be processed');
    return false;
  } catch (error) {
    console.log('💥 Service CHECK FAILED');
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

// 运行检查
quickStatusCheck().then(isHealthy => {
  console.log('\n' + '='.repeat(40));
  if (isHealthy) {
    console.log('🎉 Overall Status: OPERATIONAL');
    process.exit(0);
  } else {
    console.log('🚨 Overall Status: NEEDS ATTENTION');
    process.exit(1);
  }
}).catch(error => {
  console.error('\n💥 Status check failed:', error.message);
  process.exit(2);
}); 