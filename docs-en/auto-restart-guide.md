# CursorRemote Auto-Restart Guide

## Overview

CursorRemote now provides intelligent auto-restart functionality that can detect common errors and automatically restart services to ensure stable system operation.

## Error Detection

The auto-restart system detects the following types of errors:

### Critical Error Patterns
- `errorRecoveryService.handleError is not a function` - Error recovery service call error
- `TypeError: ... is not a function` - Function call error
- `Cannot read property ... of undefined` - Null reference error
- `ReferenceError` - Reference error
- `Failed to ensure Supabase connection` - Database connection failure
- `Max connection attempts ... reached` - Connection attempts exceeded limit
- `ECONNREFUSED` / `ENOTFOUND` - Network connection error
- `CHANNEL_ERROR` - Subscription channel error
- `subscription ... failed` - Subscription failure

### Service Health Checks
- Long unprocessed pending commands (over 10 minutes)
- Database connection status
- Recent command processing activity
- Critical error frequency analysis

## Usage

### 1. Auto-Restart Monitor (Recommended)

```bash
# Start service with auto-restart functionality
cd server
npm run production

# Or run directly
node auto-restart.js
```

### 2. Smart Restart Scripts

```bash
# Restart service
npm run smart-restart

# Start service
npm run smart-start

# Stop service
npm run smart-stop

# View service status
npm run smart-status

# Continuous monitoring (runs continuous monitoring and auto-restart in background)
npm run smart-monitor
```

### 3. Manual Operations

```bash
# Force restart (terminate all related processes)
../scripts/smart-restart.sh force-restart

# Health check
../scripts/smart-restart.sh health
```

## Monitoring Configuration

### Auto-Restart Monitor Configuration

```javascript
const config = {
  checkInterval: 60000,        // Check every 1 minute
  failureThreshold: 3,         // Restart after 3 consecutive failures
  restartCooldown: 30000,      // 30-second cooldown after restart
  maxRestarts: 10,             // Maximum restart count
  resetInterval: 3600000       // Reset restart count after 1 hour
};
```

### Smart Restart Logic

1. **Immediate Restart Conditions**:
   - Detected critical error patterns exceeding 10
   - Found long unprocessed pending commands
   - Too many critical errors within 5 minutes

2. **Regular Restart Conditions**:
   - 3 consecutive health check failures
   - Persistent database connection failure

## Monitoring Interface

When running the auto-restart monitor, real-time status is displayed:

```
═══════════════════════════════════════════════
🔄 CursorRemote Auto-Restart Monitor
═══════════════════════════════════════════════
⏰ Runtime: 2h15m30s
🔧 Service Status: ✅ Running
🔄 Restart Count: 2/10
❌ Consecutive Failures: 0/3
🚨 Critical Errors: 5
✅ Last Success: 30 seconds ago
🚨 Last Error: 120 seconds ago
───────────────────────────────────────────────
🚨 Recent Critical Errors:
   45 seconds ago: errorRecoveryService.handleError is not a function...
   120 seconds ago: Failed to ensure Supabase connection...
───────────────────────────────────────────────
Press Ctrl+C to exit monitoring
═══════════════════════════════════════════════
```

## Log Files

- **Auto-restart monitor logs**: Real-time output to console
- **Smart restart script logs**: `server/restart.log`
- **Service process PID**: `server/service.pid`

## Best Practices

### 1. Production Environment Deployment

```bash
# Use system service management
# Create systemd service file /etc/systemd/system/cursor-remote.service

[Unit]
Description=CursorRemote Auto Restart Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/CursorRemote/server
ExecStart=/usr/bin/node auto-restart.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 2. Development Environment

```bash
# Use development mode (auto-restart on file changes)
npm run dev

# Or use auto-restart monitor for testing
npm run production
```

### 3. Troubleshooting

```bash
# Check service status
npm run smart-status

# Check health status
../scripts/smart-restart.sh health

# Force restart (clean all related processes)
../scripts/smart-restart.sh force-restart

# View restart logs
tail -f server/restart.log
```

## Common Issues

### Q: Service restarts too frequently
A: Check environment variable configuration and network connection, may need to increase `failureThreshold` value

### Q: Auto-restart not working
A: Ensure correct file permissions, check if `.env` file exists

### Q: How to temporarily disable auto-restart
A: Use `npm run start` instead of `npm run production`

### Q: How to view detailed error information
A: Run `node auto-restart.js` to view real-time log output

## Update Notes

- ✅ Enhanced error detection patterns
- ✅ Smart restart decision logic
- ✅ Real-time monitoring interface
- ✅ Error history recording
- ✅ Flexible configuration options
- ✅ Complete script toolset

It's recommended to use `npm run production` to start the service for the best stability and automatic recovery capabilities 🚀
