# Redis设置指南

本文档提供了为Cursor远程控制项目配置Redis服务器的详细指南，包括安全建议。

## Redis配置选项

### 自托管Redis

如果您计划在本地或自有服务器上运行Redis，请按照以下步骤操作：

#### 在macOS上安装Redis

使用Homebrew安装：

```bash
brew install redis
```

启动Redis服务：

```bash
brew services start redis
```

#### 在Linux上安装Redis

对于Ubuntu/Debian：

```bash
sudo apt update
sudo apt install redis-server
```

修改配置文件：

```bash
sudo nano /etc/redis/redis.conf
```

启动Redis服务：

```bash
sudo systemctl restart redis-server
```

### 云托管Redis

对于需要公网访问的场景，推荐使用云托管的Redis服务：

- **Redis Labs** (RedisCloud) - 提供免费套餐和付费选项
- **AWS ElastiCache** - 适合已使用AWS的用户
- **Azure Cache for Redis** - 适合使用Microsoft Azure的用户
- **Google Cloud Memorystore** - 适合使用Google Cloud的用户

## 安全配置

### 1. 身份验证

始终为Redis设置强密码：

在`redis.conf`中设置：

```
requirepass YourStrongPassword
```

或在启动命令中设置：

```bash
redis-server --requirepass YourStrongPassword
```

### 2. 网络安全

#### 绑定特定IP

在`redis.conf`中配置Redis只监听特定IP：

```
bind 127.0.0.1 your.server.ip.address
```

#### 防火墙设置

限制只允许特定IP访问Redis端口（默认6379）：

对于UFW（Ubuntu）：

```bash
sudo ufw allow from trusted.ip.address to any port 6379
```

对于iptables：

```bash
sudo iptables -A INPUT -p tcp -s trusted.ip.address --dport 6379 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 6379 -j DROP
```

### 3. 数据加密

#### 传输加密

Redis本身不提供加密传输，建议：

1. 使用SSH隧道：

```bash
ssh -L 6379:localhost:6379 user@remote-server
```

2. 使用SSL代理：

可以使用Stunnel为Redis提供SSL/TLS加密：

```bash
# 在Stunnel配置文件中
[redis-server]
accept = 6380
connect = 127.0.0.1:6379
```

#### 云服务中的加密

大多数云Redis服务提供传输加密选项，如：

- Redis Labs：TLS/SSL加密
- AWS ElastiCache：传输加密
- Azure Cache for Redis：SSL加密

### 4. 其他安全建议

- **禁用危险命令**：在生产环境中禁用FLUSHALL、FLUSHDB等危险命令
- **设置内存限制**：防止内存过度使用
- **启用持久化**：定期备份数据
- **监控访问**：设置日志并定期检查异常访问

## 项目配置

在Cursor远程控制项目中配置Redis连接：

### 服务器端配置

编辑`server/config.js`文件：

```javascript
module.exports = {
  redis: {
    host: 'your-redis-host.com',
    port: 6379,
    password: 'your-strong-password',
    // 如果使用TLS
    tls: {
      enabled: true,
      // 可能需要CA证书
      ca: fs.readFileSync('path/to/ca.pem')
    }
  }
}
```

### 客户端配置

如果客户端直接连接Redis（不推荐），需类似配置。推荐通过服务器代理访问Redis。

## Supabase替代方案

由于Redis公网访问的安全挑战，项目正在考虑迁移到Supabase：

- **无需暴露Redis**：Supabase提供云托管服务，自带安全机制
- **结构化数据**：使用PostgreSQL存储命令和响应
- **实时订阅**：Supabase提供类似Pub/Sub的实时功能

详情请参阅[Supabase迁移简报](../project_brief_supabase_migration.md)。

## 故障排除

### 连接问题

如果遇到连接问题，请检查：

- Redis服务是否运行 (`redis-cli ping`应返回PONG)
- 防火墙设置是否允许连接
- 密码是否正确
- 网络连接是否稳定

### 性能问题

如果遇到性能问题：

- 检查Redis内存使用情况：`redis-cli info memory`
- 监控Redis性能：`redis-cli --stat`
- 考虑调整Redis配置参数

## 相关资源

- [Redis官方文档](https://redis.io/documentation)
- [Redis安全指南](https://redis.io/topics/security)
- [Redis Labs文档](https://docs.redislabs.com/) 