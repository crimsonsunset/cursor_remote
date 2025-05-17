# Cursor Remote Control Project

[阅读中文版 (Read in Chinese)](README.md)

A solution to remotely control Cursor from your mobile phone using Supabase.

## Deploy to Vercel (Client)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fterryso%2Fcursor_remote&env=SUPABASE_URL,SUPABASE_ANON_KEY&envDescription=SUPABASE_URL%20is%20your%20Supabase%20project%20URL.%20SUPABASE_ANON_KEY%20is%20your%20Supabase%20project%20anon%20key.&project-name=cursor-remote-client&repository-name=cursor-remote-client)

Click the button above to deploy the **client** project to Vercel. You will need to provide the following environment variables for the client:

- `SUPABASE_URL`: Your Supabase project URL.
- `SUPABASE_ANON_KEY`: Your Supabase project public anonymous (anon) key.

These keys are used for the client to connect to your Supabase backend.

## Project Structure

- `server/`: Server-side code, responsible for listening to Supabase commands and controlling Cursor using AppleScript.
  - `src/services/supabaseService.js`: Main server logic, connects to Supabase and subscribes to commands.
  - `src/controllers/commandController.js`: Handles commands received from Supabase and calls AppleScript for execution.
  - `src/appleScriptRunner.js`: Module for executing AppleScript scripts.
  
- `client/`: Mobile client code (Web interface).
  - `index.html`: Web interface.
  - `app.js`: Client-side JavaScript code, interacts with Supabase.
  - `styles.css`: Stylesheet.
  - `env-config.js`: Contains Supabase connection configuration. **Note**: When deploying via Vercel, environment variables will take precedence over hardcoded values in this file.
  
- `scripts/`: AppleScript scripts.
  - `send_chat.scpt`: Script to send chat messages to Cursor.

## Important Prerequisites

- **Operating System**: This solution is tested and supported only on **macOS**.
- **Application**: You must have the **Cursor** application installed on your Mac.
- **Running Status**: The **Cursor application must be running** for AppleScript to control it.
- **Shortcut Configuration**: To ensure chat modes switch correctly, you must configure (or keep the default) the following shortcuts in Cursor's settings:
    - Agent Mode: `⌘+I`
    - Ask Mode: `⌘+⇧+K`

## Supabase Configuration

You need to perform the following configurations in your Supabase project:

1.  **Database Tables**:
    *   Create the `commands` and `results` tables. Below are the recommended SQL DDL statements:

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

        COMMENT ON COLUMN public.commands.id IS 'Primary key, unique identifier';
        COMMENT ON COLUMN public.commands.created_at IS 'Creation timestamp';
        COMMENT ON COLUMN public.commands.command_text IS 'Command content (natural language from user)';
        COMMENT ON COLUMN public.commands.status IS 'Command status (e.g., ''pending'', ''processing'', ''completed'', ''error'')';
        COMMENT ON COLUMN public.commands.user_id IS 'User identifier (optional)';
        COMMENT ON COLUMN public.commands.raw_command IS 'Structured raw command data (optional)';
        COMMENT ON COLUMN public.commands.attempts IS 'Retry attempts (optional)';
        COMMENT ON COLUMN public.commands.last_error IS 'Last error message (optional)';

        CREATE TABLE public.results (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at TIMESTAMPTZ DEFAULT now(),
            command_id UUID NOT NULL REFERENCES public.commands(id),
            result_text TEXT,
            error_message TEXT,
            is_error BOOLEAN NOT NULL DEFAULT FALSE,
            raw_result JSONB
        );

        COMMENT ON COLUMN public.results.id IS 'Primary key, unique identifier';
        COMMENT ON COLUMN public.results.created_at IS 'Creation timestamp';
        COMMENT ON COLUMN public.results.command_id IS 'Associated command ID from the commands table';
        COMMENT ON COLUMN public.results.result_text IS 'Execution result content (direct output from Cursor)';
        COMMENT ON COLUMN public.results.error_message IS 'Error message (if an error occurred)';
        COMMENT ON COLUMN public.results.is_error IS 'Flag indicating if it is an error result';
        COMMENT ON COLUMN public.results.raw_result IS 'Structured raw result data (optional)';
        ```

2.  **Realtime**:
    *   Ensure Supabase Realtime is enabled for the `commands` and `results` tables. The server will listen for insert events on the `commands` table, and the client might listen for insert events on the `results` table.

3.  **RLS (Row Level Security) Policies**:
    *   **`commands` Table**:
        *   The client should have `INSERT` permission.
        *   The server (using `SERVICE_KEY`) should have `SELECT` and `UPDATE` permissions.
    *   **`results` Table**:
        *   The server (using `SERVICE_KEY`) should have `INSERT` permission.
        *   The client should have `SELECT` permission, usually based on the `command_id` associated with the command they sent.
    *   Configure appropriate RLS policies according to your security needs.

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

### Chat Modes

The following chat modes are supported via `send_chat.scpt`:

- `agent`: Agent mode (Shortcut: ⌘+I) - **Default mode**
- `ask`: Ask mode (Shortcut: ⌘+⇧+K)

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
    ```
    **Important**: `SUPABASE_SERVICE_KEY` is your Service Role Key, which has full access. Keep it secure and do not expose it.

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

1.  The mobile client (Web interface) converts user actions (like button clicks) into commands using the Supabase client library and inserts the command data into the `commands` table in the Supabase database.
2.  The server program (`server/src/services/supabaseService.js`) deployed on your computer uses Supabase Realtime to listen for new records inserted into the `commands` table with a status of 'pending'.
3.  When the server receives a new command, `commandController.js` parses the command and calls the corresponding AppleScript script (in the `scripts/` directory) via `appleScriptRunner.js` to control the local Cursor application.
4.  The command execution status (e.g., 'completed' or 'error') and any possible error messages are updated back to the corresponding record in the `commands` table by the server.
5.  (Optional) If the command has execution results that need to be returned to the client, the server can insert the results into the `results` table. The client can listen for changes in the `results` table to receive these results.

## License

This project is licensed under the [MIT License](LICENSE). 