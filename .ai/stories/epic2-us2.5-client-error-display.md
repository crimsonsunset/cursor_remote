# Epic-2 - 用户故事-2.5 (PRD US2.4)

客户端 - 展示错误信息

**作为** 客户端
**我希望** 当指令执行出错并且我获取到错误信息后，能清晰地在界面上向用户展示该错误信息
**以便** 用户了解执行过程中发生的问题。

## Status

草稿

## Context

{
- 本故事侧重于客户端应用如何向用户显示错误。
- 错误可能来自多种来源：客户端验证、Supabase API调用（提交、订阅、结果获取），或后端处理（通过指令状态'error'以及`commands`或`results`表中的消息指示）。
- 用户反馈指出客户端只需显示来自Supabase的错误；初期不需要高级处理。
}

## Estimation

故事点: {待定}

## Tasks

{
1. - [ ] 在客户端UI中设计一种一致的方式来显示错误消息 (例如，toast通知、专用的错误区域)。
2. - [ ] 确保捕获并显示来自Supabase客户端操作（插入指令、订阅、获取结果）的错误。
3. - [ ] 当指令状态为 'error' 时，显示`commands`表中的`error_message` (PRD中为`last_error`)。
4. - [ ] 如果可用，当指令执行失败时，显示`results`表中的`error_details` (PRD中为`error_message`)。
5. - [ ] 测试不同场景下的错误显示 (例如，提交时网络故障、后端脚本执行错误、结果未找到)。
}

## Constraints

- 错误消息应用户友好，但在此初始阶段可以是技术性的。
- 目前避免在客户端实现过于复杂的错误恢复逻辑。

## Data Models / Schema

- `commands.last_error` (text) (根据PRD)
- `results.error_message` (text) (根据PRD)

## Structure

- 错误显示可以是客户端应用程序中使用的实用函数或组件。

## Diagrams

{
(占位符)
}

## Dev Notes

- 如果可能，确保后端报告的错误（通过指令状态和错误字段）与客户端或通信错误明确区分，尽管简单显示是主要目标。

## Chat Command Log

{
(占位符)
}

## Examples

<example>
(Placeholder for a valid rule application example)
</example> 