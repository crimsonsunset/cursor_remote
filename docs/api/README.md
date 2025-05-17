# API参考

本文档提供了Cursor远程控制项目的API接口详细说明。

## Redis通信协议

项目使用Redis Pub/Sub机制进行通信，通过约定的消息格式和频道进行交互。

### 频道约定

- **命令频道**：`cursor:commands` - 客户端发送命令到此频道
- **响应频道**：`cursor:responses` - 服务器发送响应到此频道
- **状态频道**：`cursor:status` - 服务器发送状态更新到此频道

### 消息格式

所有消息均使用JSON格式，基本结构如下：

```json
{
  "id": "唯一标识符",
  "timestamp": "ISO格式时间戳",
  "type": "消息类型",
  "payload": {
    // 具体内容，根据消息类型不同而不同
  }
}
```

## 命令API

以下是支持的命令类型及其格式：

### 聊天命令

发送聊天消息到Cursor。

```json
{
  "id": "cmd-123",
  "timestamp": "2023-06-15T08:30:00.000Z",
  "type": "chat",
  "payload": {
    "mode": "chat|agent|ask", // 默认为ask
    "message": "需要发送的消息内容"
  }
}
```

### 动作命令

执行特定的Cursor动作。

```json
{
  "id": "cmd-456",
  "timestamp": "2023-06-15T08:35:00.000Z",
  "type": "action",
  "payload": {
    "action": "new_chat|agent|ask|clear_chat|save_code|run_code",
    "params": {
      // 可选参数，根据action类型不同而不同
    }
  }
}
```

### 自定义脚本命令

执行自定义AppleScript脚本。

```json
{
  "id": "cmd-789",
  "timestamp": "2023-06-15T08:40:00.000Z",
  "type": "script",
  "payload": {
    "script": "脚本名称",
    "params": {
      // 脚本参数
    }
  }
}
```

## 响应API

以下是服务器返回的响应类型及其格式：

### 成功响应

```json
{
  "id": "res-123", // 唯一标识符
  "ref": "cmd-123", // 对应的命令ID
  "timestamp": "2023-06-15T08:30:05.000Z",
  "type": "success",
  "payload": {
    "message": "操作成功",
    "data": {
      // 操作返回的数据
    }
  }
}
```

### 错误响应

```json
{
  "id": "res-456",
  "ref": "cmd-456",
  "timestamp": "2023-06-15T08:35:05.000Z",
  "type": "error",
  "payload": {
    "code": "错误代码",
    "message": "错误描述",
    "details": {
      // 详细错误信息
    }
  }
}
```

### 状态更新

```json
{
  "id": "stat-123",
  "timestamp": "2023-06-15T08:30:10.000Z",
  "type": "status",
  "payload": {
    "status": "connected|disconnected|busy|idle",
    "message": "状态描述"
  }
}
```

## 客户端实现示例

### JavaScript (Web客户端)

```javascript
// 连接Redis（通过WebSocket代理）
const socket = new WebSocket('wss://your-redis-proxy.com');

// 发送命令
function sendCommand(type, payload) {
  const command = {
    id: `cmd-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type,
    payload
  };
  
  socket.send(JSON.stringify(command));
}

// 示例：发送聊天消息
sendCommand('chat', {
  mode: 'ask',
  message: '如何使用React创建一个计数器组件？'
});

// 接收响应
socket.onmessage = (event) => {
  const response = JSON.parse(event.data);
  
  if (response.type === 'success') {
    console.log('操作成功:', response.payload.message);
  } else if (response.type === 'error') {
    console.error('操作失败:', response.payload.message);
  } else if (response.type === 'status') {
    console.log('状态更新:', response.payload.status);
  }
};
```

## 服务器实现示例

### Node.js

```javascript
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');

// 创建Redis客户端
const subscriber = redis.createClient({
  host: 'your-redis-host.com',
  port: 6379,
  password: 'your-redis-password'
});

const publisher = subscriber.duplicate();

// 订阅命令频道
subscriber.subscribe('cursor:commands');

// 处理接收到的命令
subscriber.on('message', (channel, message) => {
  const command = JSON.parse(message);
  
  console.log(`收到命令: ${command.type}`);
  
  // 处理命令...
  
  // 发送响应
  const response = {
    id: `res-${uuidv4()}`,
    ref: command.id,
    timestamp: new Date().toISOString(),
    type: 'success',
    payload: {
      message: '命令已处理',
      data: {}
    }
  };
  
  publisher.publish('cursor:responses', JSON.stringify(response));
});
```

## 错误代码参考

| 错误代码 | 描述 |
|---------|-----|
| `AUTH_ERROR` | 认证错误 |
| `INVALID_COMMAND` | 无效的命令 |
| `SCRIPT_ERROR` | 脚本执行错误 |
| `CURSOR_ERROR` | Cursor应用错误 |
| `CONNECTION_ERROR` | 连接错误 |
| `TIMEOUT_ERROR` | 操作超时 |

## Supabase替代API（提案）

如果使用Supabase作为替代方案，API结构将有所不同。请参考[Supabase迁移简报](../project_brief_supabase_migration.md)了解详情。 