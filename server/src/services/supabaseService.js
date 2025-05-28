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
    this.connectionRetryDelay = options.connectionRetryDelay || 3000;
    this.connectionResetInterval = options.connectionResetInterval || 3 * 60 * 1000;
    this.connectionRefreshInterval = options.connectionRefreshInterval || 30 * 60 * 1000;
    this.healthCheckInterval = options.healthCheckInterval || 60 * 1000;
    this.maxSubscriptionRetries = options.maxSubscriptionRetries || 10;
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
        timeout: 30000,
        heartbeatIntervalMs: 15000,
        reconnectAfterMs: (tries) => Math.min(tries * 500, 10000),
        params: {
          eventsPerSecond: 10
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
  }

  async subscribe(onNewCommand, retryCount = 5, retryDelay = 15000) {
    this.retryAttempts++;

    if (this.retryAttempts > this.config.maxSubscriptionRetries) {
      this.logger.error(
        `[SubscriptionManager] Max retry attempts (${this.config.maxSubscriptionRetries}) reached`
      );
      return null;
    }

    this.logger.log(
      `[SubscriptionManager] Attempting to subscribe (attempt ${this.retryAttempts}/${this.config.maxSubscriptionRetries})...`
    );

    const client = this.connectionManager.getClient();
    if (!client) {
      this.logger.error('[SubscriptionManager] No client available for subscription');
      return null;
    }

    try {
      // Clean up previous subscription
      if (this.currentSubscription) {
        await client.removeChannel(this.currentSubscription);
      }

      this.currentSubscription = client
        .channel('public_commands_changes')
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

      return this.currentSubscription;
    } catch (error) {
      this.logger.error('[SubscriptionManager] Exception while setting up subscription:', error);
      this.currentSubscription = null;
      
      const nextRetryDelay = Math.min(retryDelay * (1.5 ** (this.retryAttempts - 1)), 60000);
      setTimeout(() => this.subscribe(onNewCommand, retryCount, nextRetryDelay), nextRetryDelay);
      return null;
    }
  }

  async handleSubscriptionStatus(status, err, onNewCommand, retryDelay) {
    if (status === 'SUBSCRIBED') {
      this.logger.log('[SubscriptionManager] Successfully subscribed to commands!');
      this.retryAttempts = 0;
    } else if (['TIMED_OUT', 'CHANNEL_ERROR', 'CLOSED'].includes(status)) {
      this.logger.error(`[SubscriptionManager] Subscription ${status}. Will attempt to reconnect...`);
      await this.handleSubscriptionError(status, err, onNewCommand, retryDelay);
    } else {
      this.logger.warn(`[SubscriptionManager] Subscription status changed to ${status}`);
      await this.handleSubscriptionError(status, err, onNewCommand, retryDelay);
    }
  }

  async handleSubscriptionError(status, error, onNewCommand, retryDelay) {
    this.currentSubscription = null;
    
    const nextRetryDelay = Math.min(retryDelay * (1.5 ** (this.retryAttempts - 1)), 60000);
    setTimeout(() => this.subscribe(onNewCommand, 3, nextRetryDelay), nextRetryDelay);
  }

  cleanup() {
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
      this.logger.log('[SupabaseService] Service initialization completed');
      
      return connected;
    } catch (error) {
      this.logger.error('[SupabaseService] Error during service initialization:', error);
      return false;
    }
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
