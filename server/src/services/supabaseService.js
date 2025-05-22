import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { processCommand } from '../controllers/commandController.js';
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
        }
      } else {
        console.log('[SupabaseService] Supabase connection verified successfully.');
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
        }
      } else {
        console.log(`[SupabaseService] Command ${commandId} status successfully updated to '${status}'. Data:`, data);
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
  console.log('[SupabaseService] New command received via subscription:', newCommand.id);

  if (!newCommand || !newCommand.id || !newCommand.command_text) {
    console.error('[SupabaseService] Received invalid command data from subscription, missing ID or command_text.');
    return;
  }
  
  // 将新命令添加到队列
  commandQueue.push(newCommand);
  console.log(`[SupabaseService] Command ${newCommand.id} added to queue. Queue length: ${commandQueue.length}`);
  
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
    console.log('[SupabaseService] Command queue is empty. Processing complete.');
    return;
  }
  
  // 设置处理标志
  isProcessing = true;
  
  // 获取队列中的第一个命令
  const nextCommand = commandQueue.shift();
  console.log(`[SupabaseService] Processing next command from queue: ${nextCommand.id}. Remaining in queue: ${commandQueue.length}`);
  
  try {
    // 确保Supabase连接有效
    if (!await ensureSupabaseConnection()) {
      throw new Error('Failed to establish Supabase connection before processing command');
    }
    
    // 处理命令
    await processCommand(nextCommand);
    console.log(`[SupabaseService] Command ${nextCommand.id} processing completed.`);
  } catch (error) {
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
    // 添加延迟以避免在出现错误时立即处理下一个命令
    setTimeout(() => {
      // 无论成功还是失败，继续处理下一个命令
      processNextCommand();
    }, 5000); // 延迟5秒
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
          console.log(`[SupabaseService] Successfully subscribed to results for command ${commandId} on channel ${channelName}.`);
        } else if (err) {
          console.error(`[SupabaseService] Error subscribing to results for command ${commandId} on channel ${channelName}:`, err);
          
          // 尝试重新连接和重新订阅
          setTimeout(async () => {
            if (await ensureSupabaseConnection()) {
              console.log(`[SupabaseService] Attempting to re-subscribe for results of command ${commandId} after error.`);
              const newSubscription = await subscribeToResultForCommand(commandId, callback);
              if (newSubscription) {
                // 更新订阅，这里需要外部代码保持对subscription的引用更新
                console.log(`[SupabaseService] Successfully re-subscribed to results for command ${commandId}.`);
              }
            }
          }, 2000);
        } else {
          console.log(`[SupabaseService] Result subscription status for command ${commandId} on channel ${channelName}: ${status}`);
          
          // 处理意外关闭情况
          if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
            console.warn(`[SupabaseService] Result subscription for command ${commandId} encountered status ${status}. Attempting to reconnect...`);
            
            // 尝试重新连接和重新订阅
            setTimeout(async () => {
              if (await ensureSupabaseConnection()) {
                console.log(`[SupabaseService] Attempting to re-subscribe for results of command ${commandId} after status ${status}.`);
                const newSubscription = await subscribeToResultForCommand(commandId, callback);
                if (newSubscription) {
                  // 更新订阅，这里需要外部代码保持对subscription的引用更新
                  console.log(`[SupabaseService] Successfully re-subscribed to results for command ${commandId}.`);
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
      console.log(`[SupabaseService] Successfully unsubscribed and removed channel: ${subscription.channelName}`);
    } catch (error) {
      console.error("[SupabaseService] Error unsubscribing/removing channel:", error, "Channel:", subscription.channelName);
    }
  } else {
    console.warn("[SupabaseService] Attempted to clear an invalid or already cleared subscription.");
  }
};

// Main subscription to new commands with reconnection logic
const subscribeToCommands = async (retryCount = 3, retryDelay = 5000) => {
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
        console.error('[SupabaseService] Subscription to commands timed out. Attempting to reconnect...');
        await ensureSupabaseConnection();
        setTimeout(() => subscribeToCommands(retryCount, retryDelay), retryDelay);
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[SupabaseService] Channel error on command subscription. Attempting to reconnect... Error:', err || '(No specific error details)');
        await ensureSupabaseConnection();
        setTimeout(() => subscribeToCommands(retryCount, retryDelay), retryDelay);
      } else if (status === 'CLOSED') {
        console.warn('[SupabaseService] Command subscription closed unexpectedly. Attempting to reconnect... Error:', err || '(No specific error details)');
        await ensureSupabaseConnection();
        setTimeout(() => subscribeToCommands(retryCount, retryDelay), retryDelay);
      } else {
        console.warn(`[SupabaseService] Command subscription status changed to ${status}. Attempting to reconnect... Error:`, err || '(No specific error details)');
        await ensureSupabaseConnection();
        setTimeout(() => subscribeToCommands(retryCount, retryDelay), retryDelay);
      }
    });

  return commandsSubscription;
};

// 在文件末尾添加定期连接健康检查机制
let connectionHealthCheckInterval = null;

// 启动定期连接健康检查
export const startConnectionHealthCheck = (checkInterval = 5 * 60 * 1000) => { // 默认5分钟检查一次
  if (connectionHealthCheckInterval) {
    clearInterval(connectionHealthCheckInterval);
  }
  
  // 立即执行一次连接检查
  ensureSupabaseConnection().then(isConnected => {
    if (isConnected) {
      console.log('[SupabaseService] Initial connection health check: Connection is healthy');
    } else {
      console.warn('[SupabaseService] Initial connection health check: Connection is unhealthy, attempting to reconnect');
    }
  });
  
  // 设置定期检查
  connectionHealthCheckInterval = setInterval(async () => {
    try {
      const isConnected = await ensureSupabaseConnection();
      if (isConnected) {
        console.log('[SupabaseService] Periodic connection health check: Connection is healthy');
      } else {
        console.warn('[SupabaseService] Periodic connection health check: Connection is unhealthy, attempting to reconnect');
      }
    } catch (error) {
      console.error('[SupabaseService] Error during periodic connection health check:', error);
    }
  }, checkInterval);
  
  console.log(`[SupabaseService] Supabase connection health check scheduled every ${checkInterval / 1000} seconds`);
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

export default supabase; // Exporting the client itself might be useful for direct use elsewhere if needed but primarily controller uses exported functions.