/**
 * Cursor远程控制 - 服务器端
 * 
 * 该服务负责：
 * 1. 连接到Redis服务器
 * 2. 订阅命令频道，接收手机端发送的命令
 * 3. 调用AppleScript控制Cursor
 * 4. 将结果发布回Redis
 */

const redis = require('redis');
const { promisify } = require('util');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cursorController = require('./cursor_controller');

// Redis配置 - 建议使用环境变量存储敏感信息
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
const REDIS_COMMAND_CHANNEL = 'cursor:commands';
const REDIS_RESULT_CHANNEL = 'cursor:results';

// 创建Redis客户端
const createRedisClient = () => {
  const client = redis.createClient({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    retry_strategy: (options) => {
      if (options.error && options.error.code === 'ECONNREFUSED') {
        console.error('Redis服务器拒绝连接');
      }
      // 重试间隔增加策略
      return Math.min(options.attempt * 100, 3000);
    }
  });

  client.on('error', (err) => {
    console.error('Redis连接错误:', err);
  });

  client.on('connect', () => {
    console.log('已连接到Redis服务器');
  });

  return client;
};

// 创建订阅者和发布者客户端
const subscriberClient = createRedisClient();
const publisherClient = createRedisClient();

// 启动服务
const startServer = async () => {
  console.log('正在启动Cursor远程控制服务...');

  // 订阅命令频道
  subscriberClient.subscribe(REDIS_COMMAND_CHANNEL);
  console.log(`已订阅频道: ${REDIS_COMMAND_CHANNEL}`);

  // 处理接收到的命令
  subscriberClient.on('message', async (channel, message) => {
    if (channel === REDIS_COMMAND_CHANNEL) {
      try {
        console.log(`收到命令: ${message}`);
        const commandData = JSON.parse(message);
        
        // 处理命令
        const result = await processCommand(commandData);
        
        // 发布结果
        publishResult(commandData.id, result);
      } catch (error) {
        console.error('处理命令时出错:', error);
        publishResult(commandData?.id || 'unknown', { 
          error: true, 
          message: error.message 
        });
      }
    }
  });

  console.log('Cursor远程控制服务已启动');
};

// 处理接收到的命令
const processCommand = async (commandData) => {
  const { id, command, type = 'chat' } = commandData;
  
  if (type === 'chat') {
    // 处理聊天命令 - 向Cursor发送消息并获取响应
    return await cursorController.sendChat(command);
  } else if (type === 'action') {
    // 处理动作命令 - 在Cursor中执行特定动作
    return await cursorController.performAction(command);
  } else {
    throw new Error(`未知的命令类型: ${type}`);
  }
};

// 发布结果到结果频道
const publishResult = (commandId, result) => {
  const resultData = {
    id: commandId,
    timestamp: Date.now(),
    result
  };
  
  publisherClient.publish(
    REDIS_RESULT_CHANNEL, 
    JSON.stringify(resultData)
  );
  
  console.log(`已发布结果: ${JSON.stringify(resultData).substring(0, 100)}...`);
};

// 清理资源的函数
const cleanup = () => {
  console.log('正在关闭服务...');
  subscriberClient.quit();
  publisherClient.quit();
  process.exit(0);
};

// 监听进程退出信号
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// 启动服务
startServer().catch(error => {
  console.error('启动服务失败:', error);
  cleanup();
}); 