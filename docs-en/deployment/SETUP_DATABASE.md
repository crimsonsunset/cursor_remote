# Supabase Database Setup Guide

## Problem Diagnosis
If the client encounters 404 errors when accessing, this usually means the Supabase database tables and RPC functions have not been created yet.

## Complete Solution Steps

### 1. Login to Supabase Console
Visit [https://supabase.com/dashboard](https://supabase.com/dashboard) and login to your project:
- Project ID: `rzsupavqzxhyrgcexrpx`
- Project URL: `https://rzsupavqzxhyrgcexrpx.supabase.co`

### 2. Create Data Tables ⚠️ **Must Execute First**
1. Go to `Database` → `SQL Editor`
2. Click `New Query` to create a new SQL query
3. Copy the **complete content** from `database/tables.sql` and paste
4. Click `Run` to execute SQL
5. Confirm the following tables have been created:
   - `commands` (core command table)
   - `results` (execution results table)
   - `command_metrics` (statistics metrics table)
   - `user_favorites` (user favorites)
   - `command_templates` (command templates)

### 3. Create RPC Functions ⚠️ **Must Execute After Table Creation**
1. Create another new query in SQL Editor
2. Copy the **complete content** from `database/functions.sql` and paste
3. Click `Run` to execute SQL
4. Confirm the following functions have been created:
   - `get_command_analytics(timeframe_hours)`
   - `get_system_status()`
   - `get_queue_status()`
   - `get_command_history(limit_count, search_text)`
   - `get_favorite_commands()`
   - `add_favorite_command(command_text, description)`
   - `get_command_templates_with_usage()`
   - `increment_template_usage(template_id)`

### 4. Verify Table Creation
Run the following query in SQL Editor to verify tables exist:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('commands', 'results', 'command_metrics', 'user_favorites', 'command_templates')
ORDER BY table_name;
```

### 5. Verify Function Creation
Run the following query in SQL Editor to verify functions exist:
```sql
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE 'get_%'
ORDER BY routine_name;
```

### 6. Enable Real-time Features (Realtime)
1. Go to `Database` → `Replication`
2. Find the `supabase_realtime` publication
3. Confirm `commands` and `results` tables are added to real-time replication
4. If not, click edit and add these two tables

### 7. Test Function Calls
Test functions directly in SQL Editor:
```sql
-- Test system status function
SELECT get_system_status();

-- Test analytics data function
SELECT get_command_analytics(24);

-- Test queue status function
SELECT get_queue_status();
```

### 8. Run Deployment Verification Script 🔍 **Highly Recommended**
1. Create a new query in SQL Editor
2. Copy the content from `database/verify-deployment.sql` and paste
3. Click `Run` to execute the verification script
4. Check the output results, ensure all items show ✅
5. Pay special attention to check the `submit_command` function, this is key for client connection testing

### 9. Client Configuration Check
Ensure the `client/env-config.js` file format is correct:
```javascript
window.SUPABASE_URL = "https://rzsupavqzxhyrgcexrpx.supabase.co";
window.SUPABASE_ANON_KEY = "your-anon-key-here";
```

### 10. Permission Check
Ensure RLS (Row Level Security) policies allow anonymous users to call these functions:
1. Go to `Database` → `Tables`
2. Check RLS settings for related tables
3. If needed, temporarily disable RLS or add appropriate policies

## Troubleshooting 🔧

### 404 Error: Function Not Found
**Symptoms**: Client reports "404 Not Found" or function doesn't exist
**Solution Steps**:
1. Confirm `database/functions.sql` has been executed
2. Verify function exists in SQL Editor:
   ```sql
   SELECT routine_name FROM information_schema.routines 
   WHERE routine_schema = 'public' AND routine_name = 'submit_command';
   ```
3. Check function permissions and RLS settings

### Connection Timeout or Network Error
**Symptoms**: Connection timeout, CORS errors
**Solution Steps**:
1. Check Supabase project status (if paused)
2. Verify URL and API keys
3. Check network connection

### Permission Denied Error
**Symptoms**: "permission denied" or "access denied"
**Solution Steps**:
1. Check RLS policies
2. Verify API key permissions
3. Temporarily disable RLS for testing:
   ```sql
   ALTER TABLE commands DISABLE ROW LEVEL SECURITY;
   ALTER TABLE results DISABLE ROW LEVEL SECURITY;
   ```

### Data Type Error
**Symptoms**: "invalid input" or type conversion errors
**Solution Steps**:
1. Check function parameter types
2. Confirm client data format being passed
3. Check Supabase logs

## Testing Tools 🧪

### 1. Built-in Diagnostic Page
Visit `client/test-supabase.html` for complete connection testing:
- Check Supabase configuration
- Test all RPC functions
- Display detailed error information

### 2. Browser Console Testing
Run in the browser console on the client page:
```javascript
// Basic connection test
console.log('Supabase Client:', supabaseClient);

// Test core function
supabaseClient.rpc('submit_command', {
  p_command_text: 'test',
  p_user_id: 'test_user'
}).then(result => {
  console.log('✅ submit_command success:', result);
}).catch(error => {
  console.error('❌ submit_command failed:', error);
});

// Test system status
supabaseClient.rpc('get_system_status').then(result => {
  console.log('✅ System status:', result);
}).catch(error => {
  console.error('❌ System status failed:', error);
});
```

### 3. Direct SQL Testing
Test directly in Supabase SQL Editor:
```sql
-- Test submit command
SELECT submit_command('test_command', 'test_user');

-- Test get status
SELECT get_system_status();

-- View created test data
SELECT * FROM commands WHERE command_text = 'test_command';
```
