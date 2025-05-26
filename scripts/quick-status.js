#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../server/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

console.log('⚡ Quick Supabase status check...\n');

async function quickCheck() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.log('❌ Environment variables not configured');
    return false;
  }

  try {
    console.log('📡 Creating test connection...');
    const startTime = Date.now();
    
    const testClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });

    // 简单的连接测试
    const { data, error } = await testClient
      .from('commands')
      .select('id')
      .limit(1);

    const duration = Date.now() - startTime;

    if (error) {
      console.log(`❌ Connection FAILED (${duration}ms)`);
      console.log(`   Error: ${error.message}`);
      return false;
    }

    console.log(`✅ Connection SUCCESS (${duration}ms)`);
    console.log('🔗 Database: Accessible');
    console.log('📊 Commands table: Readable');
    return true;

  } catch (error) {
    console.log('💥 Test FAILED');
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

// 运行检查
quickCheck().then(isHealthy => {
  console.log('\n' + '='.repeat(40));
  if (isHealthy) {
    console.log('🎉 Status: OPERATIONAL ✅');
    process.exit(0);
  } else {
    console.log('🚨 Status: ISSUES DETECTED ❌');
    process.exit(1);
  }
}).catch(error => {
  console.error('\n💥 Check failed:', error.message);
  process.exit(2);
}); 