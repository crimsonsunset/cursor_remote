-- 快速部署状态检查
-- 这是一个简化版本的验证脚本，用于快速检查部署状态

-- 检查关键表
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'commands') 
    THEN '✅ commands 表存在'
    ELSE '❌ commands 表缺失 - 请执行 database/tables.sql'
  END as commands_status;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'results') 
    THEN '✅ results 表存在'
    ELSE '❌ results 表缺失 - 请执行 database/tables.sql'
  END as results_status;

-- 检查关键函数
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'submit_command') 
    THEN '✅ submit_command 函数存在'
    ELSE '❌ submit_command 函数缺失 - 请执行 database/functions.sql'
  END as submit_command_status;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'get_system_status') 
    THEN '✅ get_system_status 函数存在'
    ELSE '❌ get_system_status 函数缺失 - 请执行 database/functions.sql'
  END as get_system_status;

-- 快速功能测试
SELECT 'ℹ️ 开始功能测试...' as test_info;

-- 测试submit_command函数
DO $$
BEGIN
  BEGIN
    PERFORM submit_command('connection_test', 'test_user');
    RAISE NOTICE '✅ submit_command 函数工作正常';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ submit_command 函数错误: %', SQLERRM;
  END;
END $$;

-- 测试get_system_status函数  
DO $$
BEGIN
  BEGIN
    PERFORM get_system_status();
    RAISE NOTICE '✅ get_system_status 函数工作正常';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ get_system_status 函数错误: %', SQLERRM;
  END;
END $$;

-- 显示结果摘要
DO $$
BEGIN
  RAISE NOTICE '=== 快速检查完成 ===';
  RAISE NOTICE '如果上面都显示 ✅，则可以尝试连接客户端';
  RAISE NOTICE '如果有 ❌，请按照错误提示修复';
  RAISE NOTICE '详细验证请使用 database/verify-deployment.sql';
END $$;
