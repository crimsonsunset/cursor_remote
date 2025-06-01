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
    this.subscription = null;
    this.retryCount = 0;
    this.isShuttingDown = false;
    this.retryTimer = null;
    this.lastSuccessfulSubscription = null;
    this.subscriptionHealthTimer = null;
    this.maxRetryAttempts = config.maxSubscriptionRetries || 15;
    
    // 新增：连接健康检查
    this.healthCheckInterval = 30000; // 30秒检查一次
    this.lastHeartbeat = null;
    this.missedHeartbeats = 0;
    this.maxMissedHeartbeats = 3;
  }

  // 新增：订阅健康检查
  startHealthCheck() {
    if (this.subscriptionHealthTimer) {
      clearInterval(this.subscriptionHealthTimer);
    }
    
    this.subscriptionHealthTimer = setInterval(() => {
      if (this.subscription && !this.isShuttingDown) {
        const now = Date.now();
        if (this.lastHeartbeat && (now - this.lastHeartbeat) > this.healthCheckInterval * 2) {
          this.missedHeartbeats++;
          this.logger.warn(`[SubscriptionManager] Missed heartbeat ${this.missedHeartbeats}/${this.maxMissedHeartbeats}`);
          
          if (this.missedHeartbeats >= this.maxMissedHeartbeats) {
            this.logger.error('[SubscriptionManager] Too many missed heartbeats, forcing reconnection');
            this.forceReconnect();
          }
        } else {
          this.missedHeartbeats = 0;
        }
      }
    }, this.healthCheckInterval);
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
          this.handleSubscriptionStatus(status, err, onNewCommand, retryDelay);
        })
        .subscribe((status, err) => {
          this.handleSubscriptionError(status, err, onNewCommand, retryDelay);
        });

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
    
    const backoffDelay = Math.min(1000 * Math.pow(2, this.retryCount), 300000); // 最大5分钟
    this.logger.log(`[SubscriptionManager] Scheduling retry with backoff in ${backoffDelay}ms`);
    
    this.retryTimer = setTimeout(() => {
      this.retryCount++;
      this.subscribe(onNewCommand, this.maxRetryAttempts, 15000);
    }, backoffDelay);
  }

  async handleSubscriptionStatus(status, err, onNewCommand, retryDelay) {
    this.logger.log(`[SubscriptionManager] Subscription status: ${status}`);
    
    if (status === 'SUBSCRIBED') {
      this.retryCount = 0;
      this.lastHeartbeat = Date.now();
      this.missedHeartbeats = 0;
      this.logger.log('[SubscriptionManager] Successfully subscribed to commands');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      this.logger.error(`[SubscriptionManager] Subscription error: ${status}`, err);
      if (!this.isShuttingDown) {
        // 延迟重连以避免频繁重试
        setTimeout(() => {
          this.scheduleRetryWithBackoff(onNewCommand);
        }, 5000);
      }
    } else if (status === 'CLOSED') {
      this.logger.warn('[SubscriptionManager] Subscription closed');
      if (!this.isShuttingDown) {
        this.scheduleRetryWithBackoff(onNewCommand);
      }
    }
  }

  async handleSubscriptionError(status, error, onNewCommand, retryDelay) {
    if (status === 'SUBSCRIBED') {
      this.retryCount = 0;
      this.lastHeartbeat = Date.now();
      this.logger.log('[SubscriptionManager] Subscription established successfully');
      return;
    }

    this.logger.error(`[SubscriptionManager] Subscription failed with status: ${status}`, error);
    
    if (!this.isShuttingDown && this.retryCount > 0) {
      this.logger.log(`[SubscriptionManager] Retrying subscription in ${retryDelay}ms`);
      this.scheduleRetry(onNewCommand, retryDelay);
    } else if (!this.isShuttingDown) {
      this.logger.error('[SubscriptionManager] All subscription attempts failed, using backoff strategy');
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
