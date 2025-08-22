/**
 * Realtime Manager Service - JSG-Frontend Architecture
 * 
 * Handles all real-time subscription logic for command updates and completion detection.
 * Extracted from monolithic app.js as part of Phase 1.2 refactoring.
 * 
 * Key Responsibilities:
 * - Command status subscriptions with retry logic
 * - Completion detection and callback handling
 * - Subscription cleanup and error recovery
 * - Special handling for CLEAR_ALL_QUEUES commands (fixes completion detection bug)
 */

export class RealtimeManagerService {
    constructor(supabaseClient) {
        this.client = supabaseClient;
        this.activeSubscriptions = new Map();
        this.completionCallbacks = new Map();
        
        console.log('[RealtimeManagerService] Service initialized');
    }

    /**
     * Subscribe to command status updates with robust retry and fallback mechanisms
     * @param {string} commandId - Database UUID of the command
     * @param {string} originalCommandText - Original command text for context
     * @param {HTMLElement} loadingMessage - Loading UI element reference
     * @param {Function} onCompletion - Callback when command completes
     */
    subscribeToCommand(commandId, originalCommandText, loadingMessage = null, onCompletion = null) {
        const channelName = `command-${commandId}`;
        
        // Store completion callback
        if (onCompletion) {
            this.completionCallbacks.set(commandId, onCompletion);
        }
        
        // Clean up existing subscription for this command
        this._cleanupSubscription(channelName);
        
        console.log(`[RealtimeManager] Subscribing to command ${commandId} updates`);
        
        let channel = null;
        let subscriptionTimeout = null;
        let fallbackInterval = null;
        let retryAttempts = 0;
        let isCompleted = false;
        const maxRetryAttempts = 3;
        
        // Create subscription with retry logic
        const createSubscription = () => {
            if (channel) {
                try {
                    this.client.removeChannel(channel);
                } catch (e) {
                    console.warn(`[RealtimeManager] Warning cleaning up old channel for ${commandId}:`, e);
                }
            }

            channel = this.client.channel(channelName);
            this.activeSubscriptions.set(channelName, channel);
            
            return channel
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'commands',
                    filter: `id=eq.${commandId}`
                }, async (payload) => {
                    console.log(`[RealtimeManager] Command ${commandId} status update:`, payload);
                    
                    const updatedCommand = payload.new;
                    
                    // Clear fallback mechanisms when we receive real-time update
                    if (subscriptionTimeout) {
                        clearTimeout(subscriptionTimeout);
                        subscriptionTimeout = null;
                    }
                    if (fallbackInterval) {
                        clearInterval(fallbackInterval);
                        fallbackInterval = null;
                    }

                    if (updatedCommand.status === 'completed' || updatedCommand.status === 'error') {
                        isCompleted = true;
                        await this._handleCommandCompletion(commandId, originalCommandText, loadingMessage);
                        this._cleanupSubscription(channelName);
                    }
                })
                .subscribe((status, err) => {
                    if (status === 'SUBSCRIBED') {
                        console.log(`[RealtimeManager] Successfully subscribed to command ${commandId} updates (attempt ${retryAttempts + 1})`);
                        retryAttempts = 0;
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                        console.error(`[RealtimeManager] Command ${commandId} subscription ${status}:`, err?.message || 'No error details');
                        
                        this.activeSubscriptions.delete(channelName);
                        
                        // Immediate fallback check
                        this._performImmediateFallback(commandId, originalCommandText, loadingMessage);
                        
                        // Setup retry if attempts remaining
                        if (retryAttempts < maxRetryAttempts) {
                            retryAttempts++;
                            console.log(`[RealtimeManager] Attempting to resubscribe to command ${commandId} (attempt ${retryAttempts}/${maxRetryAttempts})`);
                            
                            setTimeout(() => {
                                if (!isCompleted) {
                                    this._performFallbackCheck(commandId, originalCommandText, loadingMessage, channel, channelName);
                                    
                                    setTimeout(() => {
                                        if (!isCompleted && retryAttempts <= maxRetryAttempts) {
                                            createSubscription();
                                        }
                                    }, 1000);
                                }
                            }, 2000);
                        }
                    }
                });
        };

        // Start subscription
        createSubscription();

        // Safety timeout fallback
        subscriptionTimeout = setTimeout(() => {
            if (!isCompleted) {
                console.log(`[RealtimeManager] Subscription timeout for command ${commandId}, starting fallback polling`);
                this._performFallbackCheck(commandId, originalCommandText, loadingMessage, channel, channelName);
            }
        }, 8000);
    }

    /**
     * Handle command completion with special cases
     * @private
     */
    async _handleCommandCompletion(commandId, originalCommandText, loadingMessage) {
        console.log(`[RealtimeManager] Handling completion for command ${commandId}`);
        
        // Special handling for CLEAR_ALL_QUEUES commands - THIS FIXES THE BUG!
        if (originalCommandText === 'CLEAR_ALL_QUEUES') {
            console.log(`[RealtimeManager] CLEAR_ALL_QUEUES command ${commandId} completed, resetting button`);
            
            // Reset the Clear Queues button
            const clearButton = document.getElementById('clearQueuesButton');
            if (clearButton) {
                clearButton.disabled = false;
                clearButton.innerHTML = `
                    <span class="icon">🗑️</span>
                    <span class="text">Clear Queues</span>
                `;
                console.log('[RealtimeManager] Clear Queues button successfully reset');
            }

            // Execute completion callback if provided
            const callback = this.completionCallbacks.get(commandId);
            if (callback) {
                try {
                    callback(commandId, 'completed');
                } catch (callbackError) {
                    console.error(`[RealtimeManager] Completion callback error:`, callbackError);
                }
            }

            // Remove loading message and cleanup
            if (loadingMessage && loadingMessage.parentNode) {
                loadingMessage.remove();
            }

            this.completionCallbacks.delete(commandId);
            return;
        }

        // Regular command completion handling
        try {
            const { data: resultData, error: resultError } = await this.client
                .from('results')
                .select('*')
                .eq('command_id', commandId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (resultError) {
                console.error(`[RealtimeManager] Error fetching result for command ${commandId}:`, resultError);
                return;
            }

            if (resultData && resultData.length > 0) {
                const result = resultData[0];
                
                // Execute completion callback
                const callback = this.completionCallbacks.get(commandId);
                if (callback) {
                    try {
                        callback(commandId, result.is_error ? 'error' : 'completed', result);
                    } catch (callbackError) {
                        console.error(`[RealtimeManager] Completion callback error:`, callbackError);
                    }
                }

                // Update UI (this would eventually move to UI service)
                this._updateCommandUI(commandId, result, loadingMessage);
            }

            this.completionCallbacks.delete(commandId);

        } catch (error) {
            console.error(`[RealtimeManager] Error in completion handler:`, error);
        }
    }

    /**
     * Update command UI with results (temporary - will move to UI service later)
     * @private
     */
    _updateCommandUI(commandId, result, loadingMessage) {
        // This logic will eventually move to a dedicated UI service
        // For now, keeping minimal UI updates here to maintain functionality
        
        if (loadingMessage && loadingMessage.parentNode) {
            const resultElement = document.createElement('div');
            resultElement.className = `message-container ${result.is_error ? 'error' : 'success'}`;
            
            if (result.is_error) {
                resultElement.innerHTML = `
                    <div class="message-content">
                        <p>指令执行出错: ${result.error_message || '未知错误'}</p>
                    </div>
                `;
            } else if (result.result_text) {
                resultElement.innerHTML = `
                    <div class="message-content">
                        ${this._formatResultText(result.result_text)}
                    </div>
                `;
            }

            loadingMessage.replaceWith(resultElement);
            
            // Scroll to bottom
            if (typeof scrollChatToBottom === 'function') {
                scrollChatToBottom();
            }
        }
    }

    /**
     * Format result text for display
     * @private
     */
    _formatResultText(text) {
        // Basic formatting - will be enhanced in UI service
        return text.split('\n').map(line => `<p>${line}</p>`).join('');
    }

    /**
     * Perform immediate fallback check on subscription failure
     * @private
     */
    async _performImmediateFallback(commandId, originalCommandText, loadingMessage) {
        try {
            const { data: commandData, error } = await this.client
                .from('commands')
                .select('status')
                .eq('id', commandId)
                .single();

            if (!error && commandData && (commandData.status === 'completed' || commandData.status === 'error')) {
                console.log(`[RealtimeManager] Immediate fallback found completed command ${commandId}`);
                await this._handleCommandCompletion(commandId, originalCommandText, loadingMessage);
            }
        } catch (immediateError) {
            console.warn(`[RealtimeManager] Immediate fallback error:`, immediateError);
        }
    }

    /**
     * Perform periodic fallback status checks
     * @private
     */
    async _performFallbackCheck(commandId, originalCommandText, loadingMessage, channel, channelName) {
        const fallbackInterval = setInterval(async () => {
            try {
                const { data: commandData, error } = await this.client
                    .from('commands')
                    .select('status')
                    .eq('id', commandId)
                    .single();

                if (!error && commandData && (commandData.status === 'completed' || commandData.status === 'error')) {
                    console.log(`[RealtimeManager] Fallback check found completed command ${commandId}`);
                    
                    clearInterval(fallbackInterval);
                    
                    // Cleanup subscription
                    if (this.activeSubscriptions.has(channelName)) {
                        this.client.removeChannel(channel);
                        this.activeSubscriptions.delete(channelName);
                    }
                    
                    await this._handleCommandCompletion(commandId, originalCommandText, loadingMessage);
                }
            } catch (fallbackError) {
                console.warn(`[RealtimeManager] Fallback check error:`, fallbackError);
            }
        }, 5000);

        // Clear fallback after timeout
        setTimeout(() => {
            clearInterval(fallbackInterval);
        }, 120000); // 2 minutes max
    }

    /**
     * Clean up subscription for a specific channel
     * @private
     */
    _cleanupSubscription(channelName) {
        if (this.activeSubscriptions.has(channelName)) {
            const oldChannel = this.activeSubscriptions.get(channelName);
            try {
                this.client.removeChannel(oldChannel);
            } catch (e) {
                console.warn(`[RealtimeManager] Warning cleaning up channel ${channelName}:`, e);
            }
            this.activeSubscriptions.delete(channelName);
        }
    }

    /**
     * Clean up subscription for a specific command ID
     */
    cleanupCommand(commandId) {
        const channelName = `command-${commandId}`;
        this._cleanupSubscription(channelName);
        this.completionCallbacks.delete(commandId);
        console.log(`[RealtimeManager] Cleaned up command ${commandId} subscription`);
    }

    /**
     * Clean up all active subscriptions
     */
    cleanupAll() {
        console.log(`[RealtimeManager] Cleaning up ${this.activeSubscriptions.size} active subscriptions`);
        
        for (const [channelName, channel] of this.activeSubscriptions) {
            try {
                this.client.removeChannel(channel);
            } catch (error) {
                console.warn(`[RealtimeManager] Error removing channel ${channelName}:`, error);
            }
        }
        
        this.activeSubscriptions.clear();
        this.completionCallbacks.clear();
        console.log('[RealtimeManager] All subscriptions cleaned up');
    }

    /**
     * Get current subscription status
     */
    getSubscriptionStatus() {
        return {
            activeSubscriptions: this.activeSubscriptions.size,
            pendingCallbacks: this.completionCallbacks.size,
            subscriptionChannels: Array.from(this.activeSubscriptions.keys())
        };
    }
}
