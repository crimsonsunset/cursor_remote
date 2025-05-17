# 系统架构

本文档描述了Cursor远程控制项目的系统架构、数据流和技术选择。

## 系统组件

![系统架构图](../assets/system-architecture.png)

整个系统由以下主要组件构成：

1. **手机客户端** - 基于Web的简单界面，用于发送命令
2. **Redis服务器** - 提供Pub/Sub功能，实现实时通信
3. **服务器应用** - 运行在Mac上的Node.js应用，处理命令并控制Cursor
4. **AppleScript模块** - 自动化脚本，直接与Cursor应用交互
5. **Cursor应用** - 最终被控制的目标应用

## 数据流

1. **命令发送流程**
   - 手机客户端 → Redis发布 → 服务器订阅 → AppleScript执行 → Cursor处理
   
2. **结果返回流程**
   - Cursor响应 → AppleScript捕获 → 服务器处理 → Redis发布 → 手机客户端展示

### 详细数据流程

1. 用户在手机客户端输入命令
2. 客户端将命令发布到Redis指定频道
3. 服务器应用订阅该频道，收到命令
4. 服务器解析命令，调用相应的AppleScript脚本
5. AppleScript控制Cursor执行相应操作
6. AppleScript捕获操作结果
7. 服务器将结果发布到另一个Redis频道
8. 手机客户端订阅该频道，接收并显示结果

## 技术选择

### Redis

选择Redis作为消息中间件的原因：
- 高性能的Pub/Sub功能
- 轻量级且易于部署
- 支持跨平台通信

### Node.js

选择Node.js作为服务器应用的原因：
- 非阻塞I/O模型，适合处理实时通信
- 丰富的库生态系统
- 与AppleScript集成的能力

### AppleScript

选择AppleScript作为自动化脚本的原因：
- macOS原生支持
- 能够直接控制应用程序界面元素
- 可以模拟用户操作

## 替代技术方案

### Supabase替代方案

近期讨论的替代Redis的方案是使用Supabase的实时数据库功能：

- **优势**：无需开放Redis公网访问，提高安全性
- **实现**：通过结构化数据表替代Pub/Sub
- **状态**：正在评估的方案

详细信息请参考[Supabase迁移简报](../project_brief_supabase_migration.md)

## 安全考虑

当前架构的主要安全考虑点：

1. Redis通过公网访问的安全风险
2. 命令验证和授权机制
3. 数据传输加密

### 缓解措施

- 使用Redis身份验证和密码保护
- 考虑命令加密或签名
- 限制Redis访问IP范围
- 探索替代技术（如Supabase）提升安全性

## 相关文档

- [服务器配置](../guides/server-setup.md)
- [Redis设置指南](../guides/redis-setup.md)
- [安全最佳实践](../guides/security-best-practices.md) 