# 数据库设置指南

这个目录包含了CursorRemote项目的数据库结构和函数定义。

## 文件说明

- `tables.sql` - 核心数据表结构定义
- `functions.sql` - 应用使用的数据库函数

## 设置步骤

1. 在Supabase项目中，进入SQL编辑器
2. 先执行 `tables.sql` 创建数据表
3. 然后执行 `functions.sql` 创建所需的函数

## 表结构

### commands
主要命令表，存储用户提交的命令
- `id`: UUID主键
- `user_id`: 用户标识
- `command_text`: 命令内容
- `status`: 命令状态 (pending/processing/completed/error)
- `created_at`, `updated_at`: 时间戳

### results
命令执行结果表
- `command_id`: 关联到commands表
- `result_text`: 执行结果
- `is_error`: 是否为错误

### command_metrics
命令执行统计表
- `command_id`: 关联到commands表
- `processing_duration`: 处理时长
- `success`: 是否成功

## 主要函数

- `submit_command()` - 提交新命令
- `get_command_history()` - 获取命令历史
- `get_command_history_with_ids()` - 获取带ID的命令历史（用于删除）
- `delete_command_by_id()` - 删除指定命令
- `get_command_analytics()` - 获取分析数据
- `get_queue_status()` - 获取队列状态
- `get_system_status()` - 获取系统状态
