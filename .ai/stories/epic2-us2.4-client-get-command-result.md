# Epic-2 - 用户故事-2.4 (PRD US2.3)

客户端 - 获取并展示指令结果

**作为** 客户端
**我希望** 当接收到`commands`记录状态变更通知（变为'completed'或'error'）后，能根据`command_id`从`results`表中获取对应的结果记录
**以便** 我可以将`result_text`或`error_message`展示给用户。

## Status

Completed

## Context

{
- 一旦指令状态变为 'completed'，客户端需要获取相应的结果。
- 结果存储在`results`表中，通过`command_id`与原始指令关联。
- 然后，客户端将向用户呈现此结果 (例如，Cursor的文本输出)。
}

## Estimation

故事点: {已随US2.3完成}

## Tasks

{
1. - [x] 当指令状态变为 'completed' 时 (通过US2.3的订阅)，触发获取其结果的逻辑。
2. - [x] 实现Supabase客户端调用，以查询`results`表中与`command_id`匹配的条目。
3. - [x] 开发逻辑以解析/处理获取到的结果中的`result_text`和任何`error_details`。
4. - [x] 更新客户端UI以显示指令结果或错误信息。
5. - [x] 为获取结果添加错误处理 (例如结果未找到、Supabase错误)。
6. - [x] 测试成功指令和以错误结束的指令的结果检索和显示。
}

## Constraints

- 客户端只应尝试获取已确认为 'completed' 或 'error' 状态的指令结果。
- `results`表中的`command_id`是链接到`commands`表`id`的外键。

## Data Models / Schema

参考PRD中`results`表的结构定义:
- `id` (uuid, 主键, 默认 gen_random_uuid())
- `command_id` (uuid, 外键，引用`commands.id`, 非空)
- `result_text` (text, 可空)
- `created_at` (timestamp with time zone, 默认 now())
- `error_details` (text, 可空) (PRD中为`error_message`，此处若指results表本身的错误细节用`error_details`，若指命令执行错误信息，PRD中为`results.error_message`)

以及`commands`表用于`id`和`status`。

## Structure

- 结果获取逻辑应是客户端服务的一部分。
- UI组件应能渲染结果数据。

## Diagrams

{
(占位符，例如显示客户端在状态更新后从Supabase获取结果的图表)
}

## Dev Notes

- 考虑如何显示可能较大或复杂的`result_text`。根据用户反馈，目前原始显示即可，但未来增强可能需要格式化。
- 如果指令状态为'error'，`results`表可能没有条目，或者其`error_details`字段可能已填充。还应检查`commands`表的`error_message` (PRD中为`last_error`)。

## Chat Command Log

{
(占位符)
}

## Examples

<example>
(Placeholder for a valid rule application example)
</example> 