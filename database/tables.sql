-- Supabase数据库表结构
-- 此文件反映实际线上表结构

-- 1. 核心命令表
CREATE TABLE IF NOT EXISTS commands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  command_text TEXT NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  user_id UUID,
  raw_command JSONB,
  attempts INTEGER DEFAULT 0,
  last_error TEXT
);

-- 2. 命令执行结果表
CREATE TABLE IF NOT EXISTS results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  command_id UUID NOT NULL REFERENCES commands(id) ON DELETE CASCADE,
  result_text TEXT,
  error_message TEXT,
  is_error BOOLEAN DEFAULT false NOT NULL,
  raw_result JSONB
);

-- 3. 命令执行统计表 (用于分析功能)
CREATE TABLE IF NOT EXISTS command_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  command_id UUID REFERENCES commands(id) ON DELETE CASCADE,
  command_length INTEGER,
  processing_duration INTEGER,
  success BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 添加索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(status);
CREATE INDEX IF NOT EXISTS idx_commands_created_at ON commands(created_at);
CREATE INDEX IF NOT EXISTS idx_commands_user_id ON commands(user_id);

CREATE INDEX IF NOT EXISTS idx_results_command_id ON results(command_id);
CREATE INDEX IF NOT EXISTS idx_command_metrics_command_id ON command_metrics(command_id);

-- 启用实时功能
ALTER PUBLICATION supabase_realtime ADD TABLE commands;
ALTER PUBLICATION supabase_realtime ADD TABLE results;
