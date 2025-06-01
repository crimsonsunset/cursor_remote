# CursorRemote 稳定模式使用指南

## 概述

为了解决频繁的心跳丢失和连接重启问题，我们提供了多种稳定运行模式。

## 问题背景

在某些网络环境下，过于敏感的心跳检查和监控机制可能会：
- 将正常的网络波动误认为连接问题
- 频繁触发不必要的重连和重启
- 产生大量的警告日志噪音
- 影响服务的稳定性

## 解决方案

### 1. 稳定模式启动（推荐）

使用稳定模式启动脚本，完全禁用心跳检查：

```bash
cd server
node start-stable.js
```

**特点：**
- ❌ 禁用心跳检查
- ✅ 依赖 Supabase 自身的重连机制
- ✅ 减少日志噪音
- ✅ 更稳定的运行

### 2. 标准模式（默认禁用心跳）

直接启动服务，心跳检查默认禁用：

```bash
cd server
node src/services/supabaseService.js
```

**特点：**
- ❌ 心跳检查默认禁用
- ✅ 可通过环境变量启用
- ✅ 保持所有其他功能

### 3. 自动重启监控（优化版）

使用优化后的自动重启脚本：

```bash
cd server
node auto-restart.js
```

**优化特点：**
- ❌ 默认禁用订阅错误检测
- ✅ 忽略心跳相关错误
- ✅ 提高错误阈值
- ✅ 更保守的重启策略

## 环境变量配置

### 心跳检查控制

```bash
# 启用心跳检查（仅在网络极不稳定时使用）
export ENABLE_HEARTBEAT_CHECK=true

# 或在 .env 文件中添加
ENABLE_HEARTBEAT_CHECK=true
```

### 自动重启控制

```bash
# 禁用自动重启
export ENABLE_AUTO_RESTART=false

# 启用订阅错误检测（默认禁用）
export ENABLE_SUBSCRIPTION_ERROR_DETECTION=true

# 自定义订阅错误阈值
export SUBSCRIPTION_ERROR_THRESHOLD=100
```

## 推荐配置

### 稳定网络环境（推荐）

```bash
# .env 文件
ENABLE_HEARTBEAT_CHECK=false
ENABLE_AUTO_RESTART=true
ENABLE_SUBSCRIPTION_ERROR_DETECTION=false
```

### 不稳定网络环境

```bash
# .env 文件
ENABLE_HEARTBEAT_CHECK=true
ENABLE_AUTO_RESTART=true
ENABLE_SUBSCRIPTION_ERROR_DETECTION=true
SUBSCRIPTION_ERROR_THRESHOLD=50
```

## 快速启动

### 推荐方式（交互式选择）

```bash
cd server
node start.js
```

这会显示一个菜单让您选择启动模式。

### 直接启动

```bash
# 稳定模式（推荐日常使用）
cd server
node start-stable.js

# 监控模式（推荐生产环境）
cd server  
node auto-restart.js
```

## 启动方式对比

| 启动方式 | 心跳检查 | 自动重启 | 订阅错误检测 | 适用场景 | 推荐度 |
|---------|---------|---------|-------------|----------|--------|
| `start.js` | 📋 可选择 | 📋 可选择 | 📋 可选择 | 交互式选择 | ⭐⭐⭐⭐⭐ |
| `start-stable.js` | ❌ 禁用 | ❌ 无 | ❌ 无 | 日常使用，最稳定 | ⭐⭐⭐⭐⭐ |
| `auto-restart.js` | ❌ 默认禁用 | ✅ 启用 | ❌ 默认禁用 | 生产环境，需要监控 | ⭐⭐⭐⭐ |
| `supabaseService.js` | ❌ 默认禁用 | ❌ 无 | ❌ 无 | 开发测试 | ⭐⭐⭐ |

## 故障排除

### 如果仍然出现频繁重连

1. **确认心跳检查已禁用**：
   ```bash
   # 检查日志中是否有这行
   [SubscriptionManager] Heartbeat check is disabled for stability
   ```

2. **检查自动重启配置**：
   ```bash
   # 确认看到这些配置
   📡 订阅错误检测: ❌ 禁用
   💓 忽略心跳错误: ✅ 是
   ```

3. **检查网络连接**：
   - 确认 Supabase 服务状态
   - 检查防火墙和代理设置
   - 验证网络延迟

### 如果需要更严格的监控

只在确认网络问题不是由监控本身引起时，才启用额外的检查：

```bash
export ENABLE_HEARTBEAT_CHECK=true
export ENABLE_SUBSCRIPTION_ERROR_DETECTION=true
```

## 监控建议

1. **观察日志模式**：关注真正的错误而非心跳警告
2. **监控命令处理**：确认命令能正常执行
3. **网络质量**：监控网络延迟和稳定性
4. **资源使用**：监控内存和CPU使用情况

## 总结

- **默认使用稳定模式**：大多数情况下，禁用心跳检查是最佳选择
- **依赖 Supabase 重连**：Supabase 自身有完善的重连机制
- **减少过度监控**：避免监控机制本身成为不稳定的源头
- **按需启用检查**：只在真正需要时才启用额外的监控

---

*更新时间：2025年1月*
*状态：✅ 已优化*
*影响：大幅减少误报和不必要的重连* 