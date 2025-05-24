# 队列处理和数据库函数修复指南

## 问题总结

### 1. 队列处理问题 ✅ 已修复
- **症状**: 命令被添加到队列但不执行，只有第一个命令执行
- **原因**: 队列处理器等待第一个命令完成（10分钟超时）才处理下一个
- **修复**: 改为异步并发处理，队列可以连续处理多个命令

### 2. 数据库函数缺失问题 ⚠️ 需要修复
- **症状**: `get_favorite_commands` 返回 404
- **原因**: 数据库中缺少必需的 RPC 函数
- **解决方案**: 需要执行 `database/functions.sql`

## 修复步骤

### 第1步：重启服务器测试队列修复
```bash
# 停止当前服务器 (Ctrl+C)
cd server
npm start
```

现在队列应该能正确处理多个命令了。

### 第2步：修复数据库函数

#### 方案A：在 Supabase Dashboard 中修复
1. 打开 [Supabase Dashboard](https://supabase.com/dashboard/project/rzsupavqzxhyrgcexrpx)
2. 进入 `Database` → `SQL Editor`
3. 点击 `New Query`
4. 复制 `database/functions.sql` 的**完整内容**并粘贴
5. 点击 `Run` 执行

#### 方案B：检查现有函数状态
1. 在 SQL Editor 中执行 `database/check-functions.sql`
2. 查看哪些函数缺失
3. 只修复缺失的部分

#### 方案C：使用命令行（需要 psql）
```bash
# 设置数据库连接字符串
export SUPABASE_DB_URL='postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres'

# 检查函数状态
psql "$SUPABASE_DB_URL" -f database/check-functions.sql

# 创建缺失的函数
psql "$SUPABASE_DB_URL" -f database/functions.sql
```

### 第3步：验证修复

#### 测试队列处理
1. 从客户端连续发送 2-3 个命令
2. 观察服务器日志，应该看到：
   ```
   [QueueManager] Processing command [id1]
   [QueueManager] Processing command [id2]
   [QueueManager] Processing command [id3]
   ```
   而不是等第一个完成才处理第二个

#### 测试数据库函数
1. 在客户端尝试访问收藏命令功能
2. 应该不再出现 404 错误

## 预期的正常行为

### 队列处理流程
```
命令1 -> 添加到队列 -> 立即开始执行 -> 等待结果
命令2 -> 添加到队列 -> 立即开始执行 -> 等待结果  
命令3 -> 添加到队列 -> 立即开始执行 -> 等待结果
```

### 服务器日志示例
```
[QueueManager] Command abc123 added with medium priority
[QueueManager] Processing command abc123
[CommandController] Executing command abc123 via AppleScript
[AppleScriptRunner] Execution successful
[CommandController] Waiting for result via subscription for command abc123

[QueueManager] Command def456 added with medium priority  
[QueueManager] Processing command def456
[CommandController] Executing command def456 via AppleScript
```

## 故障排除

### 如果队列仍不工作
- 检查 AppleScript 权限
- 确认 Cursor 正在运行
- 检查系统偏好设置中的自动化权限

### 如果数据库函数仍有问题
- 验证数据库连接权限
- 检查 RLS 策略设置
- 确认在正确的 schema (public) 中创建函数

## 下一步
修复完成后，系统应该能够：
1. 并发处理多个命令
2. 正常访问所有客户端功能
3. 提供完整的命令历史和收藏功能
