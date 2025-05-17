# Epic-2 - 用户故事-2.2 (PRD US2.1)

客户端 - 发送指令到Supabase

**作为** 客户端
**我希望** 当用户输入指令并确认发送后，能使用Supabase SDK将该指令（主要是`command_text`）作为一条新记录插入到Supabase的`commands`表中，初始状态为'pending'
**以便** 后端服务器可以处理这些指令。

## Status

草稿

## Context

{
- 本故事是客户端应用与Supabase集成的组成部分。
- 客户端需要一种机制将用户发起的指令传输到后端。
- Supabase的`commands`表是此通信的指定中介。
}

## Estimation

故事点: {待定}

## Tasks

{
1. - [ ] 实现指令输入的UI界面 (如果尚未存在)。
2. - [ ] 开发函数以构建指令对象 (需符合`commands`表结构)。
   1. - [ ] 确保包含`user_id` (即使是匿名ID)、`command_text`和初始`status` ('pending')。
3. - [ ] 实现Supabase客户端调用，将新指令插入到`commands`表。
4. - [ ] 为插入操作添加基本的错误处理 (例如网络问题、Supabase错误)。
5. - [ ] 测试从客户端到Supabase的指令提交流程。
}

## Constraints

- 指令对象必须符合已定义的`commands`表结构。
- 指令的初始状态必须是 'pending'。

## Data Models / Schema

参考PRD中的`commands`表结构定义:
- `id` (uuid, 主键, 默认 gen_random_uuid())
- `user_id` (text, 可空 - 当前可为会话ID或通用标识符)
- `command_text` (text, 非空)
- `status` (text, 默认 'pending'; 例如 'pending', 'processing', 'completed', 'error')
- `created_at` (timestamp with time zone, 默认 now())
- `updated_at` (timestamp with time zone, 默认 now())
- `error_message` (text, 可空) (PRD中为 `last_error`，此处统一为`error_message`，如果指命令本身的错误信息)

## Structure

- 发送指令的逻辑应封装在客户端应用程序的专用服务或模块中。

## Diagrams

{
(相关图表的占位符，例如客户端-Supabase指令提交流程图)
}

## Dev Notes

- 考虑如果多个匿名用户可能使用相同的客户端实例，如何处理`user_id` (例如，生成一个临时的会话ID)。
- 确保在成功提交或发生错误时向用户提供适当的反馈。

## Chat Command Log

{
(占位符)
}

## Examples

<example>
(Placeholder for a valid rule application example)
</example> 