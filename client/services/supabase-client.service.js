/**
 * SupabaseClientService - Core Supabase client and connection management
 * 
 * Handles:
 * - Client initialization and configuration
 * - Connection testing and health checks
 * - Basic command submission to database
 * - Error handling and recovery
 */

export class SupabaseClientService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.config = {
            url: null,
            anonKey: null
        };
        this.connectionCallbacks = new Set();
        
        this.initialize();
    }
    
    /**
     * Initialize Supabase client with environment configuration
     */
    initialize() {
        // Load configuration from window object (set by env-config.js)
        if (typeof window.SUPABASE_URL === 'string' && window.SUPABASE_URL &&
            typeof window.SUPABASE_ANON_KEY === 'string' && window.SUPABASE_ANON_KEY &&
            typeof supabase !== 'undefined' && supabase.createClient) {
            
            this.config = {
                url: window.SUPABASE_URL,
                anonKey: window.SUPABASE_ANON_KEY
            };
            
            try {
                this.client = supabase.createClient(this.config.url, this.config.anonKey);
                console.log('[SupabaseClientService] Client initialized successfully');
            } catch (error) {
                console.error('[SupabaseClientService] Error initializing client with provided credentials:', error);
                this.client = null;
            }
        } else {
            console.error('[SupabaseClientService] Configuration not found or Supabase SDK not loaded');
        }
    }
    
    /**
     * Get the initialized Supabase client
     * @returns {object|null} Supabase client instance or null
     */
    getClient() {
        return this.client;
    }
    
    /**
     * Check if client is properly initialized
     * @returns {boolean} True if client is available
     */
    isInitialized() {
        return this.client !== null;
    }
    
    /**
     * Test basic Supabase connection
     * @returns {Promise<boolean>} True if connection successful
     */
    async testConnection() {
        if (!this.client) {
            console.error('[SupabaseClientService] Client not initialized');
            this.isConnected = false;
            this.notifyConnectionChange(false, 'Client not initialized');
            return false;
        }
        
        try {
            // Test basic connection with a lightweight query
            const { data: healthCheck, error: healthError } = await this.client
                .from('commands')
                .select('count', { count: 'exact', head: true });
                
            if (healthError) {
                console.error('[SupabaseClientService] Connection test failed:', healthError);
                this.isConnected = false;
                this.notifyConnectionChange(false, `Database connection failed: ${healthError.message}`);
                return false;
            }
            
            this.isConnected = true;
            this.notifyConnectionChange(true, 'Supabase connection normal');
            console.log('[SupabaseClientService] Connection test successful');
            return true;
            
        } catch (error) {
            console.error('[SupabaseClientService] Connection test exception:', error);
            this.isConnected = false;
            this.notifyConnectionChange(false, `Connection error: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Test connection including RPC functions
     * @returns {Promise<boolean>} True if full connection test successful
     */
    async testConnectionFull() {
        if (!await this.testConnection()) {
            return false;
        }
        
        try {
            // Test RPC functions
            const { data: rpcTest, error: rpcError } = await this.client
                .rpc('submit_command', { 
                    p_command_text: 'connection_test',
                    p_user_id: 'test_user'
                });
                
            if (rpcError) {
                console.error('[SupabaseClientService] RPC function test failed:', rpcError);
                this.isConnected = false;
                this.notifyConnectionChange(false, `RPC function error: ${rpcError.message}`);
                return false;
            }
            
            this.notifyConnectionChange(true, 'Supabase connection and RPC functions normal');
            console.log('[SupabaseClientService] Full connection test successful');
            return true;
            
        } catch (error) {
            console.error('[SupabaseClientService] RPC test exception:', error);
            this.isConnected = false;
            this.notifyConnectionChange(false, `RPC test error: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Submit command to Supabase commands table
     * @param {object} commandPayload - Command payload object
     * @returns {Promise<object|null>} Inserted command data or null
     */
    async submitCommand(commandPayload) {
        if (!this.client) {
            console.error('[SupabaseClientService] Client not initialized. Cannot submit command.');
            throw new Error('Supabase client not initialized');
        }
        
        try {
            const { data, error } = await this.client
                .from('commands')
                .insert([commandPayload])
                .select();
                
            if (error) {
                console.error('[SupabaseClientService] Error submitting command:', error);
                throw error;
            }
            
            if (data && data.length > 0) {
                const insertedCommand = data[0];
                console.log(`[SupabaseClientService] Command submitted successfully: ${insertedCommand.id}`);
                return insertedCommand;
            }
            
            return null;
            
        } catch (error) {
            console.error('[SupabaseClientService] Command submission exception:', error);
            throw error;
        }
    }
    
    /**
     * Fetch command results from results table
     * @param {string} commandId - Command ID to fetch results for
     * @returns {Promise<object|null>} Results data or null
     */
    async fetchResults(commandId) {
        if (!this.client) {
            throw new Error('Supabase client not initialized');
        }
        
        try {
            const { data: resultsData, error: resultsError } = await this.client
                .from('results')
                .select('result_text, error_message, is_error') 
                .eq('command_id', commandId);
                
            if (resultsError) {
                throw resultsError;
            }
            
            return resultsData;
            
        } catch (error) {
            console.error('[SupabaseClientService] Error fetching results:', error);
            throw error;
        }
    }
    
    /**
     * Execute RPC function
     * @param {string} functionName - RPC function name
     * @param {object} params - Function parameters
     * @returns {Promise<object>} RPC result
     */
    async executeRpc(functionName, params = {}) {
        if (!this.client) {
            throw new Error('Supabase client not initialized');
        }
        
        try {
            const { data, error } = await this.client.rpc(functionName, params);
            
            if (error) {
                throw error;
            }
            
            return data;
            
        } catch (error) {
            console.error(`[SupabaseClientService] RPC ${functionName} error:`, error);
            throw error;
        }
    }
    
    /**
     * Register callback for connection status changes
     * @param {function} callback - Callback function (isConnected, message)
     */
    onConnectionChange(callback) {
        this.connectionCallbacks.add(callback);
    }
    
    /**
     * Unregister connection status callback
     * @param {function} callback - Callback function to remove
     */
    offConnectionChange(callback) {
        this.connectionCallbacks.delete(callback);
    }
    
    /**
     * Notify all registered callbacks of connection status change
     * @param {boolean} isConnected - Connection status
     * @param {string} message - Status message
     */
    notifyConnectionChange(isConnected, message) {
        this.connectionCallbacks.forEach(callback => {
            try {
                callback(isConnected, message);
            } catch (error) {
                console.error('[SupabaseClientService] Error in connection callback:', error);
            }
        });
    }
    
    /**
     * Get current connection status
     * @returns {boolean} True if connected
     */
    getConnectionStatus() {
        return this.isConnected;
    }
    
    /**
     * Get configuration information
     * @returns {object} Configuration object
     */
    getConfig() {
        return { ...this.config };
    }
}

// Export singleton instance
export const supabaseClientService = new SupabaseClientService();
