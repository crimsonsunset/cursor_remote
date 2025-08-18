# CursorRemote Service Stability Improvements

## Problem Description

Previously the service would experience frequent subscription connection disconnections and reconnections after running for a long time, manifesting as:

```
[Service Error] [SubscriptionManager] Subscription CLOSED. Will attempt to reconnect...
[Service] [SubscriptionManager] Attempting to subscribe (attempt X/10)...
[Service Error] [SubscriptionManager] Subscription CHANNEL_ERROR. Will attempt to reconnect...
```

## Solution

### 1. SupabaseService Optimization

**Connection Management Improvements:**
- Increased connection timeout: from 30 seconds to 60 seconds
- Optimized heartbeat interval: from 15 seconds to 30 seconds
- Improved reconnection strategy: using gentler exponential backoff algorithm
- Added connection health checks: automatic connection status check every 2 minutes

**Subscription Management Improvements:**
- Prevent duplicate subscriptions: added subscription status lock
- Intelligent retry strategy: using backoff delays and random jitter
- Better error recovery: force connection refresh after 3 consecutive failures
- Unique channel names: avoid channel name conflicts

### 2. Auto-restart Script Optimization

**Intelligent Subscription Error Handling:**
- No longer treats single subscription errors as critical errors
- Only escalates to critical error if more than 20 subscription errors occur within 5 minutes
- Adjustable threshold via environment variable `SUBSCRIPTION_ERROR_THRESHOLD`

**Monitoring Improvements:**
- Separately tracks critical errors and subscription errors
- Displays subscription error count and threshold status
- Periodically cleans up expired error records

## Usage

### 1. Update Configuration

Add to `.env` file (optional):

```bash
# If subscription errors frequently trigger false restarts, increase this value
SUBSCRIPTION_ERROR_THRESHOLD=30
```

### 2. Restart Service

```bash
# Stop current service
npm run smart-stop

# Start optimized service
npm run production
```

### 3. Monitor Status

The monitoring interface now displays:
- Subscription error count: `📡 Subscription errors: X/20`
- Critical error count: `🚨 Critical errors: X`

## Expected Effects

1. **Reduce false restarts**: Subscription connection issues no longer immediately trigger restarts
2. **More stable long-term operation**: Improved connection management and retry strategies
3. **Intelligent error detection**: Only truly serious problems trigger restarts
4. **Better observability**: Clear distinction between different types of errors

## Troubleshooting

If the service still restarts frequently:

1. **Increase subscription error threshold**:
   ```bash
   export SUBSCRIPTION_ERROR_THRESHOLD=50
   npm run production
   ```

2. **Check network connection**:
   ```bash
   npm run monitor  # Run connection monitor
   ```

3. **View detailed logs**: The monitoring interface will show recent error details

4. **Manually reset counters**:
   ```bash
   # Get monitor process ID
   ps aux | grep auto-restart
   # Send reset signal
   kill -USR1 <process_id>
   ```

## Configuration Description

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `ENABLE_AUTO_RESTART` | `true` | Whether to enable auto-restart |
| `SUBSCRIPTION_ERROR_THRESHOLD` | `20` | Subscription error threshold within 5 minutes |

## Change Log

- Optimized subscription manager to reduce frequent reconnections
- Improved connection management to enhance network fault tolerance
- Intelligent subscription error detection to avoid false restarts
- Added connection health check mechanism
- Optimized retry strategy and backoff algorithm
