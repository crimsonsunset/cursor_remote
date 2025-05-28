# Epic-4 - 用户故事-4.3 (PRD US4.3)

开发者 - 配置服务器Service Role Key

**作为** 开发者
**我希望** 为Node.js服务器应用获取并配置专用的Supabase服务角色API密钥 (service_role key)
**以便** 服务器拥有对`commands`和`results`表进行完全读写和更新的权限，并能绕过RLS。

## Status

完成

## Context

{
- 背景信息: Node.js服务器作为受信任的后端，需要最高权限与Supabase交互。
- 当前状态: Supabase项目已创建 (US4.1)。
- 故事理由: service_role key允许服务器执行管理级操作，例如不受RLS限制地更新所有记录或执行敏感操作。
- 技术背景: service_role key在项目设置的API部分可以找到。它需要在服务器环境中安全地配置。
}

## Estimation

故事点: {待定}

## Tasks

{
1. - [x] 导航到Supabase项目的仪表盘。
2. - [x] 进入 "Project Settings" (项目设置)。
3. - [x] 选择 "API" 标签页。
4. - [x] 找到 "Project API keys" 部分下的 "service_role" 密钥。
5. - [x] **安全地**复制此密钥。
6. - [x] 为Node.js服务器应用配置环境变量 (例如，在 `.env` 文件中设置 `SUPABASE_SERVICE_KEY` 为复制的密钥值)。
7. - [x] 确保服务器代码 (参考US1.8 - 服务器Supabase客户端初始化) 读取此环境变量以初始化Supabase admin客户端。
8. - [x] 验证服务器是否能使用此密钥成功连接并执行需要提升权限的操作（初步验证，完整验证在其他故事中）。
}

## Constraints

- **Service_role key 绝不能泄露到客户端或公开的代码仓库中。**
- 服务器必须配置为从安全的环境变量中读取此密钥。

## Data Models / Schema

不适用 (此故事关于密钥配置)。

## Structure

- 服务器端环境变量配置 (`.env` 或其他部署环境配置方式)。
- 服务器初始化代码中读取和使用此密钥的部分。

## Diagrams

{
(占位符)
}

## Dev Notes

- 强调service_role key的敏感性和安全存储的重要性。
- 这个密钥赋予了绕过所有RLS策略的权限，因此只能在受信任的服务器环境中使用。

## Chat Command Log

{
(占位符)
} 