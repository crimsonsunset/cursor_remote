# CursorRemote 服务稳定性改进

## 问题描述

之前服务运行时间长了会出现频繁的订阅连接断开重连问题，表现为：

```
[Service Error] [SubscriptionManager] Subscription CLOSED. Will attempt to reconnect...
[Service] [SubscriptionManager] Attempting to subscribe (attempt X/10)...
[Service Error] [SubscriptionManager] Subscription CHANNEL_ERROR. Will attempt to reconnect...
```

## 解决方案

### 1. SupabaseService 优化

**连接管理改进：**
- 增加连接超时时间：从30秒增加到60秒
- 优化心跳间隔：从15秒增加到30秒
- 改进重连策略：使用更温和的指数退避算法
- 添加连接健康检查：每2分钟自动检查连接状态

**订阅管理改进：**
- 防止重复订阅：添加订阅状态锁
- 智能重试策略：使用退避延迟和随机抖动
- 更好的错误恢复：连续失败3次后强制刷新连接
- 唯一频道名：避免频道名冲突

### 2. 自动重启脚本优化

**订阅错误智能处理：**
- 不再将单次订阅错误视为严重错误
- 只有5分钟内超过20次订阅错误才升级为严重错误
- 可通过环境变量 `SUBSCRIPTION_ERROR_THRESHOLD` 调整阈值

**监控改进：**
- 分别追踪严重错误和订阅错误
- 显示订阅错误计数和阈值状态
- 定期清理过期的错误记录

## 使用方法

### 1. 更新配置

在 `.env` 文件中添加（可选）：

```bash
# 如果订阅错误频繁误触发重启，可以调高这个值
SUBSCRIPTION_ERROR_THRESHOLD=30
```

### 2. 重启服务

```bash
# 停止当前服务
npm run smart-stop

# 启动优化后的服务
npm run production
```

### 3. 监控状态

监控界面现在会显示：
- 订阅错误计数：`📡 订阅错误: X/20`
- 严重错误计数：`🚨 严重错误: X`

## 预期效果

1. **减少误重启**：订阅连接问题不再立即触发重启
2. **更稳定的长期运行**：改进的连接管理和重试策略
3. **智能错误检测**：只有真正严重的问题才会触发重启
4. **更好的可观测性**：清楚区分不同类型的错误

## 故障排除

如果服务仍然频繁重启：

1. **调高订阅错误阈值**：
   ```bash
   export SUBSCRIPTION_ERROR_THRESHOLD=50
   npm run production
   ```

2. **检查网络连接**：
   ```bash
   npm run monitor  # 运行连接监控器
   ```

3. **查看详细日志**：监控界面会显示最近的错误详情

4. **手动重置计数器**：
   ```bash
   # 获取监控器进程ID
   ps aux | grep auto-restart
   # 发送重置信号
   kill -USR1 <进程ID>
   ```

## 配置说明

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `ENABLE_AUTO_RESTART` | `true` | 是否启用自动重启 |
| `SUBSCRIPTION_ERROR_THRESHOLD` | `20` | 5分钟内订阅错误阈值 |

## 更新日志

- 优化订阅管理器，减少频繁重连
- 改进连接管理，增强网络容错能力
- 智能订阅错误检测，避免误重启
- 添加连接健康检查机制
- 优化重试策略和退避算法
