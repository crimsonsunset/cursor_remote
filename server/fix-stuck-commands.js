#!/usr/bin/env node

// 修复卡住命令的脚本
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

console.clear();
console.log('🔧 修复卡住命令工具启动中...\n');

// 创建 Supabase 客户端
const createSupabaseClient = () => {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        'x-custom-app-name': 'CursorRemote-FixStuck',
        'x-client-info': 'Fix Stuck Commands Tool'
      }
    }
  });
};

// 查找卡住的命令
const findStuckCommands = async (client, maxAgeMinutes = 10) => {
  try {
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
    
    const { data: stuckCommands, error } = await client
      .from('commands')
      .select('id, command_text, status, created_at')
      .eq('status', 'pending')
      .lt('created_at', cutoffTime)
      .order('created_at', { ascending: true });
    
    if (error) {
      throw new Error(`查询失败: ${error.message}`);
    }
    
    return stuckCommands || [];
  } catch (error) {
    console.error('❌ 查找卡住命令时出错:', error.message);
    return [];
  }
};

// 查找处理中但长时间无响应的命令
const findProcessingCommands = async (client, maxAgeMinutes = 30) => {
  try {
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
    
    const { data: processingCommands, error } = await client
      .from('commands')
      .select('id, command_text, status, created_at')
      .eq('status', 'processing')
      .lt('created_at', cutoffTime)
      .order('created_at', { ascending: true });
    
    if (error) {
      throw new Error(`查询失败: ${error.message}`);
    }
    
    return processingCommands || [];
  } catch (error) {
    console.error('❌ 查找处理中命令时出错:', error.message);
    return [];
  }
};

// 重置命令状态
const resetCommandStatus = async (client, commandId, newStatus = 'pending', errorMessage = null) => {
  try {
    const updateData = {
      status: newStatus
    };
    
    if (errorMessage) {
      updateData.last_error = errorMessage;
    }
    
    const { data, error } = await client
      .from('commands')
      .update(updateData)
      .eq('id', commandId)
      .select();
    
    if (error) {
      throw new Error(`更新失败: ${error.message}`);
    }
    
    return data && data.length > 0;
  } catch (error) {
    console.error(`❌ 重置命令 ${commandId} 状态时出错:`, error.message);
    return false;
  }
};

// 显示命令信息
const displayCommand = (command, index) => {
  const createdAt = new Date(command.created_at);
  const ageMinutes = Math.floor((Date.now() - createdAt.getTime()) / 60000);
  const commandPreview = command.command_text.length > 50 ? 
    command.command_text.substring(0, 50) + '...' : 
    command.command_text;
  
  console.log(`${index + 1}. ID: ${command.id}`);
  console.log(`   命令: ${commandPreview}`);
  console.log(`   状态: ${command.status}`);
  console.log(`   年龄: ${ageMinutes} 分钟`);
  console.log(`   创建: ${createdAt.toLocaleString()}`);
  console.log('');
};

// 主要修复逻辑
const fixStuckCommands = async () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ 环境变量未配置');
    console.error('请确保 .env 文件中包含 SUPABASE_URL 和 SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  
  const client = createSupabaseClient();
  
  console.log('🔍 正在查找卡住的命令...\n');
  
  // 查找卡住的 pending 命令
  const stuckPendingCommands = await findStuckCommands(client, 10); // 10分钟
  
  // 查找卡住的 processing 命令
  const stuckProcessingCommands = await findProcessingCommands(client, 30); // 30分钟
  
  const totalStuckCommands = stuckPendingCommands.length + stuckProcessingCommands.length;
  
  if (totalStuckCommands === 0) {
    console.log('✅ 没有发现卡住的命令！');
    return;
  }
  
  console.log(`⚠️ 发现 ${totalStuckCommands} 个卡住的命令:\n`);
  
  // 显示卡住的 pending 命令
  if (stuckPendingCommands.length > 0) {
    console.log(`📋 卡住的 Pending 命令 (${stuckPendingCommands.length} 个):`);
    console.log('═'.repeat(50));
    stuckPendingCommands.forEach((cmd, index) => displayCommand(cmd, index));
  }
  
  // 显示卡住的 processing 命令
  if (stuckProcessingCommands.length > 0) {
    console.log(`⚙️ 卡住的 Processing 命令 (${stuckProcessingCommands.length} 个):`);
    console.log('═'.repeat(50));
    stuckProcessingCommands.forEach((cmd, index) => displayCommand(cmd, index));
  }
  
  // 询问用户操作
  console.log('请选择操作:');
  console.log('1. 重置所有 pending 命令为 pending (重新处理)');
  console.log('2. 将所有卡住的命令标记为错误');
  console.log('3. 只重置 pending 命令');
  console.log('4. 只处理 processing 命令');
  console.log('5. 退出');
  
  // 简单的用户输入处理
  process.stdout.write('\n请输入选择 (1-5): ');
  
  // 等待用户输入
  const choice = await new Promise((resolve) => {
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
  
  let resetCount = 0;
  let errorCount = 0;
  
  switch (choice) {
    case '1':
      // 重置所有命令为 pending
      console.log('\n🔄 重置所有卡住的命令为 pending...');
      
      for (const cmd of stuckPendingCommands) {
        const success = await resetCommandStatus(client, cmd.id, 'pending');
        if (success) {
          resetCount++;
          console.log(`✅ 重置命令 ${cmd.id}`);
        }
      }
      
      for (const cmd of stuckProcessingCommands) {
        const success = await resetCommandStatus(client, cmd.id, 'pending');
        if (success) {
          resetCount++;
          console.log(`✅ 重置命令 ${cmd.id}`);
        }
      }
      break;
      
    case '2':
      // 标记所有命令为错误
      console.log('\n❌ 将所有卡住的命令标记为错误...');
      
      for (const cmd of stuckPendingCommands) {
        const success = await resetCommandStatus(client, cmd.id, 'error', '命令处理超时 - 自动标记为错误');
        if (success) {
          errorCount++;
          console.log(`❌ 标记命令 ${cmd.id} 为错误`);
        }
      }
      
      for (const cmd of stuckProcessingCommands) {
        const success = await resetCommandStatus(client, cmd.id, 'error', '命令处理超时 - 自动标记为错误');
        if (success) {
          errorCount++;
          console.log(`❌ 标记命令 ${cmd.id} 为错误`);
        }
      }
      break;
      
    case '3':
      // 只重置 pending 命令
      console.log('\n🔄 重置 pending 命令...');
      
      for (const cmd of stuckPendingCommands) {
        const success = await resetCommandStatus(client, cmd.id, 'pending');
        if (success) {
          resetCount++;
          console.log(`✅ 重置命令 ${cmd.id}`);
        }
      }
      break;
      
    case '4':
      // 只处理 processing 命令
      console.log('\n❌ 将 processing 命令标记为错误...');
      
      for (const cmd of stuckProcessingCommands) {
        const success = await resetCommandStatus(client, cmd.id, 'error', '处理超时 - 自动标记为错误');
        if (success) {
          errorCount++;
          console.log(`❌ 标记命令 ${cmd.id} 为错误`);
        }
      }
      break;
      
    case '5':
      console.log('👋 退出工具');
      process.exit(0);
      break;
      
    default:
      console.log('❌ 无效选择，退出工具');
      process.exit(1);
  }
  
  // 显示结果
  console.log('\n' + '═'.repeat(50));
  console.log('🎯 修复完成!');
  if (resetCount > 0) {
    console.log(`✅ 重置了 ${resetCount} 个命令`);
  }
  if (errorCount > 0) {
    console.log(`❌ 标记了 ${errorCount} 个命令为错误`);
  }
  console.log('═'.repeat(50));
};

// 启动修复工具
fixStuckCommands().catch(error => {
  console.error('❌ 修复工具运行失败:', error);
  process.exit(1);
}); 