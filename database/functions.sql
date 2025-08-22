-- Supabase数据库核心函数
-- 只包含应用实际使用的必要函数

-- 1. 提交命令函数 (核心函数)
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

-- 2. 获取命令历史 (不带ID)
CREATE OR REPLACE FUNCTION get_command_history(
  limit_count INTEGER DEFAULT 50,
  search_text TEXT DEFAULT ''
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'command_text', c.command_text,
      'status', c.status,
      'created_at', c.created_at,
      'updated_at', c.updated_at
    )
  ) INTO result
  FROM commands c
  WHERE (search_text = '' OR c.command_text ILIKE '%' || search_text || '%')
  ORDER BY c.created_at DESC
  LIMIT limit_count;
  
  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 获取命令历史 (带ID，用于删除功能)
CREATE OR REPLACE FUNCTION get_command_history_with_ids(
  limit_count INTEGER DEFAULT 50,
  search_text TEXT DEFAULT ''
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
      'has_results', CASE WHEN r.id IS NOT NULL THEN true ELSE false END,
      'metrics', CASE 
        WHEN cm.id IS NOT NULL THEN json_build_object(
          'success', cm.success,
          'processing_duration', cm.processing_duration
        )
        ELSE NULL
      END
    )
  ) INTO result
  FROM commands c
  LEFT JOIN results r ON r.command_id = c.id
  LEFT JOIN command_metrics cm ON cm.command_id = c.id
  WHERE (search_text = '' OR c.command_text ILIKE '%' || search_text || '%')
  ORDER BY c.created_at DESC
  LIMIT limit_count;
  
  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 按ID删除命令
CREATE OR REPLACE FUNCTION delete_command_by_id(
  p_command_id UUID
)
RETURNS JSON AS $$
DECLARE
  deleted_count INTEGER := 0;
  result JSON;
BEGIN
  -- 删除命令记录（CASCADE会自动删除相关表记录）
  DELETE FROM commands 
  WHERE id = p_command_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  IF deleted_count > 0 THEN
    SELECT json_build_object(
      'success', true,
      'message', 'Command deleted successfully',
      'deleted_count', deleted_count
    ) INTO result;
  ELSE
    SELECT json_build_object(
      'success', false,
      'message', 'Command not found',
      'deleted_count', 0
    ) INTO result;
  END IF;
  
  RETURN result;
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM,
    'deleted_count', 0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 获取命令分析数据
CREATE OR REPLACE FUNCTION get_command_analytics(
  timeframe_hours INTEGER DEFAULT 24
)
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
    'averageResponseTime', COALESCE(AVG(processing_duration), 0),
    'commandsByHour', COALESCE((
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
    ), '[]'::json),
    'timestamp', NOW()
  ) INTO result
  FROM command_metrics 
  WHERE created_at >= start_time;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 获取队列状态
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
    'recentActivity', COALESCE((
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
    ), '[]'::json),
    'timestamp', NOW()
  ) INTO result
  FROM commands;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. 获取系统状态
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
    'recentCommands', COALESCE((
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
    ), '[]'::json),
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

-- 8. 清空所有队列
CREATE OR REPLACE FUNCTION clear_all_queues()
RETURNS JSON AS $$
DECLARE
  pending_count INTEGER;
  processing_count INTEGER;
  total_cancelled INTEGER;
  result JSON;
BEGIN
  -- 获取当前待处理和正在处理的命令数量
  SELECT COUNT(*) INTO pending_count FROM commands WHERE status = 'pending';
  SELECT COUNT(*) INTO processing_count FROM commands WHERE status = 'processing';
  
  -- 取消所有待处理和正在处理的命令
  UPDATE commands 
  SET status = 'cancelled', 
      updated_at = NOW(),
      error_message = 'Cancelled by clear queues operation'
  WHERE status IN ('pending', 'processing');
  
  GET DIAGNOSTICS total_cancelled = ROW_COUNT;
  
  -- 返回结果
  SELECT json_build_object(
    'success', true,
    'cleared', true,
    'totalCancelled', total_cancelled,
    'pendingCancelled', pending_count,
    'processingCancelled', processing_count,
    'message', 'All queues cleared successfully',
    'timestamp', NOW()
  ) INTO result;
  
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'cleared', false,
    'error', SQLERRM,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
