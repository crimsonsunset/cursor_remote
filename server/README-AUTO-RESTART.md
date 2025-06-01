# CursorRemote 自动重启监控器配置说明

## 概述

`auto-restart.js` 是一个监控脚本，用于检测 CursorRemote 服务的健康状态并在必要时自动重启服务。

## 配置选项

### 环境变量

- `ENABLE_AUTO_RESTART`: 控制是否启用自动重启功能
  - `true` (默认): 启用自动重启
  - `false`: 禁用自动重启，仅监控不重启

### 监控参数

- **检查间隔**: 2分钟检查一次服务状态
- **失败阈值**: 连续失败5次后触发重启
- **重启冷却期**: 重启后2分钟内不再重启
- **最大重启次数**: 每小时最多重启5次
- **卡住命令阈值**: 命令超过30分钟未处理才算卡住
- **严重错误阈值**: 10分钟内超过10个严重错误才触发重启

## 使用方法

### 启用自动重启（默认）
```bash
node auto-restart.js
```

### 禁用自动重启（仅监控）
```bash
ENABLE_AUTO_RESTART=false node auto-restart.js
```

### 在 .env 文件中配置
```bash
# 在 server/.env 文件中添加
ENABLE_AUTO_RESTART=false
```

## 重启触发条件

### 立即重启条件
1. 发现超过30分钟未处理的pending命令
2. 10分钟内检测到超过20个严重错误
3. 连续5次健康检查失败

### 严重错误模式
- `errorRecoveryService.handleError is not a function`
- `TypeError.*is not a function`
- `Cannot read property.*of undefined`
- `ReferenceError`
- `Failed to ensure Supabase connection`
- `Max connection attempts.*reached`
- `ECONNREFUSED`
- `ENOTFOUND`

## 建议配置

### 开发环境
```bash
ENABLE_AUTO_RESTART=false
```
在开发环境中建议禁用自动重启，以便更好地调试问题。

### 生产环境
```bash
ENABLE_AUTO_RESTART=true
```
在生产环境中建议启用自动重启，确保服务的高可用性。

## 监控输出

监控器会显示以下信息：
- 运行时间
- 服务状态
- 重启次数
- 连续失败次数
- 严重错误计数
- 最近的错误历史

## 故障排除

如果服务频繁重启，请检查：
1. 网络连接是否稳定
2. Supabase 配置是否正确
3. 是否有大量pending命令积压
4. 服务器资源是否充足

可以通过设置 `ENABLE_AUTO_RESTART=false` 来禁用自动重启，仅进行监控以便调试。 