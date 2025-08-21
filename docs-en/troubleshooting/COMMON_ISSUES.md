# 🔧 Common Issues & Troubleshooting Guide

*Complete troubleshooting guide for CursorRemote setup and operation*

## 🎯 Quick Diagnosis

### System Status Check
Run these commands to quickly identify issues:

```bash
# 1. Check if services are running
ps aux | grep -E "(python.*8080|node.*supabase)" | grep -v grep

# 2. Test client connection
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080

# 3. Check environment files
ls -la .env client/env-config.js

# 4. Test database connection (in browser console on localhost:8080)
supabaseClient.rpc('get_system_status')
```

---

## 🚨 Critical Setup Issues

### ❌ "Database Functions Not Found" (404 Errors)

**Symptoms:**
- Client shows "disconnected" status (red dot)
- Browser console: "function get_system_status does not exist"
- Error: "Could not find the function public.submit_command"
- Error: "column \"commands.created_at\" must appear in the GROUP BY clause"

**Root Cause:** Database functions weren't created or have SQL syntax errors (including GROUP BY aggregation issues)

**Solution:**
1. **Use the corrected SQL** from [Database Setup Guide](../deployment/SETUP_DATABASE.md) section 3.1
2. **Create functions manually** in Supabase SQL Editor:

```sql
-- Critical: Fixed submit_command function
CREATE OR REPLACE FUNCTION submit_command(
  p_command_text TEXT,
  p_user_id TEXT DEFAULT 'anonymous'
)
RETURNS JSON AS $$
DECLARE
  new_command_id UUID;
  result JSON;
BEGIN
  INSERT INTO commands (command_text, status)
  VALUES (p_command_text, 'pending')
  RETURNING id INTO new_command_id;
  
  INSERT INTO command_metrics (command_id, command_length, success, created_at)
  VALUES (new_command_id, LENGTH(p_command_text), false, NOW());
  
  SELECT json_build_object(
    'success', true,
    'command_id', new_command_id,
    'message', 'Command submitted successfully',
    'timestamp', NOW()
  ) INTO result;
  
  RETURN result;
EXCEPTION
  WHEN others THEN
    SELECT json_build_object(
      'success', false,
      'error', SQLERRM,
      'message', 'Failed to submit command'
    ) INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql;
```

3. **Test the functions**:
```sql
-- Test command submission
SELECT submit_command('test setup verification');

-- Test system status (should not have GROUP BY errors)
SELECT get_system_status();

-- Test queue status  
SELECT get_queue_status();

-- Verify all functions work
SELECT 'All functions verified' as status;
```

### ❌ Environment Variables Not Configured

**Symptoms:**
- Server won't start: "SUPABASE_URL is not defined"
- Client shows placeholder URLs
- Connection timeouts

**Root Cause:** Missing or incorrectly configured environment files

**Solution:**

1. **Create `.env` in project root** (not in server/ folder):
```env
SUPABASE_URL=https://nsiwmzgenkrmgllwqizd.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here
SUPABASE_PROJECT_ID=nsiwmzgenkrmgllwqizd
DEFAULT_EDITOR=Cursor
ENABLE_HEARTBEAT_CHECK=false
```

2. **Update `client/env-config.js`**:
```javascript
window.SUPABASE_URL = "https://nsiwmzgenkrmgllwqizd.supabase.co";
window.SUPABASE_ANON_KEY = "your-anon-key-here";
```

3. **Get your keys from Supabase Dashboard**:
   - Go to Settings → API
   - **anon key**: For client (safe to expose)
   - **service_role key**: For server (keep secret!)

### ❌ Supabase Client Not Initializing

**Symptoms:**
- Browser console: "supabaseClient is not defined"
- Functions return "undefined"
- No error messages in console

**Root Cause:** Supabase SDK not loading or configuration issue

**Manual Fix (in browser console):**
```javascript
// Test if Supabase SDK is loaded
console.log('Supabase available:', typeof supabase !== 'undefined');

// Manually initialize if needed
if (typeof supabaseClient === 'undefined') {
  window.supabaseClient = supabase.createClient(
    window.SUPABASE_URL, 
    window.SUPABASE_ANON_KEY
  );
  console.log('✅ Manually initialized Supabase client');
}
```

---

## ⚠️ Service Issues

### 🔴 Server Won't Start

**Symptoms:**
- "Module not found" errors
- "Cannot read property" errors
- Process exits immediately

**Solutions:**

1. **Install dependencies**:
```bash
cd server && npm install
```

2. **Check Node.js version**:
```bash
node --version  # Should be 14+ 
```

3. **Test minimal connection**:
```bash
cd server && node -e "console.log('Node works')"
```

4. **Run with debugging**:
```bash
cd server && DEBUG=* node src/services/supabaseService.js
```

### 🔴 Client Won't Load (HTTP Server Issues)

**Symptoms:**
- "Connection refused" at localhost:8080
- Blank page when opening browser
- 404 errors for all resources

**Solutions:**

1. **Check if port is in use**:
```bash
lsof -i :8080  # Kill any conflicting processes
```

2. **Try alternative server**:
```bash
cd client && python3 -m http.server 8081 --directory .
```

3. **Test basic HTTP**:
```bash
curl -I http://localhost:8080  # Should return 200 OK
```

---

## 🐛 Runtime Issues

### ⚡ Commands Not Reaching Cursor

**Symptoms:**
- Commands appear in database but not in Cursor
- AppleScript errors in server logs
- "Permission denied" for automation

**Solutions:**

1. **Grant automation permissions**:
   - System Preferences → Security & Privacy → Privacy
   - Add Terminal/Node to "Automation" permissions
   - Allow control of Cursor

2. **Test AppleScript manually**:
```bash
osascript -e 'tell application "Cursor" to activate'
```

3. **Check Cursor is running**:
```bash
ps aux | grep -i cursor | grep -v grep
```

### ⚡ AI Responses Not Logging Back

**Symptoms:**
- Commands work in Cursor
- No entries in `results` table
- MCP errors in Cursor

**Prerequisites:**
1. **MCP Setup**: Follow [MCP Setup Guide](../setup/MCP_SETUP_GUIDE.md)
2. **Supabase Token**: Get personal access token (not API key)
3. **Cursor Restart**: After MCP configuration

**Test MCP Connection:**
- Send command from phone with special format
- Check if command gets special `IMPORTANT INSTRUCTION` in Cursor
- Verify MCP tools are available in Cursor

---

## 🔍 Debugging Tools

### Browser Console Testing
```javascript
// Test basic Supabase connection
console.log('Client status:', supabaseClient);

// Test core functions
supabaseClient.rpc('submit_command', {
  p_command_text: 'debug test'
}).then(r => console.log('✅ Submit:', r.data))
  .catch(e => console.error('❌ Submit:', e));

// Test system status
supabaseClient.rpc('get_system_status')
  .then(r => console.log('✅ Status:', r.data))
  .catch(e => console.error('❌ Status:', e));

// Check queue
supabaseClient.rpc('get_queue_status')
  .then(r => console.log('✅ Queue:', r.data))
  .catch(e => console.error('❌ Queue:', e));
```

### SQL Debugging
```sql
-- Check system health
SELECT 
  (SELECT COUNT(*) FROM commands) as total_commands,
  (SELECT COUNT(*) FROM commands WHERE status = 'pending') as pending,
  (SELECT COUNT(*) FROM results) as total_results,
  (SELECT MAX(created_at) FROM commands) as last_command;

-- Test function directly
SELECT submit_command('SQL debug test');

-- Check recent activity
SELECT * FROM commands ORDER BY created_at DESC LIMIT 5;
SELECT * FROM results ORDER BY created_at DESC LIMIT 5;
```

### System Status Script
```bash
#!/bin/bash
echo "=== CursorRemote System Status ==="

echo "1. Services:"
ps aux | grep -E "(python.*8080|node.*supabase)" | grep -v grep || echo "No services running"

echo -e "\n2. Environment:"
ls -la .env client/env-config.js 2>/dev/null || echo "Environment files missing"

echo -e "\n3. Client HTTP:"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8080 || echo "Client not accessible"

echo -e "\n4. Recent logs:"
tail -10 server/logs/*.log 2>/dev/null || echo "No server logs found"
```

---

## 📞 Getting Help

### Before Asking for Help

1. **Run the system status script** above
2. **Check browser console** for JavaScript errors
3. **Test database functions** directly in Supabase SQL Editor
4. **Verify environment configuration** files

### Include This Information

```
**System Info:**
- OS: [macOS/Windows/Linux]
- Node.js: [version]
- Browser: [Chrome/Safari/Firefox]

**Error Details:**
- Exact error message
- Browser console logs
- Server logs (if any)
- What you were trying to do

**Environment Status:**
- [ ] .env file created and configured
- [ ] client/env-config.js configured
- [ ] Database tables created
- [ ] Database functions created
- [ ] Services running (client/server)
```

### Common Quick Fixes

| Problem | Quick Fix |
|---------|-----------|
| Red disconnected status | Check database functions |
| Server won't start | Check .env file location/format |
| Commands not reaching Cursor | Grant automation permissions |
| MCP not working | Restart Cursor after config |
| 404 errors | Database functions missing |
| Blank client page | Check HTTP server port |

---

**Last Updated:** August 21, 2025  
**For More Help:** [File an Issue](https://github.com/crimsonsunset/cursor_remote/issues) or check [Main Documentation](../README.md)
