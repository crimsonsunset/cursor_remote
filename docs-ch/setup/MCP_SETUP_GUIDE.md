# 🔧 Cursor MCP 设置指南

*完整指南：为 Cursor Remote 启用 AI 响应日志记录*

## 为什么需要这个？

目前，你的 Cursor Remote 系统工作方式如下：
- ✅ **手机** → **数据库** → **服务器** → **Cursor** ✅
- ❌ **Cursor AI 响应** → **数据库** → **手机** ❌

**没有 MCP**：AI 响应只在 Cursor 中显示，不会出现在你的手机上。  
**有了 MCP**：AI 响应会记录回 Supabase 并显示在你的手机上！

---

## 🚀 快速设置（5分钟）

### 步骤 1：获取你的 Supabase 访问令牌

1. **访问**：[Supabase Dashboard → Account → Access Tokens](https://supabase.com/dashboard/account/tokens)
2. **点击**："Generate new token"
3. **名称**："Cursor Remote MCP"
4. **权限范围**：保留默认设置（或选择全部）
5. **复制令牌**（看起来像：`sbp_abc123...`）

### 步骤 2：找到 Cursor MCP 设置

**选项 A：通过设置 UI**
1. 打开 Cursor：`⌘+,`（Mac）或 `Ctrl+,`（Windows）
2. 搜索："mcp"
3. 查找："MCP Servers" 或 "Model Context Protocol"

**选项 B：直接编辑文件**
- **macOS**：`~/Library/Application Support/Cursor/User/settings.json`  
- **Windows**：`%APPDATA%\Cursor\User\settings.json`
- **Linux**：`~/.config/Cursor/User/settings.json`

### 步骤 3：添加 MCP 配置

将以下内容添加到你的 Cursor 设置中：

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--access-token",
        "your-token-here"
      ]
    }
  }
}
```

**将 `your-token-here` 替换为你的实际 Supabase 令牌！**

### 步骤 4：测试设置

1. **完全重启 Cursor**
2. **从手机发送测试命令**："hello mcp test"
3. **检查结果**： 
   - 在 Supabase 中：转到 `results` 表 → 应该看到 AI 响应
   - 在手机上：应该看到 AI 响应出现

---

## 🔍 故障排除

### "MCP Server Failed to Start"
- **检查令牌**：确保它以 `sbp_` 开头
- **检查网络**：MCP 在首次运行时会下载包
- **重启 Cursor**：完全关闭并重新打开

### "No Response Logged"
- **验证命令有效**：检查 Cursor 是否接收到命令
- **检查数据库权限**：令牌需要读写权限
- **手动测试**：尝试发送简单命令如 "test"

### "Command Not Found: npx"
- **安装 Node.js**：[nodejs.org](https://nodejs.org/)
- **重启 Cursor**：Node.js 安装后
- **替代方案**：在配置中使用 npx 的完整路径

---

## 📊 高级配置

### 多个 MCP 服务
```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--access-token",
        "your-supabase-token"
      ]
    },
    "python": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-python@latest"
      ]
    }
  }
}
```

### 环境变量（替代方案）
```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest"
      ],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "your-token-here"
      }
    }
  }
}
```

---

## ✅ 成功指标

正常工作时，你会看到：
- 🟢 **Cursor**：底部栏中显示 MCP 服务器状态
- 🟢 **数据库**：`results` 表中有新行
- 🟢 **手机**：AI 响应出现在 Web 界面中
- 🟢 **日志**：服务器显示 "Result logged successfully"

## 📚 更多资源

- **Supabase MCP 文档**：[supabase.com/docs/guides/getting-started/mcp](https://supabase.com/docs/guides/getting-started/mcp)
- **MCP 协议**：[modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Cursor MCP**：[cursor.sh/docs/mcp](https://cursor.sh/docs/mcp)

---

**需要帮助？** 查看[主要故障排除指南](../troubleshooting/COMMON_ISSUES.md)或[提交问题](https://github.com/crimsonsunset/cursor_remote/issues)。
