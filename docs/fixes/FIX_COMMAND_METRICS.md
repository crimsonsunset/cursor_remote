# 修复 command_metrics 表结构问题

## 问题描述
服务器启动时出现错误：
```
Could not find the 'command_text' column of 'command_metrics' in the schema cache
```

这是因为 `command_metrics` 表缺少分析服务所需的列。

## 解决方案

### 方案 1：运行数据库迁移（推荐）

1. **在 Supabase Dashboard 中手动执行**：
   - 打开 Supabase Dashboard
   - 进入 SQL Editor
   - 复制并执行 `database/fix-command-metrics.sql` 文件中的内容

2. **使用命令行工具**（需要先安装 PostgreSQL 客户端）：
   ```bash
   # 安装 PostgreSQL 客户端（如果还没有）
   brew install postgresql
   
   # 设置数据库连接字符串
   export SUPABASE_DB_URL='postgresql://postgres:[YOUR_PASSWORD]@[YOUR_HOST]:[PORT]/postgres'
   
   # 运行修复脚本
   ./fix-db.sh
   ```

### 方案 2：临时修复（已应用）

我已经修改了 `AnalyticsService` 代码，使其能够在缺少列的情况下正常工作：
- 代码会首先尝试使用完整的列结构
- 如果失败，会回退到使用基本的列结构
- 这样服务可以正常启动，但分析功能会受限

## 推荐步骤

1. **立即测试**：重新启动服务器，检查错误是否消失
   ```bash
   npm start
   ```

2. **长期修复**：在方便时执行数据库迁移以获得完整功能

## 数据库迁移内容

迁移脚本会添加以下列到 `command_metrics` 表：
- `command_text TEXT` - 存储命令文本
- `start_time TIMESTAMP WITH TIME ZONE` - 命令开始时间
- `end_time TIMESTAMP WITH TIME ZONE` - 命令结束时间  
- `error_message TEXT` - 错误信息

## 验证修复

执行迁移后，你可以通过以下 SQL 验证列是否添加成功：
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'command_metrics'
ORDER BY ordinal_position;
```

## 如果仍有问题

如果问题持续存在，请检查：
1. Supabase 连接是否正常
2. 数据库权限是否足够
3. 表结构是否正确创建

可以运行快速检查：
```bash
cd database && psql "$SUPABASE_DB_URL" -f quick-check.sql
```
