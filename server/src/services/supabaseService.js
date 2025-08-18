import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Configuration class for better testability
export class SupabaseConfig {
  constructor(options = {}) {
    this.url = options.url || process.env.SUPABASE_URL;
    this.serviceKey = options.serviceKey || process.env.SUPABASE_SERVICE_KEY;
    this.maxConnectionAttempts = options.maxConnectionAttempts || 10;
    this.connectionRetryDelay = options.connectionRetryDelay || 5000; // Increased to 5 seconds
    this.connectionResetInterval = options.connectionResetInterval || 5 * 60 * 1000; // 5 minutes
    this.connectionRefreshInterval = options.connectionRefreshInterval || 60 * 60 * 1000; // 1 hour
    this.healthCheckInterval = options.healthCheckInterval || 2 * 60 * 1000; // 2 minutes
    this.maxSubscriptionRetries = options.maxSubscriptionRetries || 15; // Increased retry count
    
    // New: heartbeat check configuration
    this.enableHeartbeatCheck = options.enableHeartbeatCheck !== undefined 
      ? options.enableHeartbeatCheck 
      : (process.env.ENABLE_HEARTBEAT_CHECK === 'true'); // Disabled by default, enabled via environment variable
  }

  validate() {
    if (!this.url) {
      throw new Error('SUPABASE_URL must be defined');
    }
    if (!this.serviceKey) {
      throw new Error('SUPABASE_SERVICE_KEY must be defined');
    }
  }
}

// Service status tracker
export class ServiceStatus {
  constructor() {
    this.isConnected = false;
    this.lastConnectionAttempt = null;
    this.consecutiveFailures = 0;
    this.isShuttingDown = false;
    this.isDegraded = false;
    this.lastSuccessfulConnection = null;
    this.lastConnectionRefresh = null;
    this.connectionCreatedAt = null;
  }

  reset() {
    this.isConnected = false;
    this.consecutiveFailures = 0;
    this.isDegraded = false;
    this.lastConnectionAttempt = null;
  }

  markSuccess() {
    this.isConnected = true;
    this.consecutiveFailures = 0;
    this.lastSuccessfulConnection = new Date();
    this.isDegraded = false;
  }

  markFailure() {
    this.isConnected = false;
    this.consecutiveFailures++;
    this.lastConnectionAttempt = new Date();
  }
}

// Connection manager for handling Supabase client lifecycle
export class ConnectionManager {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.client = null;
    this.connectionAttempts = 0;
    this.timers = {
      resetTimer: null,
      refreshTimer: null,
      healthCheckTimer: null
    };
  }

  // Create a new Supabase client with proper configuration
  createClient() {
    return createClient(this.config.url, this.config.serviceKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
        detectSessionInUrl: false
      },
      global: {
        fetch: (...args) => {
          return fetch(...args).catch(err => {
            this.logger.error('[ConnectionManager] Fetch error:', err.message);
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
        timeout: 60000, // 增加到60秒
        heartbeatIntervalMs: 30000, // 增加到30秒
        reconnectAfterMs: (tries) => {
          // 更温和的重连策略
          const baseDelay = 1000;
          const maxDelay = 30000; // 最大30秒
          const delay = Math.min(baseDelay * Math.pow(1.5, tries), maxDelay);
          return delay;
        },
        params: {
          eventsPerSecond: 5 // 降低事件频率
        }
      },
      db: {
        schema: 'public'
      }
    });
  }

  // Test the current connection
  async testConnection() {
    if (!this.client) {
      return false;
    }

    try {
      const { data, error } = await this.client.from('commands').select('id').limit(1);
      if (error) {
        this.logger.error('[ConnectionManager] Connection test failed:', error.message);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error('[ConnectionManager] Connection test exception:', error.message);
      if (this.isNetworkError(error)) {
        this.client = null; // Force recreation
      }
      return false;
    }
  }

  isNetworkError(error) {
    const networkErrorPatterns = [
      'fetch failed',
      'Network',
      'ENOTFOUND',
      'ECONNREFUSED',
      'timeout'
    ];
    return networkErrorPatterns.some(pattern => 
      error.message.includes(pattern)
    );
  }

  // Initialize or recreate the client
  async initialize() {
    this.connectionAttempts++;

    if (this.connectionAttempts > this.config.maxConnectionAttempts) {
      this.logger.error(
        `[ConnectionManager] Max connection attempts (${this.config.maxConnectionAttempts}) reached`
      );
      return false;
    }

    try {
      this.logger.log(
        `[ConnectionManager] Initializing client (attempt ${this.connectionAttempts}/${this.config.maxConnectionAttempts})...`
      );

      this.client = this.createClient();
      
      const testResult = await this.testConnection();
      if (testResult) {
        this.connectionAttempts = 0;
        this.logger.log('[ConnectionManager] Client initialized successfully');
        return true;
      }

      this.client = null;
      return false;
    } catch (error) {
      this.logger.error('[ConnectionManager] Error initializing client:', error.message);
      this.client = null;
      return false;
    }
  }

  // Force refresh the connection
  async refresh() {
    this.logger.log('[ConnectionManager] Performing connection refresh...');
    
    if (this.client) {
      try {
        this.client.removeAllChannels();
      } catch (error) {
        this.logger.warn('[ConnectionManager] Warning during cleanup:', error.message);
      }
    }

    this.client = null;
    this.connectionAttempts = 0;
    
    return await this.initialize();
  }

  // Clean up resources
  cleanup() {
    for (const timer of Object.values(this.timers)) {
      if (timer) clearInterval(timer);
    }
    
    if (this.client) {
      try {
        this.client.removeAllChannels();
      } catch (error) {
        this.logger.warn('[ConnectionManager] Error during cleanup:', error.message);
      }
    }
  }

  getClient() {
    return this.client;
  }
}

// Subscription manager for handling realtime subscriptions
export class SubscriptionManager {
  constructor(connectionManager, config, logger = console) {
    this.connectionManager = connectionManager;
    this.config = config;
    this.logger = logger;
    this.subscription = null;
    this.retryCount = 0;
    this.isShuttingDown = false;
    this.retryTimer = null;
    this.lastSuccessfulSubscription = null;
    this.subscriptionHealthTimer = null;
    this.maxRetryAttempts = config.maxSubscriptionRetries || 15;
    
    // 新增：连接健康检查 - 极度保守的参数设置
    this.healthCheckInterval = 300000; // 5分钟检查一次（大幅减少检查频率）
    this.lastHeartbeat = null;
    this.missedHeartbeats = 0;
    this.maxMissedHeartbeats = 10; // 允许10次丢失（大幅增加容忍度）
    this.heartbeatTimeout = 600000; // 10分钟心跳超时（大幅增加超时时间）
    this.enableHeartbeatCheck = config.enableHeartbeatCheck || false; // 从配置中读取心跳检查设置
  }

  // 新增：订阅健康检查 - 极度保守的实现
  startHealthCheck() {
    // 如果心跳检查被禁用，则不启动
    if (!this.enableHeartbeatCheck) {
      this.logger.log('[SubscriptionManager] Heartbeat check is disabled for stability');
      return;
    }
    
    if (this.subscriptionHealthTimer) {
      clearInterval(this.subscriptionHealthTimer);
    }
    
    this.subscriptionHealthTimer = setInterval(async () => {
      if (this.subscription && !this.isShuttingDown) {
        const now = Date.now();
        
        // 使用极度宽松的心跳超时时间
        if (this.lastHeartbeat && (now - this.lastHeartbeat) > this.heartbeatTimeout) {
          this.missedHeartbeats++;
          
          // 在触发重连前，先进行额外的连接验证
          if (this.missedHeartbeats >= this.maxMissedHeartbeats) {
            this.logger.warn(`[SubscriptionManager] Potential connection issue detected (${Math.round((now - this.lastHeartbeat) / 1000)}s since last heartbeat)`);
            
            // 进行额外的连接测试
            const isReallyDisconnected = await this.verifyConnectionLoss();
            
            if (isReallyDisconnected) {
              this.logger.error('[SubscriptionManager] Connection loss confirmed, forcing reconnection');
              this.forceReconnect();
            } else {
              this.logger.log('[SubscriptionManager] Connection test passed, resetting heartbeat counter');
              this.lastHeartbeat = Date.now(); // 重置心跳时间
              this.missedHeartbeats = 0; // 重置计数器
            }
          } else if (this.missedHeartbeats >= 5) {
            // 只在达到一半阈值时才记录警告
            this.logger.warn(`[SubscriptionManager] Long silence detected ${this.missedHeartbeats}/${this.maxMissedHeartbeats} (${Math.round((now - this.lastHeartbeat) / 1000)}s since last)`);
          }
        } else {
          // 重置计数器，但不记录日志以减少噪音
          if (this.missedHeartbeats > 0) {
            this.missedHeartbeats = 0;
          }
        }
      }
    }, this.healthCheckInterval);
  }

  // 新增：验证连接是否真的丢失
  async verifyConnectionLoss() {
    try {
      // 尝试进行一个简单的数据库查询来验证连接
      const client = this.connectionManager.getClient();
      if (!client) {
        return true; // 没有客户端，确实断开了
      }

      // 执行一个轻量级的查询
      const { data, error } = await client
        .from('commands')
        .select('id')
        .limit(1);

      if (error) {
        this.logger.warn('[SubscriptionManager] Connection verification failed:', error.message);
        return true; // 查询失败，可能真的断开了
      }

      // 查询成功，连接可能是正常的
      return false;
    } catch (error) {
      this.logger.warn('[SubscriptionManager] Connection verification error:', error.message);
      return true; // 出现异常，可能真的断开了
    }
  }

  // 新增：强制重连
  async forceReconnect() {
    this.logger.log('[SubscriptionManager] Forcing subscription reconnection...');
    await this.cleanupSubscription();
    this.retryCount = 0;
    this.missedHeartbeats = 0;
    // 延迟重连以避免频繁重连
    setTimeout(() => {
      if (!this.isShuttingDown && this.lastSuccessfulSubscription) {
        this.scheduleRetryWithBackoff(this.lastSuccessfulSubscription);
      }
    }, 5000);
  }

  async subscribe(onNewCommand, retryCount = 5, retryDelay = 15000) {
    if (this.isShuttingDown) {
      this.logger.log('[SubscriptionManager] Skipping subscription - service is shutting down');
      return null;
    }

    // 检查是否已经有活跃的订阅
    if (this.subscription && this.subscription.state === 'subscribed') {
      this.logger.warn('[SubscriptionManager] Active subscription already exists, skipping duplicate subscription');
      return this.subscription;
    }

    this.lastSuccessfulSubscription = onNewCommand;
    this.retryCount = retryCount;

    try {
      const client = this.connectionManager.getClient();
      if (!client) {
        throw new Error('No Supabase client available');
      }

      this.logger.log(`[SubscriptionManager] Setting up subscription (attempt ${this.config.maxSubscriptionRetries - retryCount + 1}/${this.config.maxSubscriptionRetries})`);

      // 清理现有订阅
      await this.cleanupSubscription();

      // 创建新订阅，增加更多事件监听
      this.subscription = client
        .channel('commands-channel')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'commands',
          filter: 'status=eq.pending'
        }, (payload) => {
          this.lastHeartbeat = Date.now();
          this.missedHeartbeats = 0;
          this.logger.log('[SubscriptionManager] Received new command:', payload.new?.id);
          if (onNewCommand && typeof onNewCommand === 'function') {
            try {
              onNewCommand(payload);
            } catch (error) {
              this.logger.error('[SubscriptionManager] Error in command callback:', error);
            }
          }
        })
        .on('system', {}, (status, err) => {
          // 系统事件也算作心跳活动
          this.lastHeartbeat = Date.now();
          this.handleSubscriptionStatus(status, err, onNewCommand, retryDelay);
        })
        .subscribe((status, err) => {
          this.handleSubscriptionError(status, err, onNewCommand, retryDelay);
        });

      // 设置初始心跳时间
      this.lastHeartbeat = Date.now();
      this.missedHeartbeats = 0;
      
      // 启动健康检查
      this.startHealthCheck();

      return this.subscription;

    } catch (error) {
      this.logger.error('[SubscriptionManager] Error setting up subscription:', error);
      
      if (retryCount > 0 && !this.isShuttingDown) {
        this.logger.log(`[SubscriptionManager] Retrying subscription in ${retryDelay}ms (${retryCount} attempts left)`);
        this.scheduleRetry(onNewCommand, retryDelay);
      } else {
        this.logger.error('[SubscriptionManager] Max subscription retry attempts reached');
        // 不要完全放弃，而是使用指数退避重试
        this.scheduleRetryWithBackoff(onNewCommand);
      }
      
      return null;
    }
  }

  async cleanupSubscription() {
    if (this.subscriptionHealthTimer) {
      clearInterval(this.subscriptionHealthTimer);
      this.subscriptionHealthTimer = null;
    }
    
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.subscription) {
      try {
        await this.subscription.unsubscribe();
        this.logger.log('[SubscriptionManager] Subscription cleaned up successfully');
      } catch (error) {
        this.logger.error('[SubscriptionManager] Error cleaning up subscription:', error);
      } finally {
        this.subscription = null;
      }
    }
  }

  scheduleRetry(onNewCommand, baseDelay) {
    if (this.isShuttingDown) return;
    
    this.retryTimer = setTimeout(() => {
      this.subscribe(onNewCommand, this.retryCount - 1, baseDelay);
    }, baseDelay);
  }

  // 增强的指数退避重试
  scheduleRetryWithBackoff(onNewCommand) {
    if (this.isShuttingDown) return;
    
    // 改进退避算法：起始延迟更长，增长更缓慢
    const baseDelay = 5000; // 5秒起始延迟
    const backoffDelay = Math.min(baseDelay * Math.pow(1.5, this.retryCount), 300000); // 最大5分钟，增长因子1.5
    this.logger.log(`[SubscriptionManager] Scheduling retry with backoff in ${Math.round(backoffDelay/1000)}s (attempt ${this.retryCount + 1})`);
    
    this.retryTimer = setTimeout(() => {
      this.retryCount++;
      // 重置重试计数，避免无限增长
      if (this.retryCount > 10) {
        this.retryCount = 5; // 重置到中等水平
        this.logger.log('[SubscriptionManager] Resetting retry count to prevent infinite backoff');
      }
      this.subscribe(onNewCommand, this.maxRetryAttempts, 15000);
    }, backoffDelay);
  }

  async handleSubscriptionStatus(status, err, onNewCommand, retryDelay) {
    // 改进状态日志显示和状态检查
    const statusStr = typeof status === 'object' ? JSON.stringify(status) : status;
    
    // 检查是否是成功的订阅状态（包括对象形式的状态）
    const isSubscribed = status === 'SUBSCRIBED' || 
                        (typeof status === 'object' && status?.status === 'ok' && status?.message?.includes('Subscribed'));
    
    if (isSubscribed) {
      this.retryCount = 0;
      this.lastHeartbeat = Date.now();
      this.missedHeartbeats = 0;
      this.logger.log('[SubscriptionManager] Successfully subscribed to commands');
      return; // 早期返回，避免记录为未知状态
    }
    
    // 只在非成功状态时记录详细状态
    this.logger.log(`[SubscriptionManager] Subscription status: ${statusStr}`);
    
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      this.logger.error(`[SubscriptionManager] Subscription error: ${statusStr}`, err);
      if (!this.isShuttingDown) {
        // 延迟重连以避免频繁重试
        setTimeout(() => {
          this.scheduleRetryWithBackoff(onNewCommand);
        }, 5000);
      }
    } else if (status === 'CLOSED') {
      this.logger.warn(`[SubscriptionManager] Subscription closed: ${statusStr}`);
      if (!this.isShuttingDown) {
        // 对于CLOSED状态，使用更长的延迟避免立即重连
        setTimeout(() => {
          this.scheduleRetryWithBackoff(onNewCommand);
        }, 10000); // 10秒延迟
      }
    } else if (typeof status === 'object' && status?.status === 'ok') {
      // 处理其他成功状态的对象，但不是订阅确认
      this.lastHeartbeat = Date.now();
      this.logger.log(`[SubscriptionManager] Received status update: ${status.message || 'OK'}`);
    } else {
      // 处理真正的未知状态
      this.logger.warn(`[SubscriptionManager] Unknown subscription status: ${statusStr}`, err);
    }
  }

  async handleSubscriptionError(status, error, onNewCommand, retryDelay) {
    if (status === 'SUBSCRIBED') {
      this.retryCount = 0;
      this.lastHeartbeat = Date.now();
      this.missedHeartbeats = 0;
      this.logger.log('[SubscriptionManager] Subscription established successfully');
      return;
    }

    // 改进错误状态显示
    const statusStr = typeof status === 'object' ? JSON.stringify(status) : status;
    const errorStr = error ? (error.message || error.toString()) : 'undefined';
    this.logger.error(`[SubscriptionManager] Subscription failed with status: ${statusStr} ${errorStr}`);
    
    if (!this.isShuttingDown && this.retryCount > 0) {
      this.logger.log(`[SubscriptionManager] Retrying subscription in ${retryDelay}ms (${this.retryCount} attempts left)`);
      this.scheduleRetry(onNewCommand, retryDelay);
    } else if (!this.isShuttingDown) {
      this.logger.warn('[SubscriptionManager] All subscription attempts failed, using backoff strategy');
      this.scheduleRetryWithBackoff(onNewCommand);
    }
  }

  cleanup() {
    this.isShuttingDown = true;
    this.cleanupSubscription();
  }
}

// Main Supabase service class
export class SupabaseService {
  constructor(config = new SupabaseConfig(), logger = console, options = {}) {
    this.config = config;
    this.logger = logger;
    this.status = new ServiceStatus();
    this.connectionManager = new ConnectionManager(config, logger);
    this.subscriptionManager = new SubscriptionManager(this.connectionManager, config, logger);
    
    // Allow dependency injection for testing
    this.commandProcessor = options.commandProcessor || this.defaultCommandProcessor;
    this.queueManager = options.queueManager || null; // 队列管理器引用，用于删除命令
    
    // 新增：重复命令检测
    this.processedCommands = new Set();
    this.commandProcessingTimeout = 5 * 60 * 1000; // 5分钟后清理已处理命令记录
    
    // Validate configuration
    this.config.validate();
    
    // 定期清理已处理命令记录
    setInterval(() => {
      this.cleanupProcessedCommands();
    }, this.commandProcessingTimeout);
  }

  async defaultCommandProcessor(command) {
    const { processCommand } = await import('../controllers/commandController.js');
    await processCommand(command);
  }

  // Ensure connection is available
  async ensureConnection() {
    if (this.status.isShuttingDown) {
      return false;
    }

    this.status.lastConnectionAttempt = new Date();

    if (!this.connectionManager.getClient() || !this.status.isConnected) {
      const initialized = await this.connectionManager.initialize();
      if (initialized) {
        this.status.markSuccess();
        this.status.connectionCreatedAt = new Date();
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, this.config.connectionRetryDelay));
      return false;
    }

    const connectionValid = await this.connectionManager.testConnection();
    if (connectionValid) {
      if (this.status.isDegraded) {
        this.logger.log('[SupabaseService] Connection recovered from degraded mode!');
      }
      this.status.markSuccess();
      return true;
    }

    this.status.markFailure();

    if (this.status.consecutiveFailures >= 3) {
      this.logger.warn(
        `[SupabaseService] ${this.status.consecutiveFailures} consecutive failures, resetting client...`
      );
      this.connectionManager.client = null;
      this.connectionManager.connectionAttempts = 0;
    }

    return false;
  }

  // Update command status with retry mechanism
  async updateCommandStatus(commandId, status, errorMessage = null, retryCount = 3, retryDelay = 1000) {
    if (!await this.ensureConnection()) {
      this.logger.error('[SupabaseService] Failed to ensure connection for command status update');
      return { data: null, error: new Error('Failed to establish connection') };
    }

    let lastError = null;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const updatePayload = { status: status, last_error: errorMessage };
        const client = this.connectionManager.getClient();

        const { data, error } = await client
          .from('commands')
          .update(updatePayload)
          .eq('id', commandId)
          .select();

        if (error) {
          this.logger.error(
            `[SupabaseService] Error updating command ${commandId} (attempt ${attempt}/${retryCount}):`,
            error
          );
          lastError = error;

          if (attempt < retryCount) {
            await this.ensureConnection();
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        } else {
          if (status === 'completed' || status === 'error') {
            this.logger.log(`[SupabaseService] Command ${commandId} status updated to '${status}'`);
          }
          return { data, error: null };
        }
      } catch (e) {
        this.logger.error(
          `[SupabaseService] Unexpected error updating command ${commandId} (attempt ${attempt}/${retryCount}):`,
          e
        );
        lastError = e;

        if (attempt < retryCount) {
          await this.ensureConnection();
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    this.logger.error(
      `[SupabaseService] All ${retryCount} attempts to update command ${commandId} failed`
    );
    return { data: null, error: lastError };
  }

  // Handle new command
  async handleNewCommand(payload) {
    const newCommand = payload.new;
    this.logger.log('[SupabaseService] New command received:', newCommand.id);

    if (!newCommand || !newCommand.id || !newCommand.command_text) {
      this.logger.error('[SupabaseService] Invalid command data received');
      return;
    }

    // 检查是否已经处理过这个命令
    if (this.processedCommands.has(newCommand.id)) {
      this.logger.warn(`[SupabaseService] Command ${newCommand.id} already processed, skipping duplicate`);
      return;
    }

    // 标记命令为正在处理
    this.processedCommands.add(newCommand.id);

    try {
      await this.commandProcessor(newCommand);
    } catch (error) {
      this.logger.error(`[SupabaseService] Error processing command ${newCommand.id}:`, error.message);

      try {
        await this.updateCommandStatus(newCommand.id, 'error', `Service error: ${error.message}`);
      } catch (updateError) {
        this.logger.error(
          `[SupabaseService] Failed to update error status for command ${newCommand.id}:`,
          updateError.message
        );
      }
    }
  }

  // Subscribe to result for specific command
  async subscribeToResultForCommand(commandId, callback) {
    if (!await this.ensureConnection()) {
      this.logger.error('[SupabaseService] Failed to ensure connection for result subscription');
      return null;
    }

    try {
      const channelName = `result_for_command_${commandId}`.replace(/-/g, '_');
      const client = this.connectionManager.getClient();
      
      const subscription = client
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'results', filter: `command_id=eq.${commandId}` },
          callback
        )
        .subscribe(async (status, err) => {
          if (status === 'SUBSCRIBED') {
            this.logger.log(`[SupabaseService] Subscribed to results for command ${commandId}`);
          } else if (err) {
            this.logger.error(`[SupabaseService] Error subscribing to results for command ${commandId}:`, err);
          }
        });
      
      return subscription;
    } catch (e) {
      this.logger.error(`[SupabaseService] Exception subscribing to results for command ${commandId}:`, e);
      return null;
    }
  }

  // Clear result subscription
  async clearResultSubscription(subscription) {
    if (subscription && this.connectionManager.getClient()) {
      try {
        await this.connectionManager.getClient().removeChannel(subscription);
      } catch (error) {
        this.logger.error("[SupabaseService] Error unsubscribing/removing channel:", error);
      }
    }
  }

  // Subscribe to commands
  async subscribeToCommands() {
    return await this.subscriptionManager.subscribe(
      (payload) => this.handleNewCommand(payload)
    );
  }

  // Subscribe to command deletions
  async subscribeToCommandDeletions() {
    if (!await this.ensureConnection()) {
      this.logger.error('[SupabaseService] Failed to ensure connection for command deletion subscription');
      return null;
    }

    try {
      const client = this.connectionManager.getClient();
      
      const subscription = client
        .channel('command-deletions-channel')
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'commands'
        }, (payload) => {
          this.handleCommandDeletion(payload);
        })
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            this.logger.log('[SupabaseService] Successfully subscribed to command deletions');
          } else if (err) {
            this.logger.error('[SupabaseService] Error subscribing to command deletions:', err);
          }
        });
      
      return subscription;
    } catch (error) {
      this.logger.error('[SupabaseService] Exception subscribing to command deletions:', error);
      return null;
    }
  }

  // Handle command deletion
  async handleCommandDeletion(payload) {
    const deletedCommand = payload.old;
    if (!deletedCommand || !deletedCommand.id) {
      this.logger.warn('[SupabaseService] Invalid command deletion payload received');
      return;
    }

    this.logger.log(`[SupabaseService] Command deleted: ${deletedCommand.id}`);

    // 从已处理命令集合中移除
    if (this.processedCommands.has(deletedCommand.id)) {
      this.processedCommands.delete(deletedCommand.id);
      this.logger.log(`[SupabaseService] Removed deleted command ${deletedCommand.id} from processed commands set`);
    }

    // 从队列中移除（如果存在）
    try {
      // 优先使用注入的队列管理器
      let queueManager = this.queueManager;
      
      // 如果没有注入的队列管理器，尝试获取全局实例
      if (!queueManager) {
        const { getQueueManager } = await import('./queueManager.js');
        queueManager = getQueueManager();
      }
      
      if (queueManager && queueManager.hasCommand && queueManager.removeCommand) {
        if (queueManager.hasCommand(deletedCommand.id)) {
          const removed = queueManager.removeCommand(deletedCommand.id);
          if (removed) {
            this.logger.log(`[SupabaseService] Removed deleted command ${deletedCommand.id} from processing queue`);
          }
        } else {
          this.logger.log(`[SupabaseService] Command ${deletedCommand.id} was not in the processing queue`);
        }
      } else {
        this.logger.warn('[SupabaseService] Queue manager not available for command removal');
      }
    } catch (error) {
      this.logger.error(`[SupabaseService] Error removing deleted command from queue:`, error);
    }
  }

  // Initialize the service
  async initialize() {
    this.logger.log('[SupabaseService] Starting service initialization...');

    try {
      const connected = await this.ensureConnection();
      if (!connected) {
        this.logger.error('[SupabaseService] Failed to establish initial connection');
      }

      await this.subscribeToCommands();
      
      // 订阅命令删除事件
      await this.subscribeToCommandDeletions();
      
      // 启动健康检查定时器
      this.startHealthCheck();
      
      this.logger.log('[SupabaseService] Service initialization completed');
      
      return connected;
    } catch (error) {
      this.logger.error('[SupabaseService] Error during service initialization:', error);
      return false;
    }
  }

  // 启动健康检查
  startHealthCheck() {
    // 清理现有的定时器
    if (this.connectionManager.timers.healthCheckTimer) {
      clearInterval(this.connectionManager.timers.healthCheckTimer);
    }

    this.connectionManager.timers.healthCheckTimer = setInterval(async () => {
      try {
        const isHealthy = await this.connectionManager.testConnection();
        if (!isHealthy) {
          this.logger.warn('[SupabaseService] Health check failed, attempting recovery...');
          this.status.markFailure();
          
          // 如果连续失败多次，强制刷新连接
          if (this.status.consecutiveFailures >= 3) {
            this.logger.warn('[SupabaseService] Multiple health check failures, refreshing connection...');
            
            // 先清理现有订阅，避免重复订阅
            await this.subscriptionManager.cleanupSubscription();
            
            // 刷新连接
            await this.connectionManager.refresh();
            
            // 重新订阅（只有在之前有订阅回调时才重新订阅）
            if (this.subscriptionManager.lastSuccessfulSubscription) {
              this.logger.log('[SupabaseService] Reestablishing subscription after connection refresh...');
              await this.subscribeToCommands();
            }
          }
        } else if (this.status.consecutiveFailures > 0) {
          this.logger.log('[SupabaseService] Health check recovered');
          this.status.markSuccess();
        }
      } catch (error) {
        this.logger.error('[SupabaseService] Health check error:', error.message);
        this.status.markFailure();
      }
    }, this.config.healthCheckInterval);
  }

  // Graceful shutdown
  async shutdown() {
    this.logger.log('[SupabaseService] Starting graceful shutdown...');
    this.status.isShuttingDown = true;

    this.subscriptionManager.cleanup();
    this.connectionManager.cleanup();

    this.logger.log('[SupabaseService] Graceful shutdown completed');
  }

  // Get service status
  getStatus() {
    return {
      ...this.status,
      hasClient: !!this.connectionManager.getClient(),
      connectionAttempts: this.connectionManager.connectionAttempts
    };
  }

  // Get client for direct access (use sparingly)
  getClient() {
    return this.connectionManager.getClient();
  }

  // 新增：清理已处理命令记录
  cleanupProcessedCommands() {
    const oldSize = this.processedCommands.size;
    // 简单的清理策略：定期清空所有记录
    // 在生产环境中，可以考虑更复杂的基于时间戳的清理策略
    this.processedCommands.clear();
    if (oldSize > 0) {
      this.logger.log(`[SupabaseService] Cleaned up ${oldSize} processed command records`);
    }
  }
}

// Create and export default instance only in non-test environments
let defaultService = null;

if (process.env.NODE_ENV !== 'test' && process.env.JEST_WORKER_ID === undefined) {
  const defaultConfig = new SupabaseConfig();
  defaultService = new SupabaseService(defaultConfig);

  // Auto-initialize the default service
  defaultService.initialize().catch(error => {
    console.error('[SupabaseService] Failed to auto-initialize:', error);
  });

  // Handle graceful shutdown for default instance
  const gracefulShutdown = () => {
    defaultService.shutdown().then(() => {
      process.exit(0);
    });
  };

  // Register process handlers
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

// Export named functions for backward compatibility
export const ensureSupabaseConnection = () => {
  if (!defaultService) {
    throw new Error('SupabaseService not available in test environment');
  }
  return defaultService.ensureConnection();
};

export const updateCommandStatus = (...args) => {
  if (!defaultService) {
    throw new Error('SupabaseService not available in test environment');
  }
  return defaultService.updateCommandStatus(...args);
};

export const subscribeToResultForCommand = (...args) => {
  if (!defaultService) {
    throw new Error('SupabaseService not available in test environment');
  }
  return defaultService.subscribeToResultForCommand(...args);
};

export const clearResultSubscription = (...args) => {
  if (!defaultService) {
    throw new Error('SupabaseService not available in test environment');
  }
  return defaultService.clearResultSubscription(...args);
};

// Export default client for backward compatibility
export default defaultService?.getClient() || null;

// Export the service instance and classes for testing
export { defaultService as supabaseService };
