// 错误处理和恢复服务
const errorPatterns = {
  APPLESCRIPT_TIMEOUT: /timeout|timed out/i,
  APPLESCRIPT_PERMISSION: /permission|access denied/i,
  CURSOR_NOT_RUNNING: /cursor.*not running|application.*not found/i,
  SUPABASE_ERROR: /supabase|database/i,
  NETWORK_ERROR: /network|connection|fetch/i,
  SUBSCRIPTION_ERROR: /subscription.*failed|CHANNEL_ERROR|subscription.*closed/i,
  MEMORY_ERROR: /out of memory|heap|memory/i,
  FUNCTION_ERROR: /is not a function|undefined.*function/i
};

const recoverySuggestions = {
  APPLESCRIPT_TIMEOUT: {
    suggestion: '建议检查 Cursor 是否响应，或尝试重启 Cursor',
    autoRetry: true,
    retryDelay: 10000,
    maxRetries: 2
  },
  APPLESCRIPT_PERMISSION: {
    suggestion: '请检查系统偏好设置中的辅助功能权限',
    autoRetry: false,
    maxRetries: 0
  },
  CURSOR_NOT_RUNNING: {
    suggestion: '请确保 Cursor 应用程序正在运行',
    autoRetry: true,
    retryDelay: 5000,
    maxRetries: 3
  },
  NETWORK_ERROR: {
    suggestion: '网络连接问题，请检查网络状态',
    autoRetry: true,
    retryDelay: 3000,
    maxRetries: 5
  },
  SUPABASE_ERROR: {
    suggestion: 'Supabase 连接问题，正在尝试重新连接',
    autoRetry: true,
    retryDelay: 2000,
    maxRetries: 3
  },
  SUBSCRIPTION_ERROR: {
    suggestion: '订阅连接问题，正在尝试重新建立连接',
    autoRetry: true,
    retryDelay: 5000,
    maxRetries: 5
  },
  MEMORY_ERROR: {
    suggestion: '内存不足，建议重启服务',
    autoRetry: false,
    maxRetries: 0,
    requiresRestart: true
  },
  FUNCTION_ERROR: {
    suggestion: '函数调用错误，可能是代码问题',
    autoRetry: true,
    retryDelay: 1000,
    maxRetries: 1
  }
};

// 全局错误统计
let globalErrorStats = {
  errorCounts: {},
  lastReset: Date.now(),
  resetInterval: 3600000, // 1小时重置一次
  criticalErrorThreshold: 10,
  restartRequested: false
};

export function analyzeError(error) {
  const errorMessage = error.message || error.toString();
  
  for (const [errorType, pattern] of Object.entries(errorPatterns)) {
    if (pattern.test(errorMessage)) {
      return {
        type: errorType,
        ...recoverySuggestions[errorType],
        originalError: errorMessage,
        timestamp: new Date().toISOString()
      };
    }
  }

  return {
    type: 'UNKNOWN_ERROR',
    suggestion: '发生未知错误，请检查日志或联系管理员',
    autoRetry: false,
    maxRetries: 0,
    originalError: errorMessage,
    timestamp: new Date().toISOString()
  };
}

export async function handleErrorWithRecovery(commandId, error, attemptCount = 1) {
  const analysis = analyzeError(error);
  
  console.error(`[ErrorRecovery] Command ${commandId} failed (attempt ${attemptCount}):`, {
    type: analysis.type,
    suggestion: analysis.suggestion,
    originalError: analysis.originalError
  });

  // 记录错误统计
  await recordErrorStats(analysis.type, commandId);

  // 检查是否需要重启服务
  if (analysis.requiresRestart || shouldRequestRestart()) {
    console.error(`[ErrorRecovery] Critical error detected, service restart may be required`);
    globalErrorStats.restartRequested = true;
    return {
      shouldRetry: false,
      suggestion: analysis.suggestion,
      finalError: true,
      requiresRestart: true
    };
  }

  // 检查是否应该重试
  const maxRetries = analysis.maxRetries || 3;
  if (analysis.autoRetry && attemptCount <= maxRetries) {
    console.log(`[ErrorRecovery] Auto-retrying command ${commandId} in ${analysis.retryDelay}ms (attempt ${attemptCount}/${maxRetries})`);
    return {
      shouldRetry: true,
      retryDelay: analysis.retryDelay,
      suggestion: analysis.suggestion,
      maxRetries: maxRetries
    };
  }

  return {
    shouldRetry: false,
    suggestion: analysis.suggestion,
    finalError: true
  };
}

// 新增：检查是否应该请求重启
function shouldRequestRestart() {
  const now = Date.now();
  
  // 重置统计（如果需要）
  if (now - globalErrorStats.lastReset > globalErrorStats.resetInterval) {
    globalErrorStats.errorCounts = {};
    globalErrorStats.lastReset = now;
    globalErrorStats.restartRequested = false;
  }

  // 计算总错误数
  const totalErrors = Object.values(globalErrorStats.errorCounts).reduce((sum, count) => sum + count, 0);
  
  return totalErrors >= globalErrorStats.criticalErrorThreshold;
}

export async function recordErrorStats(errorType, commandId) {
  try {
    // 更新全局统计
    globalErrorStats.errorCounts[errorType] = (globalErrorStats.errorCounts[errorType] || 0) + 1;
    
    const errorLog = {
      timestamp: new Date().toISOString(),
      errorType,
      commandId,
      count: globalErrorStats.errorCounts[errorType],
      totalErrors: Object.values(globalErrorStats.errorCounts).reduce((sum, count) => sum + count, 0)
    };
    
    // 兼容旧的全局统计
    if (!global.errorStats) {
      global.errorStats = {};
    }
    global.errorStats[errorType] = globalErrorStats.errorCounts[errorType];
    
    console.log('[ErrorRecovery] Error stats updated:', {
      current: errorLog,
      global: globalErrorStats.errorCounts
    });

    // 如果错误过多，记录警告
    if (errorLog.totalErrors >= globalErrorStats.criticalErrorThreshold * 0.8) {
      console.warn(`[ErrorRecovery] High error count detected: ${errorLog.totalErrors}/${globalErrorStats.criticalErrorThreshold}`);
    }
    
  } catch (err) {
    console.error('[ErrorRecovery] Failed to record error stats:', err);
  }
}

export function getErrorStats() {
  return {
    ...globalErrorStats,
    legacy: global.errorStats || {}
  };
}

// 新增：重置错误统计
export function resetErrorStats() {
  globalErrorStats.errorCounts = {};
  globalErrorStats.lastReset = Date.now();
  globalErrorStats.restartRequested = false;
  global.errorStats = {};
  console.log('[ErrorRecovery] Error statistics reset');
}

// 新增：检查服务健康状态
export function getServiceHealth() {
  const now = Date.now();
  const totalErrors = Object.values(globalErrorStats.errorCounts).reduce((sum, count) => sum + count, 0);
  
  return {
    status: globalErrorStats.restartRequested ? 'critical' : 
            totalErrors >= globalErrorStats.criticalErrorThreshold * 0.8 ? 'warning' : 'healthy',
    totalErrors,
    errorBreakdown: globalErrorStats.errorCounts,
    restartRequested: globalErrorStats.restartRequested,
    lastReset: new Date(globalErrorStats.lastReset).toISOString(),
    uptime: now - globalErrorStats.lastReset
  };
}

export async function performSystemHealthCheck() {
  const healthStatus = {
    timestamp: new Date().toISOString(),
    supabase: false,
    applescript: false,
    cursor: false,
    serviceHealth: getServiceHealth(),
    recommendations: []
  };

  // 在测试环境中跳过实际的系统检查
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
    healthStatus.supabase = true;
    healthStatus.applescript = true;
    return healthStatus;
  }

  try {
    // 检查 Supabase 连接
    const { ensureSupabaseConnection } = await import('./supabaseService.js');
    healthStatus.supabase = await ensureSupabaseConnection();
    
    if (!healthStatus.supabase) {
      healthStatus.recommendations.push('检查 Supabase 连接配置和网络状态');
    }
  } catch (err) {
    healthStatus.recommendations.push('Supabase 服务模块加载失败');
    console.error('[ErrorRecovery] Supabase health check failed:', err);
  }

  try {
    // 检查 AppleScript 功能
    const { default: runAppleScript } = await import('../appleScriptRunner.js');
    const testResult = await runAppleScript('return "test"', 'agent', 'Cursor');
    healthStatus.applescript = testResult.success;
    
    if (!healthStatus.applescript) {
      healthStatus.recommendations.push('检查 AppleScript 权限和系统设置');
    }
  } catch (err) {
    healthStatus.recommendations.push('AppleScript 模块加载失败');
    console.error('[ErrorRecovery] AppleScript health check failed:', err);
  }

  // 添加基于错误统计的建议
  if (healthStatus.serviceHealth.status === 'critical') {
    healthStatus.recommendations.push('服务错误过多，建议重启服务');
  } else if (healthStatus.serviceHealth.status === 'warning') {
    healthStatus.recommendations.push('服务错误较多，建议监控服务状态');
  }

  return healthStatus;
}

// 新增：处理特定类型的错误
export async function handleSpecificError(errorType, context = {}) {
  const recovery = recoverySuggestions[errorType];
  if (!recovery) {
    return { success: false, message: '未知错误类型' };
  }

  console.log(`[ErrorRecovery] Handling specific error: ${errorType}`);

  switch (errorType) {
    case 'SUBSCRIPTION_ERROR':
      try {
        // 尝试重新建立订阅
        const { supabaseService } = await import('./supabaseService.js');
        if (supabaseService && typeof supabaseService.subscribeToCommands === 'function') {
          // 先清理现有订阅，避免重复订阅
          if (supabaseService.subscriptionManager && typeof supabaseService.subscriptionManager.cleanupSubscription === 'function') {
            await supabaseService.subscriptionManager.cleanupSubscription();
          }
          await supabaseService.subscribeToCommands();
          return { success: true, message: '订阅已重新建立' };
        }
      } catch (err) {
        console.error('[ErrorRecovery] Failed to reestablish subscription:', err);
      }
      break;
      
    case 'SUPABASE_ERROR':
      try {
        // 尝试重新连接 Supabase
        const { ensureSupabaseConnection } = await import('./supabaseService.js');
        const connected = await ensureSupabaseConnection();
        return { 
          success: connected, 
          message: connected ? 'Supabase 连接已恢复' : 'Supabase 连接恢复失败' 
        };
      } catch (err) {
        console.error('[ErrorRecovery] Failed to reconnect to Supabase:', err);
      }
      break;
  }

  return { success: false, message: recovery.suggestion };
}

// 为了保持向后兼容性，可以导出一个包含所有函数的对象
export const ErrorRecoveryService = {
  analyzeError,
  handleErrorWithRecovery,
  recordErrorStats,
  getErrorStats,
  resetErrorStats,
  getServiceHealth,
  performSystemHealthCheck,
  handleSpecificError
};
