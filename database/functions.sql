-- Supabase Database Functions for API endpoints
-- 这些函数可以直接通过 supabase.rpc() 调用

-- 0. 提交命令函数 (核心函数)
CREATE OR REPLACE FUNCTION submit_command(
  p_command_text TEXT,
  p_user_id TEXT DEFAULT 'anonymous'
)
RETURNS JSON AS $$
DECLARE
  new_command_id UUID;
  result JSON;
BEGIN
  -- 插入新命令
  INSERT INTO commands (user_id, command_text, status)
  VALUES (p_user_id, p_command_text, 'pending')
  RETURNING id INTO new_command_id;
  
  -- 创建度量记录
  INSERT INTO command_metrics (command_id, command_length, success, created_at)
  VALUES (new_command_id, LENGTH(p_command_text), false, NOW());
  
  -- 返回结果
  SELECT json_build_object(
    'success', true,
    'command_id', new_command_id,
    'status', 'pending',
    'message', 'Command submitted successfully',
    'timestamp', NOW()
  ) INTO result;
  
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. 获取命令分析数据
CREATE OR REPLACE FUNCTION get_command_analytics(timeframe_hours INTEGER DEFAULT 24)
RETURNS JSON AS $$
DECLARE
  result JSON;
  start_time TIMESTAMP;
BEGIN
  start_time := NOW() - INTERVAL '1 hour' * timeframe_hours;
  
  SELECT json_build_object(
    'totalCommands', COUNT(*),
    'successfulCommands', COUNT(*) FILTER (WHERE success = true),
    'failedCommands', COUNT(*) FILTER (WHERE success = false),
    'averageResponseTime', AVG(processing_duration),
    'commandsByHour', (
      SELECT json_agg(
        json_build_object(
          'hour', EXTRACT(hour from created_at),
          'count', count(*)
        )
      )
      FROM command_metrics 
      WHERE created_at >= start_time
      GROUP BY EXTRACT(hour from created_at)
      ORDER BY EXTRACT(hour from created_at)
    ),
    'timestamp', NOW()
  ) INTO result
  FROM command_metrics 
  WHERE created_at >= start_time;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 获取系统状态
CREATE OR REPLACE FUNCTION get_system_status()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'database', json_build_object(
      'connected', true,
      'timestamp', NOW()
    ),
    'recentCommands', (
      SELECT json_agg(
        json_build_object(
          'id', id,
          'command_text', LEFT(command_text, 50) || '...',
          'status', status,
          'created_at', created_at
        )
      )
      FROM commands 
      WHERE created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC
      LIMIT 10
    ),
    'metrics', (
      SELECT json_build_object(
        'totalCommands', COUNT(*),
        'recentSuccess', COUNT(*) FILTER (WHERE success = true AND created_at >= NOW() - INTERVAL '1 hour')
      )
      FROM command_metrics
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 命令历史查询
CREATE OR REPLACE FUNCTION get_command_history(
  limit_count INTEGER DEFAULT 50,
  search_text TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'id', c.id,
      'command_text', c.command_text,
      'status', c.status,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'metrics', (
        SELECT json_build_object(
          'success', cm.success,
          'duration', cm.processing_duration
        )
        FROM command_metrics cm
        WHERE cm.command_id = c.id
      )
    )
  ) INTO result
  FROM commands c
  WHERE (search_text IS NULL OR c.command_text ILIKE '%' || search_text || '%')
  ORDER BY c.created_at DESC
  LIMIT limit_count;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 添加收藏命令
CREATE OR REPLACE FUNCTION add_favorite_command(
  command_text TEXT,
  category TEXT DEFAULT 'general',
  description TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  new_id UUID;
BEGIN
  INSERT INTO user_favorites (command_text, category, description)
  VALUES (command_text, category, description)
  RETURNING id INTO new_id;
  
  SELECT json_build_object(
    'success', true,
    'id', new_id,
    'message', 'Command added to favorites'
  ) INTO result;
  
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 获取收藏命令
CREATE OR REPLACE FUNCTION get_favorite_commands(category_filter TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'id', id,
      'command_text', command_text,
      'category', category,
      'description', description,
      'created_at', created_at,
      'usage_count', usage_count
    )
  ) INTO result
  FROM user_favorites
  WHERE (category_filter IS NULL OR category = category_filter)
  ORDER BY usage_count DESC, created_at DESC;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 获取当前命令队列状态
CREATE OR REPLACE FUNCTION get_queue_status()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'pendingCommands', COUNT(*) FILTER (WHERE status = 'pending'),
    'processingCommands', COUNT(*) FILTER (WHERE status = 'processing'), 
    'completedToday', COUNT(*) FILTER (WHERE status = 'completed' AND created_at >= CURRENT_DATE),
    'errorCommands', COUNT(*) FILTER (WHERE status = 'error'),
    'queueEmpty', CASE WHEN COUNT(*) FILTER (WHERE status IN ('pending', 'processing')) = 0 THEN true ELSE false END,
    'recentActivity', (
      SELECT json_agg(
        json_build_object(
          'id', id,
          'command_text', LEFT(command_text, 30) || '...',
          'status', status,
          'created_at', created_at
        )
      )
      FROM commands 
      WHERE created_at >= NOW() - INTERVAL '2 hours'
      ORDER BY created_at DESC
      LIMIT 5
    ),
    'timestamp', NOW()
  ) INTO result
  FROM commands;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. 获取模板数据
CREATE OR REPLACE FUNCTION get_command_templates_with_usage()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'id', id,
      'name', name,
      'template_text', template_text,
      'category', category,
      'description', description,
      'variables', variables,
      'usage_count', usage_count,
      'created_at', created_at
    )
  ) INTO result
  FROM command_templates
  ORDER BY usage_count DESC, created_at DESC;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. 增加模板使用次数
CREATE OR REPLACE FUNCTION increment_template_usage(template_id UUID)
RETURNS JSON AS $$
BEGIN
  UPDATE command_templates 
  SET usage_count = usage_count + 1, updated_at = NOW()
  WHERE id = template_id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Template usage count updated'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
