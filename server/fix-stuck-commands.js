#!/usr/bin/env node

// Fix stuck commands script
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import i18n from './src/config/i18n-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

console.clear();
console.log(i18n.__('fix_stuck.tool_starting') + '\n');

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
    console.error(i18n.__('fix_stuck.error_finding_stuck', { message: error.message }));
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
    console.error(i18n.__('fix_stuck.error_finding_processing', { message: error.message }));
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
    console.error(i18n.__('fix_stuck.error_resetting_command', { id: commandId, message: error.message }));
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
  console.log(i18n.__('fix_stuck.command_preview', { preview: commandPreview }));
  console.log(i18n.__('fix_stuck.command_status', { status: command.status }));
  console.log(i18n.__('fix_stuck.command_age', { minutes: ageMinutes }));
  console.log(i18n.__('fix_stuck.command_created', { time: createdAt.toLocaleString() }));
  console.log('');
};

// 主要修复逻辑
const fixStuckCommands = async () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error(i18n.__('fix_stuck.env_not_configured'));
    console.error(i18n.__('fix_stuck.env_instructions'));
    process.exit(1);
  }
  
  const client = createSupabaseClient();
  
  console.log(i18n.__('fix_stuck.searching_stuck') + '\n');
  
  // 查找卡住的 pending 命令
  const stuckPendingCommands = await findStuckCommands(client, 10); // 10分钟
  
  // 查找卡住的 processing 命令
  const stuckProcessingCommands = await findProcessingCommands(client, 30); // 30分钟
  
  const totalStuckCommands = stuckPendingCommands.length + stuckProcessingCommands.length;
  
  if (totalStuckCommands === 0) {
    console.log(i18n.__('fix_stuck.no_stuck_found'));
    return;
  }
  
  console.log(i18n.__('fix_stuck.found_stuck_total', { count: totalStuckCommands }) + '\n');
  
  // 显示卡住的 pending 命令
  if (stuckPendingCommands.length > 0) {
    console.log(i18n.__('fix_stuck.stuck_pending_header', { count: stuckPendingCommands.length }));
    console.log('═'.repeat(50));
    stuckPendingCommands.forEach((cmd, index) => displayCommand(cmd, index));
  }
  
  // 显示卡住的 processing 命令
  if (stuckProcessingCommands.length > 0) {
    console.log(i18n.__('fix_stuck.stuck_processing_header', { count: stuckProcessingCommands.length }));
    console.log('═'.repeat(50));
    stuckProcessingCommands.forEach((cmd, index) => displayCommand(cmd, index));
  }
  
  // 询问用户操作
  console.log(i18n.__('fix_stuck.choose_operation'));
  console.log(i18n.__('fix_stuck.option_1'));
  console.log(i18n.__('fix_stuck.option_2'));
  console.log(i18n.__('fix_stuck.option_3'));
  console.log(i18n.__('fix_stuck.option_4'));
  console.log(i18n.__('fix_stuck.option_5'));
  
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
      console.log('\n' + i18n.__('fix_stuck.resetting_all_pending'));
      
      for (const cmd of stuckPendingCommands) {
        const success = await resetCommandStatus(client, cmd.id, 'pending');
        if (success) {
          resetCount++;
          console.log(i18n.__('fix_stuck.reset_command_success', { id: cmd.id }));
        }
      }
      
      for (const cmd of stuckProcessingCommands) {
        const success = await resetCommandStatus(client, cmd.id, 'pending');
        if (success) {
          resetCount++;
          console.log(i18n.__('fix_stuck.reset_command_success', { id: cmd.id }));
        }
      }
      break;
      
    case '2':
      // 标记所有命令为错误
      console.log('\n' + i18n.__('fix_stuck.marking_all_error'));
      
      for (const cmd of stuckPendingCommands) {
        const success = await resetCommandStatus(client, cmd.id, 'error', '命令处理超时 - 自动标记为错误');
        if (success) {
          errorCount++;
          console.log(i18n.__('fix_stuck.mark_command_error', { id: cmd.id }));
        }
      }
      
      for (const cmd of stuckProcessingCommands) {
        const success = await resetCommandStatus(client, cmd.id, 'error', '命令处理超时 - 自动标记为错误');
        if (success) {
          errorCount++;
          console.log(i18n.__('fix_stuck.mark_command_error', { id: cmd.id }));
        }
      }
      break;
      
    case '3':
      // 只重置 pending 命令
      console.log('\n' + i18n.__('fix_stuck.resetting_pending_only'));
      
      for (const cmd of stuckPendingCommands) {
        const success = await resetCommandStatus(client, cmd.id, 'pending');
        if (success) {
          resetCount++;
          console.log(i18n.__('fix_stuck.reset_command_success', { id: cmd.id }));
        }
      }
      break;
      
    case '4':
      // 只处理 processing 命令
      console.log('\n' + i18n.__('fix_stuck.marking_processing_error'));
      
      for (const cmd of stuckProcessingCommands) {
        const success = await resetCommandStatus(client, cmd.id, 'error', '处理超时 - 自动标记为错误');
        if (success) {
          errorCount++;
          console.log(i18n.__('fix_stuck.mark_command_error', { id: cmd.id }));
        }
      }
      break;
      
    case '5':
      console.log(i18n.__('fix_stuck.exit_tool'));
      process.exit(0);
      break;
      
    default:
      console.log(i18n.__('fix_stuck.invalid_choice'));
      process.exit(1);
  }
  
  // 显示结果
  console.log('\n' + '═'.repeat(50));
  console.log(i18n.__('fix_stuck.fix_complete'));
  if (resetCount > 0) {
    console.log(i18n.__('fix_stuck.reset_count', { count: resetCount }));
  }
  if (errorCount > 0) {
    console.log(i18n.__('fix_stuck.error_count', { count: errorCount }));
  }
  console.log('═'.repeat(50));
};

// 启动修复工具
fixStuckCommands().catch(error => {
  console.error(i18n.__('fix_stuck.tool_run_failed', { error }));
  process.exit(1);
}); 