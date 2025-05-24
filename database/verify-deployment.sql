-- Supabase部署验证脚本
-- 在Supabase SQL Editor中运行此脚本来验证所有组件是否正确部署

-- 1. 检查所有必需的表是否存在
DO $$
DECLARE
    missing_tables TEXT[] := ARRAY[]::TEXT[];
    table_name TEXT;
BEGIN
    -- 检查所有必需的表
    FOR table_name IN SELECT unnest(ARRAY['commands', 'results', 'command_metrics', 'user_favorites', 'command_templates'])
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = table_name
        ) THEN
            missing_tables := array_append(missing_tables, table_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE NOTICE '❌ 缺少以下表: %', array_to_string(missing_tables, ', ');
        RAISE NOTICE '请先执行 database/tables.sql 文件';
    ELSE
        RAISE NOTICE '✅ 所有必需的表都存在';
    END IF;
END $$;

-- 2. 检查所有必需的函数是否存在
DO $$
DECLARE
    missing_functions TEXT[] := ARRAY[]::TEXT[];
    func_name TEXT;
BEGIN
    -- 检查所有必需的函数
    FOR func_name IN SELECT unnest(ARRAY[
        'submit_command',
        'get_command_analytics', 
        'get_system_status', 
        'get_queue_status',
        'get_command_history',
        'get_favorite_commands',
        'add_favorite_command',
        'get_command_templates_with_usage',
        'increment_template_usage'
    ])
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.routines 
            WHERE routine_schema = 'public' AND routine_name = func_name
        ) THEN
            missing_functions := array_append(missing_functions, func_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_functions, 1) > 0 THEN
        RAISE NOTICE '❌ 缺少以下函数: %', array_to_string(missing_functions, ', ');
        RAISE NOTICE '请执行 database/functions.sql 文件';
    ELSE
        RAISE NOTICE '✅ 所有必需的函数都存在';
    END IF;
END $$;

-- 3. 测试核心函数调用
DO $$
DECLARE
    test_result JSON;
BEGIN
    RAISE NOTICE '开始测试函数调用...';
    
    -- 测试提交命令函数
    BEGIN
        SELECT submit_command('test_command', 'test_user') INTO test_result;
        RAISE NOTICE '✅ submit_command() 函数正常';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '❌ submit_command() 函数错误: %', SQLERRM;
    END;
    
    -- 测试系统状态
    BEGIN
        SELECT get_system_status() INTO test_result;
        RAISE NOTICE '✅ get_system_status() 函数正常';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '❌ get_system_status() 函数错误: %', SQLERRM;
    END;
    
    -- 测试队列状态
    BEGIN
        SELECT get_queue_status() INTO test_result;
        RAISE NOTICE '✅ get_queue_status() 函数正常';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '❌ get_queue_status() 函数错误: %', SQLERRM;
    END;
    
    -- 测试分析数据
    BEGIN
        SELECT get_command_analytics(24) INTO test_result;
        RAISE NOTICE '✅ get_command_analytics() 函数正常';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '❌ get_command_analytics() 函数错误: %', SQLERRM;
    END;
    
    -- 测试模板获取
    BEGIN
        SELECT get_command_templates_with_usage() INTO test_result;
        RAISE NOTICE '✅ get_command_templates_with_usage() 函数正常';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '❌ get_command_templates_with_usage() 函数错误: %', SQLERRM;
    END;
    
    -- 测试收藏获取
    BEGIN
        SELECT get_favorite_commands() INTO test_result;
        RAISE NOTICE '✅ get_favorite_commands() 函数正常';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '❌ get_favorite_commands() 函数错误: %', SQLERRM;
    END;
END $$;

-- 4. 检查实时复制设置
SELECT 
    schemaname,
    tablename,
    'Realtime enabled: ' || 
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = pg_tables.tablename
    ) THEN '✅ Yes' ELSE '❌ No' END as realtime_status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('commands', 'results')
ORDER BY tablename;

-- 5. 显示部署摘要
DO $$
BEGIN
    RAISE NOTICE '=== 部署验证完成 ===';
    RAISE NOTICE '如果上面所有检查都显示 ✅，则Supabase后端配置正确';
    RAISE NOTICE '如果有 ❌ 错误，请按照 SETUP_DATABASE.md 指南修复';
    RAISE NOTICE '现在可以测试客户端连接了';
END $$;
