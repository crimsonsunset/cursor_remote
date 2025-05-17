# Epic-1 - Story-1.1
DB Schema - Commands Table

**As a** 开发者
**I want** 在Supabase项目中根据PRD定义创建并配置`commands`数据表 (包含id, created_at, command_text, status, user_id, raw_command, attempts, last_error字段，以及正确的类型、约束和默认值)
**so that** 应用程序有地方存储从客户端接收到的指令。

## Status

Completed

## Context

- **Background information**: This story is part of the migration удовольствие from Redis to Supabase for the Cursor remote control project.
- **Current state**: No Supabase tables exist yet.
- **Story justification**: The `commands` table is essential for storing incoming commands from the client before they are processed by the server. This is a foundational step for the backend migration.
- **Technical context**: Involves defining a table schema in Supabase, matching the specifications in the PRD.
- **Relevant history from previous stories**: This is one of the first data schema stories.

## Estimation

Story Points: {Story Points (1 SP = 1 day of Human Development = 10 minutes of AI development)}

## Tasks

{
1. - [x] Define `commands` table schema in Supabase SQL editor or UI.
   1. - [x] Specify `id` (UUID, PK, default gen_random_uuid()).
   2. - [x] Specify `created_at` (TIMESTAMPTZ, default now()).
   3. - [x] Specify `command_text` (TEXT, NOT NULL).
   4. - [x] Specify `status` (TEXT, NOT NULL, default 'pending').
   5. - [x] Specify `user_id` (UUID, nullable, for future use).
   6. - [x] Specify `raw_command` (JSONB, nullable).
   7. - [x] Specify `attempts` (INTEGER, nullable, default 0).
   8. - [x] Specify `last_error` (TEXT, nullable).
2. - [x] Apply the schema to the Supabase project.
3. - [x] Verify table creation and column specifications in Supabase dashboard.
}

## Constraints

- Schema must align with the PRD section 4.1.1.
- Primary keys and foreign keys (if any in future stories) should be correctly configured.

## Data Models / Schema

Refers to `commands` table schema defined in PRD section 4.1.1:

| 字段名        | 类型        | 描述                                     | 约束/备注                                     |
|---------------|-------------|------------------------------------------|-----------------------------------------------|
| id            | UUID        | 主键，唯一标识                           | Supabase自动生成 (PK)                         |
| created_at    | TIMESTAMPTZ | 创建时间戳                               | Supabase自动生成, `now()`                      |
| command_text  | TEXT        | 命令内容 (用户输入的自然语言)            | NOT NULL                                      |
| status        | TEXT        | 命令状态 (例如: 'pending', 'processing', 'completed', 'error') | NOT NULL, 默认 'pending'                 |
| user_id       | UUID        | (可选) 用户标识                           | 占位符，供未来用户认证功能使用，当前可为空 |
| raw_command   | JSONB       | (可选) 结构化的原始命令数据              |                                               |
| attempts      | INTEGER     | (可选) 重试次数                           | 默认 0                                        |
| last_error    | TEXT        | (可选) 最后一次错误信息                   |                                               |

## Structure

- This story directly impacts the Supabase database schema. No application code structure is directly affected, but server-side code (Epic 1) will depend on this schema.

## Diagrams

{Mermaid diagrams as needed - e.g., ERD snippet if it becomes complex}

## Dev Notes

- Ensure `user_id` is nullable as per PRD decision for initial phase.
- Double-check default values for `status` and `attempts`.

## Chat Command Log

{
- User: Generate user stories according to the template.
- Agent: Processing US1.1...
} 