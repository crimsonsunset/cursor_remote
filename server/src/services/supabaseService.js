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

// Ensure Supabase is initialized on module load
initializeSupabase();

// NEW: Function to update command status
export const updateCommandStatus = async (commandId, status, errorMessage = null) => {
  if (!supabase) {
    console.error('[SupabaseService] Supabase client not initialized. Cannot update command status.');
    return { data: null, error: new Error('Supabase client not initialized.') };
  }
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
      console.error(`[SupabaseService] Error updating command ${commandId} to '${status}':`, error);
    } else {
      console.log(`[SupabaseService] Command ${commandId} status successfully updated to '${status}'. Data:`, data);
    }
    if ((!data || data.length === 0) && !error) {
      console.warn(`[SupabaseService] Command ${commandId} not found or no change when trying to update status to '${status}', but no explicit error from Supabase.`);
    }
    return { data, error };
  } catch (e) {
    console.error(`[SupabaseService] Unexpected error in updateCommandStatus for command ${commandId}:`, e);
    return { data: null, error: e };
  }
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
    // 处理命令
    await processCommand(nextCommand);
    console.log(`[SupabaseService] Command ${nextCommand.id} processing completed.`);
  } catch (error) {
    console.error(`[SupabaseService] Error processing command ${nextCommand.id}:`, error);
    // 尝试将命令标记为错误
    await updateCommandStatus(nextCommand.id, 'error', `处理失败: ${error.message}`);
  } finally {
    // 无论成功还是失败，继续处理下一个命令
    processNextCommand();
  }
};

// NEW: Function to subscribe to results for a specific command_id
export const subscribeToResultForCommand = (commandId, callback) => {
  if (!supabase) {
    console.error('[SupabaseService] Supabase client not initialized. Cannot subscribe to results.');
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
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[SupabaseService] Successfully subscribed to results for command ${commandId} on channel ${channelName}.`);
        } else if (err) {
          console.error(`[SupabaseService] Error subscribing to results for command ${commandId} on channel ${channelName}:`, err);
        } else {
          console.log(`[SupabaseService] Result subscription status for command ${commandId} on channel ${channelName}: ${status}`);
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

// Main subscription to new commands
const subscribeToCommands = () => {
  if (!initializeSupabase()) { // Ensure client is initialized before subscribing
    console.error('[SupabaseService] Supabase client not initialized. Cannot subscribe to commands.');
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
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('[SupabaseService] Successfully subscribed to new commands!');
      } else if (status === 'TIMED_OUT') {
        console.error('[SupabaseService] Subscription to commands timed out.');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[SupabaseService] Subscription to commands failed due to a channel error:', err);
      } else if (err) {
        console.error('[SupabaseService] Error subscribing to commands:', err);
      }
    });

  return commandsSubscription;
};

// Start the main command subscription when the service is loaded
subscribeToCommands();

export default supabase; // Exporting the client itself might be useful for direct use elsewhere if needed but primarily controller uses exported functions.