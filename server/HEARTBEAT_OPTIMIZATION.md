# Supabase 订阅心跳机制优化

## 问题描述

在使用 CursorRemote 服务时，经常出现以下警告信息：
```
[Service Error] [SubscriptionManager] Missed heartbeat 1/3
```

这个警告表明 Supabase 实时订阅的心跳检查机制检测到连接可能不稳定。

## 原因分析

原始的心跳检查配置过于敏感：

### 原始配置
- **健康检查间隔**: 30秒
- **心跳超时**: 60秒（30秒 × 2）
- **最大丢失次数**: 3次
- **触发重连条件**: 连续3次心跳丢失

### 问题
1. **网络延迟敏感**: 在网络稍有延迟时就会触发警告
2. **频繁误报**: 正常的网络波动也会被认为是连接问题
3. **过度重连**: 不必要的连接重建影响性能

## 优化方案

### 新配置参数（极度保守版本）
- **心跳检查**: 默认禁用（通过环境变量启用）
- **健康检查间隔**: 5分钟（从30秒大幅增加）
- **心跳超时**: 10分钟（从60秒大幅增加）
- **最大丢失次数**: 10次（从3次大幅增加）
- **警告阈值**: 5次丢失后才开始记录警告
- **连接验证**: 在重连前进行额外的数据库查询验证

### 优化特性

#### 1. 极度保守的超时时间
```javascript
this.healthCheckInterval = 300000; // 5分钟检查一次
this.heartbeatTimeout = 600000; // 10分钟心跳超时
this.maxMissedHeartbeats = 10; // 允许10次丢失
this.enableHeartbeatCheck = false; // 默认禁用
```

#### 2. 智能连接验证
```javascript
// 在重连前进行额外的连接验证
const isReallyDisconnected = await this.verifyConnectionLoss();
if (isReallyDisconnected) {
  this.logger.error('[SubscriptionManager] Connection loss confirmed, forcing reconnection');
  this.forceReconnect();
} else {
  this.logger.log('[SubscriptionManager] Connection test passed, resetting heartbeat counter');
  this.lastHeartbeat = Date.now();
  this.missedHeartbeats = 0;
}
```

#### 3. 增强的心跳更新
```javascript
// 系统事件也算作心跳活动
.on('system', {}, (status, err) => {
  this.lastHeartbeat = Date.now();
  this.handleSubscriptionStatus(status, err, onNewCommand, retryDelay);
})
```

#### 4. 初始心跳设置
```javascript
// 设置初始心跳时间
this.lastHeartbeat = Date.now();
this.missedHeartbeats = 0;
```

## 效果对比

### 优化前
- 心跳丢失频繁出现
- 每60秒就可能触发警告
- 连续3次丢失就强制重连
- 日志噪音较多

### 优化后
- 心跳检查默认禁用，避免误报
- 需要600秒（10分钟）无响应才算丢失
- 连续10次丢失才考虑重连
- 重连前进行额外的连接验证
- 只在真正连接断开时才重连

## 测试验证

### 运行心跳测试
```bash
cd server
node test-heartbeat.js
```

### 测试输出示例
```
🔄 测试优化后的心跳机制...

✅ 配置验证通过
📊 心跳检查间隔: 30秒
📊 订阅管理器配置:
   - 健康检查间隔: 60秒
   - 心跳超时时间: 180秒
   - 最大丢失次数: 5次

🚀 初始化服务...
✅ 服务初始化成功
🔄 监控心跳状态...

📊 状态报告:
   - 连接状态: ✅ 已连接
   - 订阅状态: ✅ 已订阅
   - 丢失心跳: 0/5
   - 上次心跳: 15秒前
   - 连续失败: 0次
```

### 单元测试
```bash
npm test -- --testNamePattern="missed heartbeat"
```

## 配置建议

### 默认配置（推荐）
- **心跳检查**: 禁用（避免误报）
- **依赖**: 仅依赖 Supabase 自身的重连机制
- **适用**: 大多数稳定的网络环境

### 启用心跳检查（仅在必要时）
如果您的网络环境极不稳定，可以启用心跳检查：

```bash
# 通过环境变量启用
export ENABLE_HEARTBEAT_CHECK=true

# 或在 .env 文件中添加
ENABLE_HEARTBEAT_CHECK=true
```

### 自定义配置
```javascript
const config = new SupabaseConfig({
  // ... 其他配置
  enableHeartbeatCheck: true, // 启用心跳检查
  healthCheckInterval: 300000, // 5分钟检查间隔
});
```

### 何时启用心跳检查
- 网络环境极不稳定
- 经常出现长时间的网络中断
- 需要更快的故障检测
- 已确认网络问题不是由心跳检查本身引起的

## 监控建议

1. **观察日志**: 关注心跳警告的频率
2. **网络监控**: 监控网络延迟和稳定性
3. **性能指标**: 观察重连频率的变化
4. **用户体验**: 确认命令执行的稳定性

## 故障排除

### 如果仍然频繁出现心跳丢失
1. 检查网络连接稳定性
2. 验证 Supabase 服务状态
3. 考虑进一步增加超时时间
4. 检查防火墙或代理设置

### 紧急回退
如果需要回退到原始配置：
```javascript
this.healthCheckInterval = 30000;
this.heartbeatTimeout = 60000;
this.maxMissedHeartbeats = 3;
```

## 相关文件

- `src/services/supabaseService.js` - 主要实现
- `tests/services/supabaseService.test.js` - 单元测试
- `test-heartbeat.js` - 心跳测试脚本
- `HEARTBEAT_OPTIMIZATION.md` - 本文档

---

*优化完成时间: 2025年1月*
*测试状态: ✅ 通过*
*影响范围: SubscriptionManager 心跳检查机制* 