# 开发指南

本章节包含了参与Cursor远程控制项目开发的相关指南、最佳实践和开发流程。

## 目录

- [开发环境设置](environment-setup.md)
- [代码风格与规范](code-style.md)
- [贡献指南](contributing.md)
- [测试指南](testing.md)
- [AppleScript开发](applescript-development.md)
- [扩展功能指南](extending.md)

## 项目结构

```
cursor-remote/
├── server/              # 服务器应用
│   ├── server.js        # 主服务器入口
│   ├── cursor_controller.js # Cursor控制模块
│   └── package.json     # 依赖管理
├── client/              # 客户端应用
│   ├── index.html       # 客户端入口
│   ├── app.js           # 客户端逻辑
│   └── styles.css       # 样式
├── scripts/             # AppleScript脚本
│   ├── send_chat.scpt   # 发送聊天消息脚本
│   └── perform_action.scpt # 执行动作脚本
└── docs/                # 文档
```

## 技术栈

项目使用的主要技术：

- **服务器**：Node.js
- **客户端**：HTML5, CSS3, JavaScript (ES6+)
- **通信**：Redis Pub/Sub
- **自动化**：AppleScript
- **文档**：Markdown

## 开始开发

### 1. 克隆代码库

```bash
git clone https://github.com/yourusername/cursor-remote.git
cd cursor-remote
```

### 2. 安装依赖

```bash
cd server
npm install
```

### 3. 配置开发环境

创建本地配置文件：

```bash
cp server/config.example.js server/config.js
```

修改配置文件，填入你的Redis服务器信息。

### 4. 运行开发服务器

```bash
cd server
node server.js
```

## 调试技巧

### 服务器端调试

使用Node.js调试工具：

```bash
node --inspect server/server.js
```

然后在Chrome浏览器中访问 `chrome://inspect` 来连接调试器。

### AppleScript调试

可以使用AppleScript编辑器来测试和调试脚本：

1. 打开"AppleScript编辑器"应用
2. 加载脚本文件
3. 使用日志命令添加调试信息：
   ```applescript
   log "变量值: " & someVariable
   ```

### Redis调试

使用Redis CLI工具监控通信：

```bash
redis-cli -h your-redis-host -p 6379 -a your-password
```

然后使用以下命令订阅频道：

```
SUBSCRIBE cursor:commands cursor:responses
```

## 扩展功能

### 添加新的Cursor命令支持

要添加对新Cursor命令的支持，需要修改以下文件：

1. 在 `scripts/` 目录中创建或修改AppleScript
2. 在 `server/cursor_controller.js` 中添加对应的处理函数
3. 更新API文档

### 示例：添加代码格式化命令

1. 创建 `scripts/format_code.scpt`：

```applescript
-- 格式化代码的AppleScript
on run argv
  set message to item 1 of argv
  
  tell application "Cursor" to activate
  delay 1
  
  tell application "System Events"
    tell process "Cursor"
      -- 执行格式化操作
      keystroke "f" using {command down, shift down}
      delay 2
    end tell
  end tell
  
  return "代码已格式化"
end run
```

2. 在 `server/cursor_controller.js` 中添加处理函数：

```javascript
// 添加格式化代码功能
async function formatCode() {
  return await executeAppleScript('format_code.scpt', []);
}

// 导出函数
module.exports = {
  // 已有的导出...
  formatCode,
};
```

3. 在 `server/server.js` 中注册命令处理：

```javascript
// 处理格式化代码命令
if (command.type === 'action' && command.payload.action === 'format_code') {
  result = await cursorController.formatCode();
}
```

## 代码提交指南

1. 创建功能分支
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. 编写代码并测试

3. 提交变更
   ```bash
   git add .
   git commit -m "feat: 添加代码格式化功能"
   ```

4. 推送到远程仓库
   ```bash
   git push origin feature/your-feature-name
   ```

5. 创建Pull Request

## 提交信息规范

我们使用[约定式提交](https://www.conventionalcommits.org/)规范：

- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档变更
- `style`: 代码风格变更（不影响功能）
- `refactor`: 代码重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建过程或辅助工具变更

## 测试

目前项目使用手动测试。未来计划添加自动化测试。

## 文档编写

所有新功能或更改都应该在文档中有相应的更新。文档使用Markdown格式。 