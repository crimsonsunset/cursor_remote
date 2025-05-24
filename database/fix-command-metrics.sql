-- 数据库迁移：修复 command_metrics 表结构
-- 添加缺失的列以支持分析服务

-- 为 command_metrics 表添加缺失的列
ALTER TABLE command_metrics 
ADD COLUMN IF NOT EXISTS command_text TEXT,
ADD COLUMN IF NOT EXISTS start_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS end_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- 添加索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_command_metrics_start_time ON command_metrics(start_time);
CREATE INDEX IF NOT EXISTS idx_command_metrics_end_time ON command_metrics(end_time);

-- 显示更新后的表结构
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'command_metrics'
ORDER BY ordinal_position;

-- 验证列是否添加成功
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'command_metrics' 
        AND column_name = 'command_text'
    ) 
    THEN '✅ command_text 列已添加'
    ELSE '❌ command_text 列添加失败'
  END as command_text_status;

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'command_metrics' 
        AND column_name = 'start_time'
    ) 
    THEN '✅ start_time 列已添加'
    ELSE '❌ start_time 列添加失败'
  END as start_time_status;

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'command_metrics' 
        AND column_name = 'end_time'
    ) 
    THEN '✅ end_time 列已添加'
    ELSE '❌ end_time 列添加失败'
  END as end_time_status;

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'command_metrics' 
        AND column_name = 'error_message'
    ) 
    THEN '✅ error_message 列已添加'
    ELSE '❌ error_message 列添加失败'
  END as error_message_status;
