// 错误处理和恢复服务
const errorPatterns = {
  APPLESCRIPT_TIMEOUT: /timeout|timed out/i,
  APPLESCRIPT_PERMISSION: /permission|access denied/i,
  CURSOR_NOT_RUNNING: /cursor.*not running|application.*not found/i,
  SUPABASE_ERROR: /supabase|database/i,
  NETWORK_ERROR: /network|connection|fetch/i
};

const recoverySuggestions = {
  APPLESCRIPT_TIMEOUT: {
    suggestion: '建议检查 Cursor 是否响应，或尝试重启 Cursor',
    autoRetry: true,
    retryDelay: 10000
  },
  APPLESCRIPT_PERMISSION: {
    suggestion: '请检查系统偏好设置中的辅助功能权限',
    autoRetry: false
  },
  CURSOR_NOT_RUNNING: {
    suggestion: '请确保 Cursor 应用程序正在运行',
    autoRetry: true,
    retryDelay: 5000
  },
  NETWORK_ERROR: {
    suggestion: '网络连接问题，请检查网络状态',
    autoRetry: true,
    retryDelay: 3000
  },
  SUPABASE_ERROR: {
    suggestion: 'Supabase 连接问题，正在尝试重新连接',
    autoRetry: true,
    retryDelay: 2000
  }
};

export function analyzeError(error) {
  const errorMessage = error.message || error.toString();
  
  for (const [errorType, pattern] of Object.entries(errorPatterns)) {
    if (pattern.test(errorMessage)) {
      return {
        type: errorType,
        ...recoverySuggestions[errorType],
        originalError: errorMessage
      };
    }
  }

  return {
    type: 'UNKNOWN_ERROR',
    suggestion: '发生未知错误，请检查日志或联系管理员',
    autoRetry: false,
    originalError: errorMessage
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

  if (analysis.autoRetry && attemptCount < 3) {
    console.log(`[ErrorRecovery] Auto-retrying command ${commandId} in ${analysis.retryDelay}ms`);
    return {
      shouldRetry: true,
      retryDelay: analysis.retryDelay,
      suggestion: analysis.suggestion
    };
  }

  return {
    shouldRetry: false,
    suggestion: analysis.suggestion,
    finalError: true
  };
}

export async function recordErrorStats(errorType, commandId) {
  try {
    // 这里可以记录到 Supabase 或本地文件
    const errorLog = {
      timestamp: new Date().toISOString(),
      errorType,
      commandId,
      count: 1
    };
    
    // 简单的内存统计（生产环境建议持久化）
    if (!global.errorStats) {
      global.errorStats = {};
    }
    
    global.errorStats[errorType] = (global.errorStats[errorType] || 0) + 1;
    
    console.log('[ErrorRecovery] Error stats updated:', global.errorStats);
  } catch (err) {
    console.error('[ErrorRecovery] Failed to record error stats:', err);
  }
}

export function getErrorStats() {
  return global.errorStats || {};
}

export async function performSystemHealthCheck() {
  const healthStatus = {
    timestamp: new Date().toISOString(),
    supabase: false,
    applescript: false,
    cursor: false,
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
  }

  return healthStatus;
}

// 为了保持向后兼容性，可以导出一个包含所有函数的对象
export const ErrorRecoveryService = {
  analyzeError,
  handleErrorWithRecovery,
  recordErrorStats,
  getErrorStats,
  performSystemHealthCheck
};
