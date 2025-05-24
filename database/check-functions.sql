-- 检查所有必需的数据库函数
-- 运行此脚本来验证数据库设置是否完整

SELECT 'Checking database functions...' as status;

-- 检查所有必需的函数
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'submit_command') 
    THEN '✅ submit_command'
    ELSE '❌ submit_command - MISSING'
  END as submit_command_status;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'get_system_status') 
    THEN '✅ get_system_status'
    ELSE '❌ get_system_status - MISSING'
  END as get_system_status;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'get_command_analytics') 
    THEN '✅ get_command_analytics'
    ELSE '❌ get_command_analytics - MISSING'
  END as get_command_analytics;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'get_queue_status') 
    THEN '✅ get_queue_status'
    ELSE '❌ get_queue_status - MISSING'
  END as get_queue_status;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'get_command_history') 
    THEN '✅ get_command_history'
    ELSE '❌ get_command_history - MISSING'
  END as get_command_history;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'get_favorite_commands') 
    THEN '✅ get_favorite_commands'
    ELSE '❌ get_favorite_commands - MISSING'
  END as get_favorite_commands;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'add_favorite_command') 
    THEN '✅ add_favorite_command'
    ELSE '❌ add_favorite_command - MISSING'
  END as add_favorite_command;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'get_command_templates_with_usage') 
    THEN '✅ get_command_templates_with_usage'
    ELSE '❌ get_command_templates_with_usage - MISSING'
  END as get_command_templates_with_usage;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'increment_template_usage') 
    THEN '✅ increment_template_usage'
    ELSE '❌ increment_template_usage - MISSING'
  END as increment_template_usage;

-- 如果有缺失的函数，提供解决方案
SELECT '
如果发现缺失的函数，请执行以下步骤：
1. 在 Supabase Dashboard -> SQL Editor 中执行 database/functions.sql
2. 或者运行以下命令（如果有 psql）：
   psql "$SUPABASE_DB_URL" -f database/functions.sql

如果仍有问题，请检查：
- 数据库连接权限
- 函数创建权限
- RLS 策略设置
' as instructions;
