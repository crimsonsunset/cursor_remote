# Cursor远程控制项目文档

欢迎来到Cursor远程控制项目的文档。本文档提供了项目的架构、设计、API和使用指南等详细信息。

## 文档结构

- [架构设计](architecture/README.md) - 系统架构、数据流和技术选择
- [API参考](api/README.md) - API接口文档
- [用户指南](guides/README.md) - 安装、配置和使用指南
- [开发指南](development/README.md) - 开发环境设置、贡献指南
- [计划与路线图](roadmap/README.md) - 未来计划和功能路线图

## 项目概述

Cursor远程控制项目是一个基于Redis的解决方案，允许用户通过手机远程控制Mac电脑上的Cursor应用。通过简单的Web界面，用户可以发送命令，执行各种Cursor操作，如发送聊天消息、创建新对话、执行代码等。

### 核心功能

- 通过Redis Pub/Sub机制进行实时通信
- 使用AppleScript控制Cursor应用
- 支持多种Cursor操作模式（聊天、Agent、Ask等）
- 支持各种Cursor操作（新建聊天、保存代码、运行代码等）

### 技术栈

- **服务器端**：Node.js + Redis客户端
- **客户端**：HTML/CSS/JavaScript (Web界面)
- **自动化**：AppleScript
- **通信**：Redis Pub/Sub

## 快速链接

- [安装指南](guides/installation.md)
- [配置Redis](guides/redis-setup.md)
- [手机客户端使用](guides/mobile-client.md)
- [服务器设置](guides/server-setup.md)
- [常见问题](guides/faq.md)

## 相关资源

- [项目仓库](https://github.com/yourusername/cursor-remote)
- [问题追踪](https://github.com/yourusername/cursor-remote/issues)
- [Cursor官网](https://cursor.so/)
- [AppleScript文档](https://developer.apple.com/library/archive/documentation/AppleScript/Conceptual/AppleScriptLangGuide/introduction/ASLR_intro.html) 