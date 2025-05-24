# Cursor远程控制项目
> 通过 Supabase 实现手机远程控制 Cursor 的解决方案。

## 🚨 首次使用须知
如果您是第一次设置此项目，**请先按照 [数据库设置指南](docs/deployment/SETUP_DATABASE.md) 配置Supabase数据库**，否则客户端将无法连接。

📖 **快速开始**: 查看 [部署状态](docs/deployment/DEPLOYMENT_STATUS.md) 了解当前部署状态和待办事项。

📚 **文档导航**: 查看 [文档目录](docs/README.md) 了解完整的文档结构。

[![GitHub stars](https://img.shields.io/github/stars/terryso/cursor_remote.svg)](https://github.com/terryso/cursor_remote/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/terryso/cursor_remote/pulls)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![DeepWiki](https://img.shields.io/badge/DeepWiki-项目文档-blue)](https://deepwiki.com/terryso/cursor_remote)

[Read this in English](README.en.md)

## Demo 体验
[https://cursor-remote.vercel.app/](https://cursor-remote.vercel.app/)

## 演示视频 🎬
> 远程控制 Cursor 进行UI自动化测试

[![Watch the demo](https://img.youtube.com/vi/3SWj7X-4Gzs/0.jpg)](https://youtu.be/3SWj7X-4Gzs)

## ✨ 主要功能

### 🎮 远程控制
- **命令发送**: 通过手机发送文本命令到 Cursor/VS Code
- **智能建议**: 基于历史记录的命令自动补全
- **实时反馈**: 命令执行状态实时显示

### 📊 系统监控
- **连接状态**: 实时显示 Supabase 连接状态
- **系统指标**: CPU、内存使用率监控
- **性能分析**: 响应时间和成功率统计

### 📝 历史管理
- **命令历史**: 查看和管理所有历史命令
- **搜索过滤**: 快速搜索特定的历史命令
- **删除功能**: 清理不需要的历史记录

### 🔧 诊断工具
- **连接测试**: 一键检测 Supabase 连接问题
- **状态仪表盘**: 多标签页显示详细系统信息
- **错误诊断**: 自动检测并提供解决方案

## 一键部署到 Vercel (客户端)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fterryso%2Fcursor_remote&env=SUPABASE_URL,SUPABASE_ANON_KEY&envDescription=SUPABASE_URL%20is%20your%20Supabase%20project%20URL.%20SUPABASE_ANON_KEY%20is%20your%20Supabase%20project%20anon%20key.&project-name=cursor-remote-client&repository-name=cursor-remote-client)

点击上面的按钮将 **客户端** 项目部署到 Vercel。您需要为客户端提供以下环境变量：

- `SUPABASE_URL`: 您的 Supabase 项目 URL。
- `SUPABASE_ANON_KEY`: 您的 Supabase 项目公开匿名 (public anon) 密钥。

这些密钥用于客户端连接到您的 Supabase 后端。

## 项目结构

- `server/`: 服务器端代码，负责监听 Supabase 命令并使用 AppleScript 控制目标编辑器。
  - `src/services/supabaseService.js`: 主服务器逻辑，连接到 Supabase 并订阅命令。
  - `src/controllers/commandController.js`: 处理从 Supabase 接收到的命令并调用 AppleScript 执行。
  - `src/appleScriptRunner.js`: 执行 AppleScript 脚本的模块。
  
- `client/`: 手机客户端代码 (Web 界面)。
  - `index.html`: Web 界面，包含命令发送、历史管理、系统监控等功能。
  - `app.js`: 客户端 JavaScript 代码，与 Supabase 交互。
  - `enhancement.js`: 增强功能模块，提供智能建议和数据管理。
  - `systemMonitor.js`: 系统监控模块，实时显示系统状态和性能指标。
  - `connection-test.js`: 连接测试模块，诊断 Supabase 连接问题。
  - `styles.css`: 样式表。
  - `env-config.js`: 包含 Supabase 连接配置。**注意**: 通过 Vercel 部署时，环境变量会优先于此文件中的硬编码值。
  
- `scripts/`: AppleScript 脚本。
  - `send_command_to_editor.scpt`: (或 `send_chat.scpt` 如果未重命名) 发送命令到配置的目标编辑器的脚本。

## 重要前提条件

- **操作系统**: 此解决方案仅在 **macOS** 上经过测试和支持。
- **目标应用程序**: 您的 Mac 上必须已安装您希望控制的编辑器，例如 **Cursor** 或 **Visual Studio Code**。
- **运行状态**: 为了使 AppleScript 能够控制目标编辑器，**该应用程序必须正在运行**。
- **快捷键配置**: 为确保聊天模式能正确切换，您可能需要在目标编辑器的设置中配置（或保留默认的）以下快捷键：
    - Agent 模式 (例如 Cursor): `⌘+I`
    - Ask/Chat 模式 (例如 Cursor): `⌘+K` 或 `⌘+⇧+K`
    - **VS Code**: 您可能需要配置 GitHub Copilot Chat 或其他 AI 助手的快捷键以匹配 AppleScript 中的操作。
- **默认编辑器配置**: 您可以在项目根目录的 `.env` 文件中设置 `DEFAULT_EDITOR` 变量 (例如 `DEFAULT_EDITOR=VSCode` 或 `DEFAULT_EDITOR=Cursor`) 来指定服务启动时默认控制的编辑器。如果命令中包含 `target_editor` 参数，则会优先使用该参数指定的编辑器。

## Supabase 配置

您需要在您的 Supabase 项目中进行以下配置：

1.  **数据库表**:
    *   创建 `commands` 和 `results` 表。以下是推荐的 SQL DDL 语句：

        ```sql
        CREATE TABLE public.commands (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at TIMESTAMPTZ DEFAULT now(),
            command_text TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            user_id UUID,
            raw_command JSONB,
            attempts INTEGER DEFAULT 0,
            last_error TEXT
        );

        COMMENT ON COLUMN public.commands.id IS '主键，唯一标识';
        COMMENT ON COLUMN public.commands.created_at IS '创建时间戳';
        COMMENT ON COLUMN public.commands.command_text IS '命令内容 (用户输入的自然语言)';
        COMMENT ON COLUMN public.commands.status IS '命令状态 (''pending'', ''processing'', ''completed'', ''error'')';
        COMMENT ON COLUMN public.commands.user_id IS '(可选) 用户标识';
        COMMENT ON COLUMN public.commands.raw_command IS '(可选) 结构化的原始命令数据';
        COMMENT ON COLUMN public.commands.attempts IS '(可选) 重试次数';
        COMMENT ON COLUMN public.commands.last_error IS '(可选) 最后一次错误信息';

        CREATE TABLE public.results (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at TIMESTAMPTZ DEFAULT now(),
            command_id UUID NOT NULL REFERENCES public.commands(id),
            result_text TEXT,
            error_message TEXT,
            is_error BOOLEAN NOT NULL DEFAULT FALSE,
            raw_result JSONB
        );

        COMMENT ON COLUMN public.results.id IS '主键，唯一标识';
        COMMENT ON COLUMN public.results.created_at IS '创建时间戳';
        COMMENT ON COLUMN public.results.command_id IS '关联的commands表中的指令ID';
        COMMENT ON COLUMN public.results.result_text IS '执行结果内容 (Cursor的直接输出)';
        COMMENT ON COLUMN public.results.error_message IS '错误信息 (如果发生错误)';
        COMMENT ON COLUMN public.results.is_error IS '标记是否为错误结果';
        COMMENT ON COLUMN public.results.raw_result IS '(可选) 结构化的原始结果数据';
        ```

2.  **实时 (Realtime)**:
    *   确保为 `commands` 表和 `results` 表启用了 Supabase Realtime。服务器将监听 `commands` 表的插入事件，客户端可能监听 `results` 表的插入事件。

3.  **RLS (Row Level Security) 策略**:
    *   **`commands` 表**:
        *   客户端应具有写入 (`INSERT`) 权限。
        *   服务器（使用 `SERVICE_KEY`）应具有读取 (`SELECT`) 和更新 (`UPDATE`) 权限。
    *   **`results` 表**:
        *   服务器（使用 `SERVICE_KEY`）应具有写入 (`INSERT`) 权限。
        *   客户端应具有读取 (`SELECT`) 权限，通常基于与其发送的命令相关联的 `command_id`。
    *   请根据您的安全需求配置适当的 RLS 策略。

## Cursor MCP 配置 (用于结果返回)

为了让 Cursor 能够将执行的命令结果写回到您的 Supabase 项目 (例如，写入 `results` 表)，您需要在 Cursor 的设置中配置 Supabase 的MCP服务器。这样，客户端才能接收到来自 Cursor 的反馈。

在 Cursor 的 MCP 设置中，添加以下配置：

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--access-token",
        "your-supabase-access-token"
      ]
    }
  }
}
```

**重要提示**: 
- 将 `"your-supabase-access-token"` 替换为您 Supabase 项目的有效访问令牌。您可以在 Supabase 控制面板的 [账户设置 > Access Tokens](https://supabase.com/dashboard/account/tokens) 页面生成个人访问令牌。此令牌将授予 MCP 服务器向您的 Supabase 数据库写入数据的权限。请确保此令牌具有写入 `results` 表（或您用于存储结果的任何其他表）的必要权限，并妥善保管。
- MCP 服务器 (`@supabase/mcp-server-supabase`) 会在 Cursor 执行动作后，使用此令牌将结果发送回您的 Supabase 实例。

## 支持的功能

### 聊天模式与目标编辑器

通过 AppleScript (`send_command_to_editor.scpt` 或 `send_chat.scpt`) 支持向配置的目标编辑器（如 Cursor, VS Code）发送命令。支持的模式通常包括：

- `agent`: Agent/通用AI助手模式 (例如 Cursor 中的 ⌘+I)
- `chat` 或 `ask`: 上下文聊天/提问模式 (例如 Cursor 中的 ⌘+K 或 ⌘+⇧+K)

具体的快捷键和行为可能需要根据目标编辑器及其AI助手（如 GitHub Copilot Chat）的配置进行调整。

客户端发送命令时，可以在 `raw_command` JSON 对象中通过 `target_editor` 字段指定目标编辑器 (例如 `"target_editor": "VSCode"`)，并通过 `chatMode` 字段指定模式。如果未指定 `target_editor`，则会使用服务器端 `.env` 文件中配置的 `DEFAULT_EDITOR`，如果 `.env` 中也未配置，则默认为 "Cursor"。

## 🚀 未来展望：我们的 Roadmap

我们深知，远程控制的可能性远不止于此！为了让这个项目更加强大和普惠，我们有以下激动人心的计划：

*   **💻 支持更多 AI 编辑器/助手：**
    *   **Visual Studio Code (VS Code):** 将远程控制能力扩展到广受欢迎的 VS Code，通过其强大的 API 实现更精细的编辑器控制和任务执行。
    *   **Deepchat:** 集成对 Deepchat ([https://github.com/thinkinaixyz/deepchat](https://github.com/thinkinaixyz/deepchat)) 的支持。Deepchat 作为一个智能助手，连接了强大的AI与个人世界，我们的目标是让用户也能远程与 Deepchat 互动，利用其 MCP（Model Controller Platform）的特性。
    *   **Trae 及其他 AI 工具:** 探索并逐步支持更多新兴的 AI 代码编辑器和开发助手，让远程控制覆盖更广泛的 AI 开发场景。
*   **功能增强：**
    *   **文件系统操作：** 允许远程浏览、打开、甚至修改项目文件。
    *   **更复杂的指令支持：** 例如，远程执行代码片段、运行测试、控制版本管理等。
    *   **双向通信增强：** 更丰富的结果反馈，甚至支持流式输出。
*   **易用性提升：**
    *   **更便捷的配置流程：** 简化服务器和客户端的安装配置。
    *   **更完善的错误处理和提示。**
*   **安全性强化：** 持续关注并提升数据传输和指令执行的安全性。

我们相信，通过社区的共同努力，这个项目将能连接更多优秀的AI工具，为大家带来前所未有的远程协作体验！

## 安装与使用

### 服务器端

1.  进入服务器目录:
    ```bash
    cd server
    ```
2.  安装依赖:
    ```bash
    npm install
    ```
3.  配置环境变量:
    在 `server/` 目录的同级，即项目根目录下创建一个 `.env` 文件，并添加以下内容，替换为您的实际 Supabase 信息:
    ```env
    SUPABASE_URL=https://your-project-id.supabase.co
    SUPABASE_SERVICE_KEY=your-supabase-service-role-key
    DEFAULT_EDITOR=Cursor # 或 VSCode, VSCode-Insiders 等
    ```
    **重要**: 
    - `SUPABASE_SERVICE_KEY` 是您的服务角色密钥 (Service Role Key)，具有完全访问权限，请妥善保管，不要泄露。
    - `DEFAULT_EDITOR` (可选) 用于指定服务器默认控制的编辑器。可接受的值包括 `Cursor`, `VSCode`, `VSCode-Insiders`。如果客户端请求中指定了 `target_editor`，则会覆盖此默认值。

4.  启动服务器:
    ```bash
    npm start 
    # 或者 npm run dev (使用 nodemon 自动重启)
    ```

### 客户端

1.  **通过 Vercel 部署 (推荐)**:
    *   点击本 README 文件顶部的 "Deploy with Vercel" 按钮。
    *   在 Vercel 的配置向导中，提供您的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`。Vercel 会将这些作为环境变量注入到您的客户端应用中。

2.  **本地配置/其他部署**:
    *   如果您不通过 Vercel 部署，或者需要在本地运行客户端，请修改 `client/env-config.js` 文件，填入您的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`。
    ```javascript
    // client/env-config.js
    window.SUPABASE_URL = 'https://your-project-id.supabase.co';
    window.SUPABASE_ANON_KEY = 'your-public-anon-key';
    ```
    *   然后，您可以使用任何静态文件服务器（如 Live Server VScode 插件，或 `npx serve client/`）来运行客户端，或者将其部署到其他静态托管平台。

## 工作原理

### 核心流程
1.  手机客户端 (Web 界面) 通过 Supabase 客户端库将用户操作（如点击按钮）转换为命令，并将命令数据插入到 Supabase 数据库的 `commands` 表中。
2.  部署在您电脑上的服务器程序 (`server/src/services/supabaseService.js`) 使用 Supabase Realtime 功能实时监听 `commands` 表中状态为 'pending' 的新插入记录。
3.  当服务器接收到新命令后，`commandController.js` 解析命令（包括确定目标编辑器和聊天模式）并通过 `appleScriptRunner.js` 调用相应的 AppleScript 脚本 (`scripts/` 目录下的 `.scpt` 文件) 来控制本机的目标编辑器应用。
4.  命令执行状态（如 'completed' 或 'error'）以及可能的错误信息会由服务器更新回 `commands` 表中对应的记录。
5.  (可选) 如果命令有执行结果需要返回给客户端，服务器可以将结果插入到 `results` 表中。客户端可以监听 `results` 表的变化以接收这些结果。

### 增强功能
- **智能建议**: `enhancement.js` 分析历史命令，提供自动补全和智能建议
- **系统监控**: `systemMonitor.js` 实时收集和显示系统性能指标
- **连接诊断**: `connection-test.js` 自动检测连接问题并提供解决方案
- **历史管理**: 支持命令历史搜索、过滤和删除功能
- **状态仪表盘**: 多标签页展示概览、分析、队列和系统信息

## 📚 文档和维护

### 文档结构
- [`docs/`](docs/) - 完整文档目录
  - [`architecture/`](docs/architecture/) - 系统架构文档
  - [`deployment/`](docs/deployment/) - 部署和设置指南
  - [`fixes/`](docs/fixes/) - 问题修复文档
  - [`testing/`](docs/testing/) - 测试指南

### 维护工具
- [`scripts/maintenance/`](scripts/maintenance/) - 维护脚本
  - `check-status.sh` - 系统状态检查
  - `fix-db.sh` - 数据库修复工具

### 项目报告
- [功能完成报告](docs/FUNCTIONALITY_COMPLETION_REPORT.md) - 项目完成状态
- [清理报告](docs/CLEANUP_REPORT.md) - 代码清理详情
- [最终解决方案](docs/FINAL_SOLUTION.md) - 关键问题解决方案

## License

本项根据 [MIT License](LICENSE) 授权。
