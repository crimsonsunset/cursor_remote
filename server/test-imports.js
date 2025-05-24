// 测试导入脚本
console.log('Testing imports...');

try {
  console.log('Importing analyticsService...');
  const { AnalyticsService } = await import('./src/services/analyticsService.js');
  console.log('✓ analyticsService imported successfully');

  console.log('Importing errorRecoveryService...');
  const { ErrorRecoveryService } = await import('./src/services/errorRecoveryService.js');
  console.log('✓ errorRecoveryService imported successfully');

  console.log('Importing queueManager...');
  const { CommandQueueManager } = await import('./src/services/queueManager.js');
  console.log('✓ queueManager imported successfully');

  console.log('Importing commandController...');
  const { processCommand } = await import('./src/controllers/commandController.js');
  console.log('✓ commandController imported successfully');

  console.log('All imports successful!');
} catch (error) {
  console.error('Import error:', error);
}
