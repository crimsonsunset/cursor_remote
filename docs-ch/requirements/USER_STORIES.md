# 用户故事详细列表

## 📋 文档信息
- **版本**: v2.0 (整合版)
- **来源**: 整合自.ai/user_stories.md和.ai/stories/目录
- **更新日期**: 2024年12月
- **总故事数**: 29个用户故事，分为4个史诗

---

## 📚 史诗概览

| 史诗 | 名称 | 状态 | 故事数 | 描述 |
|------|------|------|--------|------|
| Epic 1 | 后端核心改造与Supabase集成 | ✅ 已完成 | 8个 | 服务器端Redis到Supabase迁移 |
| Epic 2 | 客户端核心改造与Supabase集成 | ✅ 已完成 | 5个 | 客户端通信逻辑迁移 |
| Epic 3 | 核心功能迁移验证与端到端测试 | ✅ 已完成 | 9个 | 功能验证和测试 |
| Epic 4 | Supabase基础设施配置与安全设置 | ✅ 已完成 | 7个 | 基础设施和安全配置 |

---

## 🎯 Epic 1: 后端核心改造与Supabase集成

### 目标
将服务器端的通信逻辑从Redis迁移到Supabase，实现指令的接收、处理状态更新以及结果的存储。

### 涉及组件
- Node.js服务器应用
- Supabase数据库 (commands、results表)
- AppleScript交互层

### 📝 用户故事

#### US1.1 - 数据库表结构创建 (commands表)
**作为**开发者  
**我需要**在Supabase中创建commands数据表  
**以便**存储从客户端发送的指令信息

**验收标准**:
- [x] 创建commands表，包含所有必需字段
- [x] 设置正确的数据类型和约束
- [x] 配置id为主键，自动生成UUID
- [x] 设置created_at自动时间戳
- [x] status字段默认值为'pending'

**技术细节**:
```sql
CREATE TABLE commands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  command_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  user_id UUID,
  raw_command JSONB,
  attempts INTEGER DEFAULT 0,
  last_error TEXT
);
```

---

#### US1.2 - 数据库表结构创建 (results表)
**作为**开发者  
**我需要**在Supabase中创建results数据表  
**以便**存储指令执行的结果信息

**验收标准**:
- [x] 创建results表，包含所有必需字段
- [x] 设置command_id外键关联到commands表
- [x] 配置is_error布尔字段，默认FALSE
- [x] 支持存储结构化的raw_result数据

**技术细节**:
```sql
CREATE TABLE results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  command_id UUID NOT NULL REFERENCES commands(id),
  result_text TEXT,
  error_message TEXT,
  is_error BOOLEAN NOT NULL DEFAULT FALSE,
  raw_result JSONB
);
```

---

#### US1.3 - 服务器订阅新指令
**作为**服务器  
**我希望**能实时订阅commands表中新创建的、状态为'pending'的指令  
**以便**及时获取并处理用户发送的命令

**验收标准**:
- [x] 使用Supabase SDK建立实时订阅
- [x] 监听INSERT操作和status='pending'的记录
- [x] 接收到新指令时触发处理流程
- [x] 处理订阅连接异常和重连

**技术实现**:
```javascript
// 订阅新的pending命令
const subscription = supabase
  .channel('commands')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'commands',
    filter: 'status=eq.pending'
  }, handleNewCommand)
  .subscribe();
```

---

#### US1.4 - 服务器更新处理状态
**作为**服务器  
**我希望**接收到指令后能将其状态更新为'processing'  
**以便**标明正在处理该指令

**验收标准**:
- [x] 接收指令后立即更新status为'processing'
- [x] 记录处理开始时间
- [x] 处理并发情况下的状态冲突
- [x] 提供错误处理和重试机制

**技术实现**:
```javascript
async function updateCommandStatus(commandId, status, error = null) {
  const { data, error: updateError } = await supabase
    .from('commands')
    .update({ 
      status, 
      last_error: error,
      attempts: attempts + 1 
    })
    .eq('id', commandId);
}
```

---

#### US1.5 - 服务器存储执行结果
**作为**服务器  
**我希望**在指令执行完毕后将结果存储到results表  
**以便**客户端能获取到执行结果

**验收标准**:
- [x] 执行成功时存储result_text
- [x] 执行失败时存储error_message并设置is_error=true
- [x] 关联正确的command_id
- [x] 支持结构化数据存储到raw_result

**技术实现**:
```javascript
async function storeExecutionResult(commandId, result, isError = false) {
  const { data, error } = await supabase
    .from('results')
    .insert({
      command_id: commandId,
      result_text: isError ? null : result,
      error_message: isError ? result : null,
      is_error: isError,
      raw_result: typeof result === 'object' ? result : null
    });
}
```

---

#### US1.6 - 服务器更新完成状态
**作为**服务器  
**我希望**在结果存储后将commands表状态更新为'completed'或'error'  
**以便**通知客户端指令处理完成

**验收标准**:
- [x] 成功执行后状态更新为'completed'
- [x] 执行失败后状态更新为'error'
- [x] 同步更新last_error字段
- [x] 确保状态更新的原子性

---

#### US1.7 - 服务器错误处理机制
**作为**服务器  
**我希望**能正确处理和记录各种执行错误  
**以便**提供详细的错误信息给用户

**验收标准**:
- [x] 捕获AppleScript执行错误
- [x] 处理Cursor无响应情况
- [x] 记录网络连接异常
- [x] 提供有意义的错误消息

---

#### US1.8 - 服务器Supabase客户端初始化
**作为**服务器  
**我需要**正确初始化Supabase客户端连接  
**以便**使用service_role权限进行数据库操作

**验收标准**:
- [x] 使用service_role key初始化客户端
- [x] 配置正确的项目URL和密钥
- [x] 设置适当的连接参数
- [x] 实现连接健康检查

---

## 🖥️ Epic 2: 客户端核心改造与Supabase集成

### 目标
将客户端的通信逻辑从Redis迁移到Supabase，实现指令的发送和对指令执行结果的实时接收与展示。

### 涉及组件
- Web客户端 (HTML/CSS/JavaScript)
- Supabase SDK (JavaScript)

### 📝 用户故事

#### US2.1 - 客户端Supabase客户端初始化
**作为**客户端  
**我需要**正确初始化Supabase客户端连接  
**以便**使用匿名权限进行必要的数据库操作

**验收标准**:
- [x] 使用anon key初始化客户端
- [x] 配置实时订阅功能
- [x] 处理连接状态变化
- [x] 实现错误重试机制

---

#### US2.2 - 客户端发送指令到Supabase
**作为**客户端  
**我希望**能将用户输入的指令发送到Supabase  
**以便**服务器能处理用户的命令

**验收标准**:
- [x] 将command_text插入commands表
- [x] 设置初始状态为'pending'
- [x] 处理发送失败的情况
- [x] 返回生成的command_id

---

#### US2.3 - 客户端订阅指令状态变化
**作为**客户端  
**我希望**能实时监听我发送的指令状态变化  
**以便**及时获取处理结果

**验收标准**:
- [x] 订阅特定command_id的状态变化
- [x] 监听status字段的UPDATE事件
- [x] 处理订阅连接中断和恢复
- [x] 实现订阅超时处理

---

#### US2.4 - 客户端获取指令结果
**作为**客户端  
**我希望**能从results表获取指令的执行结果  
**以便**向用户展示处理结果

**验收标准**:
- [x] 根据command_id查询results表
- [x] 正确解析result_text和error_message
- [x] 处理is_error标志
- [x] 支持重试获取结果

---

#### US2.5 - 客户端错误信息展示
**作为**客户端  
**我希望**能清晰地向用户展示错误信息  
**以便**用户了解指令执行失败的原因

**验收标准**:
- [x] 展示友好的错误消息
- [x] 区分不同类型的错误
- [x] 提供重试选项
- [x] 记录错误日志用于调试

---

## 🧪 Epic 3: 核心功能迁移验证与端到端测试

### 目标
确保所有PRD中定义的用户场景和现有核心功能在迁移到Supabase后能够正确、稳定地运行。

### 涉及组件
- 完整系统 (客户端、服务器、Supabase、AppleScript、Cursor)

### 📝 用户故事

#### US3.1 - 用户聊天功能端到端测试
**作为**用户  
**我希望**通过客户端发送聊天指令并获得结果  
**以便**验证核心功能正常工作

**验收标准**:
- [x] 发送chat模式指令
- [x] 发送agent模式指令  
- [x] 发送ask模式指令
- [x] 接收Cursor返回的正确结果

---

#### US3.2 - 测试者端到端核心场景验证
**作为**测试者  
**我将**验证所有核心用户场景的完整流程  
**以便**确保系统在新架构下正确运行

**验收标准**:
- [x] 测试指令发送到结果返回的完整流程
- [x] 验证响应时间在可接受范围内
- [x] 确认所有界面功能正常
- [x] 验证数据持久化正确

---

#### US3.3 - 测试者错误场景验证
**作为**测试者  
**我将**模拟各种错误情况  
**以便**验证错误处理机制的正确性

**验收标准**:
- [x] 测试AppleScript执行失败
- [x] 测试Cursor无响应情况
- [x] 测试无效指令处理
- [x] 验证错误信息正确传递

---

#### US3.A - 技术验证指令流程
**作为**技术人员  
**我需要**验证指令从客户端到服务器的完整技术流程  
**以便**确保数据流转正确

**验收标准**:
- [x] 验证commands表记录创建
- [x] 验证状态更新时序
- [x] 验证results表数据写入
- [x] 验证实时订阅机制

---

#### US3.B - 技术验证结果返回
**作为**技术人员  
**我需要**验证结果从服务器返回到客户端的技术流程  
**以便**确保结果传递机制正确

**验收标准**:
- [x] 验证结果数据格式
- [x] 验证实时推送机制
- [x] 验证错误状态传递
- [x] 验证订阅连接稳定性

---

#### US3.C - 比较新旧系统性能
**作为**技术人员  
**我需要**比较新旧系统的性能差异  
**以便**评估迁移效果

**验收标准**:
- [x] 对比响应时间
- [x] 对比稳定性表现
- [x] 对比错误率
- [x] 评估用户体验变化

---

#### 附加测试故事 (来自stories目录)

#### US3.D - 验证指令流程技术细节
- 验证commands表状态变化时序
- 验证AppleScript与Cursor交互
- 确认错误恢复机制

#### US3.E - 验证结果返回技术细节  
- 验证results表数据完整性
- 验证实时订阅性能
- 确认客户端状态同步

#### US3.F - 系统对比分析
- Redis vs Supabase性能对比
- 稳定性和可靠性评估
- 用户体验改进评估

---

## 🔧 Epic 4: Supabase基础设施配置与安全设置

### 目标
正确配置Supabase项目，建立数据表，并实施初步的行级安全(RLS)策略以满足当前阶段的需求。

### 涉及组件
- Supabase Dashboard/CLI

### 📝 用户故事

#### US4.1 - 开发者创建Supabase项目
**作为**开发者  
**我需要**在Supabase平台创建新项目  
**以便**为应用提供后端服务

**验收标准**:
- [x] 在Supabase云平台创建项目
- [x] 配置项目基本信息
- [x] 获取项目URL和API密钥
- [x] 配置项目设置参数

---

#### US4.2 - 研究RLS策略
**作为**开发者  
**我需要**研究Supabase的行级安全策略  
**以便**为数据表配置适当的访问控制

**验收标准**:
- [x] 了解RLS基本概念和语法
- [x] 研究anon和authenticated角色差异
- [x] 设计适合当前需求的策略
- [x] 文档化策略决策

---

#### US4.A - 研究认证选项
**作为**开发者  
**我需要**研究Supabase认证选项  
**以便**为未来功能做准备

**验收标准**:
- [x] 了解Supabase Auth功能
- [x] 评估匿名访问vs认证访问
- [x] 制定认证集成计划
- [x] 文档化决策原因

---

#### US4.3 - 开发者配置服务角色密钥
**作为**开发者  
**我需要**为Node.js服务器配置service_role密钥  
**以便**服务器具有必要的数据库操作权限

**验收标准**:
- [x] 获取service_role API密钥
- [x] 配置服务器环境变量
- [x] 验证权限范围和安全性
- [x] 测试数据库连接

---

#### US4.4 - 开发者配置匿名密钥
**作为**开发者  
**我需要**为Web客户端配置anon密钥  
**以便**客户端能进行基本的数据库操作

**验收标准**:
- [x] 获取anon API密钥
- [x] 配置客户端代码
- [x] 验证权限限制
- [x] 测试客户端连接

---

#### US4.5 - 开发者设置commands表RLS
**作为**开发者  
**我需要**为commands表设置行级安全策略  
**以便**控制数据访问权限

**验收标准**:
- [x] 允许anon角色INSERT新记录
- [x] 允许anon角色SELECT自己的记录 (或全部，根据需求)
- [x] 允许service_role UPDATE任何记录
- [x] 测试策略有效性

---

#### US4.6 - 开发者设置results表RLS
**作为**开发者  
**我需要**为results表设置行级安全策略  
**以便**保护执行结果数据

**验收标准**:
- [x] 允许service_role INSERT新记录
- [x] 允许anon角色SELECT相关记录
- [x] 防止unauthorized访问
- [x] 测试策略完整性

---

#### US4.7 - 开发者启用实时功能
**作为**开发者  
**我需要**为相关表启用Supabase实时功能  
**以便**支持实时订阅和推送

**验收标准**:
- [x] 为commands表启用Realtime
- [x] 为results表启用Realtime  
- [x] 配置订阅权限
- [x] 测试实时功能

---

## 📊 实施状态总结

### ✅ 已完成的史诗
- **Epic 1**: 后端核心改造与Supabase集成 (8/8 故事完成)
- **Epic 2**: 客户端核心改造与Supabase集成 (5/5 故事完成)  
- **Epic 3**: 核心功能迁移验证与端到端测试 (9/9 故事完成)
- **Epic 4**: Supabase基础设施配置与安全设置 (7/7 故事完成)

### 📈 总体进度
- **总故事数**: 29个
- **已完成**: 29个 (100%)
- **整体状态**: ✅ 迁移完成

### 🎯 关键成果
- 成功将Redis Pub/Sub替换为Supabase实时数据库
- 保持了所有现有核心功能的完整性
- 提升了系统安全性，解决了公网暴露问题
- 建立了结构化的数据存储和查询能力
- 为未来功能扩展奠定了良好基础

---

*文档整理: 产品经理Bill | 最后更新: 2024年12月* 