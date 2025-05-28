# Epic-1 - Story-1.2
DB Schema - Results Table

**As a** 开发者
**I want** 在Supabase项目中根据PRD定义创建并配置`results`数据表 (包含id, created_at, command_id, result_text, error_message, is_error, raw_result字段，以及正确的类型、约束、默认值和到`commands`表的外键)
**so that** 应用程序有地方存储指令执行后的结果和错误信息。

## Status

Completed

## Context

- **Background information**: Companion to US1.1, this story defines the schema for storing command execution outcomes.
- **Current state**: `commands` table schema is defined (or being defined in US1.1). No `results` table exists.
- **Story justification**: The `results` table is crucial for persisting the output of processed commands, whether successful or failed, making them available for the client.
- **Technical context**: Involves defining a table schema in Supabase, including a foreign key relationship to the `commands` table.
- **Relevant history from previous stories**: Depends on the `commands` table (US1.1) for the foreign key.

## Estimation

Story Points: {Story Points (1 SP = 1 day of Human Development = 10 minutes of AI development)}

## Tasks

{
1. - [x] Define `results` table schema in Supabase SQL editor or UI.
   1. - [x] Specify `id` (UUID, PK, default gen_random_uuid()).
   2. - [x] Specify `created_at` (TIMESTAMPTZ, default now()).
   3. - [x] Specify `command_id` (UUID, NOT NULL, Foreign Key referencing `commands.id`).
   4. - [x] Specify `result_text` (TEXT, nullable).
   5. - [x] Specify `error_message` (TEXT, nullable).
   6. - [x] Specify `is_error` (BOOLEAN, NOT NULL, default FALSE).
   7. - [x] Specify `raw_result` (JSONB, nullable).
2. - [x] Apply the schema to the Supabase project.
3. - [x] Verify table creation, column specifications, and foreign key constraint in Supabase dashboard.
}

## Constraints

- Schema must align with the PRD section 4.1.2.
- The `command_id` foreign key must correctly reference the `commands(id)` primary key.

## Data Models / Schema

Refers to `results` table schema defined in PRD section 4.1.2:

| 字段名        | 类型        | 描述                                   | 约束/备注                                     |
|---------------|-------------|----------------------------------------|-----------------------------------------------|
| id            | UUID        | 主键，唯一标识                         | Supabase自动生成 (PK)                         |
| created_at    | TIMESTAMPTZ | 创建时间戳                             | Supabase自动生成, `now()`                    |
| command_id    | UUID        | 关联的`commands`表中的指令ID           | NOT NULL, FK to `commands.id`                 |
| result_text   | TEXT        | 执行结果内容 (Cursor的直接输出，格式不定) |                                               |
| error_message | TEXT        | 错误信息 (如果发生错误)                |                                               |
| is_error      | BOOLEAN     | 标记是否为错误结果                     | NOT NULL, 默认 FALSE                         |
| raw_result    | JSONB       | (可选) 结构化的原始结果数据            | 用于存储Cursor的原始输出，方便后续处理或分析 |

## Structure

- This story directly impacts the Supabase database schema. Server-side code (Epic 1) will write to this table, and client-side code (Epic 2) will read from it.

## Diagrams

{Mermaid diagrams as needed - e.g., ERD showing `commands` and `results` relationship}

## Dev Notes

- Ensure `is_error` defaults to `FALSE`.
- Confirm the foreign key constraint on `command_id` is correctly implemented (e.g., with `ON DELETE CASCADE` or other appropriate action if needed, though PRD doesn't specify, cascade might be a safe default for this relationship).

## Chat Command Log

{
- User: Generate user stories according to the template.
- Agent: Processing US1.2...
} 