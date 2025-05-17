# Epic-4 - 用户故事-4.4 (PRD US4.4)

开发者 - 配置客户端Anon Key

**作为** 开发者
**我希望** 为Web客户端配置Supabase的匿名API密钥 (anon key)
**以便** 客户端能够安全地连接到Supabase项目并执行其权限范围内的操作（如插入`commands`，读取`commands`和`results`，具体取决于RLS策略）。

## Status

草稿

## Context

{
- 背景信息: Web客户端需要一个公开的密钥来与Supabase交互。
- 当前状态: Supabase项目已创建 (US4.1)。
- 故事理由: anon key是Supabase提供给公开客户端使用的，它会受到RLS策略的限制。
- 技术背景: anon key在项目设置的API部分可以找到。它可以安全地嵌入到客户端代码中。
}

## Estimation

故事点: {待定}

## Tasks

{
1. - [ ] 导航到Supabase项目的仪表盘。
2. - [ ] 进入 "Project Settings" (项目设置)。
3. - [ ] 选择 "API" 标签页。
4. - [ ] 找到 "Project API keys" 部分下的 "anon" (public) 密钥。
5. - [ ] 复制此密钥以及项目的URL。
6. - [ ] 在Web客户端代码中配置此anon key和项目URL (参考US2.1 - 客户端Supabase客户端初始化)。
   1. - [ ] 例如，在JavaScript初始化代码中设置 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`。
7. - [ ] 确保客户端能使用这些凭证成功初始化Supabase客户端实例。
}

## Constraints

- Anon key是公开的，但必须与正确的项目URL一起正确配置。
- 客户端的操作将受到为此anon key角色配置的RLS策略的严格限制。

## Data Models / Schema

不适用 (此故事关于密钥配置)。

## Structure

- 客户端初始化代码中配置URL和anon key的部分。

## Diagrams

{
(占位符)
}

## Dev Notes

- Anon key本身是安全的，可以公开。真正的安全性依赖于后续正确配置的RLS策略。
- 确保客户端使用的是 `anon` key 而不是 `service_role` key。

## Chat Command Log

{
(占位符)
} 