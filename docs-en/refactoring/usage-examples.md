# SupabaseService Usage Examples

## Basic Usage

### 1. Using Default Configuration
```javascript
import { supabaseService } from '../src/services/supabaseService.js';

// Service will auto-initialize using environment variables
const status = supabaseService.getStatus();
console.log('Service status:', status);
```

### 2. Custom Configuration
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

### 3. Dependency Injection Pattern
```javascript
import { SupabaseService, SupabaseConfig } from '../src/services/supabaseService.js';

// Custom logger
const customLogger = {
  log: (msg) => console.log(`[CustomLog] ${msg}`),
  error: (msg) => console.error(`[CustomError] ${msg}`),
  warn: (msg) => console.warn(`[CustomWarn] ${msg}`)
};

// Custom command processor
const customCommandProcessor = async (command) => {
  console.log('Processing custom command:', command.command_text);
  // Custom processing logic
};

const service = new SupabaseService(
  new SupabaseConfig(),
  customLogger,
  { commandProcessor: customCommandProcessor }
);
```

## Testing Scenarios

### 1. Unit Testing Examples
```javascript
import { SupabaseConfig, ServiceStatus } from '../src/services/supabaseService.js';

describe('Configuration validation tests', () => {
  it('should validate required configuration items', () => {
    const config = new SupabaseConfig({
      url: null,
      serviceKey: 'test-key'
    });
    
    expect(() => config.validate()).toThrow('SUPABASE_URL must be defined');
  });
});

describe('Status management tests', () => {
  it('should correctly mark success status', () => {
    const status = new ServiceStatus();
    status.markSuccess();
    
    expect(status.isConnected).toBe(true);
    expect(status.consecutiveFailures).toBe(0);
    expect(status.lastSuccessfulConnection).toBeInstanceOf(Date);
  });
});
```

### 2. Integration Testing Examples
```javascript
import { SupabaseService, SupabaseConfig } from '../src/services/supabaseService.js';

describe('Service integration tests', () => {
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

  it('should handle complete command flow', async () => {
    // Mock successful connection
    service.connectionManager.testConnection = jest.fn().mockResolvedValue(true);
    
    // Initialize service
    const initialized = await service.initialize();
    expect(initialized).toBe(true);
    
    // Process command
    const commandPayload = {
      new: {
        id: 'test-command-id',
        command_text: 'echo "Hello World"'
      }
    };
    
    await service.handleNewCommand(commandPayload);
    
    // Verify command was processed
    expect(mockCommandProcessor).toHaveBeenCalledWith(commandPayload.new);
    
    // Cleanup
    await service.shutdown();
    expect(service.status.isShuttingDown).toBe(true);
  });
});
```

## Production Environment Usage

### 1. High Availability Configuration
```javascript
import { SupabaseService, SupabaseConfig } from '../src/services/supabaseService.js';

const productionConfig = new SupabaseConfig({
  maxConnectionAttempts: 15,
  connectionRetryDelay: 2000,
  connectionResetInterval: 2 * 60 * 1000, // 2 minutes
  connectionRefreshInterval: 20 * 60 * 1000, // 20 minutes
  healthCheckInterval: 30 * 1000, // 30 seconds
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

// Add error monitoring
process.on('uncaughtException', (error) => {
  productionLogger.error(`Uncaught exception: ${error.message}`);
  // Send to monitoring system
});

process.on('unhandledRejection', (reason, promise) => {
  productionLogger.error(`Unhandled Promise rejection: ${reason}`);
  // Send to monitoring system
});
```

### 2. Monitoring and Diagnostics
```javascript
// Periodic service status check
setInterval(() => {
  const status = service.getStatus();
  
  if (!status.isConnected) {
    console.warn('⚠️ Service connection abnormal:', {
      consecutiveFailures: status.consecutiveFailures,
      lastAttempt: status.lastConnectionAttempt,
      isDegraded: status.isDegraded
    });
  }
  
  // Report to monitoring system
  reportToMonitoring('supabase_service_status', status);
}, 60000); // Check every minute

// Command processing performance monitoring
const monitoredCommandProcessor = async (command) => {
  const startTime = Date.now();
  
  try {
    // Call original processor
    const { processCommand } = await import('../controllers/commandController.js');
    await processCommand(command);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Command ${command.id} completed, duration: ${duration}ms`);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Command ${command.id} failed, duration: ${duration}ms, error: ${error.message}`);
    throw error;
  }
};

const service = new SupabaseService(
  productionConfig,
  productionLogger,
  { commandProcessor: monitoredCommandProcessor }
);
```

## Error Handling Best Practices

### 1. Connection Error Handling
```javascript
const robustService = new SupabaseService(config, logger);

// Listen to connection events
robustService.connectionManager.on = (event, callback) => {
  // Custom event listener
  if (event === 'connectionLost') {
    callback('Connection lost, reconnecting...');
  }
};

// Check connection status
const ensureConnected = async () => {
  const connected = await robustService.ensureConnection();
  
  if (!connected) {
    throw new Error('Unable to establish database connection, please check network and configuration');
  }
  
  return connected;
};
```

### 2. Command Processing Error Recovery
```javascript
const resilientCommandProcessor = async (command) => {
  const maxRetries = 3;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { processCommand } = await import('../controllers/commandController.js');
      await processCommand(command);
      return; // Success, exit retry loop
      
    } catch (error) {
      lastError = error;
      console.warn(`Command processing failed, attempt ${attempt}/${maxRetries}: ${error.message}`);
      
      if (attempt < maxRetries) {
        // Exponential backoff retry
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries failed
  throw new Error(`Command processing ultimately failed: ${lastError.message}`);
};

const service = new SupabaseService(config, logger, {
  commandProcessor: resilientCommandProcessor
});
```

## Performance Optimization

### 1. Connection Pool Management
```javascript
const optimizedConfig = new SupabaseConfig({
  // Connection related optimization
  maxConnectionAttempts: 10,
  connectionRetryDelay: 1500,
  
  // Real-time connection optimization
  realtimeTimeout: 25000,
  heartbeatInterval: 12000,
  
  // Health check optimization
  healthCheckInterval: 45000
});
```

### 2. Batch Operations
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
      // Set timeout processing
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
      console.error('Batch processing failed:', error);
      // Fallback to individual processing
      for (const command of batch) {
        try {
          await this.processIndividualCommand(command);
        } catch (cmdError) {
          console.error(`Individual command processing failed ${command.id}:`, cmdError);
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

These examples demonstrate how the refactored SupabaseService can be used in various scenarios, from simple testing to complex production environment configurations.
