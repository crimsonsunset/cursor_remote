# CursorRemote 自动重启指南

## 概述

CursorRemote 现在提供了智能的自动重启功能，可以检测常见错误并自动重启服务，确保系统稳定运行。

## 错误检测

自动重启系统会检测以下类型的错误：

### 严重错误模式
- `errorRecoveryService.handleError is not a function` - 错误恢复服务调用错误
- `TypeError: ... is not a function` - 函数调用错误  
- `Cannot read property ... of undefined` - 空值引用错误
- `ReferenceError` - 引用错误
- `Failed to ensure Supabase connection` - 数据库连接失败
- `Max connection attempts ... reached` - 连接尝试超限
- `ECONNREFUSED` / `ENOTFOUND` - 网络连接错误
- `CHANNEL_ERROR` - 订阅通道错误
- `subscription ... failed` - 订阅失败

### 服务健康检查
- 长时间未处理的pending命令（超过10分钟）
- 数据库连接状态
- 最近命令处理活动
- 严重错误频率分析

## 使用方法

### 1. 自动重启监控器（推荐）

```bash
# 启动带自动重启功能的服务
cd server
npm run production

# 或者直接运行
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

# 持续监控（会在后台持续监控并自动重启）
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
  checkInterval: 60000,        // 1分钟检查一次
  failureThreshold: 3,         // 连续失败3次后重启
  restartCooldown: 30000,      // 重启后30秒冷却期
  maxRestarts: 10,             // 最大重启次数
  resetInterval: 3600000       // 1小时后重置重启计数
};
```

### 智能重启逻辑

1. **立即重启条件**：
   - 检测到严重错误模式超过10个
   - 发现长时间未处理的pending命令
   - 5分钟内严重错误过多

2. **常规重启条件**：
   - 连续健康检查失败3次
   - 数据库连接持续失败

## 监控界面

运行自动重启监控器时，会显示实时状态：

```
═══════════════════════════════════════════════
🔄 CursorRemote 自动重启监控器
═══════════════════════════════════════════════
⏰ 运行时间: 2时15分30秒
🔧 服务状态: ✅ 运行中
🔄 重启次数: 2/10
❌ 连续失败: 0/3
🚨 严重错误: 5
✅ 最后成功: 30秒前
🚨 最后错误: 120秒前
───────────────────────────────────────────────
🚨 最近的严重错误:
   45秒前: errorRecoveryService.handleError is not a function...
   120秒前: Failed to ensure Supabase connection...
───────────────────────────────────────────────
按 Ctrl+C 退出监控
═══════════════════════════════════════════════
```

## 日志文件

- **自动重启监控器日志**: 实时输出到控制台
- **智能重启脚本日志**: `server/restart.log`
- **服务进程PID**: `server/service.pid`

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
# 使用开发模式（文件变化时自动重启）
npm run dev

# 或者使用自动重启监控器进行测试
npm run production
```

### 3. 故障排除

```bash
# 查看服务状态
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
A: 确保有正确的文件权限，检查 `.env` 文件是否存在

### Q: 如何临时禁用自动重启
A: 使用 `npm run start` 而不是 `npm run production`

### Q: 如何查看详细的错误信息
A: 运行 `node auto-restart.js` 查看实时日志输出

## 更新说明

- ✅ 增强的错误检测模式
- ✅ 智能重启决策逻辑  
- ✅ 实时监控界面
- ✅ 错误历史记录
- ✅ 灵活的配置选项
- ✅ 完整的脚本工具集

建议使用 `npm run production` 来启动服务，这样可以获得最佳的稳定性和自动恢复能力 🚀 