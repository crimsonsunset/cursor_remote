# 用户指南

本章节包含了Cursor远程控制项目的安装、配置和使用指南。

## 目录

- [安装指南](installation.md) - 项目搭建和环境配置
- [Redis设置](redis-setup.md) - Redis服务器配置和安全建议
- [服务器设置](server-setup.md) - Node.js服务器配置和部署
- [手机客户端使用](mobile-client.md) - 手机Web客户端的使用方法
- [故障排除](troubleshooting.md) - 常见问题和解决方案
- [常见问题](faq.md) - 常见问题解答

## 快速开始

以下是快速启动项目的基本步骤：

### 1. 安装依赖

确保你的Mac电脑已安装Node.js和npm。然后克隆项目并安装依赖：

```bash
git clone https://github.com/yourusername/cursor-remote.git
cd cursor-remote/server
npm install
```

### 2. 配置Redis

你需要一个Redis服务器，可以选择：

- 本地安装Redis（仅适用于局域网使用）
- 使用云托管的Redis服务（如Redis Labs，适用于公网访问）

配置Redis连接信息：

```javascript
// server/config.js
module.exports = {
  redis: {
    host: 'your-redis-host.com',
    port: 6379,
    password: 'your-redis-password'
  }
}
```

### 3. 启动服务器

```bash
cd server
node server.js
```

服务器将启动并连接到Redis，准备接收命令。

### 4. 访问Web客户端

在手机浏览器中访问部署的Web客户端地址，或者在本地开发时访问：

```
http://your-mac-ip:port
```

## 支持的命令

Cursor远程控制支持以下主要功能：

### 聊天模式

- **普通聊天**：与Cursor AI进行对话
- **Agent模式**：使用Cursor Agent功能
- **Ask模式**：使用Cursor Ask功能（默认）

### 常用动作

- **新建聊天**：创建新的AI对话
- **清除聊天**：清除当前对话内容
- **保存代码**：保存当前代码
- **运行代码**：执行当前代码

## 安全注意事项

使用Cursor远程控制项目时，请注意以下安全事项：

1. **Redis访问安全**：
   - 务必设置强密码
   - 限制可访问的IP地址
   - 考虑使用SSL加密Redis连接

2. **命令验证**：
   - 服务器应验证接收到的命令
   - 避免执行危险操作

3. **网络安全**：
   - 使用HTTPS保护Web客户端
   - 考虑使用VPN连接，而非直接暴露服务在公网

更多安全建议，请参考[安全最佳实践](security-best-practices.md)。

## 视频教程

- [项目安装与配置](https://example.com/setup-tutorial)
- [手机客户端使用指南](https://example.com/mobile-tutorial)
- [高级功能与定制](https://example.com/advanced-tutorial)

## 社区与支持

如果你遇到问题或有建议，可以通过以下渠道获取帮助：

- [GitHub Issues](https://github.com/yourusername/cursor-remote/issues)
- [项目讨论区](https://github.com/yourusername/cursor-remote/discussions)
- [Email支持](mailto:support@example.com) 