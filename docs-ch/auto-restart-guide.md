# CursorRemote 自动重启指南

## 概述

CursorRemote 现在提供智能自动重启功能，能够检测常见错误并自动重启服务，以确保系统稳定运行。

## 错误检测

自动重启系统检测以下类型的错误：

### 关键错误模式
- `errorRecoveryService.handleError is not a function` - 错误恢复服务调用错误
- `TypeError: ... is not a function` - 函数调用错误
- `Cannot read property ... of undefined` - 空引用错误
- `ReferenceError` - 引用错误
- `Failed to ensure Supabase connection` - 数据库连接失败
- `Max connection attempts ... reached` - 连接尝试次数超限
- `ECONNREFUSED` / `ENOTFOUND` - 网络连接错误
- `CHANNEL_ERROR` - 订阅通道错误
- `subscription ... failed` - 订阅失败

### 服务健康检查
- 长期未处理的待处理命令（超过 10 分钟）
- 数据库连接状态
- 最近命令处理活动
- 关键错误频率分析

## 使用方法

### 1. 自动重启监控器（推荐）

```bash
# 启动带有自动重启功能的服务
cd server
npm run production

# 或直接运行
node auto-restart.js
```

### 2. 智能重启脚本

```bash
# 重启服务
npm run smart-restart

# 启动服务
npm run smart-start

# 停止服务
npm run smart-stop

# 查看服务状态
npm run smart-status

# 持续监控（在后台运行持续监控和自动重启）
npm run smart-monitor
```

### 3. 手动操作

```bash
# 强制重启（终止所有相关进程）
../scripts/smart-restart.sh force-restart

# 健康检查
../scripts/smart-restart.sh health
```

## 监控配置

### 自动重启监控器配置

```javascript
const config = {
  checkInterval: 60000,        // 每 1 分钟检查一次
  failureThreshold: 3,         // 连续 3 次失败后重启
  restartCooldown: 30000,      // 重启后 30 秒冷却时间
  maxRestarts: 10,             // 最大重启次数
  resetInterval: 3600000       // 1 小时后重置重启次数
};
```

### 智能重启逻辑

1. **立即重启条件**：
   - 检测到超过 10 个关键错误模式
   - 发现长期未处理的待处理命令
   - 5 分钟内过多关键错误

2. **常规重启条件**：
   - 连续 3 次健康检查失败
   - 数据库连接持续失败

## 监控界面

运行自动重启监控器时，会显示实时状态：

```
═══════════════════════════════════════════════
🔄 CursorRemote 自动重启监控器
═══════════════════════════════════════════════
⏰ 运行时间: 2h15m30s
🔧 服务状态: ✅ 运行中
🔄 重启次数: 2/10
❌ 连续失败: 0/3
🚨 关键错误: 5
✅ 上次成功: 30 秒前
🚨 上次错误: 120 秒前
───────────────────────────────────────────────
🚨 最近关键错误:
   45 秒前: errorRecoveryService.handleError is not a function...
   120 秒前: Failed to ensure Supabase connection...
───────────────────────────────────────────────
按 Ctrl+C 退出监控
═══════════════════════════════════════════════
```

## 日志文件

- **自动重启监控器日志**：实时输出到控制台
- **智能重启脚本日志**：`server/restart.log`
- **服务进程 PID**：`server/service.pid`

## 最佳实践

### 1. 生产环境部署

```bash
# 使用系统服务管理
# 创建 systemd 服务文件 /etc/systemd/system/cursor-remote.service

[Unit]
Description=CursorRemote Auto Restart Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/CursorRemote/server
ExecStart=/usr/bin/node auto-restart.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 2. 开发环境

```bash
# 使用开发模式（文件更改时自动重启）
npm run dev

# 或使用自动重启监控器进行测试
npm run production
```

### 3. 故障排除

```bash
# 检查服务状态
npm run smart-status

# 检查健康状态
../scripts/smart-restart.sh health

# 强制重启（清理所有相关进程）
../scripts/smart-restart.sh force-restart

# 查看重启日志
tail -f server/restart.log
```

## 常见问题

### Q: 服务重启过于频繁
A: 检查环境变量配置和网络连接，可能需要增加 `failureThreshold` 值

### Q: 自动重启不工作
A: 确保文件权限正确，检查 `.env` 文件是否存在

### Q: 如何临时禁用自动重启
A: 使用 `npm run start` 而不是 `npm run production`

### Q: 如何查看详细错误信息
A: 运行 `node auto-restart.js` 查看实时日志输出

## 更新说明

- ✅ 增强错误检测模式
- ✅ 智能重启决策逻辑
- ✅ 实时监控界面
- ✅ 错误历史记录
- ✅ 灵活配置选项
- ✅ 完整脚本工具集

建议使用 `npm run production` 启动服务以获得最佳稳定性和自动恢复能力 🚀