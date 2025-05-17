# 用户故事清单: Cursor远程控制 - Supabase迁移

本文档包含了将Cursor远程控制项目从Redis迁移到Supabase所需的详细用户故事。这些故事是基于已批准的PRD文档及其中的Epic划分生成的。

## Epic 1: 后端核心改造与Supabase集成
**目标**: 将服务器端的通信逻辑从Redis迁移到Supabase，实现指令的接收、处理状态更新以及结果的存储。

**用户故事**:

1.  **US1.1 (DB Schema - Commands Table)**
    *   **As a** 开发者,
    *   **I want** 在Supabase项目中根据PRD定义创建并配置`commands`数据表 (包含id, created_at, command_text, status, user_id, raw_command, attempts, last_error字段，以及正确的类型、约束和默认值),
    *   **So that** 应用程序有地方存储从客户端接收到的指令。

2.  **US1.2 (DB Schema - Results Table)**
    *   **As a** 开发者,
    *   **I want** 在Supabase项目中根据PRD定义创建并配置`results`数据表 (包含id, created_at, command_id, result_text, error_message, is_error, raw_result字段，以及正确的类型、约束、默认值和到`commands`表的外键),
    *   **So that** 应用程序有地方存储指令执行后的结果和错误信息。

3.  **US1.3 (Server - Subscribe to New Commands - PRD-US1)**
    *   **As a** Node.js服务器应用,
    *   **I want** 使用Supabase SDK实时订阅`commands`表中`status`为 'pending' 的新记录,
    *   **So that** 我可以即时获取并处理用户通过客户端发送的新指令。

4.  **US1.4 (Server - Update Command Status to Processing - PRD-US2)**
    *   **As a** Node.js服务器应用,
    *   **I want** 在从`commands`表接收到一个待处理指令后，立即通过Supabase SDK将该指令记录的`status`字段更新为 'processing',
    *   **So that** 系统的其他部分（包括可能的客户端）知道该指令正在被处理中。

5.  **US1.5 (Server - Store Execution Result - PRD-US3)**
    *   **As a** Node.js服务器应用,
    *   **I want** 在通过AppleScript执行完一条指令后，能将执行结果（包括`result_text` for success, or `error_message` for failure, and `is_error` flag）通过Supabase SDK作为一条新记录存入`results`表，并确保其通过`command_id`与原始指令正确关联,
    *   **So that** 指令的执行产出被持久化，并可供客户端查询。

6.  **US1.6 (Server - Update Command Status to Completed/Error - PRD-US4)**
    *   **As a** Node.js服务器应用,
    *   **I want** 在指令执行完毕并将结果成功存入`results`表之后，通过Supabase SDK将`commands`表中对应指令记录的`status`字段更新为 'completed' (如果成功) 或 'error' (如果失败)，同时如果失败则更新`last_error`字段,
    *   **So that** 客户端和其他系统部分可以准确了解指令的最终执行状态。

7.  **US1.7 (Server - Error Handling for Script Execution - PRD-US7Srv)**
    *   **As a** Node.js服务器应用,
    *   **I want** 妥善处理AppleScript执行过程中可能发生的各种错误（例如，脚本找不到、执行超时、Cursor应用无响应、脚本内部错误等），并将具体的错误信息记录到`results.error_message`和`commands.last_error`中，同时设置`results.is_error`为TRUE，并将`commands.status`更新为'error',
    *   **So that** 错误信息能够被准确记录和传递，方便问题排查和用户反馈。

8.  **US1.8 (Server - Supabase Client Initialization)**
    *   **As a** Node.js服务器应用,
    *   **I want** 在启动时能够使用正确的Supabase项目URL和服务角色密钥 (service_role key) 初始化Supabase客户端实例,
    *   **So that** 我可以安全地与Supabase后端进行所有必要的数据库操作。

## Epic 2: 客户端核心改造与Supabase集成
**目标**: 将客户端的通信逻辑从Redis迁移到Supabase，实现指令的发送和对指令执行结果的实时接收与展示。

**用户故事**:

1.  **US2.1 (Client - Supabase Client Initialization)**
    *   **As a** Web客户端应用,
    *   **I want** 在加载时能够使用正确的Supabase项目URL和匿名密钥 (anon key) 初始化Supabase客户端实例,
    *   **So that** 我可以与Supabase后端进行交互，如发送指令和订阅更新。

2.  **US2.2 (Client - Send Command - PRD-US5)**
    *   **As a** Web客户端应用,
    *   **I want** 当用户在界面输入指令并确认发送时，将该指令的文本内容（`command_text`）通过Supabase SDK作为一条新记录插入到`commands`表中，并设置初始`status`为 'pending',
    *   **So that** 用户发出的指令可以被后端服务器接收和处理。

3.  **US2.3 (Client - Subscribe to Command Status - PRD-US6)**
    *   **As a** Web客户端应用,
    *   **I want** 在成功发送一条指令（即在`commands`表中创建记录）后，能使用Supabase SDK实时订阅该特定指令记录的`status`字段的变化,
    *   **So that** 我可以实时了解该指令的执行进展（如 'processing', 'completed', 'error'）。

4.  **US2.4 (Client - Fetch and Display Result)**
    *   **As a** Web客户端应用,
    *   **I want** 当我订阅的`commands`记录的`status`更新为 'completed' 或 'error' 时，能自动根据该记录的`id` (即`command_id`) 从`results`表中查询对应的结果记录,
    *   **So that** 我可以获取到详细的执行结果或错误信息。

5.  **US2.5 (Client - Display Result/Error to User - PRD-US7Cli)**
    *   **As a** Web客户端应用,
    *   **I want** 在获取到`results`表中的执行结果后，清晰地在用户界面上展示`result_text` (如果成功) 或 `error_message` (如果失败),
    *   **So that** 用户可以明确知道他们指令的执行情况。

6.  **US2.6 (Client - Handle Realtime Connection Issues)**
    *   **As a** Web客户端应用,
    *   **I want** 优雅地处理Supabase实时订阅连接可能出现的暂时中断或错误，并在适当时尝试重连，同时给用户适当的反馈（如"正在重新连接..."）,
    *   **So that** 用户体验在网络不稳的情况下尽可能平滑。

## Epic 3: 核心功能迁移验证与端到端测试
**目标**: 确保所有PRD中定义的用户场景和现有核心功能在迁移到Supabase后能够正确、稳定地运行。

**用户故事**:

1.  **US3.1 (E2E Test - Chat Command - PRD-US8)**
    *   **As a** 测试者,
    *   **I want** 模拟用户通过客户端发送不同模式（chat, agent, ask）的聊天指令，验证指令能成功通过Supabase传递给服务器，服务器能正确调用AppleScript与Cursor交互，并且Cursor的聊天回复能通过Supabase正确返回并显示在客户端,
    *   **So that** 核心的聊天功能在迁移后按预期工作。

2.  **US3.2 (E2E Test - Action Command - PRD-US9)**
    *   **As a** 测试者,
    *   **I want** 模拟用户通过客户端发送各种支持的动作指令（如'新建聊天', '清除聊天', '保存代码', '运行代码'），验证这些动作能被服务器正确解析并通过AppleScript在Cursor中成功执行，同时客户端能收到相应的确认或结果,
    *   **So that** 核心的动作执行功能在迁移后按预期工作。

3.  **US3.3 (E2E Test - Error Handling Path)**
    *   **As a** 测试者,
    *   **I want** 模拟指令执行过程中可能发生的错误场景（例如，AppleScript执行失败、Cursor未运行导致AppleScript无法交互、传递无效指令给服务器等），验证错误信息能够被服务器捕获，正确存入`results`表和更新`commands`表状态，并最终在客户端清晰展示给用户,
    *   **So that** 系统的错误处理和反馈机制在新架构下是有效的。

4.  **US3.4 (E2E Test - Basic Performance/Responsiveness)**
    *   **As a** 测试者,
    *   **I want** 在执行核心功能的端到端测试时，主观评估指令发送到结果显示的响应时间，确保其在可接受的"不太慢"范围内，没有出现比原Redis方案明显更差的延迟,
    *   **So that** 迁移后的系统在基本性能上满足个人使用的要求。

## Epic 4: Supabase基础设施配置与初步安全设置
**目标**: 正确配置Supabase项目，建立数据表，并实施初步的行级安全 (RLS) 策略以满足当前阶段的需求。

**用户故事**:

1.  **US4.1 (Supabase Project Setup)**
    *   **As a** 开发者,
    *   **I want** 在Supabase云平台上成功创建一个新的后端项目，并记录下项目URL和API密钥等关键信息,
    *   **So that** 我的应用程序有一个可以连接和使用的Supabase实例。

2.  **US4.2 (Implement DB Schema via Supabase UI/SQL - Covered by US1.1, US1.2)**
    *   (此用户故事的功能已由US1.1和US1.2覆盖，即通过开发者操作创建表结构)

3.  **US4.3 (Server API Key Configuration)**
    *   **As a** 开发者,
    *   **I want** 为Node.js服务器应用安全地配置和使用Supabase的服务角色API密钥 (service_role key),
    *   **So that** 服务器应用拥有完全权限访问其所需的Supabase资源。

4.  **US4.4 (Client API Key Configuration)**
    *   **As a** 开发者,
    *   **I want** 为Web客户端应用安全地配置和使用Supabase的匿名API密钥 (anon key),
    *   **So that** 客户端应用可以代表匿名用户执行允许的操作。

5.  **US4.5 (RLS for `commands` Table)**
    *   **As a** 开发者,
    *   **I want** 为`commands`表设置行级安全 (RLS) 策略，具体如下：
        *   允许匿名用户 (anon role) `INSERT` 新的指令记录。
        *   允许匿名用户 `SELECT` 所有指令记录 (考虑到当前不区分用户，且客户端需要订阅自己创建的记录变化，初期允许读取所有，后续可根据`user_id`完善)。
        *   允许服务角色 (service_role) `UPDATE` 任何指令记录的`status`和`last_error`字段。
        *   允许服务角色 `SELECT` 所有指令记录。
        *   拒绝其他所有操作 (如匿名用户的DELETE, UPDATE等)。
    *   **So that** `commands`表的访问权限符合应用逻辑和安全需求。

6.  **US4.6 (RLS for `results` Table)**
    *   **As a** 开发者,
    *   **I want** 为`results`表设置行级安全 (RLS) 策略，具体如下：
        *   允许服务角色 (service_role) `INSERT` 新的结果记录。
        *   允许匿名用户 `SELECT` 所有结果记录 (理由同上，初期允许读取所有，后续可根据`command_id`和潜在的`user_id`进行更细致的关联查询控制)。
        *   允许服务角色 `SELECT` 所有结果记录。
        *   拒绝其他所有操作。
    *   **So that** `results`表的访问权限符合应用逻辑和安全需求。

7.  **US4.7 (Enable Realtime for Tables)**
    *   **As a** 开发者,
    *   **I want** 在Supabase项目配置中，确保为`commands`表（特别是`status`字段的更新）和（如果需要直接订阅）`results`表启用了实时数据库功能,
    *   **So that** 客户端和服务器端能够通过Supabase的实时订阅机制接收数据变更通知。

8.  **US4.8 (Documentation for Setup and RLS)**
    *   **As a** 开发者,
    *   **I want** 简要记录Supabase项目的关键配置步骤和已实施的RLS策略,
    *   **So that** 项目的维护者和未来的开发者可以理解和复现这些配置。

请审阅这份详细的用户故事清单。如果这符合您的预期，我们可以将其作为后续开发迭代和任务分配的基础。 