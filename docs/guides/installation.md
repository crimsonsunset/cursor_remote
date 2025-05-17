# 安装指南

本文档提供了Cursor远程控制项目的详细安装说明。

## 系统要求

- **服务器端**：
  - macOS 10.15+（需要运行Cursor应用）
  - Node.js 14.0+
  - npm 6.0+
  - Cursor应用已安装
  
- **客户端**：
  - 任何现代Web浏览器（Chrome, Safari, Firefox等）
  - 支持JavaScript

- **Redis服务器**：
  - Redis 5.0+
  - 可从客户端和服务器端访问

## 安装步骤

### 1. 克隆项目仓库

```bash
git clone https://github.com/yourusername/cursor-remote.git
cd cursor-remote
```

### 2. 安装服务器依赖

```bash
cd server
npm install
```

### 3. 配置Redis连接

创建配置文件：

```bash
cp config.example.js config.js
```

编辑`config.js`文件，填入你的Redis服务器信息：

```javascript
module.exports = {
  redis: {
    host: 'your-redis-host.com',
    port: 6379,
    password: 'your-redis-password'
  },
  server: {
    port: 3000
  }
}
```

### 4. 启动服务器

```bash
node server.js
```

成功启动后，你应该能看到以下输出：

```
服务器已启动，正在监听端口3000
已连接到Redis服务器
正在订阅cursor:commands频道
```

### 5. 部署Web客户端

你可以选择以下方式之一部署Web客户端：

#### 方式1：使用Node.js静态文件服务器

```bash
cd client
npx http-server -p 8080
```

然后在手机浏览器中访问：`http://your-mac-ip:8080`

#### 方式2：使用其他Web服务器（如Nginx）

配置Web服务器指向`client`目录，并确保正确设置CORS。

## 验证安装

安装完成后，请验证以下功能：

1. 服务器能成功连接到Redis
2. 手机客户端能加载Web界面
3. 发送测试命令，确认Cursor执行相应操作
4. 检查响应是否正确返回到客户端

## 常见问题

### 服务器无法连接到Redis

- 检查Redis服务器是否运行
- 验证主机名、端口和密码是否正确
- 确认网络连接和防火墙设置

### AppleScript权限问题

如果遇到AppleScript无法控制Cursor的问题：

1. 打开系统偏好设置 > 安全性与隐私 > 隐私 > 辅助功能
2. 确保Terminal或运行Node.js的应用程序被勾选
3. 可能需要重启Terminal或应用程序

### 客户端无法连接到服务器

- 确认服务器正在运行
- 检查网络连接状态
- 验证服务器IP和端口是否正确

## 下一步

安装完成后，建议参考以下文档：

- [Redis设置](redis-setup.md) - 配置和优化Redis服务器
- [手机客户端使用](mobile-client.md) - 了解如何使用客户端
- [服务器配置](server-setup.md) - 服务器高级配置选项 