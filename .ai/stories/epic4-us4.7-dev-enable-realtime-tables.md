# Epic-4 - 用户故事-4.7 (PRD US4.7)

开发者 - 为表启用实时功能

**作为** 开发者
**我希望** 确保Supabase的实时功能已为`commands`和`results`表（或至少是`commands`表）启用
**以便** 客户端和服务器可以订阅这些表的变更，实现实时通信。

## Status

草稿

## Context

{
- 背景信息: Supabase的实时功能是项目核心通信机制的基础。
- 当前状态: `commands`和`results`表已创建。
- 故事理由: 如果实时功能未在数据库层面为特定表启用，SDK中的订阅尝试将失败。
- 技术背景: 涉及在Supabase仪表盘的Database -> Replication部分检查和配置哪些表加入了`supabase_realtime`发布。
}

## Estimation

故事点: {待定}

## Tasks

{
1. - [ ] 导航到Supabase仪表盘，选择对应项目。
2. - [ ] 进入 "Database" -> "Replication" 部分。
3. - [ ] 在 "Source" 下查看当前的复制设置，通常会看到一个名为 `supabase_realtime` 的publication。
4. - [ ] 点击 `supabase_realtime` publication右侧的数字（表示发布的表数量）或编辑按钮，查看哪些表被包含。
5. - [ ] 确认 `public.commands` 表（以及根据需要，`public.results` 表）是否在列表中。
6. - [ ] 如果`commands`表（或`results`表）未被发布：
   1. - [ ] 勾选 `public.commands` (和 `public.results`) 使其能被发布 (all tables / specific tables)。
   2.  或者通过SQL `ALTER PUBLICATION supabase_realtime ADD TABLE commands, results;` (确保使用正确的schema，通常是`public`)
7. - [ ] 保存更改（如果通过UI操作）。
8. - [ ] 验证：
   1. - [ ] 服务器端能否成功建立对`commands`表的实时订阅 (US1.3)。
   2. - [ ] 客户端能否成功建立对`commands`表（或其记录）的实时订阅 (US2.3)。
}

## Constraints

- 更改复制设置可能需要短暂的数据库操作，一般很快完成。
- 必须确保至少`commands`表启用了实时，因为服务器和客户端都依赖于此。

## Data Models / Schema

- `commands` 表。
- `results` 表 (可选，取决于客户端是否直接订阅它)。

## Structure

- Supabase数据库复制配置。

## Diagrams

{
(占位符)
}

## Dev Notes

- Supabase默认可能为所有public schema下的新表启用realtime，但最好显式检查和确认。
- 如果遇到订阅问题，这里是首要检查点之一。
- PRD中，客户端主要订阅`commands`表的状态变化。

## Chat Command Log

{
(占位符)
} 