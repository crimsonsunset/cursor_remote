import { ensureSupabaseConnection, supabase } from './supabaseService.js';

// 命令统计和分析服务
export class AnalyticsService {
  static async recordCommandMetrics(commandId, commandText, duration, success) {
    try {
      if (!await ensureSupabaseConnection()) {
        console.warn('[AnalyticsService] Supabase connection not available for metrics recording');
        return;
      }

      const { error } = await supabase
        .from('command_metrics')
        .insert({
          command_id: commandId,
          command_length: commandText.length,
          processing_duration: duration,
          success: success,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('[AnalyticsService] Failed to record command metrics:', error);
      }
    } catch (err) {
      console.error('[AnalyticsService] Error recording metrics:', err);
    }
  }

  static async getCommandStats() {
    try {
      if (!await ensureSupabaseConnection()) {
        return null;
      }

      const { data, error } = await supabase
        .from('command_metrics')
        .select(`
          success,
          processing_duration,
          created_at
        `)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // 最近24小时

      if (error) {
        console.error('[AnalyticsService] Failed to fetch command stats:', error);
        return null;
      }

      return {
        total: data.length,
        successful: data.filter(d => d.success).length,
        avgDuration: data.reduce((sum, d) => sum + d.processing_duration, 0) / data.length || 0
      };
    } catch (err) {
      console.error('[AnalyticsService] Error fetching stats:', err);
      return null;
    }
  }
}
