# SupabaseService 使用示例

## 基本使用

### 1. 使用默认配置
```javascript
import { supabaseService } from '../src/services/supabaseService.js';

// 服务会自动初始化，使用环境变量配置
const status = supabaseService.getStatus();
console.log('服务状态:', status);
```

### 2. 自定义配置
```javascript
import { SupabaseService, SupabaseConfig } from '../src/services/supabaseService.js';

const customConfig = new SupabaseConfig({
  url: 'https://custom.supabase.co',
  serviceKey: 'custom-key',
  maxConnectionAttempts: 5,
  connectionRetryDelay: 1000
});

const service = new SupabaseService(customConfig);
await service.initialize();
```

### 3. 依赖注入模式
```javascript
import { SupabaseService, SupabaseConfig } from '../src/services/supabaseService.js';

// 自定义日志器
const customLogger = {
  log: (msg) => console.log(`[CustomLog] ${msg}`),
  error: (msg) => console.error(`[CustomError] ${msg}`),
  warn: (msg) => console.warn(`[CustomWarn] ${msg}`)
};

// 自定义命令处理器
const customCommandProcessor = async (command) => {
  console.log('处理自定义命令:', command.command_text);
  // 自定义处理逻辑
};

const service = new SupabaseService(
  new SupabaseConfig(),
  customLogger,
  { commandProcessor: customCommandProcessor }
);
```

## 测试场景

### 1. 单元测试示例
```javascript
import { SupabaseConfig, ServiceStatus } from '../src/services/supabaseService.js';

describe('配置验证测试', () => {
  it('应该验证必需的配置项', () => {
    const config = new SupabaseConfig({
      url: null,
      serviceKey: 'test-key'
    });
    
    expect(() => config.validate()).toThrow('SUPABASE_URL must be defined');
  });
});

describe('状态管理测试', () => {
  it('应该正确标记成功状态', () => {
    const status = new ServiceStatus();
    status.markSuccess();
    
    expect(status.isConnected).toBe(true);
    expect(status.consecutiveFailures).toBe(0);
    expect(status.lastSuccessfulConnection).toBeInstanceOf(Date);
  });
});
```

### 2. 集成测试示例
```javascript
import { SupabaseService, SupabaseConfig } from '../src/services/supabaseService.js';

describe('服务集成测试', () => {
  let service;
  let mockCommandProcessor;

  beforeEach(() => {
    mockCommandProcessor = jest.fn().mockResolvedValue(undefined);
    
    const testConfig = new SupabaseConfig({
      url: 'https://test.supabase.co',
      serviceKey: 'test-key'
    });
    
    service = new SupabaseService(testConfig, console, {
      commandProcessor: mockCommandProcessor
    });
  });

  it('应该完整处理命令流程', async () => {
    // 模拟连接成功
    service.connectionManager.testConnection = jest.fn().mockResolvedValue(true);
    
    // 初始化服务
    const initialized = await service.initialize();
    expect(initialized).toBe(true);
    
    // 处理命令
    const commandPayload = {
      new: {
        id: 'test-command-id',
        command_text: 'echo "Hello World"'
      }
    };
    
    await service.handleNewCommand(commandPayload);
    
    // 验证命令被处理
    expect(mockCommandProcessor).toHaveBeenCalledWith(commandPayload.new);
    
    // 清理
    await service.shutdown();
    expect(service.status.isShuttingDown).toBe(true);
  });
});
```

## 生产环境使用

### 1. 高可用配置
```javascript
import { SupabaseService, SupabaseConfig } from '../src/services/supabaseService.js';

const productionConfig = new SupabaseConfig({
  maxConnectionAttempts: 15,
  connectionRetryDelay: 2000,
  connectionResetInterval: 2 * 60 * 1000, // 2分钟
  connectionRefreshInterval: 20 * 60 * 1000, // 20分钟
  healthCheckInterval: 30 * 1000, // 30秒
  maxSubscriptionRetries: 15
});

const productionLogger = {
  log: (msg) => console.log(`[${new Date().toISOString()}] INFO: ${msg}`),
  error: (msg) => console.error(`[${new Date().toISOString()}] ERROR: ${msg}`),
  warn: (msg) => console.warn(`[${new Date().toISOString()}] WARN: ${msg}`)
};

const service = new SupabaseService(
  productionConfig,
  productionLogger
);

// 添加错误监控
process.on('uncaughtException', (error) => {
  productionLogger.error(`未捕获的异常: ${error.message}`);
  // 发送到监控系统
});

process.on('unhandledRejection', (reason, promise) => {
  productionLogger.error(`未处理的Promise拒绝: ${reason}`);
  // 发送到监控系统
});
```

### 2. 监控和诊断
```javascript
// 定期检查服务状态
setInterval(() => {
  const status = service.getStatus();
  
  if (!status.isConnected) {
    console.warn('⚠️ 服务连接异常:', {
      consecutiveFailures: status.consecutiveFailures,
      lastAttempt: status.lastConnectionAttempt,
      isDegraded: status.isDegraded
    });
  }
  
  // 报告到监控系统
  reportToMonitoring('supabase_service_status', status);
}, 60000); // 每分钟检查一次

// 命令处理性能监控
const monitoredCommandProcessor = async (command) => {
  const startTime = Date.now();
  
  try {
    // 调用原始处理器
    const { processCommand } = await import('../controllers/commandController.js');
    await processCommand(command);
    
    const duration = Date.now() - startTime;
    console.log(`✅ 命令 ${command.id} 处理完成，耗时: ${duration}ms`);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ 命令 ${command.id} 处理失败，耗时: ${duration}ms, 错误: ${error.message}`);
    throw error;
  }
};

const service = new SupabaseService(
  productionConfig,
  productionLogger,
  { commandProcessor: monitoredCommandProcessor }
);
```

## 错误处理最佳实践

### 1. 连接错误处理
```javascript
const robustService = new SupabaseService(config, logger);

// 监听连接事件
robustService.connectionManager.on = (event, callback) => {
  // 自定义事件监听器
  if (event === 'connectionLost') {
    callback('连接丢失，正在重连...');
  }
};

// 检查连接状态
const ensureConnected = async () => {
  const connected = await robustService.ensureConnection();
  
  if (!connected) {
    throw new Error('无法建立数据库连接，请检查网络和配置');
  }
  
  return connected;
};
```

### 2. 命令处理错误恢复
```javascript
const resilientCommandProcessor = async (command) => {
  const maxRetries = 3;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { processCommand } = await import('../controllers/commandController.js');
      await processCommand(command);
      return; // 成功，退出重试循环
      
    } catch (error) {
      lastError = error;
      console.warn(`命令处理失败，第 ${attempt}/${maxRetries} 次尝试: ${error.message}`);
      
      if (attempt < maxRetries) {
        // 指数退避重试
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // 所有重试都失败了
  throw new Error(`命令处理最终失败: ${lastError.message}`);
};

const service = new SupabaseService(config, logger, {
  commandProcessor: resilientCommandProcessor
});
```

## 性能优化

### 1. 连接池管理
```javascript
const optimizedConfig = new SupabaseConfig({
  // 连接相关优化
  maxConnectionAttempts: 10,
  connectionRetryDelay: 1500,
  
  // 实时连接优化
  realtimeTimeout: 25000,
  heartbeatInterval: 12000,
  
  // 健康检查优化
  healthCheckInterval: 45000
});
```

### 2. 批量操作
```javascript
class BatchProcessor {
  constructor(service) {
    this.service = service;
    this.batchSize = 10;
    this.batchTimeout = 1000;
    this.pendingCommands = [];
  }
  
  async processCommand(command) {
    this.pendingCommands.push(command);
    
    if (this.pendingCommands.length >= this.batchSize) {
      await this.processBatch();
    } else {
      // 设置超时处理
      setTimeout(() => {
        if (this.pendingCommands.length > 0) {
          this.processBatch();
        }
      }, this.batchTimeout);
    }
  }
  
  async processBatch() {
    const batch = this.pendingCommands.splice(0, this.batchSize);
    
    try {
      await Promise.all(
        batch.map(command => this.processIndividualCommand(command))
      );
    } catch (error) {
      console.error('批处理失败:', error);
      // 回退到单个处理
      for (const command of batch) {
        try {
          await this.processIndividualCommand(command);
        } catch (cmdError) {
          console.error(`单命令处理失败 ${command.id}:`, cmdError);
        }
      }
    }
  }
  
  async processIndividualCommand(command) {
    const { processCommand } = await import('../controllers/commandController.js');
    await processCommand(command);
  }
}

const batchProcessor = new BatchProcessor(service);
const service = new SupabaseService(config, logger, {
  commandProcessor: (command) => batchProcessor.processCommand(command)
});
```

这些示例展示了重构后的 SupabaseService 如何在各种场景下使用，从简单的测试到复杂的生产环境配置。 