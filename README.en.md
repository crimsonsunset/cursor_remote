# Cursor Remote Control Project
> A solution to remotely control Cursor from your mobile phone using Supabase.

[![GitHub stars](https://img.shields.io/github/stars/terryso/cursor_remote.svg)](https://github.com/terryso/cursor_remote/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/terryso/cursor_remote/pulls)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![DeepWiki](https://img.shields.io/badge/DeepWiki-项目文档-blue)](https://deepwiki.com/terryso/cursor_remote)

[阅读中文版 (Read in Chinese)](README.md)

## 🚨 First-Time Setup Notice
If you are setting up this project for the first time, **please follow the [Database Setup Guide](docs/deployment/SETUP_DATABASE.md) to configure your Supabase database first**, otherwise the client will not be able to connect.

📖 **Quick Start**: Check [Deployment Status](docs/deployment/DEPLOYMENT_STATUS.md) to understand current deployment status and tasks.

📚 **Documentation**: See [Documentation Directory](docs/README.en.md) for complete documentation structure.

## Live Demo
[https://cursor-remote.vercel.app/](https://cursor-remote.vercel.app/)

### 🔍 **New Feature: Integrated Tavily MCP Search Service**
The demo server now includes Tavily MCP search functionality, allowing you to test real-time search capabilities directly!

**Test Suggestions**:
- Try asking: "Latest trends and breakthroughs in global AI development for 2025"
- Or: "Application cases and effectiveness analysis of quantum computing in the financial industry"
- Or: "Key technological breakthroughs of ChatGPT-5 and differences from previous generations"

The system will automatically use Tavily search to fetch the latest information and return results.

## Demo Video 🎬
> Remote control Cursor for UI automation testing

[![Watch the demo](https://img.youtube.com/vi/3SWj7X-4Gzs/0.jpg)](https://youtu.be/3SWj7X-4Gzs)

## ✨ Key Features

### 🎮 Remote Control
- **Command Sending**: Send text commands from your phone to Cursor/VS Code
- **Smart Suggestions**: Auto-completion based on command history
- **Real-time Feedback**: Live display of command execution status

### 📊 System Monitoring
- **Connection Status**: Real-time Supabase connection status display
- **System Metrics**: CPU and memory usage monitoring
- **Performance Analytics**: Response time and success rate statistics

### 📝 History Management
- **Command History**: View and manage all historical commands
- **Search & Filter**: Quickly search for specific historical commands
- **Delete Function**: Clean up unwanted history records

### 🔧 Diagnostic Tools
- **Connection Testing**: One-click Supabase connection issue detection
- **Status Dashboard**: Multi-tab detailed system information display
- **Error Diagnosis**: Automatic detection with solution suggestions

## Deploy to Vercel (Client)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fterryso%2Fcursor_remote&env=SUPABASE_URL,SUPABASE_ANON_KEY&envDescription=SUPABASE_URL%20is%20your%20Supabase%20project%20URL.%20SUPABASE_ANON_KEY%20is%20your%20Supabase%20project%20anon%20key.&project-name=cursor-remote-client&repository-name=cursor-remote-client)

Click the button above to deploy the **client** project to Vercel. You will need to provide the following environment variables for the client:

- `SUPABASE_URL`: Your Supabase project URL.
- `SUPABASE_ANON_KEY`: Your Supabase project public anonymous (anon) key.

These keys are used for the client to connect to your Supabase backend.

## Project Structure

- `server/`: Server-side code, responsible for listening to Supabase commands and controlling the target editor using AppleScript.
  - `src/services/supabaseService.js`: Main server logic, connects to Supabase and subscribes to commands.
  - `src/controllers/commandController.js`: Handles commands received from Supabase and calls AppleScript for execution.
  - `src/appleScriptRunner.js`: Module for executing AppleScript scripts.
  
- `client/`: Mobile client code (Web interface).
  - `index.html`: Web interface with command sending, history management, system monitoring features.
  - `app.js`: Client-side JavaScript code, interacts with Supabase.
  - `enhancement.js`: Enhancement module providing intelligent suggestions and data management.
  - `systemMonitor.js`: System monitoring module displaying real-time system status and performance metrics.
  - `connection-test.js`: Connection testing module for diagnosing Supabase connection issues.
  - `styles.css`: Stylesheet.
  - `env-config.js`: Contains Supabase connection configuration. **Note**: When deploying via Vercel, environment variables will take precedence over hardcoded values in this file.
  
- `scripts/`: AppleScript scripts.
  - `send_command_to_editor.scpt`: (or `send_chat.scpt` if not renamed) Script to send commands to the configured target editor.

## Important Prerequisites

- **Operating System**: This solution is tested and supported only on **macOS**.
- **Target Application**: You must have the editor you wish to control, such as **Cursor** or **Visual Studio Code**, installed on your Mac.
- **Running Status**: The **target application must be running** for AppleScript to control it.
- **Shortcut Configuration**: To ensure chat modes switch correctly, you may need to configure (or keep the default) the following shortcuts in your target editor's settings:
    - Agent Mode (e.g., for Cursor): `⌘+I`
    - Ask/Chat Mode (e.g., for Cursor): `⌘+K` or `⌘+⇧+K`
    - **VS Code**: You might need to configure shortcuts for GitHub Copilot Chat or other AI assistants to match the actions in the AppleScript.
- **Default Editor Configuration**: You can set the `DEFAULT_EDITOR` variable in the `.env` file in the project root (e.g., `DEFAULT_EDITOR=VSCode` or `DEFAULT_EDITOR=Cursor`) to specify the default editor the service controls on startup. If the command includes a `target_editor` parameter, it will take precedence.

## Supabase Database Configuration

⚠️ **Important Note**: Please follow the [Database Setup Guide](docs/deployment/SETUP_DATABASE.md) to complete detailed Supabase database configuration, including:
- Creating necessary data tables (`commands`, `results`, etc.)
- Configuring RPC functions
- Setting up Realtime subscriptions
- Configuring RLS (Row Level Security) policies

## Cursor MCP Configuration (for Result Return)

To allow Cursor to write the execution results of commands back to your Supabase project (e.g., to the `results` table), you need to configure the Supabase Message Conduit Protocol (MCP) server in Cursor's settings. This enables the client to receive feedback from Cursor.

In Cursor's MCP settings, add the following configuration:

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

**Important Note**:
- Replace `"your-supabase-access-token"` with a valid access token for your Supabase project. You can generate a personal access token on the Supabase dashboard under [Account Settings > Access Tokens](https://supabase.com/dashboard/account/tokens). This token grants the MCP server permission to write data to your Supabase database. Ensure this token has the necessary permissions to write to the `results` table (or any other table you use for results) and keep it secure.
- The MCP server (`@supabase/mcp-server-supabase`) will use this token to send results back to your Supabase instance after Cursor executes an action.

## Supported Features

### Chat Modes and Target Editors

Commands can be sent to a configured target editor (e.g., Cursor, VS Code) via AppleScript (`send_command_to_editor.scpt` or `send_chat.scpt`). Supported modes typically include:

- `agent`: Agent/General AI assistant mode (e.g., ⌘+I in Cursor)
- `chat` or `ask`: Contextual chat/ask mode (e.g., ⌘+K or ⌘+⇧+K in Cursor)

Specific shortcuts and behaviors might need adjustments based on the target editor and its AI assistant (like GitHub Copilot Chat) configuration.

When the client sends a command, it can specify the target editor via the `target_editor` field in the `raw_command` JSON object (e.g., `"target_editor": "VSCode"`) and the mode via the `chatMode` field. If `target_editor` is not specified, the server will use the `DEFAULT_EDITOR` configured in its `.env` file. If that is also not configured, it defaults to "Cursor".

## 🚀 Future Outlook: Our Roadmap

We know the possibilities for remote control extend far beyond what's currently implemented! To make this project even more powerful and beneficial for everyone, we have some exciting plans:

*   **💻 Support for More AI Editors/Assistants:** (Partially Implemented/In Progress)
    *   **Visual Studio Code (VS Code):** (Initial support) Remote control capabilities have been extended to the widely popular VS Code. Future work will focus on finer-grained editor control and task execution through its powerful APIs.
    *   **Cursor:** (Primary support) Remains a key supported editor for the project.
    *   **Deepchat:** Integrate support for Deepchat ([https://github.com/thinkinaixyz/deepchat](https://github.com/thinkinaixyz/deepchat)). As an intelligent assistant connecting powerful AI to the personal world, our goal is to allow users to interact with Deepchat remotely, leveraging its MCP (Model Controller Platform) features.
    *   **Trae and other AI Tools:** Explore and incrementally support more emerging AI code editors and development assistants, broadening the scope of remote control to cover a wider range of AI development scenarios.
*   **Feature Enhancements:**
    *   **File System Operations:** Allow remote browsing, opening, and even modification of project files.
    *   **Support for More Complex Instructions:** For example, remotely executing code snippets, running tests, controlling version management, etc.
    *   **Enhanced Bidirectional Communication:** Richer result feedback, potentially including streaming output.
*   **Usability Improvements:**
    *   **More Convenient Configuration Process:** Simplify server and client installation and setup.
    *   **More Comprehensive Error Handling and Prompts.**
*   **Security Hardening:** Continuously focus on and improve the security of data transmission and command execution.

We believe that with the collective efforts of the community, this project can connect more excellent AI tools and bring an unprecedented remote collaboration experience to everyone!

## Installation and Usage

### Server-side

1.  Navigate to the server directory:
    ```bash
    cd server
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure environment variables:
    Create a `.env` file in the project root directory (at the same level as the `server/` directory) and add the following, replacing with your actual Supabase information:
    ```env
    SUPABASE_URL=https://your-project-id.supabase.co
    SUPABASE_SERVICE_KEY=your-supabase-service-role-key
    DEFAULT_EDITOR=Cursor # Or VSCode, VSCode-Insiders, etc.
    ```
    **Important**:
    - `SUPABASE_SERVICE_KEY` is your Service Role Key, which has full access. Keep it secure and do not expose it.
    - `DEFAULT_EDITOR` (optional) specifies the default editor for the server to control. Acceptable values include `Cursor`, `VSCode`, `VSCode-Insiders`. This will be overridden if a `target_editor` is specified in the client request.

4.  Start the server:
    ```bash
    npm start 
    # Or npm run dev (uses nodemon for auto-restart)
    ```

### Client-side

1.  **Deploy via Vercel (Recommended)**:
    *   Click the "Deploy with Vercel" button at the top of this README file.
    *   In Vercel's configuration wizard, provide your `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Vercel will inject these as environment variables into your client application.

2.  **Local Configuration/Other Deployments**:
    *   If you are not deploying via Vercel, or if you need to run the client locally, modify the `client/env-config.js` file and fill in your `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
    ```javascript
    // client/env-config.js
    window.SUPABASE_URL = 'https://your-project-id.supabase.co';
    window.SUPABASE_ANON_KEY = 'your-public-anon-key';
    ```
    *   Then, you can use any static file server (like the Live Server VSCode extension, or `npx serve client/`) to run the client, or deploy it to other static hosting platforms.

## How It Works

### Core Process
1.  The mobile client (Web interface) converts user actions (like button clicks) into commands using the Supabase client library and inserts the command data into the `commands` table in the Supabase database.
2.  The server program (`server/src/services/supabaseService.js`) deployed on your computer uses Supabase Realtime to listen for new records inserted into the `commands` table with a status of 'pending'.
3.  When the server receives a new command, `commandController.js` parses the command (including determining the target editor and chat mode) and calls the corresponding AppleScript script (in the `scripts/` directory) via `appleScriptRunner.js` to control the local target editor application.
4.  The command execution status (e.g., 'completed' or 'error') and any possible error messages are updated back to the corresponding record in the `commands` table by the server.
5.  (Optional) If the command has execution results that need to be returned to the client, the server can insert the results into the `results` table. The client can listen for changes in the `results` table to receive these results.

### Enhanced Features
- **Smart Suggestions**: `enhancement.js` analyzes command history to provide auto-completion and intelligent suggestions
- **System Monitoring**: `systemMonitor.js` collects and displays real-time system performance metrics
- **Connection Diagnosis**: `connection-test.js` automatically detects connection issues and provides solutions
- **History Management**: Supports command history search, filtering, and deletion functions
- **Status Dashboard**: Multi-tab display showing overview, analytics, queue, and system information

## 📚 Documentation and Maintenance

### Documentation Structure
- [`docs/`](docs/) - Complete documentation directory
  - [`architecture/`](docs/architecture/) - System architecture documents
  - [`deployment/`](docs/deployment/) - Deployment and setup guides
  - [`fixes/`](docs/fixes/) - Issue fix documentation
  - [`testing/`](docs/testing/) - Testing guides

### Maintenance Tools
- [`scripts/maintenance/`](scripts/maintenance/) - Maintenance scripts
  - `check-status.sh` - System status checker
  - `fix-db.sh` - Database repair tool

### Project Reports
- [Functionality Completion Report](docs/FUNCTIONALITY_COMPLETION_REPORT.md) - Project completion status
- [Cleanup Report](docs/CLEANUP_REPORT.md) - Code cleanup details
- [Final Solution](docs/FINAL_SOLUTION.md) - Key issue solutions

## License

This project is licensed under the [MIT License](LICENSE).