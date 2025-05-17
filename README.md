# Cursor远程控制项目

通过Redis实现手机远程控制Cursor的解决方案。

## 项目结构

- `server/`: 服务器端代码，包含Redis客户端和AppleScript控制脚本
  - `server.js`: 主服务器代码，订阅Redis频道并处理命令
  - `cursor_controller.js`: 使用AppleScript控制Cursor的模块
  
- `client/`: 手机客户端代码
  - `index.html`: 简单的Web界面
  - `app.js`: 客户端JavaScript代码
  - `styles.css`: 样式表
  
- `scripts/`: AppleScript脚本
  - `perform_action.scpt`: 执行特定Cursor动作的脚本
  - `send_chat.scpt`: 发送聊天消息到Cursor的脚本

## 支持的功能

### 聊天模式

通过`send_chat.scpt`支持三种聊天模式：

- `chat`: 普通聊天模式 (⌘+K)
- `agent`: Agent模式 (⌘+I)
- `ask`: Ask模式 (⌘+⇧+K) - 默认模式

### 动作支持

通过`perform_action.scpt`支持以下动作：

- `new_chat`: 创建新聊天 (⌘+K)
- `agent`: 使用Agent功能 (⌘+I)
- `ask`: 使用Ask功能 (⌘+⇧+K)
- `clear_chat`: 清除当前聊天
- `save_code`: 保存代码 (⌘+S)
- `run_code`: 运行代码

## 安装与使用

### 服务器端

1. 安装依赖：
```
cd server
npm install
```

2. 启动服务器：
```
node server.js
```

### 客户端

使用手机浏览器访问部署的Web界面，或者使用HTTP客户端发送请求。

## 工作原理

1. 手机通过Web界面发送命令到Redis服务器
2. 电脑上的服务器程序订阅Redis频道，接收命令
3. 服务器使用AppleScript控制Cursor执行命令
4. 执行结果通过Redis返回给手机客户端
