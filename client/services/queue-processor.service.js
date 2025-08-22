/**
 * Queue Processor Service - JSG-Frontend Architecture
 * 
 * Handles client-side command queue management, persistence, and recovery logic.
 * Extracted from monolithic app.js as part of Phase 1.3 refactoring.
 * 
 * Key Responsibilities:
 * - Command queue persistence in localStorage
 * - Recovery of pending commands on page load/refresh
 * - Command timeout handling and cleanup
 * - Queue state management and monitoring
 */

export class QueueProcessorService {
    constructor(supabaseClient, realtimeManagerService) {
        this.client = supabaseClient;
        this.realtimeManager = realtimeManagerService;
        
        // Configuration
        this.config = {
            storageKey: 'pendingCommandsClientSide',
            timeoutDuration: 600000, // 10 minutes
            maxRetries: 3,
            retryDelay: 1000
        };
        
        // State
        this.isProcessing = false;
        this.cleanupInterval = null;
        
        console.log('[QueueProcessorService] Service initialized');
    }

    /**
     * Add command to persistent queue
     * @param {object} command - Command object with id, text, timestamp
     */
    addCommand(command) {
        try {
            const pendingCommands = this._getPendingCommands();
            
            // Prevent duplicates
            if (pendingCommands.find(cmd => cmd.id === command.id)) {
                console.log(`[QueueProcessor] Command ${command.id} already in queue, skipping`);
                return;
            }
            
            pendingCommands.push({
                id: command.id,
                text: command.text,
                timestamp: command.timestamp || Date.now()
            });
            
            this._savePendingCommands(pendingCommands);
            console.log(`[QueueProcessor] Added command ${command.id} to queue: "${command.text}"`);
            
        } catch (error) {
            console.error('[QueueProcessor] Error adding command to queue:', error);
        }
    }

    /**
     * Remove command from persistent queue
     * @param {string} commandId - Command ID to remove
     */
    removeCommand(commandId) {
        try {
            const pendingCommands = this._getPendingCommands();
            const filteredCommands = pendingCommands.filter(cmd => cmd.id !== commandId);
            
            if (filteredCommands.length !== pendingCommands.length) {
                this._savePendingCommands(filteredCommands);
                console.log(`[QueueProcessor] Removed command ${commandId} from queue`);
            }
            
        } catch (error) {
            console.error(`[QueueProcessor] Error removing command ${commandId}:`, error);
        }
    }

    /**
     * Get all pending commands
     * @returns {Array} Array of pending command objects
     */
    getPendingCommands() {
        return this._getPendingCommands();
    }

    /**
     * Clear all pending commands
     */
    clearAll() {
        try {
            localStorage.removeItem(this.config.storageKey);
            console.log('[QueueProcessor] Cleared all pending commands');
        } catch (error) {
            console.error('[QueueProcessor] Error clearing pending commands:', error);
        }
    }

    /**
     * Process pending commands on page load/refresh - main recovery logic
     */
    async processPendingCommandsOnLoad() {
        if (this.isProcessing) {
            console.log('[QueueProcessor] Already processing pending commands, skipping duplicate call');
            return;
        }

        const pendingCommands = this._getPendingCommands();
        if (pendingCommands.length === 0) {
            console.log('[QueueProcessor] No pending commands to process');
            return;
        }

        this.isProcessing = true;
        console.log(`[QueueProcessor] 🔄 Found ${pendingCommands.length} pending commands, starting recovery...`);

        for (const command of pendingCommands) {
            if (!command.id || !command.text) {
                console.warn('[QueueProcessor] Invalid command structure, skipping:', command);
                continue;
            }

            try {
                await this._processIndividualCommand(command);
            } catch (error) {
                console.error(`[QueueProcessor] Error processing command ${command.id}:`, error);
                this.removeCommand(command.id);
            }
        }

        console.log('[QueueProcessor] ✅ Pending command recovery completed');
        this.isProcessing = false;
    }

    /**
     * Start periodic cleanup task for timed-out commands
     */
    startCleanupTask() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        this.cleanupInterval = setInterval(() => {
            this._cleanupTimedOutCommands();
        }, 60000); // Check every minute

        console.log('[QueueProcessor] Started cleanup task for timed-out commands');
    }

    /**
     * Stop cleanup task
     */
    stopCleanupTask() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log('[QueueProcessor] Stopped cleanup task');
        }
    }

    /**
     * Get queue statistics
     * @returns {object} Queue statistics
     */
    getQueueStats() {
        const pendingCommands = this._getPendingCommands();
        const now = Date.now();
        
        let activeCommands = 0;
        let timedOutCommands = 0;
        
        pendingCommands.forEach(cmd => {
            if (now - cmd.timestamp > this.config.timeoutDuration) {
                timedOutCommands++;
            } else {
                activeCommands++;
            }
        });

        return {
            total: pendingCommands.length,
            active: activeCommands,
            timedOut: timedOutCommands,
            oldestTimestamp: pendingCommands.length > 0 ? Math.min(...pendingCommands.map(c => c.timestamp)) : null
        };
    }

    /**
     * Private: Get pending commands from localStorage
     * @private
     */
    _getPendingCommands() {
        try {
            return JSON.parse(localStorage.getItem(this.config.storageKey)) || [];
        } catch (error) {
            console.error('[QueueProcessor] Error parsing pending commands from localStorage:', error);
            return [];
        }
    }

    /**
     * Private: Save pending commands to localStorage
     * @private
     */
    _savePendingCommands(commands) {
        try {
            localStorage.setItem(this.config.storageKey, JSON.stringify(commands));
        } catch (error) {
            console.error('[QueueProcessor] Error saving pending commands to localStorage:', error);
        }
    }

    /**
     * Private: Process individual command during recovery
     * @private
     */
    async _processIndividualCommand(command) {
        let commandData = null;
        let cmdError = null;

        // Retry logic for fetching command status
        for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
            try {
                const response = await this.client
                    .from('commands')
                    .select('status, last_error, created_at')
                    .eq('id', command.id)
                    .single();

                commandData = response.data;
                cmdError = response.error;

                if (!cmdError) {
                    break; // Success, exit retry loop
                }

                if (attempt < this.config.maxRetries - 1) {
                    console.log(`[QueueProcessor] Retrying command status fetch for ${command.id} (attempt ${attempt + 1}/${this.config.maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * (attempt + 1)));
                }
            } catch (error) {
                cmdError = error;
            }
        }

        if (cmdError) {
            console.error(`[QueueProcessor] Failed to fetch status for command ${command.id}:`, cmdError.message);
            this.removeCommand(command.id);
            return;
        }

        if (!commandData) {
            console.log(`[QueueProcessor] Command ${command.id} not found in database, removing from queue`);
            this.removeCommand(command.id);
            return;
        }

        console.log(`[QueueProcessor] Command ${command.id} status: ${commandData.status}`);

        // Handle different command states
        switch (commandData.status) {
            case 'completed':
            case 'error':
                await this._handleCompletedCommand(command, commandData);
                break;
                
            case 'pending':
            case 'processing':
                await this._handleActiveCommand(command);
                break;
                
            default:
                console.log(`[QueueProcessor] Unknown status ${commandData.status} for command ${command.id}, removing`);
                this.removeCommand(command.id);
                break;
        }
    }

    /**
     * Private: Handle completed command during recovery
     * @private
     */
    async _handleCompletedCommand(command, commandData) {
        // Check if result already exists in message history
        const existingResult = this._checkExistingResult(command.id);
        
        if (existingResult) {
            console.log(`[QueueProcessor] Result for command ${command.id} already exists, skipping recovery`);
        } else {
            // Try to recover the result if command was completed but result not displayed
            console.log(`[QueueProcessor] Attempting to recover result for completed command ${command.id}`);
            // This would integrate with the existing handleCompletedCommand logic
            // For now, we'll add a placeholder to show the recovery attempt
            this._addRecoveryMessage(command, commandData.status);
        }
        
        this.removeCommand(command.id);
    }

    /**
     * Private: Handle active command during recovery
     * @private
     */
    async _handleActiveCommand(command) {
        console.log(`[QueueProcessor] Restoring subscription for active command ${command.id}: ${command.text}`);
        
        // Add loading animation to UI
        this._addLoadingMessage(command);
        
        // Restore subscription using realtime manager
        if (this.realtimeManager) {
            const loadingMessage = this._getLastLoadingMessage();
            this.realtimeManager.subscribeToCommand(command.id, command.text, loadingMessage);
            console.log(`[QueueProcessor] Restored subscription for command: ${command.text}`);
        }
    }

    /**
     * Private: Clean up timed-out commands
     * @private
     */
    _cleanupTimedOutCommands() {
        const pendingCommands = this._getPendingCommands();
        const now = Date.now();
        let cleanedCount = 0;

        const activeCommands = pendingCommands.filter(command => {
            if (now - command.timestamp > this.config.timeoutDuration) {
                console.log(`[QueueProcessor] Cleaning up timed-out command: ${command.text} (${Math.round((now - command.timestamp) / 60000)}min old)`);
                cleanedCount++;
                return false;
            }
            return true;
        });

        if (cleanedCount > 0) {
            this._savePendingCommands(activeCommands);
            console.log(`[QueueProcessor] Cleaned up ${cleanedCount} timed-out commands`);
        }
    }

    /**
     * Private: Check if result already exists in message history
     * @private
     */
    _checkExistingResult(commandId) {
        // This would integrate with the global message history
        // For now, return false to allow recovery attempts
        return false;
    }

    /**
     * Private: Add recovery message to UI
     * @private
     */
    _addRecoveryMessage(command, status) {
        // This would integrate with the global addMessageToHistory function
        // For now, just log the recovery attempt
        console.log(`[QueueProcessor] Would add recovery message for ${command.id} with status ${status}`);
    }

    /**
     * Private: Add loading message to UI
     * @private
     */
    _addLoadingMessage(command) {
        // This would integrate with the global UI elements
        // For now, just log the loading message addition
        console.log(`[QueueProcessor] Would add loading message for active command: ${command.text}`);
    }

    /**
     * Private: Get last loading message element
     * @private
     */
    _getLastLoadingMessage() {
        // This would return the actual DOM element
        // For now, return null as placeholder
        return null;
    }

    /**
     * Destroy service and cleanup resources
     */
    destroy() {
        this.stopCleanupTask();
        console.log('[QueueProcessorService] Service destroyed');
    }
}
