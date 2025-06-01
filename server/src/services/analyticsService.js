/**
 * 命令统计和分析服务
 * 重构为测试友好的版本，支持依赖注入
 */
export class AnalyticsService {
  constructor(supabaseService = null, logger = console) {
    this.supabaseService = supabaseService;
    this.logger = logger;
    this.isInitialized = false;
  }

  /**
   * 初始化服务，设置 Supabase 连接
   */
  async initialize(supabaseService = null) {
    if (supabaseService) {
      this.supabaseService = supabaseService;
    }
    
    // 如果没有提供 supabaseService，在非测试环境中动态加载
    if (!this.supabaseService && process.env.NODE_ENV !== 'test') {
      try {
        const supabaseModule = await import('./supabaseService.js');
        this.supabaseService = {
          ensureConnection: supabaseModule.ensureSupabaseConnection,
          getClient: () => supabaseModule.default
        };
      } catch (error) {
        this.logger.error('[AnalyticsService] Failed to load Supabase service:', error);
        return false;
      }
    }
    
    this.isInitialized = true;
    return true;
  }

  /**
   * 检查服务是否可用
   */
  async isServiceAvailable() {
    if (!this.isInitialized || !this.supabaseService) {
      return false;
    }

    try {
      return await this.supabaseService.ensureConnection();
    } catch (error) {
      this.logger.warn('[AnalyticsService] Supabase connection check failed:', error);
      return false;
    }
  }

  /**
   * 记录命令开始
   */
  async recordCommandStart(commandId, commandText) {
    if (!await this.isServiceAvailable()) {
      this.logger.warn('[AnalyticsService] Service not available for start recording');
      return { success: false, reason: 'service_unavailable' };
    }

    try {
      const supabase = this.supabaseService.getClient();
      
      // 基础指标对象
      const basicMetrics = {
        command_id: commandId,
        command_length: commandText ? commandText.length : 0,
        success: false, // 初始状态
        created_at: new Date().toISOString()
      };

      // 尝试插入完整信息
      const result = await this.attemptInsert(supabase, basicMetrics, commandText);
      
      if (result.success) {
        this.logger.log(`[AnalyticsService] Command start recorded for ${commandId}`);
      }
      
      return result;
    } catch (error) {
      this.logger.error('[AnalyticsService] Error recording command start:', error);
      return { success: false, reason: 'unexpected_error', error };
    }
  }

  /**
   * 记录命令结束
   */
  async recordCommandEnd(commandId, success, duration, errorMessage = null) {
    if (!await this.isServiceAvailable()) {
      this.logger.warn('[AnalyticsService] Service not available for end recording');
      return { success: false, reason: 'service_unavailable' };
    }

    try {
      const supabase = this.supabaseService.getClient();
      
      // 尝试更新完整信息
      const result = await this.attemptUpdate(supabase, commandId, {
        success,
        duration,
        errorMessage
      });
      
      if (result.success) {
        this.logger.log(`[AnalyticsService] Command end recorded for ${commandId}`);
      }
      
      return result;
    } catch (error) {
      this.logger.error('[AnalyticsService] Error recording command end:', error);
      return { success: false, reason: 'unexpected_error', error };
    }
  }

  /**
   * 记录命令完整指标（一次性记录）
   */
  async recordCommandMetrics(commandId, commandText, duration, success) {
    if (!await this.isServiceAvailable()) {
      this.logger.warn('[AnalyticsService] Service not available for metrics recording');
      return { success: false, reason: 'service_unavailable' };
    }

    try {
      const supabase = this.supabaseService.getClient();
      const metrics = {
        command_id: commandId,
        command_length: commandText ? commandText.length : 0,
        processing_duration: duration,
        success: success,
        created_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('command_metrics')
        .insert(metrics);

      if (error) {
        this.logger.error('[AnalyticsService] Failed to record command metrics:', error);
        return { success: false, reason: 'database_error', error };
      }

      this.logger.log(`[AnalyticsService] Command metrics recorded for ${commandId}`);
      return { success: true };
    } catch (error) {
      this.logger.error('[AnalyticsService] Error recording metrics:', error);
      return { success: false, reason: 'unexpected_error', error };
    }
  }

  /**
   * 获取命令统计信息
   */
  async getCommandStats(hoursBack = 24) {
    if (!await this.isServiceAvailable()) {
      this.logger.warn('[AnalyticsService] Service not available for stats retrieval');
      return null;
    }

    try {
      const supabase = this.supabaseService.getClient();
      const timeThreshold = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('command_metrics')
        .select(`
          success,
          processing_duration,
          created_at
        `)
        .gte('created_at', timeThreshold);

      if (error) {
        this.logger.error('[AnalyticsService] Failed to fetch command stats:', error);
        return null;
      }

      return this.calculateStats(data);
    } catch (error) {
      this.logger.error('[AnalyticsService] Error fetching stats:', error);
      return null;
    }
  }

  /**
   * 尝试插入记录（使用现有表结构字段）
   */
  async attemptInsert(supabase, basicMetrics, commandText) {
    try {
      // 只使用表中实际存在的字段
      const metricsToInsert = {
        command_id: basicMetrics.command_id,
        command_length: commandText ? commandText.length : 0,
        processing_duration: null, // 开始时还不知道处理时间
        success: null, // 开始时还不知道结果
        created_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('command_metrics')
        .insert(metricsToInsert);

      if (!error) {
        return { success: true, method: 'standard' };
      }

      return { success: false, reason: 'database_error', error };
    } catch (error) {
      return { success: false, reason: 'unexpected_error', error };
    }
  }

  /**
   * 尝试更新记录（使用现有表结构字段）
   */
  async attemptUpdate(supabase, commandId, { success, duration, errorMessage }) {
    try {
      // 只使用表中实际存在的字段
      const updateData = {
        success: success,
        processing_duration: duration
      };

      const { error } = await supabase
        .from('command_metrics')
        .update(updateData)
        .eq('command_id', commandId);

      if (!error) {
        return { success: true, method: 'standard' };
      }

      return { success: false, reason: 'database_error', error };
    } catch (error) {
      return { success: false, reason: 'unexpected_error', error };
    }
  }

  /**
   * 计算统计信息
   */
  calculateStats(data) {
    if (!data || data.length === 0) {
      return {
        total: 0,
        successful: 0,
        successRate: 0,
        avgDuration: 0,
        totalDuration: 0
      };
    }

    const successful = data.filter(d => d.success).length;
    const totalDuration = data.reduce((sum, d) => sum + (d.processing_duration || 0), 0);
    
    return {
      total: data.length,
      successful,
      successRate: (successful / data.length) * 100,
      avgDuration: totalDuration / data.length,
      totalDuration
    };
  }
}

// 创建默认实例（在非测试环境中自动初始化）
let defaultService = null;

export const getAnalyticsService = async () => {
  // 在测试环境中不创建默认服务
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
    throw new Error('getAnalyticsService should not be called in test environment');
  }
  
  if (!defaultService) {
    defaultService = new AnalyticsService();
    await defaultService.initialize();
  }
  return defaultService;
};

// 便利的导出函数（向后兼容）
export const recordCommandStart = async (...args) => {
  const service = await getAnalyticsService();
  return service.recordCommandStart(...args);
};

export const recordCommandEnd = async (...args) => {
  const service = await getAnalyticsService();
  return service.recordCommandEnd(...args);
};

export const recordCommandMetrics = async (...args) => {
  const service = await getAnalyticsService();
  return service.recordCommandMetrics(...args);
};

export const getCommandStats = async (...args) => {
  const service = await getAnalyticsService();
  return service.getCommandStats(...args);
};
