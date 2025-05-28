# Epic-2 - 用户故事-2.1 (辅助)

客户端 - Supabase客户端初始化

**作为** Web客户端应用
**我希望** 在加载时能够使用正确的Supabase项目URL和匿名密钥 (anon key) 初始化Supabase客户端实例
**以便** 我可以与Supabase后端进行交互，如发送指令和订阅更新。

## Status

已完成

## Context

{
- 背景信息: 这是任何客户端Supabase交互的基础步骤。
- 当前状态: 客户端可能尚未集成或配置Supabase SDK。
- 故事理由: 确保客户端应用程序能够使用适当的（权限较低的）匿名密钥连接到Supabase项目以进行面向公众的操作。
- 技术背景: 包括在客户端中引入Supabase JavaScript SDK（例如，通过脚本标签或捆绑），并使用项目URL和匿名密钥（公开可用）创建Supabase客户端实例。
- 相关历史: 这是US2.2, US2.3, US2.4, US2.5的前提。
}

## Estimation

故事点: {待定}

## Tasks

{
1.  - [x] 在Web客户端项目中包含Supabase JavaScript SDK (`@supabase/supabase-js`)（例如，如果使用捆绑器，则添加到 `package.json`，或在 `index.html` 中添加CDN链接）。
2.  - [x] ~~如果使用捆绑器，安装依赖项。~~ (由于使用CDN，此步骤跳过)
3.  - [x] 使Supabase项目URL和匿名密钥可用于客户端JavaScript（已直接在 `client/app.js` 中定义）。
4.  - [x] 在客户端JavaScript中（例如，在 `app.js` 中）实现逻辑，以便在页面加载或应用初始化时使用 `createClient` 初始化Supabase客户端实例。
5.  - [x] 使此客户端实例在客户端代码中或相关模块/作用域内全局可访问 (当前在 `app.js` 顶层作用域，满足现阶段需求)。
6.  - [x] 添加基本检查或控制台日志以确认客户端初始化成功。
7.  - [x] 处理初始化期间的潜在错误 (已添加对常量和SDK加载的检查，并在失败时更新状态)。
}

## Constraints

- 匿名密钥是公开的，但应正确配置。
- 客户端应在其生命周期的早期初始化Supabase。

## Data Models / Schema

不适用 (此故事关于客户端设置)。

## Structure

- 影响客户端JavaScript，可能在初始化块或主应用程序脚本 (`app.js`) 中。

## Diagrams

```mermaid
graph TD
    A[Web客户端加载] --> B[获取/加载配置 (Supabase URL, Anon Key)];
    B --> C[使用凭据初始化Supabase客户端];
    C -- 成功 --> D[Supabase客户端准备好进行客户端操作];
    C -- 失败 --> E[记录错误/处理客户端初始化失败];
```

## Dev Notes

- Supabase项目URL和匿名密钥设计为公开。但是，为了更清晰的配置，如果客户端比简单的HTML/JS设置更复杂，它们仍可能通过构建过程或非敏感配置文件进行管理。
- 确保SDK版本兼容且最新。

## Chat Command Log

{
(占位符)
} 