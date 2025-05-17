# Epic-2 - 用户故事-2.3 (PRD US2.2)

客户端 - 订阅指令状态更新

**作为** 客户端
**我希望** 能使用Supabase SDK实时订阅我之前创建的`commands`记录的状态变化
**以便** 当其`status`更新为'completed'或'error'时，我能得到通知，并告知用户其指令的处理状态。

## Status

草稿

## Context

{
- 此故事使客户端能够向用户提供实时反馈。
- 提交指令后，用户应能看到其状态变化 (例如，从 'pending' 到 'processing' 再到 'completed' 或 'error')。
- 将使用Supabase的实时功能。
}

## Estimation

故事点: {待定}

## Tasks

{
1. - [ ] 实现对`commands`表的Supabase实时订阅。
   1. - [ ] 过滤订阅，使其仅包含与当前客户端/用户相关的指令 (例如，基于`user_id`或会话标识符，如果已实现；或者如果客户端知道其提交的指令ID，则基于ID)。
2. - [ ] 开发逻辑以处理从订阅中接收到的状态更新。
3. - [ ] 更新客户端UI以反映指令的新状态。
4. - [ ] 处理订阅中潜在的错误 (例如连接丢失)。
5. - [ ] 测试各种指令生命周期阶段的实时状态更新。
}

## Constraints

- 订阅应高效，且不会使客户端或Supabase过载。
- UI更新应清晰及时。

## Data Models / Schema

参考PRD中`commands`表的结构定义 (尤其是`status`和`id`字段)。

## Structure

- 实时订阅逻辑应在客户端服务中管理。
- UI组件应设计为能对状态变化做出反应。

## Diagrams

{
(占位符，例如显示客户端订阅Supabase并接收更新的图表)
}

## Dev Notes

- 如果多个匿名用户共享一个没有唯一`user_id`的客户端实例，需明确过滤指令更新的策略。一种方法是客户端记住当前会话中已提交指令的ID，并基于这些ID过滤更新。
- 考虑显示状态更新的用户体验 (例如通知、加载指示器、状态消息)。

## Chat Command Log

{
(占位符)
}

## Examples

<example>
(Placeholder for a valid rule application example)
</example> 