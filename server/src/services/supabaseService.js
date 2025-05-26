import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// 增强的配置验证
if (!supabaseUrl) {
  console.error('Error: SUPABASE_URL must be defined in your .env file');
  process.exit(1);
}
if (!supabaseServiceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY must be defined in your .env file');
  process.exit(1);
}

let supabase = null;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 10;
const CONNECTION_RETRY_DELAY = 3000; // 3秒，减少重试延迟
const CONNECTION_RESET_INTERVAL = 3 * 60 * 1000; // 3分钟重置连接尝试计数器，缩短重置间隔

// 服务状态跟踪
const serviceStatus = {
  isConnected: false,
  lastConnectionAttempt: null,
  consecutiveFailures: 0,
  isShuttingDown: false,
  isDegraded: false,
  lastSuccessfulConnection: null
};

// 命令队列和处理状态
const commandQueue = [];
let isProcessing = false;

// 订阅状态跟踪
let currentSubscription = null;
let subscriptionRetryAttempts = 0;
const MAX_SUBSCRIPTION_RETRIES = 10;

// 连接重置定时器
let connectionResetTimer = null;

// 优雅关闭处理
const gracefulShutdown = () => {
  console.log('[SupabaseService] Received shutdown signal, cleaning up...');
  serviceStatus.isShuttingDown = true;
  
  // 停止健康检查
  stopConnectionHealthCheck();
  
  // 清理连接重置定时器
  if (connectionResetTimer) {
    clearInterval(connectionResetTimer);
    connectionResetTimer = null;
  }
  
  // 清理订阅
  if (supabase) {
    try {
      supabase.removeAllChannels();
    } catch (error) {
      console.warn('[SupabaseService] Error cleaning up channels:', error.message);
    }
  }
  
  // 等待队列处理完成或超时
  const shutdownTimeout = setTimeout(() => {
    console.log('[SupabaseService] Force shutdown after timeout');
    process.exit(0);
  }, 30000); // 30秒超时
  
  const checkQueue = () => {
    if (commandQueue.length === 0 && !isProcessing) {
      clearTimeout(shutdownTimeout);
      console.log('[SupabaseService] Graceful shutdown completed');
      process.exit(0);
    } else {
      console.log(`[SupabaseService] Waiting for ${commandQueue.length} commands to complete...`);
      setTimeout(checkQueue, 1000);
    }
  };
  
  checkQueue();
};

// 监听进程信号
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  console.error('[SupabaseService] Uncaught Exception:', error);
  // 不要立即退出，尝试继续运行
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SupabaseService] Unhandled Rejection at:', promise, 'reason:', reason);
  // 不要立即退出，尝试继续运行
});

// 连接测试函数
const testConnection = async () => {
  if (!supabase) {
    return false;
  }
  
  try {
    const { data, error } = await supabase.from('commands').select('id').limit(1);
    if (error) {
      console.error('[SupabaseService] Connection test failed:', error.message);
      // 如果是网络相关错误，标记需要重置客户端
      if (error.message.includes('fetch failed') || error.message.includes('Network')) {
        console.warn('[SupabaseService] Network error detected, will reset client on next connection attempt');
        serviceStatus.isConnected = false;
        serviceStatus.consecutiveFailures++;
      }
      return false;
    }
    return true;
  } catch (error) {
    console.error('[SupabaseService] Connection test exception:', error.message);
    // 检测常见的网络错误模式
    if (error.message.includes('fetch failed') || 
        error.message.includes('Network') || 
        error.message.includes('ENOTFOUND') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('timeout')) {
      console.warn('[SupabaseService] Network connectivity issue detected, forcing client reset');
      serviceStatus.isConnected = false;
      serviceStatus.consecutiveFailures++;
      // 强制重置客户端以便下次重新初始化
      supabase = null;
    }
    return false;
  }
};

// Function to initialize Supabase client if not already initialized
const initializeSupabase = async () => {
  if (serviceStatus.isShuttingDown) {
    return false;
  }
  
  connectionAttempts++;
  
  if (connectionAttempts > MAX_CONNECTION_ATTEMPTS) {
    if (!serviceStatus.isDegraded) {
      console.error(`[SupabaseService] Max connection attempts (${MAX_CONNECTION_ATTEMPTS}) reached. Entering degraded mode.`);
      serviceStatus.isDegraded = true;
      
      // 启动连接重置定时器
      if (!connectionResetTimer) {
        connectionResetTimer = setInterval(() => {
          console.log('[SupabaseService] Resetting connection attempts counter to allow recovery from degraded mode...');
          connectionAttempts = 0;
          subscriptionRetryAttempts = 0;
          serviceStatus.isDegraded = false;
        }, CONNECTION_RESET_INTERVAL);
      }
    }
    return false;
  }
  
  try {
    if (!supabase && supabaseUrl && supabaseServiceKey) {
      console.log(`[SupabaseService] Initializing Supabase client (attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})...`);
      
      supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: false,
          detectSessionInUrl: false
        },
        // 增强的连接配置
        global: {
          fetch: (...args) => {
            return fetch(...args).catch(err => {
              console.error('[SupabaseService] Fetch error in Supabase client:', err.message);
              // 标记连接状态为不健康
              serviceStatus.isConnected = false;
              serviceStatus.consecutiveFailures++;
              
              // 如果是严重的网络错误，立即触发重连
              if (err.message.includes('fetch failed') || 
                  err.message.includes('ENOTFOUND') ||
                  err.message.includes('ECONNREFUSED')) {
                console.warn('[SupabaseService] Critical network error detected, forcing immediate reconnection attempt');
                // 异步触发重连，不阻塞当前调用
                setTimeout(async () => {
                  supabase = null;
                  await ensureSupabaseConnection();
                }, 1000);
              }
              
              throw err;
            });
          },
          headers: {
            'x-custom-app-name': 'CursorRemote',
            'x-client-info': 'NodeJS Server',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        },
        realtime: {
          timeout: 30000,  // 减少到30秒超时，更快发现问题
          heartbeatIntervalMs: 15000, // 减少到15秒心跳，更频繁检测
          reconnectAfterMs: (tries) => Math.min(tries * 500, 10000), // 更快的重连，最大10秒
          params: {
            eventsPerSecond: 10
          }
        }
      });
      
      // 测试连接
      const testResult = await testConnection();
      if (testResult) {
        serviceStatus.isConnected = true;
        serviceStatus.consecutiveFailures = 0;
        serviceStatus.lastSuccessfulConnection = new Date();
        serviceStatus.isDegraded = false;
        
        // 重置连接尝试计数器
        connectionAttempts = 0;
        subscriptionRetryAttempts = 0;
        
        // 清理连接重置定时器
        if (connectionResetTimer) {
          clearInterval(connectionResetTimer);
          connectionResetTimer = null;
        }
        
        console.log('[SupabaseService] Supabase client initialized and connection verified successfully.');
        return true;
      }
      supabase = null;
      serviceStatus.isConnected = false;
      return false;
    }
  } catch (error) {
    console.error('[SupabaseService] Error initializing Supabase client:', error.message);
    supabase = null;
    serviceStatus.isConnected = false;
    serviceStatus.consecutiveFailures++;
    return false;
  }
  
  return false;
};

// 添加一个函数用于检查和重新初始化Supabase连接
export const ensureSupabaseConnection = async () => {
  if (serviceStatus.isShuttingDown) {
    return false;
  }
  
  serviceStatus.lastConnectionAttempt = new Date();
  
  // 如果客户端未初始化或连接状态不好，尝试初始化
  if (!supabase || !serviceStatus.isConnected) {
    const initialized = await initializeSupabase();
    if (initialized) {
      return true;
    }
    
    // 如果初始化失败，等待一段时间后再次尝试
    await new Promise(resolve => setTimeout(resolve, CONNECTION_RETRY_DELAY));
    return false;
  }
  
  // 如果客户端已初始化，测试连接
  const connectionValid = await testConnection();
  if (connectionValid) {
    // 如果之前是降级状态，现在恢复了，记录恢复
    if (serviceStatus.isDegraded) {
      console.log('[SupabaseService] Connection recovered from degraded mode!');
    }
    
    serviceStatus.isConnected = true;
    serviceStatus.consecutiveFailures = 0;
    serviceStatus.lastSuccessfulConnection = new Date();
    serviceStatus.isDegraded = false;
    
    // 清理连接重置定时器
    if (connectionResetTimer) {
      clearInterval(connectionResetTimer);
      connectionResetTimer = null;
    }
    
    return true;
  }
  
  serviceStatus.isConnected = false;
  serviceStatus.consecutiveFailures++;
  
  // 如果连续失败次数过多，重置客户端
  if (serviceStatus.consecutiveFailures >= 3) {
    console.warn(`[SupabaseService] ${serviceStatus.consecutiveFailures} consecutive connection failures, resetting client...`);
    supabase = null;
    connectionAttempts = 0; // 重置连接尝试计数器
  }
  
  return false;
};

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
      const updatePayload = { status: status, last_error: errorMessage };

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
  // 如果队列为空或服务正在关闭，结束处理
  if (commandQueue.length === 0 || serviceStatus.isShuttingDown) {
    isProcessing = false;
    return;
  }
  
  // 设置处理标志
  isProcessing = true;
  
  // 获取队列中的第一个命令
  const nextCommand = commandQueue.shift();
  console.log(`[SupabaseService] Processing command ${nextCommand.id}. Queue: ${commandQueue.length} remaining`);
  
  let hasError = false;
  let retryCount = 0;
  const maxRetries = 2;
  
  while (retryCount <= maxRetries) {
    try {
      // 确保Supabase连接有效
      if (!await ensureSupabaseConnection()) {
        throw new Error('Failed to establish Supabase connection before processing command');
      }
      
      // 处理命令 - 使用动态导入避免循环依赖
      const { processCommand } = await import('../controllers/commandController.js');
      await processCommand(nextCommand);
      
      // 如果成功处理，跳出重试循环
      hasError = false;
      break;
      
    } catch (error) {
      retryCount++;
      hasError = true;
      console.error(`[SupabaseService] Error processing command ${nextCommand.id} (attempt ${retryCount}/${maxRetries + 1}):`, error.message);
      
      // 如果还有重试机会，等待一段时间再重试
      if (retryCount <= maxRetries) {
        console.log(`[SupabaseService] Retrying command ${nextCommand.id} in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      
      // 所有重试都失败了，确保连接有效后再尝试更新状态
      await ensureSupabaseConnection();
      
      // 尝试将命令标记为错误
      try {
        await updateCommandStatus(nextCommand.id, 'error', `处理失败 (${retryCount}次尝试): ${error.message}`);
      } catch (updateError) {
        console.error(`[SupabaseService] Failed to update error status for command ${nextCommand.id}:`, updateError.message);
      }
    }
  }
  
  // 根据是否有错误决定延迟时间
  const delay = hasError ? 5000 : 1000; // 错误时延迟5秒，正常时延迟1秒
  
  setTimeout(() => {
    // 无论成功还是失败，继续处理下一个命令
    processNextCommand();
  }, delay);
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
    } catch (error) {
      console.error("[SupabaseService] Error unsubscribing/removing channel:", error);
    }
  }
};

// 订阅错误处理函数
const handleSubscriptionError = async (status, error, retryDelay) => {
  if (serviceStatus.isShuttingDown) {
    return;
  }
  
  // 清理当前订阅
  currentSubscription = null;
  
  // 重置连接状态
  serviceStatus.isConnected = false;
  serviceStatus.consecutiveFailures++;
  
  // 尝试重新建立连接
  await ensureSupabaseConnection();
  
  // 指数退避重试策略
  const nextRetryDelay = Math.min(retryDelay * (1.5 ** (subscriptionRetryAttempts - 1)), 60000);
  setTimeout(() => subscribeToCommands(3, nextRetryDelay), nextRetryDelay);
};

// Main subscription to new commands with enhanced error handling
const subscribeToCommands = async (retryCount = 5, retryDelay = 15000) => {
  if (serviceStatus.isShuttingDown) {
    console.log('[SupabaseService] Service is shutting down, not attempting to subscribe');
    return null;
  }
  
  subscriptionRetryAttempts++;
  
  if (subscriptionRetryAttempts > MAX_SUBSCRIPTION_RETRIES) {
    if (!serviceStatus.isDegraded) {
      console.error(`[SupabaseService] Max subscription retry attempts (${MAX_SUBSCRIPTION_RETRIES}) reached. Service will continue attempting recovery.`);
    }
    // 不要立即返回 null，允许在连接重置后继续尝试
    if (serviceStatus.isDegraded && connectionResetTimer) {
      return null;
    }
  }
  
  console.log(`[SupabaseService] Attempting to subscribe to commands (attempt ${subscriptionRetryAttempts}/${MAX_SUBSCRIPTION_RETRIES})...`);
  
  // 确保客户端初始化并且连接有效
  if (!await ensureSupabaseConnection()) { 
    console.error('[SupabaseService] Failed to ensure Supabase connection. Will retry command subscription later.');
    
    // 指数退避重试策略
    const nextRetryDelay = Math.min(retryDelay * (1.5 ** (subscriptionRetryAttempts - 1)), 60000);
    setTimeout(() => subscribeToCommands(retryCount, nextRetryDelay), nextRetryDelay);
    return null;
  }

  try {
    // 清理之前的订阅
    if (currentSubscription) {
      try {
        await supabase.removeChannel(currentSubscription);
      } catch (cleanupError) {
        console.warn('[SupabaseService] Warning: Could not cleanly remove previous subscription:', cleanupError.message);
      }
    }

    // 验证 supabase 客户端仍然有效
    if (!supabase) {
      throw new Error('Supabase client is null after connection check');
    }

    currentSubscription = supabase
      .channel('public_commands_insert')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'commands', filter: 'status=eq.pending' },
        (payload) => {
          try {
            handleNewCommand(payload);
          } catch (error) {
            console.error('[SupabaseService] Error handling new command:', error);
          }
        }
      )
      .subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[SupabaseService] Successfully subscribed to new commands!');
          subscriptionRetryAttempts = 0; // 重置重试计数器
          
          // 如果从降级模式恢复，记录恢复状态
          if (serviceStatus.isDegraded) {
            console.log('[SupabaseService] Service recovered from degraded mode - subscription active!');
            serviceStatus.isDegraded = false;
            
            // 清理连接重置定时器
            if (connectionResetTimer) {
              clearInterval(connectionResetTimer);
              connectionResetTimer = null;
            }
          }
        } else if (status === 'TIMED_OUT') {
          console.error('[SupabaseService] Subscription to commands timed out. Will attempt to reconnect in', retryDelay / 1000, 'seconds...');
          await handleSubscriptionError('TIMED_OUT', err, retryDelay);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[SupabaseService] Channel error on command subscription. Will attempt to reconnect in', retryDelay / 1000, 'seconds... Error:', err || '(No specific error details)');
          await handleSubscriptionError('CHANNEL_ERROR', err, retryDelay);
        } else if (status === 'CLOSED') {
          console.warn('[SupabaseService] Command subscription closed unexpectedly. Will attempt to reconnect in', retryDelay / 1000, 'seconds... Error:', err || '(No specific error details)');
          await handleSubscriptionError('CLOSED', err, retryDelay);
        } else {
          console.warn(`[SupabaseService] Command subscription status changed to ${status}. Error:`, err || '(No specific error details)');
          await handleSubscriptionError(status, err, retryDelay);
        }
      });

    return currentSubscription;
    
  } catch (error) {
    console.error('[SupabaseService] Exception while setting up command subscription:', error);
    currentSubscription = null;
    
    // 指数退避重试策略
    const nextRetryDelay = Math.min(retryDelay * (1.5 ** (subscriptionRetryAttempts - 1)), 60000);
    setTimeout(() => subscribeToCommands(retryCount, nextRetryDelay), nextRetryDelay);
    return null;
  }
};

// 在文件末尾添加定期连接健康检查机制
let connectionHealthCheckInterval = null;

// 启动定期连接健康检查
export const startConnectionHealthCheck = (checkInterval = 2 * 60 * 1000) => {
  if (connectionHealthCheckInterval) {
    clearInterval(connectionHealthCheckInterval);
  }
  
  // 立即执行一次连接检查（静默模式）
  ensureSupabaseConnection().then(isConnected => {
    if (!isConnected) {
      console.warn('[SupabaseService] Initial connection health check: Connection is unhealthy, attempting to reconnect');
    }
  }).catch(error => {
    console.error('[SupabaseService] Error during initial connection health check:', error);
  });
  
  // 设置定期检查
  connectionHealthCheckInterval = setInterval(async () => {
    try {
      const isConnected = await ensureSupabaseConnection();
      if (!isConnected) {
        const status = serviceStatus.isDegraded ? 'degraded mode' : 'attempting reconnection';
        console.warn(`[SupabaseService] Periodic connection health check: Connection is unhealthy (${status})`);
      }
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

// 添加智能重连机制
const startIntelligentReconnect = () => {
  // 更频繁的重连尝试，在网络问题时
  setInterval(async () => {
    if (serviceStatus.consecutiveFailures >= 2 && !serviceStatus.isConnected && !serviceStatus.isShuttingDown) {
      console.log('[SupabaseService] Intelligent reconnect: Attempting to recover from connection issues...');
      
      // 强制重置所有状态
      supabase = null;
      currentSubscription = null;
      connectionAttempts = 0;
      subscriptionRetryAttempts = 0;
      
      // 尝试重新建立连接
      const reconnected = await ensureSupabaseConnection();
      if (reconnected) {
        console.log('[SupabaseService] Intelligent reconnect: Successfully restored connection!');
        // 重新启动订阅
        await subscribeToCommands();
      }
    }
  }, 30000); // 每30秒检查一次
};

// 服务初始化
const initializeService = async () => {
  console.log('[SupabaseService] Starting service initialization...');
  
  try {
    // 初始化 Supabase 连接
    const connected = await ensureSupabaseConnection();
    if (!connected) {
      console.error('[SupabaseService] Failed to establish initial connection. Service will continue trying to reconnect.');
    }
    
    // 启动健康检查（缩短到2分钟间隔）
    startConnectionHealthCheck();
    
    // 启动智能重连机制
    startIntelligentReconnect();
    
    // 启动命令订阅
    await subscribeToCommands();
    
    console.log('[SupabaseService] Service initialization completed');
  } catch (error) {
    console.error('[SupabaseService] Error during service initialization:', error);
    // 不要退出进程，而是继续尝试重连
  }
};

// 启动服务
initializeService();

export default supabase;
