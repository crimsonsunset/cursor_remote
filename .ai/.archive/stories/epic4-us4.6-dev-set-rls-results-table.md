# Epic-4 - 用户故事-4.6 (PRD US4.6)

开发者 - 为`results`表设置RLS策略

**作为** 开发者
**我希望** 为`results`表设置初步的行级安全 (RLS) 策略
**以便** 控制对指令执行结果数据的访问，特别是允许客户端读取与其指令相关的结果，并允许服务器写入结果。

## Status

草稿

## Context

{
- 背景信息: RLS策略需要应用于所有包含敏感或用户相关数据的表。
- 当前状态: `results`表已创建 (US1.6/PRD)，API密钥已配置。
- 故事理由: 保护指令执行结果数据，确保只有授权的角色可以访问。
- 技术背景: 涉及在Supabase仪表盘为`results`表创建SQL策略。
}

## Estimation

故事点: {待定}

## Tasks

{
1. - [ ] 导航到Supabase仪表盘，选择对应项目。
2. - [ ] 进入 "Authentication" -> "Policies" 部分。
3. - [ ] 如果尚未为`results`表启用RLS，首先启用它。
4. - [ ] 为`results`表创建以下策略 (基于PRD US4.6的描述):
   1.  - [ ] **允许服务角色创建新记录 (INSERT):**
       - 名称: `Allow service_role insert to results`
       - Target roles: `service_role` (同commands表，service_role默认绕过RLS，此为显式声明或文档目的)
       - Operation: `INSERT`
       - USING expression: `true`
       - WITH CHECK expression: `true`
   2.  - [ ] **允许匿名/认证用户读取与其自己`commands`记录相关联的`results`记录 (SELECT):**
       - 名称: `Allow anon/auth select own results` (或 `Allow anon/auth select all results`)
       - Target roles: `anon`, `authenticated`
       - Operation: `SELECT`
       - USING expression: PRD提到"*初期可能需要更宽松的策略*"。理想情况下，这需要一个JOIN或子查询来检查`results.command_id`对应的`commands`记录是否属于当前用户（例如 `EXISTS (SELECT 1 FROM commands WHERE commands.id = results.command_id AND commands.user_id = auth.uid())`）。如果初期`user_id`不可靠或策略宽松，可设为 `true`。
   3.  - [ ] **允许服务角色读取所有记录 (SELECT):**
       - 名称: `Allow service_role select all results`
       - Target roles: `service_role`
       - Operation: `SELECT`
       - USING expression: `true`
5. - [ ] （可选，但推荐）添加一个默认的DENY ALL策略。
6. - [ ] 测试策略：
   1. - [ ] 使用客户端的anon key尝试读取相关的和不相关的`results`记录。
   2. - [ ] 确保服务器能写入`results`。
}

## Constraints

- 读取`results`的策略可能需要正确关联到`commands`表来判断所有权，这取决于`commands`表RLS和`user_id`的实现。
- PRD指明初期策略可能较宽松。

## Data Models / Schema

- `results` 表。
- `commands` 表 (用于关联检查)。

## Structure

- Supabase RLS策略SQL定义。

## Diagrams

{
(占位符)
}

## Dev Notes

- `results`表的SELECT策略是最复杂的，因为它依赖于`commands`表的所有权。如果`commands.user_id`和`auth.uid()`在初期不强制关联，那么实现"自己的结果"会比较困难，可能需要退回到更宽松的策略（例如，允许读取所有，或者基于客户端在请求时提供的某些会话标识符——但这需要更复杂的查询）。
- PRD强调初期策略可以宽松。简单的`USING expression: true` 对于SELECT可能是初期的选择。

## Chat Command Log

{
(占位符)
} 