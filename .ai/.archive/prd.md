# 产品需求文档 (PRD): Cursor远程控制解决方案 - Supabase迁移

## 1. 引言

### 1.1. 项目背景
当前Cursor远程控制项目通过手机客户端发送指令，经由Redis Pub/Sub传递至Mac上的Node.js服务器，通过AppleScript控制Cursor应用，并将结果通过Redis返回。

### 1.2. 问题痛点
现有架构依赖Redis公网访问，增加了配置复杂性并带来潜在安全风险。

### 1.3. 目标
本次迭代的目标是采用Supabase替换现有的Redis Pub/Sub通信机制，以解决公网访问的安全性和复杂性问题，并简化后端基础设施。预期将提升安全性、简化网络配置、实现结构化数据存储，并为未来利用更多BaaS功能奠定基础。

### 1.4. 项目范围
- **范围内**:
    - 使用Supabase实时数据库替换Redis Pub/Sub功能。
    - 迁移客户端和服务器端的通信逻辑以适配Supabase SDK。
    - 设计和实现`commands`和`results`数据表以支持现有功能。
    - 配置Supabase行级安全 (RLS)策略以保护数据（初期将较为宽松，后续根据用户体系完善）。
    - 确保所有现有核心功能（如聊天、执行动作）在迁移后正常工作。
- **范围外** (本次迭代不包括):
    - 引入新的用户功能 (除非为支持迁移所必需)。
    - 对客户端UI/UX进行重大修改。
    - 全面集成Supabase的其他服务 (如Auth、Storage)，除非与核心通信迁移直接相关。
    - 本次迭代不包含用户认证功能的实现。

## 2. 用户及场景

### 2.1. 目标用户
现有Cursor远程控制解决方案的用户（初期主要为开发者个人使用）。

### 2.2. 用户场景 (保持现有功能)
- 用户能够通过手机客户端发送控制命令到Cursor应用。
- 用户能够实时接收到Cursor应用执行命令后的结果。
- 支持的命令类型包括但不限于：聊天 (chat, agent, ask模式)、动作 (新建聊天, 清除聊天, 保存代码, 运行代码)。

## 3. 建议解决方案概述 (基于项目简报)

采用Supabase作为后端即服务 (BaaS)平台，核心变更包括：
- **数据通信迁移**: 使用Supabase的实时数据库 (PostgreSQL + Realtime) 替代Redis Pub/Sub。
- **数据模型**:
    - `commands` 表：存储从客户端发送的指令 (指令内容, 状态, 时间戳)。`user_id` 字段作为未来用户认证的占位符。
    - `results` 表：存储Cursor执行结果 (关联的指令ID, 时间戳, 结果内容, 错误信息)。
- **客户端改造**: 使用Supabase SDK将指令写入`commands`表，并实时订阅`commands`表的状态变更以获取结果通知。
- **服务器端改造**: 使用Supabase SDK订阅`commands`表中的新指令，处理后将结果写入`results`表，并更新`commands`表状态。
- **安全性**: 初期行级安全 (RLS) 策略将允许认证的服务器角色进行必要操作，客户端操作将基于匿名或公共角色（待细化）。由于初期不实现用户认证，数据隔离不是首要目标。

## 4. 详细需求

### 4.1. 数据模型

#### 4.1.1. `commands` 表
| 字段名        | 类型        | 描述                                     | 约束/备注                                     |
|---------------|-------------|------------------------------------------|-----------------------------------------------|
| id            | UUID        | 主键，唯一标识                           | Supabase自动生成 (PK)                         |
| created_at    | TIMESTAMPTZ | 创建时间戳                               | Supabase自动生成, `now()`                      |
| command_text  | TEXT        | 命令内容 (用户输入的自然语言)            | NOT NULL                                      |
| status        | TEXT        | 命令状态 (例如: 'pending', 'processing', 'completed', 'error') | NOT NULL, 默认 'pending'                 |
| user_id       | UUID        | (可选) 用户标识                           | 占位符，供未来用户认证功能使用，当前可为空 |
| raw_command   | JSONB       | (可选) 结构化的原始命令数据              |                                               |
| attempts      | INTEGER     | (可选) 重试次数                           | 默认 0                                        |
| last_error    | TEXT        | (可选) 最后一次错误信息                   |                                               |

#### 4.1.2. `results` 表
| 字段名        | 类型        | 描述                                   | 约束/备注                                     |
|---------------|-------------|----------------------------------------|-----------------------------------------------|
| id            | UUID        | 主键，唯一标识                         | Supabase自动生成 (PK)                         |
| created_at    | TIMESTAMPTZ | 创建时间戳                             | Supabase自动生成, `now()`                    |
| command_id    | UUID        | 关联的`commands`表中的指令ID           | NOT NULL, FK to `commands.id`                 |
| result_text   | TEXT        | 执行结果内容 (Cursor的直接输出，格式不定) |                                               |
| error_message | TEXT        | 错误信息 (如果发生错误)                |                                               |
| is_error      | BOOLEAN     | 标记是否为错误结果                     | NOT NULL, 默认 FALSE                         |
| raw_result    | JSONB       | (可选) 结构化的原始结果数据            | 用于存储Cursor的原始输出，方便后续处理或分析 |

### 4.2. 安全需求
- 服务器端脚本（Node.js应用）应具有创建`commands`记录（如果命令源于服务器端）、读取`commands`记录、创建`results`记录以及更新`commands`表状态的权限。
- 客户端应具有创建`commands`记录和读取`commands`、`results`记录的权限（具体通过RLS实现，初期可能较为宽松）。
- **当前版本不实现用户特定的数据隔离。** 所有通过客户端写入的`commands`和关联的`results`在数据库层面可能是共享可见的（具体取决于RLS的宽松度）。
- `user_id`字段当前不用于RLS策略中的数据隔离。

### 4.3. 功能需求 (用户故事形式)

**核心通信迁移**
- **US1**: 作为服务器，我希望能实时订阅`commands`表中新创建的、状态为'pending'的指令，以便及时处理。
- **US2**: 作为服务器，当接收到一条指令后，我希望能将其在`commands`表中的状态更新为'processing'，以表明正在处理。
- **US3**: 作为服务器，在指令执行完毕后（无论成功或失败），我希望能将执行结果（包括`result_text`、`error_message`、`is_error`标志）记录到`results`表中，并关联到原始指令ID。
- **US4**: 作为服务器，在指令执行完毕并记录结果后，我希望能将`commands`表中对应指令的状态更新为'completed'或'error'。
- **US5**: 作为客户端，我希望能将用户发出的控制指令（`command_text`为自然语言）写入到Supabase的`commands`表中。
- **US6**: 作为客户端，我希望能实时订阅`commands`表的状态变化。当一个我发起的指令状态变为'completed'或'error'时，我能获取到关联的`results`表中的信息并展示给用户。
- **US7**: 作为服务器或客户端，当指令执行出错时，相关的错误信息应保存在`results`表的`error_message`字段和`commands`表的`last_error`字段，并且`results.is_error`应设为TRUE。客户端应能展示这些错误信息。

**保持现有功能 (示例)**
- **US8**: 作为用户，我希望能通过客户端发送一个包含自然语言的"聊天"命令给Cursor，并能实时看到Cursor的回复（`result_text`）。
- **US9**: 作为用户，我希望能通过客户端发送一个包含自然语言的"执行动作"（如'新建聊天'）的命令给Cursor，并能实时看到操作结果或确认（`result_text`）。
- ... (其他现有功能的迁移用户故事，确保核心交互流程不变)

### 4.4. 非功能性需求
- **性能**: 实时消息传递的延迟应"不太慢"，满足个人使用的基本体验。初期不设具体量化指标。
- **可靠性**: 系统应能处理偶发的网络中断。基本的目标是指令和结果不错不漏。复杂的重试机制和错误恢复流程初期从简。
- **可维护性**: 代码结构应清晰，Supabase的配置和RLS策略（即使初期简单）应有文档记录。
- **安全性**: 核心目标是解决Redis公网暴露问题。Supabase提供的基础安全机制应被正确使用。
- **可伸缩性**: 初期为个人使用设计，暂不考虑大规模并发或数据量。
- **数据保留**: `commands`和`results`表的数据保留策略暂无特殊要求，按Supabase默认或后续定义。

## 5. 成功标准
- 所有在简报中提及的核心功能（通过手机远程控制Cursor执行各种操作，核心交互流程不变）在迁移到Supabase后能正常运行。
- 系统响应速度满足个人使用的基本需求，不出现明显卡顿。
- Redis公网暴露的问题得到解决，系统安全性相比之前有提升。
- 开发者能够清晰理解和维护新的Supabase集成方案。
- **定性为主，暂无具体量化指标。**

## 6. 基于用户反馈的关键决策与假设

根据用户在 [YYYY-MM-DD] 的反馈，针对先前版本PRD中的"待澄清问题"，现做出以下关键决策和假设：

1.  **用户认证与识别**:
    *   **决策**: 本次迁移**不包含**用户认证功能的实现。
    *   **假设**: `commands.user_id`字段仅作为未来用户认证功能的占位符，当前版本中该字段可为空或不用于逻辑判断。系统按单用户或共享客户端模式运行，不实现用户间数据的严格隔离。一个在线客户端可能服务于多个匿名用户或一个共享身份。

2.  **指令(`command_text`)和结果(`result_text`)的具体格式**:
    *   **决策**: `commands.command_text`接收用户输入的随意自然语言。`results.result_text`存储Cursor返回的直接结果，其格式不固定。
    *   **假设**: 服务器端和客户端需要能够处理和展示这种格式不定的`result_text`。`results.raw_result` (JSONB)可考虑用于存储原始输出，以备未来进行更结构化的处理。

3.  **错误处理与状态**:
    *   **决策**: `commands`表的`status`字段和`results`表中的`error_message`、`is_error`字段对于错误处理已足够。无需添加更细致的错误状态定义。
    *   **假设**: 当指令执行出错时，错误信息将被存入Supabase，客户端负责获取并在界面上向用户展示这些信息。

4.  **实时更新的细节**:
    *   **决策**: 客户端将通过订阅`commands`表的状态变化来感知指令完成和获取结果。对实时更新的延迟没有具体要求，满足"不太慢"即可。
    *   **推荐**: 客户端订阅其创建的`commands`记录的变化。当`status`变为 'completed' 或 'error' 时，客户端再根据`command_id`查询对应的`results`记录。

5.  **非功能性需求**:
    *   **决策**: 初期主要目标是实现功能可用性，供开发者个人使用。性能、可伸缩性、复杂的数据保留策略等优化工作后续再考虑。
    *   **假设**: 当前对并发用户数、数据量、具体响应时间等没有严格的非功能性指标要求。

6.  **本次迁移范围的进一步确认**:
    *   **决策**: 本次迁移**仅专注于替换Redis Pub/Sub的核心通信功能**。AppleScript和Node.js服务器的核心业务逻辑保持不变，仅做必要的Supabase SDK集成和适配。不包含利用Supabase其他高级功能（如Auth的深度集成、Storage等）的初步步骤。
    *   **假设**: 客户端的UI/UX将保持最小程度的必要修改，以适配新的后端通信机制，核心功能展示和交互流程不变。

7.  **衡量成功的具体指标**:
    *   **决策**: 本次迁移的成功标准主要为定性评估（如核心功能可用，安全问题解决），**暂不设定具体的量化指标** (例如，错误率降低X%，特定操作的平均延迟不超过Y毫秒)。

## 7. 未来展望 (范围外)
- 实现基于Supabase Auth的用户认证系统，支持多用户及数据隔离。
- 结构化`command_text`和`result_text`，提供更丰富的交互和数据分析能力。
- 优化错误处理机制，提供更友好的用户反馈。
- 根据用户增长和使用情况，进行性能和可伸缩性优化。
- 探索集成Supabase Storage存储相关文件或日志。

请您审阅更新后的PRD。如果内容准确反映了您的需求和我们的讨论结果，我们可以将其作为本次迁移工作的基础。

## 8. Epic及主要用户故事

根据已确认的需求，我们将迁移工作划分为以下主要Epic，并列出各Epic下的核心用户故事。

### Epic 1: 后端核心改造与Supabase集成
**目标**: 将服务器端的通信逻辑从Redis迁移到Supabase，实现指令的接收、处理状态更新以及结果的存储。
**涉及组件**: Node.js服务器应用, Supabase数据库 (tables: `commands`, `results`), AppleScript交互层。

**主要用户故事**:
- **US1.1 (PRD-US1)**: 作为服务器，我希望能使用Supabase SDK实时订阅`commands`表中新创建的、状态为'pending'的指令，以便及时获取并处理。
- **US1.2 (PRD-US2)**: 作为服务器，当从`commands`表接收到一条指令后，我希望能通过Supabase SDK将其在表中的`status`字段更新为'processing'。
- **US1.3 (PRD-US3)**: 作为服务器，在通过AppleScript与Cursor交互并执行指令完毕后（无论成功或失败），我希望能将执行结果（包括`result_text`、`error_message`、`is_error`标志）通过Supabase SDK记录到`results`表中，并确保其与原始指令通过`command_id`关联。
- **US1.4 (PRD-US4)**: 作为服务器，在指令执行完毕并将结果存入`results`表后，我希望能通过Supabase SDK将`commands`表中对应指令的`status`字段更新为'completed'或'error'（同时可更新`last_error`字段）。
- **US1.5**: 作为开发者，我需要在Supabase项目中根据PRD定义创建`commands`数据表，包含`id`, `created_at`, `command_text`, `status`, `user_id` (nullable), `raw_command` (nullable), `attempts` (nullable), `last_error` (nullable) 字段及相应的类型和约束。
- **US1.6**: 作为开发者，我需要在Supabase项目中根据PRD定义创建`results`数据表，包含`id`, `created_at`, `command_id` (FK to commands), `result_text` (nullable), `error_message` (nullable), `is_error`, `raw_result` (nullable) 字段及相应的类型和约束。
- **US1.7 (PRD-US7Srv)**: 作为服务器，当处理出错时（例如AppleScript执行失败、Cursor无响应等），我能捕获这些错误，并将错误信息存入`results.error_message`及`commands.last_error`，同时设置`results.is_error`为TRUE，更新`commands.status`为'error'。

### Epic 2: 客户端核心改造与Supabase集成
**目标**: 将客户端的通信逻辑从Redis迁移到Supabase，实现指令的发送和对指令执行结果的实时接收与展示。
**涉及组件**: Web客户端 (HTML/CSS/JavaScript), Supabase SDK (JavaScript)。

**主要用户故事**:
- **US2.1 (PRD-US5)**: 作为客户端，当用户输入指令并确认发送后，我希望能使用Supabase SDK将该指令（主要是`command_text`）作为一条新记录插入到Supabase的`commands`表中，初始状态为'pending'。
- **US2.2 (PRD-US6)**: 作为客户端，我希望能使用Supabase SDK实时订阅我之前创建的`commands`记录的状态变化。当其`status`更新为'completed'或'error'时，我能得到通知。
- **US2.3**: 作为客户端，当接收到`commands`记录状态变更通知（变为'completed'或'error'）后，我能根据`command_id`从`results`表中获取对应的结果记录，并将`result_text`或`error_message`展示给用户。
- **US2.4 (PRD-US7Cli)**: 作为客户端，当指令执行出错并且我获取到错误信息后，我能清晰地在界面上向用户展示该错误信息。

### Epic 3: 核心功能迁移验证与端到端测试
**目标**: 确保所有PRD中定义的用户场景和现有核心功能在迁移到Supabase后能够正确、稳定地运行。
**涉及组件**: 完整的系统（客户端、服务器、Supabase、AppleScript、Cursor）。

**主要用户故事**:
- **US3.1 (PRD-US8 & US9)**: 作为用户，我能通过迁移后的客户端发送"聊天"（包含不同模式）和"执行动作"类型的自然语言指令，服务器能正确通过AppleScript驱动Cursor执行，并且我能在客户端实时看到Cursor返回的准确结果或错误信息。
- **US3.2**: 作为测试者，我将对PRD中定义的所有核心用户场景进行端到端测试，验证指令从发送到结果返回的整个流程在新架构下的正确性和基本响应速度。
- **US3.3**: 作为测试者，我将模拟不同的错误场景（如AppleScript执行失败、Cursor无响应、无效指令等），验证错误信息能否正确传递并在客户端展示。

### Epic 4: Supabase基础设施配置与初步安全设置
**目标**: 正确配置Supabase项目，建立数据表，并实施初步的行级安全 (RLS) 策略以满足当前阶段的需求。
**涉及组件**: Supabase Dashboard/CLI。

**主要用户故事**:
- **US4.1**: 作为开发者，我能在Supabase云平台创建一个新的项目用于此应用。
- **US4.2**: 作为开发者，我能根据US1.5和US1.6中定义的表结构，在Supabase项目中实际创建`commands`和`results`表，并配置好主键、外键等关系。
- **US4.3**: 作为开发者，我需要为Node.js服务器应用创建一个专用的Supabase服务角色API密钥 (service_role key)，确保它拥有对`commands`和`results`表进行读写和更新的权限。
- **US4.4**: 作为开发者，我需要为Web客户端配置Supabase的匿名API密钥 (anon key)。
- **US4.5**: 作为开发者，我需要为`commands`表设置初步的RLS策略：
    - 允许匿名/认证用户（anon/authenticated role）创建新记录 (INSERT)。
    - 允许匿名/认证用户读取他们自己创建的记录 (SELECT) - *初期可能需要更宽松的策略，如允许读取所有，待确认实现难度和必要性*。
    - 允许服务角色 (service_role) 更新任何记录 (UPDATE - 主要用于服务器更新status)。
    - 允许服务角色读取所有记录 (SELECT)。
- **US4.6**: 作为开发者，我需要为`results`表设置初步的RLS策略：
    - 允许服务角色创建新记录 (INSERT)。
    - 允许匿名/认证用户读取与他们自己`commands`记录相关联的`results`记录 (SELECT) - *同上，初期可能需要更宽松的策略*。
    - 允许服务角色读取所有记录 (SELECT)。
- **US4.7**: 作为开发者，我需要确保Supabase的实时功能已为`commands`和`results`表启用，以便客户端和服务器可以订阅变更。

这些Epic和用户故事为迁移工作提供了一个结构化的框架。在实际开发过程中，这些用户故事可以进一步细化为更小的任务。请您审阅，看看是否覆盖了迁移的核心需求。我们可以根据您的反馈进行调整。 