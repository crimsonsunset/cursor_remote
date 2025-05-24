import { ensureSupabaseConnection } from './supabaseService.js';

// 动态获取supabase客户端
const getSupabaseClient = async () => {
  const supabaseModule = await import('./supabaseService.js');
  return supabaseModule.default;
};

// 命令统计和分析服务
export class AnalyticsService {
  constructor() {
    // 初始化任何必要的状态
  }

  async recordCommandStart(commandId, commandText) {
    try {
      if (!await ensureSupabaseConnection()) {
        console.warn('[AnalyticsService] Supabase connection not available for start recording');
        return;
      }

      const supabase = await getSupabaseClient();
      
      // 临时解决方案：只记录基本信息，避免使用可能不存在的列
      const basicMetrics = {
        command_id: commandId,
        command_length: commandText ? commandText.length : 0,
        success: false, // 暂时设为false，稍后会更新
        created_at: new Date().toISOString()
      };

      // 尝试插入扩展信息，如果失败则使用基本信息
      try {
        const { error: extendedError } = await supabase
          .from('command_metrics')
          .insert({
            ...basicMetrics,
            command_text: commandText,
            start_time: new Date().toISOString()
          });

        if (extendedError) {
          // 如果扩展字段插入失败，尝试只插入基本字段
          const { error: basicError } = await supabase
            .from('command_metrics')
            .insert(basicMetrics);
          
          if (basicError) {
            console.error('[AnalyticsService] Failed to record command start (both extended and basic):', basicError);
          } else {
            console.log('[AnalyticsService] Recorded command start with basic metrics only');
          }
        }
      } catch (insertError) {
        console.error('[AnalyticsService] Error during command start recording:', insertError);
      }
    } catch (err) {
      console.error('[AnalyticsService] Error recording command start:', err);
    }
  }

  async recordCommandEnd(commandId, success, duration, errorMessage = null) {
    try {
      if (!await ensureSupabaseConnection()) {
        console.warn('[AnalyticsService] Supabase connection not available for end recording');
        return;
      }

      const supabase = await getSupabaseClient();
      
      // 尝试更新扩展字段，如果失败则更新基本字段
      try {
        const { error: extendedError } = await supabase
          .from('command_metrics')
          .update({
            end_time: new Date().toISOString(),
            success: success,
            processing_duration: duration,
            error_message: errorMessage
          })
          .eq('command_id', commandId);

        if (extendedError) {
          // 如果扩展字段更新失败，尝试只更新基本字段
          const { error: basicError } = await supabase
            .from('command_metrics')
            .update({
              success: success,
              processing_duration: duration
            })
            .eq('command_id', commandId);
          
          if (basicError) {
            console.error('[AnalyticsService] Failed to record command end (both extended and basic):', basicError);
          } else {
            console.log('[AnalyticsService] Recorded command end with basic metrics only');
          }
        }
      } catch (updateError) {
        console.error('[AnalyticsService] Error during command end recording:', updateError);
      }
    } catch (err) {
      console.error('[AnalyticsService] Error recording command end:', err);
    }
  }

  async recordCommandMetrics(commandId, commandText, duration, success) {
    try {
      if (!await ensureSupabaseConnection()) {
        console.warn('[AnalyticsService] Supabase connection not available for metrics recording');
        return;
      }

      const supabase = await getSupabaseClient();
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

  async getCommandStats() {
    try {
      if (!await ensureSupabaseConnection()) {
        return null;
      }

      const supabase = await getSupabaseClient();
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
