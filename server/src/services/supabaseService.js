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
    this.connectionRetryDelay = options.connectionRetryDelay || 5000; // 增加到5秒
    this.connectionResetInterval = options.connectionResetInterval || 5 * 60 * 1000; // 5分钟
    this.connectionRefreshInterval = options.connectionRefreshInterval || 60 * 60 * 1000; // 1小时
    this.healthCheckInterval = options.healthCheckInterval || 2 * 60 * 1000; // 2分钟
    this.maxSubscriptionRetries = options.maxSubscriptionRetries || 15; // 增加重试次数
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
    this.currentSubscription = null;
    this.retryAttempts = 0;
    this.lastRetryTime = null;
    this.isSubscribing = false;
    this.subscriptionCallback = null;
    this.retryTimer = null;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = null;
    this.minRetryDelay = 5000;  // 最小重试延迟 5 秒
    this.maxRetryDelay = 300000; // 最大重试延迟 5 分钟
  }

  async subscribe(onNewCommand, retryCount = 5, retryDelay = 15000) {
    // 防止重复订阅
    if (this.isSubscribing) {
      this.logger.warn('[SubscriptionManager] Already in subscribing process, skipping...');
      return null;
    }

    this.isSubscribing = true;
    this.subscriptionCallback = onNewCommand;

    // 清除任何现有的重试定时器
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    this.retryAttempts++;

    if (this.retryAttempts > this.config.maxSubscriptionRetries) {
      this.logger.error(
        `[SubscriptionManager] Max retry attempts (${this.config.maxSubscriptionRetries}) reached, entering backoff mode`
      );
      this.isSubscribing = false;
      
      // 进入长时间退避模式
      this.scheduleRetryWithBackoff(onNewCommand);
      return null;
    }

    this.logger.log(
      `[SubscriptionManager] Attempting to subscribe (attempt ${this.retryAttempts}/${this.config.maxSubscriptionRetries})...`
    );

    const client = this.connectionManager.getClient();
    if (!client) {
      this.logger.error('[SubscriptionManager] No client available for subscription');
      this.isSubscribing = false;
      this.scheduleRetry(onNewCommand, retryDelay);
      return null;
    }

    try {
      // 确保完全清理之前的订阅
      await this.cleanupSubscription();

      this.currentSubscription = client
        .channel(`public_commands_changes_${Date.now()}`) // 使用唯一的频道名
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'commands', filter: 'status=eq.pending' },
          (payload) => {
            try {
              this.logger.log('[SubscriptionManager] New command inserted:', payload.new.id);
              onNewCommand(payload);
            } catch (error) {
              this.logger.error('[SubscriptionManager] Error handling new command:', error);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'commands', filter: 'status=eq.pending' },
          (payload) => {
            try {
              if (payload.old.status !== 'pending' && payload.new.status === 'pending') {
                this.logger.log('[SubscriptionManager] Command status updated to pending:', payload.new.id);
                onNewCommand(payload);
              }
            } catch (error) {
              this.logger.error('[SubscriptionManager] Error handling updated command:', error);
            }
          }
        )
        .subscribe(async (status, err) => {
          await this.handleSubscriptionStatus(status, err, onNewCommand, retryDelay);
        });

      this.isSubscribing = false;
      return this.currentSubscription;
    } catch (error) {
      this.logger.error('[SubscriptionManager] Exception while setting up subscription:', error);
      this.currentSubscription = null;
      this.isSubscribing = false;
      this.scheduleRetry(onNewCommand, retryDelay);
      return null;
    }
  }

  // 清理订阅的专用方法
  async cleanupSubscription() {
    if (this.currentSubscription) {
      try {
        const client = this.connectionManager.getClient();
        if (client) {
          await client.removeChannel(this.currentSubscription);
          // 等待一小段时间确保清理完成
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        this.logger.warn('[SubscriptionManager] Error cleaning up previous subscription:', error.message);
      }
      this.currentSubscription = null;
    }
  }

  // 智能重试调度
  scheduleRetry(onNewCommand, baseDelay) {
    // 计算退避延迟
    const backoffMultiplier = Math.min(this.consecutiveFailures, 10); // 最多10倍退避
    const jitter = Math.random() * 1000; // 添加随机抖动
    const delay = Math.min(
      Math.max(baseDelay * Math.pow(1.5, backoffMultiplier) + jitter, this.minRetryDelay),
      this.maxRetryDelay
    );

    this.logger.log(`[SubscriptionManager] Scheduling retry in ${Math.round(delay / 1000)}s...`);
    
    this.retryTimer = setTimeout(() => {
      this.subscribe(onNewCommand);
    }, delay);
  }

  // 长时间退避重试
  scheduleRetryWithBackoff(onNewCommand) {
    const backoffDelay = this.maxRetryDelay; // 5分钟
    this.logger.log(`[SubscriptionManager] Entering backoff mode, retry in ${Math.round(backoffDelay / 60000)} minutes...`);
    
    this.retryTimer = setTimeout(() => {
      // 重置重试计数器，重新开始
      this.retryAttempts = 0;
      this.consecutiveFailures = Math.max(0, this.consecutiveFailures - 1); // 减少失败计数
      this.subscribe(onNewCommand);
    }, backoffDelay);
  }

  async handleSubscriptionStatus(status, err, onNewCommand, retryDelay) {
    if (status === 'SUBSCRIBED') {
      this.logger.log('[SubscriptionManager] Successfully subscribed to commands!');
      this.retryAttempts = 0;
      this.consecutiveFailures = 0;
      this.lastSuccessTime = new Date();
    } else if (['TIMED_OUT', 'CHANNEL_ERROR', 'CLOSED'].includes(status)) {
      this.consecutiveFailures++;
      this.logger.error(`[SubscriptionManager] Subscription ${status}. Will attempt to reconnect...`);
      
      // 重要：等待一段时间再重连，避免立即重试
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.handleSubscriptionError(status, err, onNewCommand, retryDelay);
    } else {
      this.logger.warn(`[SubscriptionManager] Subscription status changed to ${status}`);
      if (status !== 'SUBSCRIBING') { // SUBSCRIBING 状态是正常的，不需要重连
        await this.handleSubscriptionError(status, err, onNewCommand, retryDelay);
      }
    }
  }

  async handleSubscriptionError(status, error, onNewCommand, retryDelay) {
    // 清理当前订阅
    await this.cleanupSubscription();
    
    // 如果连续失败次数过多，强制刷新连接
    if (this.consecutiveFailures >= 3) {
      this.logger.warn('[SubscriptionManager] Too many consecutive failures, refreshing connection...');
      try {
        await this.connectionManager.refresh();
        // 重置失败计数，给新连接一个机会
        this.consecutiveFailures = Math.max(0, this.consecutiveFailures - 2);
      } catch (refreshError) {
        this.logger.error('[SubscriptionManager] Failed to refresh connection:', refreshError.message);
      }
    }
    
    // 使用智能重试策略
    this.scheduleRetry(onNewCommand, retryDelay);
  }

  cleanup() {
    // 清除重试定时器
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    
    this.isSubscribing = false;
    
    // 清理订阅
    if (this.currentSubscription && this.connectionManager.getClient()) {
      try {
        this.connectionManager.getClient().removeChannel(this.currentSubscription);
      } catch (error) {
        this.logger.warn('[SubscriptionManager] Error cleaning up subscription:', error.message);
      }
    }
    this.currentSubscription = null;
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
    
    // Validate configuration
    this.config.validate();
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

  // Initialize the service
  async initialize() {
    this.logger.log('[SupabaseService] Starting service initialization...');

    try {
      const connected = await this.ensureConnection();
      if (!connected) {
        this.logger.error('[SupabaseService] Failed to establish initial connection');
      }

      await this.subscribeToCommands();
      
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
          
          // 如果连续失败多次，强制刷新连接
          if (this.status.consecutiveFailures >= 3) {
            this.logger.warn('[SupabaseService] Multiple health check failures, refreshing connection...');
            await this.connectionManager.refresh();
            
            // 重新订阅
            if (this.subscriptionManager.subscriptionCallback) {
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
}

// Create and export default instance
const defaultConfig = new SupabaseConfig();
const defaultService = new SupabaseService(defaultConfig);

// Auto-initialize the default service only in non-test environments
if (process.env.NODE_ENV !== 'test' && process.env.JEST_WORKER_ID === undefined) {
  defaultService.initialize().catch(error => {
    console.error('[SupabaseService] Failed to auto-initialize:', error);
  });
}

// Handle graceful shutdown for default instance
const gracefulShutdown = () => {
  defaultService.shutdown().then(() => {
    process.exit(0);
  });
};

// Only register process handlers in non-test environments
if (process.env.NODE_ENV !== 'test' && process.env.JEST_WORKER_ID === undefined) {
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

// Export named functions for backward compatibility
export const ensureSupabaseConnection = () => defaultService.ensureConnection();
export const updateCommandStatus = (...args) => defaultService.updateCommandStatus(...args);
export const subscribeToResultForCommand = (...args) => defaultService.subscribeToResultForCommand(...args);
export const clearResultSubscription = (...args) => defaultService.clearResultSubscription(...args);

// Export default client for backward compatibility
export default defaultService.getClient();

// Export the service instance and classes for testing
export { defaultService as supabaseService };
