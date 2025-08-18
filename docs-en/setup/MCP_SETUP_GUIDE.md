# 🔧 Cursor MCP Setup Guide

*Complete guide to enable AI response logging for Cursor Remote*

## Why Do You Need This?

Currently, your Cursor Remote system works like this:
- ✅ **Phone** → **Database** → **Server** → **Cursor** ✅
- ❌ **Cursor AI Response** → **Database** → **Phone** ❌

**Without MCP**: AI responses only appear in Cursor, not your phone.  
**With MCP**: AI responses get logged back to Supabase and appear on your phone!

---

## 🚀 Quick Setup (5 minutes)

### Step 1: Get Your Supabase Access Token

1. **Visit**: [Supabase Dashboard → Account → Access Tokens](https://supabase.com/dashboard/account/tokens)
2. **Click**: "Generate new token"
3. **Name**: "Cursor Remote MCP"
4. **Scopes**: Leave defaults (or select all)
5. **Copy the token** (looks like: `sbp_abc123...`)

### Step 2: Find Cursor MCP Settings

**Option A: Through Settings UI**
1. Open Cursor: `⌘+,` (Mac) or `Ctrl+,` (Windows)
2. Search: "mcp"
3. Look for: "MCP Servers" or "Model Context Protocol"

**Option B: Direct File Edit**
- **macOS**: `~/Library/Application Support/Cursor/User/settings.json`  
- **Windows**: `%APPDATA%\Cursor\User\settings.json`
- **Linux**: `~/.config/Cursor/User/settings.json`

### Step 3: Add MCP Configuration

Add this to your Cursor settings:

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

**Replace `your-token-here`** with your actual Supabase token!

### Step 4: Test the Setup

1. **Restart Cursor** completely
2. **Send test command** from your phone: "hello mcp test"
3. **Check results**: 
   - In Supabase: Go to `results` table → should see AI response
   - On phone: Should see the AI response appear

---

## 🔍 Troubleshooting

### "MCP Server Failed to Start"
- **Check token**: Make sure it starts with `sbp_`
- **Check internet**: MCP downloads packages on first run
- **Restart Cursor**: Close completely and reopen

### "No Response Logged"
- **Verify command worked**: Check Cursor received the command
- **Check database permissions**: Token needs read/write access
- **Test manually**: Try sending a simple command like "test"

### "Command Not Found: npx"
- **Install Node.js**: [nodejs.org](https://nodejs.org/)
- **Restart Cursor**: After Node.js installation
- **Alternative**: Use full path to npx in config

---

## 📊 Advanced Configuration

### Multiple MCP Services
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

### Environment Variables (Alternative)
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

## ✅ Success Indicators

When working correctly, you'll see:
- 🟢 **Cursor**: MCP server status in bottom bar
- 🟢 **Database**: New rows in `results` table
- 🟢 **Phone**: AI responses appear in web interface
- 🟢 **Logs**: Server shows "Result logged successfully"

## 📚 More Resources

- **Supabase MCP Docs**: [supabase.com/docs/guides/getting-started/mcp](https://supabase.com/docs/guides/getting-started/mcp)
- **MCP Protocol**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Cursor MCP**: [cursor.sh/docs/mcp](https://cursor.sh/docs/mcp)

---

**Need help?** Check the [main troubleshooting guide](../troubleshooting/COMMON_ISSUES.md) or [file an issue](https://github.com/crimsonsunset/cursor_remote/issues).
