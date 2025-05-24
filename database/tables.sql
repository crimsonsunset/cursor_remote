-- Supabase数据库表结构
-- 执行此文件来创建项目所需的所有表

-- 1. 核心命令表
CREATE TABLE IF NOT EXISTS commands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT, -- 可以是会话ID或用户标识
  command_text TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 命令执行结果表
CREATE TABLE IF NOT EXISTS results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  command_id UUID NOT NULL REFERENCES commands(id) ON DELETE CASCADE,
  result_text TEXT,
  error_message TEXT,
  is_error BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 命令执行统计表
CREATE TABLE IF NOT EXISTS command_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  command_id UUID REFERENCES commands(id) ON DELETE CASCADE,
  command_length INTEGER,
  processing_duration FLOAT, -- 处理时间(秒)
  success BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 用户收藏命令表
CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  command_text TEXT NOT NULL,
  category VARCHAR(50) DEFAULT 'general',
  description TEXT,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 命令模板表
CREATE TABLE IF NOT EXISTS command_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  template_text TEXT NOT NULL,
  category VARCHAR(50) DEFAULT 'general',
  description TEXT,
  variables JSONB DEFAULT '[]'::jsonb, -- 模板中的变量定义
  usage_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 添加索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(status);
CREATE INDEX IF NOT EXISTS idx_commands_created_at ON commands(created_at);
CREATE INDEX IF NOT EXISTS idx_commands_user_id ON commands(user_id);

CREATE INDEX IF NOT EXISTS idx_results_command_id ON results(command_id);
CREATE INDEX IF NOT EXISTS idx_results_created_at ON results(created_at);

CREATE INDEX IF NOT EXISTS idx_command_metrics_command_id ON command_metrics(command_id);
CREATE INDEX IF NOT EXISTS idx_command_metrics_created_at ON command_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_command_metrics_success ON command_metrics(success);

CREATE INDEX IF NOT EXISTS idx_user_favorites_category ON user_favorites(category);
CREATE INDEX IF NOT EXISTS idx_user_favorites_created_at ON user_favorites(created_at);

CREATE INDEX IF NOT EXISTS idx_command_templates_category ON command_templates(category);
CREATE INDEX IF NOT EXISTS idx_command_templates_name ON command_templates(name);

-- 启用实时功能 (Realtime)
-- 这些表需要启用实时订阅功能
ALTER PUBLICATION supabase_realtime ADD TABLE commands;
ALTER PUBLICATION supabase_realtime ADD TABLE results;

-- 插入示例模板数据
INSERT INTO command_templates (name, template_text, category, description, variables) VALUES
('文件分析', '请分析 {{filename}} 文件的代码结构和功能', 'analysis', '分析指定文件的代码结构', '[{"name": "filename", "description": "要分析的文件名"}]'),
('代码重构', '请重构 {{filename}} 文件中的 {{function_name}} 函数，提高代码质量', 'refactor', '重构指定函数的代码', '[{"name": "filename", "description": "文件名"}, {"name": "function_name", "description": "函数名"}]'),
('添加测试', '为 {{filename}} 文件添加单元测试', 'testing', '为指定文件添加测试代码', '[{"name": "filename", "description": "要添加测试的文件名"}]'),
('代码注释', '为 {{filename}} 文件添加详细的代码注释', 'documentation', '为代码添加注释', '[{"name": "filename", "description": "要添加注释的文件名"}]'),
('性能优化', '优化 {{filename}} 文件的性能，特别是 {{target_area}} 部分', 'optimization', '优化代码性能', '[{"name": "filename", "description": "文件名"}, {"name": "target_area", "description": "要优化的具体区域"}]')
ON CONFLICT DO NOTHING;
