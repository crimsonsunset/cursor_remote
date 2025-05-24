# Supabase 数据库设置指南

## 问题诊断
如果客户端访问时出现404错误，这通常意味着Supabase数据库表和RPC函数还没有创建。

## 完整解决步骤

### 1. 登录Supabase控制台
访问 [https://supabase.com/dashboard](https://supabase.com/dashboard) 并登录到你的项目：
- Project ID: `rzsupavqzxhyrgcexrpx`
- Project URL: `https://rzsupavqzxhyrgcexrpx.supabase.co`

### 2. 创建数据表 ⚠️ **必须先执行**
1. 进入 `Database` → `SQL Editor`
2. 点击 `New Query` 创建新的SQL查询
3. 复制 `database/tables.sql` 中的**完整内容**并粘贴
4. 点击 `Run` 执行SQL
5. 确认以下表已创建：
   - `commands` (核心命令表)
   - `results` (执行结果表)
   - `command_metrics` (统计指标表)
   - `user_favorites` (用户收藏)
   - `command_templates` (命令模板)

### 3. 创建RPC函数 ⚠️ **必须在表创建后执行**
1. 在SQL Editor中创建另一个新查询
2. 复制 `database/functions.sql` 中的**完整内容**并粘贴
3. 点击 `Run` 执行SQL
4. 确认以下函数已创建：
   - `get_command_analytics(timeframe_hours)`
   - `get_system_status()`
   - `get_queue_status()`
   - `get_command_history(limit_count, search_text)`
   - `get_favorite_commands()`
   - `add_favorite_command(command_text, description)`
   - `get_command_templates_with_usage()`
   - `increment_template_usage(template_id)`

### 4. 验证数据表创建
在SQL Editor中运行以下查询验证表是否存在：
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('commands', 'results', 'command_metrics', 'user_favorites', 'command_templates')
ORDER BY table_name;
```

### 5. 验证函数创建
在SQL Editor中运行以下查询验证函数是否存在：
```sql
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE 'get_%'
ORDER BY routine_name;
```

### 6. 启用实时功能 (Realtime)
1. 进入 `Database` → `Replication`
2. 找到 `supabase_realtime` publication
3. 确认 `commands` 和 `results` 表已添加到实时复制中
4. 如果没有，点击编辑并添加这两个表

### 7. 测试函数调用
在SQL Editor中直接测试函数：
```sql
-- 测试系统状态函数  
SELECT get_system_status();

-- 测试分析数据函数
SELECT get_command_analytics(24);

-- 测试队列状态函数
SELECT get_queue_status();
```

### 8. 运行部署验证脚本 🔍 **强烈建议**
1. 在SQL Editor中创建新查询
2. 复制 `database/verify-deployment.sql` 中的内容并粘贴
3. 点击 `Run` 执行验证脚本
4. 检查输出结果，确保所有项目都显示 ✅
5. 特别注意检查 `submit_command` 函数，这是客户端连接测试的关键

### 9. 客户端配置检查
确保 `client/env-config.js` 文件格式正确：
```javascript
window.SUPABASE_URL = "https://rzsupavqzxhyrgcexrpx.supabase.co";
window.SUPABASE_ANON_KEY = "your-anon-key-here";
```

### 10. 权限检查
确保RLS（Row Level Security）政策允许匿名用户调用这些函数：
1. 进入 `Database` → `Tables`
2. 检查相关表的RLS设置
3. 如果需要，可以临时禁用RLS或添加适当的政策

## 故障排除 🔧

### 404错误：找不到函数
**症状**: 客户端报告 "404 Not Found" 或函数不存在
**解决步骤**:
1. 确认已执行 `database/functions.sql`
2. 在SQL Editor中验证函数存在：
   ```sql
   SELECT routine_name FROM information_schema.routines 
   WHERE routine_schema = 'public' AND routine_name = 'submit_command';
   ```
3. 检查函数权限和RLS设置

### 连接超时或网络错误
**症状**: 连接超时、CORS错误
**解决步骤**:
1. 检查Supabase项目状态（是否暂停）
2. 验证URL和API密钥
3. 检查网络连接

### 权限拒绝错误
**症状**: "permission denied" 或 "access denied"
**解决步骤**:
1. 检查RLS策略
2. 验证API密钥权限
3. 临时禁用RLS测试：
   ```sql
   ALTER TABLE commands DISABLE ROW LEVEL SECURITY;
   ALTER TABLE results DISABLE ROW LEVEL SECURITY;
   ```

### 数据类型错误
**症状**: "invalid input" 或类型转换错误
**解决步骤**:
1. 检查函数参数类型
2. 确认客户端传递的数据格式
3. 查看Supabase日志

## 测试工具 🧪

### 1. 内置诊断页面
访问 `client/test-supabase.html` 进行完整的连接测试：
- 检查Supabase配置
- 测试所有RPC函数
- 显示详细错误信息

### 2. 浏览器控制台测试
在客户端页面的浏览器控制台中运行：
```javascript
// 基本连接测试
console.log('Supabase客户端:', supabaseClient);

// 测试核心函数
supabaseClient.rpc('submit_command', {
  p_command_text: 'test',
  p_user_id: 'test_user'
}).then(result => {
  console.log('✅ submit_command 成功:', result);
}).catch(error => {
  console.error('❌ submit_command 失败:', error);
});

// 测试系统状态
supabaseClient.rpc('get_system_status').then(result => {
  console.log('✅ 系统状态:', result);
}).catch(error => {
  console.error('❌ 系统状态失败:', error);
});
```

### 3. SQL直接测试
在Supabase SQL Editor中直接测试：
```sql
-- 测试提交命令
SELECT submit_command('test_command', 'test_user');

-- 测试获取状态
SELECT get_system_status();

-- 查看创建的测试数据
SELECT * FROM commands WHERE command_text = 'test_command';
```
