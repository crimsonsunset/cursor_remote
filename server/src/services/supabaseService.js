import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl) {
  console.error('Error: SUPABASE_URL must be defined in your .env file');
}
if (!supabaseServiceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY must be defined in your .env file');
}

let supabase = null;

// 命令队列和处理状态
const commandQueue = [];
let isProcessing = false;

// Function to initialize Supabase client if not already initialized
const initializeSupabase = () => {
  if (!supabase && supabaseUrl && supabaseServiceKey) {
    try {
      supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: false,
          detectSessionInUrl: false
        },
        // 添加重试配置和超时设置
        global: {
          fetch: (...args) => fetch(...args).catch(err => {
            console.error('[SupabaseService] Fetch error in Supabase client:', err);
            throw err;
          }),
          headers: {
            'x-custom-app-name': 'CursorRemote',
            'x-client-info': 'NodeJS Server'
          }
        },
        realtime: {
          timeout: 60000,  // 60秒超时
          params: {
            eventsPerSecond: 10
          }
        }
      });
      console.log('[SupabaseService] Supabase client initialized successfully.');
    } catch (error) {
      console.error('[SupabaseService] Error initializing Supabase client:', error.message);
      supabase = null; // Ensure supabase is null if initialization fails
    }
  } else if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('[SupabaseService] Supabase client not initialized due to missing SUPABASE_URL or SUPABASE_SERVICE_KEY.');
  }
  return supabase;
};

// 添加一个函数用于检查和重新初始化Supabase连接
export const ensureSupabaseConnection = async () => {
  let maxAttempts = 3;
  let attempt = 0;
  
  while (attempt < maxAttempts) {
    attempt++;
    
    // 如果客户端未初始化，尝试初始化
    if (!supabase) {
      initializeSupabase();
      if (!supabase) {
        console.error(`[SupabaseService] Failed to initialize Supabase client (attempt ${attempt}/${maxAttempts})`);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒后重试
          continue;
        }
        return false;
      }
    }
    
    // 尝试进行一个简单查询以验证连接是否有效
    try {
      const { data, error } = await supabase.from('commands').select('id').limit(1);
      
      if (error) {
        console.error(`[SupabaseService] Supabase connection test failed (attempt ${attempt}/${maxAttempts}):`, error);
        supabase = null; // 重置客户端以便重新初始化
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒后重试
          continue;
        }        } else {
          // 只在首次成功连接时输出日志，避免重复的成功日志
          if (attempt === 1) {
            console.log('[SupabaseService] Supabase connection verified successfully.');
          }
          return true; // 连接正常
        }
    } catch (e) {
      console.error(`[SupabaseService] Unexpected error testing Supabase connection (attempt ${attempt}/${maxAttempts}):`, e);
      supabase = null; // 重置客户端以便重新初始化
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒后重试
        continue;
      }
    }
  }
  
  return false; // 所有尝试均失败
};

// Ensure Supabase is initialized on module load
initializeSupabase();

// NEW: Function to update command status with retry mechanism
export const updateCommandStatus = async (commandId, status, errorMessage = null, retryCount = 3, retryDelay = 1000) => {
  // 检查并确保Supabase连接可用
  if (!await ensureSupabaseConnection()) {
    console.error('[SupabaseService] Failed to ensure Supabase connection. Cannot update command status.');
    return { data: null, error: new Error('Failed to establish Supabase connection after multiple attempts.') };
  }
  
  let lastError = null;
  
  // 重试逻辑
  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      // Removed 'updated_at' from the update object as it's not in the 'commands' table schema
      const updatePayload = { status: status, last_error: errorMessage };
      if (status === 'completed' || status === 'error') {
          // Optionally, one could add a 'completed_at' or 'finished_at' timestamp here if the schema supports it
          // For now, just status and last_error as per current schema and issue.
      }

      const { data, error } = await supabase
        .from('commands')
        .update(updatePayload)
        .eq('id', commandId)
        .select();

      if (error) {
        console.error(`[SupabaseService] Error updating command ${commandId} to '${status}' (attempt ${attempt}/${retryCount}):`, error);
        lastError = error;
        
        // 如果是连接错误并且还有重试机会，尝试重新初始化连接
        if (attempt < retryCount) {
          console.log(`[SupabaseService] Checking Supabase connection and retrying update for command ${commandId}...`);
          await ensureSupabaseConnection(); // 尝试重新建立连接
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }        } else {
          // 只输出重要的状态更新日志
          if (status === 'completed' || status === 'error') {
            console.log(`[SupabaseService] Command ${commandId} status successfully updated to '${status}'.`);
          }
          if ((!data || data.length === 0) && !error) {
            console.warn(`[SupabaseService] Command ${commandId} not found or no change when trying to update status to '${status}', but no explicit error from Supabase.`);
          }
          return { data, error: null };
        }
    } catch (e) {
      console.error(`[SupabaseService] Unexpected error in updateCommandStatus for command ${commandId} (attempt ${attempt}/${retryCount}):`, e);
      lastError = e;
      
      // 如果是网络错误，并且还有重试机会，则尝试重新建立连接并重试
      if (attempt < retryCount) {
        console.log(`[SupabaseService] Checking Supabase connection and retrying update for command ${commandId} after error: ${e.message}`);
        await ensureSupabaseConnection(); // 尝试重新建立连接
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
    }
  }
  
  console.error(`[SupabaseService] All ${retryCount} attempts to update command ${commandId} status failed. Last error:`, lastError);
  return { data: null, error: lastError };
};

// MODIFIED: handleNewCommand now adds commands to queue instead of processing immediately
const handleNewCommand = async (payload) => {
  const newCommand = payload.new;
  console.log('[SupabaseService] New command received:', newCommand.id);

  if (!newCommand || !newCommand.id || !newCommand.command_text) {
    console.error('[SupabaseService] Received invalid command data from subscription, missing ID or command_text.');
    return;
  }
  
  // 将新命令添加到队列
  commandQueue.push(newCommand);
  // 减少队列长度的日志输出频率
  if (commandQueue.length > 1) {
    console.log(`[SupabaseService] Command ${newCommand.id} queued (${commandQueue.length} total)`);
  }
  
  // 如果没有正在处理的命令，开始处理队列
  if (!isProcessing) {
    processNextCommand();
  }
};

// NEW: Function to process next command in queue
const processNextCommand = async () => {
  // 如果队列为空，结束处理
  if (commandQueue.length === 0) {
    isProcessing = false;
    // 只在有命令处理完成时才输出日志
    return;
  }
  
  // 设置处理标志
  isProcessing = true;
  
  // 获取队列中的第一个命令
  const nextCommand = commandQueue.shift();
  console.log(`[SupabaseService] Processing command ${nextCommand.id}. Queue: ${commandQueue.length} remaining`);
  
  let hasError = false;
  
  try {
    // 确保Supabase连接有效
    if (!await ensureSupabaseConnection()) {
      throw new Error('Failed to establish Supabase connection before processing command');
    }
    
    // 处理命令 - 使用动态导入避免循环依赖
    const { processCommand } = await import('../controllers/commandController.js');
    await processCommand(nextCommand);
    // 减少成功处理的日志输出
  } catch (error) {
    hasError = true;
    console.error(`[SupabaseService] Error processing command ${nextCommand.id}:`, error);
    
    // 确保连接有效后再尝试更新状态
    await ensureSupabaseConnection();
    
    // 尝试将命令标记为错误
    try {
      await updateCommandStatus(nextCommand.id, 'error', `处理失败: ${error.message}`);
    } catch (updateError) {
      console.error(`[SupabaseService] Failed to update error status for command ${nextCommand.id}:`, updateError);
    }
  } finally {
    // 根据是否有错误决定延迟时间
    const delay = hasError ? 5000 : 1000; // 错误时延迟5秒，正常时延迟1秒
    setTimeout(() => {
      // 无论成功还是失败，继续处理下一个命令
      processNextCommand();
    }, delay);
  }
};

// NEW: Function to subscribe to results for a specific command_id with improved error handling
export const subscribeToResultForCommand = async (commandId, callback) => {
  // 确保Supabase连接有效
  if (!await ensureSupabaseConnection()) {
    console.error('[SupabaseService] Failed to ensure Supabase connection. Cannot subscribe to results.');
    return null;
  }
  
  try {
    const channelName = `result_for_command_${commandId}`.replace(/-/g, '_'); // Sanitize for channel name
    const subscription = supabase
      .channel(channelName) // Unique channel per command for result
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'results', filter: `command_id=eq.${commandId}` },
        callback
      )
      .subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          // 减少订阅成功的日志输出
          console.log(`[SupabaseService] Subscribed to results for command ${commandId}.`);
        } else if (err) {
          console.error(`[SupabaseService] Error subscribing to results for command ${commandId}:`, err);
          
          // 尝试重新连接和重新订阅
          setTimeout(async () => {
            if (await ensureSupabaseConnection()) {
              const newSubscription = await subscribeToResultForCommand(commandId, callback);
              if (newSubscription) {
                console.log(`[SupabaseService] Re-subscribed to results for command ${commandId}.`);
              }
            }
          }, 2000);
        } else {
          // 减少常规状态变化的日志输出
          if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
            console.warn(`[SupabaseService] Result subscription for command ${commandId} status: ${status}. Reconnecting...`);
            
            // 尝试重新连接和重新订阅
            setTimeout(async () => {
              if (await ensureSupabaseConnection()) {
                const newSubscription = await subscribeToResultForCommand(commandId, callback);
                if (newSubscription) {
                  console.log(`[SupabaseService] Re-subscribed to results for command ${commandId}.`);
                }
              }
            }, 2000);
          }
        }
      });
    return subscription;
  } catch (e) {
    console.error(`[SupabaseService] Exception when trying to subscribe to results for command ${commandId}:`, e);
    return null;
  }
};

// NEW: Function to clear/unsubscribe from a Supabase channel subscription
export const clearResultSubscription = async (subscription) => {
  if (subscription && typeof subscription.unsubscribe === 'function') {
    try {
      await supabase.removeChannel(subscription);
      // 减少清理订阅的日志输出
    } catch (error) {
      console.error("[SupabaseService] Error unsubscribing/removing channel:", error);
    }
  } else {
    // 移除无效订阅的警告日志，减少噪音
  }
};

// Main subscription to new commands with reconnection logic
const subscribeToCommands = async (retryCount = 3, retryDelay = 10000) => { // 增加重试延迟到10秒
  // 确保客户端初始化
  if (!await ensureSupabaseConnection()) { 
    console.error('[SupabaseService] Failed to ensure Supabase connection. Will retry command subscription later.');
    
    // 设置延迟后的重试
    setTimeout(() => subscribeToCommands(retryCount, retryDelay), retryDelay);
    return null;
  }

  const commandsSubscription = supabase
    .channel('public_commands_insert') // Changed channel name for clarity
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'commands', filter: 'status=eq.pending' },
      (payload) => {
        handleNewCommand(payload);
      }
    )
    .subscribe(async (status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('[SupabaseService] Successfully subscribed to new commands!');
      } else if (status === 'TIMED_OUT') {
        console.error('[SupabaseService] Subscription to commands timed out. Will attempt to reconnect in', retryDelay / 1000, 'seconds...');
        await ensureSupabaseConnection();
        setTimeout(() => subscribeToCommands(retryCount, retryDelay), retryDelay);
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[SupabaseService] Channel error on command subscription. Will attempt to reconnect in', retryDelay / 1000, 'seconds... Error:', err || '(No specific error details)');
        await ensureSupabaseConnection();
        setTimeout(() => subscribeToCommands(retryCount, retryDelay), retryDelay);
      } else if (status === 'CLOSED') {
        console.warn('[SupabaseService] Command subscription closed unexpectedly. Will attempt to reconnect in', retryDelay / 1000, 'seconds... Error:', err || '(No specific error details)');
        await ensureSupabaseConnection();
        setTimeout(() => subscribeToCommands(retryCount, retryDelay), retryDelay);
      } else {
        // 减少其他状态变化的日志输出频率
        if (Math.random() < 0.1) { // 只有10%的概率输出日志
          console.warn(`[SupabaseService] Command subscription status changed to ${status}. Will attempt to reconnect in`, retryDelay / 1000, 'seconds... Error:', err || '(No specific error details)');
        }
        await ensureSupabaseConnection();
        setTimeout(() => subscribeToCommands(retryCount, retryDelay), retryDelay);
      }
    });

  return commandsSubscription;
};

// 在文件末尾添加定期连接健康检查机制
let connectionHealthCheckInterval = null;

// 启动定期连接健康检查
export const startConnectionHealthCheck = (checkInterval = 15 * 60 * 1000) => { // 改为15分钟检查一次，减少频繁的日志输出
  if (connectionHealthCheckInterval) {
    clearInterval(connectionHealthCheckInterval);
  }
  
  // 立即执行一次连接检查（静默模式）
  ensureSupabaseConnection().then(isConnected => {
    if (!isConnected) {
      console.warn('[SupabaseService] Initial connection health check: Connection is unhealthy, attempting to reconnect');
    }
  });
  
  // 设置定期检查
  connectionHealthCheckInterval = setInterval(async () => {
    try {
      const isConnected = await ensureSupabaseConnection();
      if (!isConnected) {
        console.warn('[SupabaseService] Periodic connection health check: Connection is unhealthy, attempting to reconnect');
      }
      // 移除成功连接的日志，减少噪音
    } catch (error) {
      console.error('[SupabaseService] Error during periodic connection health check:', error);
    }
  }, checkInterval);
  
  console.log(`[SupabaseService] Supabase connection health check scheduled every ${checkInterval / 60000} minutes`);
  return connectionHealthCheckInterval;
};

// 停止定期连接健康检查
export const stopConnectionHealthCheck = () => {
  if (connectionHealthCheckInterval) {
    clearInterval(connectionHealthCheckInterval);
    connectionHealthCheckInterval = null;
    console.log('[SupabaseService] Supabase connection health check stopped');
  }
};

// 启动健康检查
startConnectionHealthCheck();

// 命令订阅立即启动
subscribeToCommands();

// API服务器已移除 - 现在只通过Supabase RPC函数提供服务

export default supabase; // Exporting the client itself might be useful for direct use elsewhere if needed but primarily controller uses exported functions.