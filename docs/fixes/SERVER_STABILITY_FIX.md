# 🚨 服务端稳定性紧急修复指南

**问题类型**：服务端连接稳定性  
**严重程度**：高 - 导致服务退出  
**修复时间**：预计3-5天  
**创建日期**：2025年5月25日

## 📋 问题描述

### 错误现象
```
[SupabaseService] Fetch error in Supabase client: TypeError: fetch failed
TypeError: Cannot read properties of null (reading 'channel')
```

### 错误根因
1. **网络连接不稳定**：TLS连接在建立过程中断开
2. **空指针引用**：连接失败后 `supabaseClient` 为 null，但代码仍尝试调用 `.channel()`
3. **缺乏重连机制**：服务异常退出后需要手动重启
4. **错误处理不完善**：未实现优雅降级

## 🔧 立即修复方案

### 1. 连接状态验证 (第一优先级)

**文件**：`server/src/services/supabaseService.js`

```javascript
// 在 subscribeToCommands 函数中添加空值检查
async function subscribeToCommands() {
  try {
    // 确保连接可用
    if (!await ensureSupabaseConnection()) {
      console.error('[SupabaseService] Cannot subscribe: connection unavailable');
      scheduleReconnect();
      return;
    }

    // 再次验证客户端不为空
    if (!supabaseClient) {
      console.error('[SupabaseService] Supabase client is null, cannot subscribe');
      scheduleReconnect();
      return;
    }

    console.log('[SupabaseService] Starting command subscription...');
    
    const subscription = supabaseClient
      .channel('public_commands_insert')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'commands',
        filter: 'status=eq.pending'
      }, handleNewCommand)
      .subscribe((status) => {
        console.log(`[SupabaseService] Subscription status: ${status}`);
        if (status === 'SUBSCRIBED') {
          console.log('[SupabaseService] Successfully subscribed to new commands!');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`[SupabaseService] Subscription failed: ${status}`);
          scheduleReconnect();
        }
      });

  } catch (error) {
    console.error('[SupabaseService] Error in subscribeToCommands:', error);
    scheduleReconnect();
  }
}
```

### 2. 智能重连机制

```javascript
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000; // 1秒

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[SupabaseService] Max reconnection attempts reached, entering maintenance mode');
    enterMaintenanceMode();
    return;
  }

  const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 30000); // 最大30秒
  reconnectAttempts++;

  console.log(`[SupabaseService] Scheduling reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
  
  setTimeout(async () => {
    try {
      console.log(`[SupabaseService] Reconnection attempt ${reconnectAttempts}...`);
      
      // 重置客户端
      await initializeSupabaseClient();
      
      if (await ensureSupabaseConnection()) {
        console.log('[SupabaseService] Reconnection successful, resubscribing...');
        reconnectAttempts = 0; // 重置计数器
        await subscribeToCommands();
      } else {
        console.log('[SupabaseService] Reconnection failed, will retry...');
        scheduleReconnect();
      }
    } catch (error) {
      console.error('[SupabaseService] Reconnection error:', error);
      scheduleReconnect();
    }
  }, delay);
}
```

### 3. 连接健康检查

```javascript
let healthCheckInterval;

function startHealthCheck() {
  // 每30秒检查一次连接健康度
  healthCheckInterval = setInterval(async () => {
    try {
      if (!supabaseClient) {
        console.warn('[HealthCheck] Supabase client is null');
        scheduleReconnect();
        return;
      }

      // 执行轻量级查询测试连接
      const { error } = await supabaseClient
        .from('commands')
        .select('count', { count: 'exact', head: true });

      if (error) {
        console.warn('[HealthCheck] Connection test failed:', error.message);
        scheduleReconnect();
      } else {
        console.log('[HealthCheck] Connection healthy');
      }
    } catch (error) {
      console.error('[HealthCheck] Health check error:', error);
      scheduleReconnect();
    }
  }, 30000);
}

function stopHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}
```

### 4. 优雅降级模式

```javascript
let isMaintenanceMode = false;
const commandCache = [];

function enterMaintenanceMode() {
  isMaintenanceMode = true;
  console.log('[SupabaseService] Entering maintenance mode - caching commands locally');
  
  // 停止健康检查
  stopHealthCheck();
  
  // 设置恢复检查 (每5分钟尝试恢复)
  setInterval(async () => {
    if (await attemptRecovery()) {
      exitMaintenanceMode();
    }
  }, 300000); // 5分钟
}

function exitMaintenanceMode() {
  isMaintenanceMode = false;
  reconnectAttempts = 0;
  console.log('[SupabaseService] Exiting maintenance mode');
  
  // 处理缓存的命令
  processCachedCommands();
  
  // 重新启动正常服务
  startHealthCheck();
  subscribeToCommands();
}

async function attemptRecovery() {
  try {
    await initializeSupabaseClient();
    return await ensureSupabaseConnection();
  } catch (error) {
    console.log('[Recovery] Recovery attempt failed:', error.message);
    return false;
  }
}
```

### 5. 增强错误处理

```javascript
function handleNewCommand(payload) {
  try {
    if (!payload || !payload.new) {
      console.warn('[SupabaseService] Invalid payload received:', payload);
      return;
    }

    console.log('[SupabaseService] New command received:', payload.new);
    
    // 如果在维护模式，缓存命令
    if (isMaintenanceMode) {
      commandCache.push(payload.new);
      console.log('[SupabaseService] Command cached for later processing');
      return;
    }

    // 正常处理命令
    processCommand(payload.new);
    
  } catch (error) {
    console.error('[SupabaseService] Error handling new command:', error);
    
    // 如果是关键错误，可能需要重连
    if (isConnectionError(error)) {
      scheduleReconnect();
    }
  }
}

function isConnectionError(error) {
  const connectionErrors = [
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'fetch failed'
  ];
  
  return connectionErrors.some(errorType => 
    error.message.includes(errorType) || error.code === errorType
  );
}
```

## 🔍 监控和告警

### 1. 连接状态监控

```javascript
class ConnectionMonitor {
  constructor() {
    this.metrics = {
      connectionAttempts: 0,
      successfulConnections: 0,
      failedConnections: 0,
      lastConnectionTime: null,
      totalDowntime: 0
    };
  }

  recordConnectionAttempt() {
    this.metrics.connectionAttempts++;
  }

  recordConnectionSuccess() {
    this.metrics.successfulConnections++;
    this.metrics.lastConnectionTime = new Date();
  }

  recordConnectionFailure() {
    this.metrics.failedConnections++;
  }

  getHealthScore() {
    const total = this.metrics.connectionAttempts;
    if (total === 0) return 100;
    
    return (this.metrics.successfulConnections / total) * 100;
  }

  generateReport() {
    return {
      healthScore: this.getHealthScore(),
      uptime: this.calculateUptime(),
      ...this.metrics
    };
  }
}

const monitor = new ConnectionMonitor();
```

### 2. 日志增强

```javascript
function logConnectionEvent(event, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event,
    details,
    reconnectAttempts,
    isMaintenanceMode
  };

  console.log(`[ConnectionLog] ${timestamp} - ${event}:`, details);
  
  // 可选：写入文件或发送到监控系统
  // writeToLogFile(logEntry);
  // sendToMonitoringService(logEntry);
}
```

## 🧪 测试和验证

### 1. 网络中断模拟测试

```bash
# 模拟网络中断
sudo pfctl -e
echo "block out proto tcp from any to rzsupavqzxhyrgcexrpx.supabase.co port 443" | sudo pfctl -f -

# 恢复网络
sudo pfctl -f /etc/pf.conf
```

### 2. 连接测试脚本

```javascript
// test/connection-stress-test.js
async function stressTestConnection() {
  for (let i = 0; i < 100; i++) {
    try {
      await testSupabaseConnection();
      console.log(`Test ${i + 1}: ✅ Success`);
    } catch (error) {
      console.log(`Test ${i + 1}: ❌ Failed - ${error.message}`);
    }
    
    // 随机延迟
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
  }
}
```

## 📋 实施检查清单

### 阶段1：紧急修复 (1-2天)
- [ ] 添加空值检查到 `subscribeToCommands`
- [ ] 实现基础重连机制
- [ ] 添加连接状态验证
- [ ] 增强错误日志

### 阶段2：稳定性增强 (2-3天)
- [ ] 实现智能重连算法
- [ ] 添加健康检查机制
- [ ] 实现优雅降级模式
- [ ] 添加连接监控

### 阶段3：长期优化 (持续)
- [ ] 连接池管理
- [ ] 性能监控仪表盘
- [ ] 自动化测试套件
- [ ] 告警和通知系统

## 🎯 成功指标

- **服务稳定性**：连续运行时间 > 24小时
- **重连成功率**：> 95%
- **故障恢复时间**：< 30秒
- **错误处理覆盖率**：100%

---

**下一步**：立即开始实施阶段1的紧急修复，确保服务基本稳定运行。
