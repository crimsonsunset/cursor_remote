// System monitoring and status page
class SystemMonitorService {
  constructor() {
    this.metrics = {
      commandsProcessed: 0,
      successRate: 0,
      averageResponseTime: 0,
      activeConnections: 0,
      systemUptime: Date.now(),
      lastError: null,
      errorCount: 0
    };
    
    this.startMonitoring();
  }

  startMonitoring() {
    // Update system status every 30 seconds
    setInterval(() => {
      this.updateSystemMetrics();
    }, 30000);

    // Check system health every 5 minutes
    setInterval(() => {
      this.performHealthCheck();
    }, 5 * 60 * 1000);
  }

  async updateSystemMetrics() {
    try {
      // Get command statistics
      const stats = await this.fetchCommandStats();
      if (stats) {
        this.metrics.commandsProcessed = stats.total;
        this.metrics.successRate = stats.successful / stats.total;
        this.metrics.averageResponseTime = stats.avgDuration;
      }

      // Update runtime
      this.metrics.systemUptime = Date.now() - this.metrics.systemUptime;

      // Broadcast update event
      this.broadcastMetricsUpdate();
    } catch (error) {
      console.error('[SystemMonitor] Failed to update metrics:', error);
    }
  }

  async fetchCommandStats() {
    try {
      if (!supabaseClient) return null;

      const { data, error } = await supabaseClient
        .from('commands')
        .select('status, created_at')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      const total = data.length;
      const successful = data.filter(d => d.status === 'completed').length;

      return { total, successful };
    } catch (error) {
      console.error('[SystemMonitor] Failed to fetch command stats:', error);
      return null;
    }
  }

  async performHealthCheck() {
    const healthStatus = {
      timestamp: new Date().toISOString(),
      supabase: false,
      network: false,
      browser: true, // Client always considers browser normal
      localStorage: false
    };

    try {
      // Check Supabase connection
      if (supabaseClient) {
        const { data, error } = await supabaseClient
          .from('commands')
          .select('id')
          .limit(1);
        healthStatus.supabase = !error;
      }

      // Check network connection
      try {
        await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors' });
        healthStatus.network = true;
      } catch {
        healthStatus.network = false;
      }

      // Check local storage
      try {
        localStorage.setItem('test', 'test');
        localStorage.removeItem('test');
        healthStatus.localStorage = true;
      } catch {
        healthStatus.localStorage = false;
      }

      this.updateHealthStatus(healthStatus);
    } catch (error) {
      console.error('[SystemMonitor] Health check failed:', error);
    }
  }

  updateHealthStatus(status) {
    // Update UI status indicators
    const statusElement = document.getElementById('systemHealthStatus');
    if (statusElement) {
      const isHealthy = status.supabase && status.network && status.localStorage;
      statusElement.className = `health-status ${isHealthy ? 'healthy' : 'unhealthy'}`;
      statusElement.title = `Supabase: ${status.supabase ? '✓' : '✗'}, Network: ${status.network ? '✓' : '✗'}, Storage: ${status.localStorage ? '✓' : '✗'}`;
    }
  }

  broadcastMetricsUpdate() {
    // Send custom event to notify UI updates
    window.dispatchEvent(new CustomEvent('systemMetricsUpdate', {
      detail: this.metrics
    }));
  }

  getMetrics() {
    return { ...this.metrics };
  }

  // Generate status report
  generateStatusReport() {
    const uptime = Date.now() - this.metrics.systemUptime;
    const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

    return {
      uptime: `${uptimeHours}小时${uptimeMinutes}分钟`,
      commandsProcessed: this.metrics.commandsProcessed,
      successRate: `${(this.metrics.successRate * 100).toFixed(1)}%`,
      averageResponseTime: `${this.metrics.averageResponseTime.toFixed(1)}秒`,
      errorCount: this.metrics.errorCount,
      lastError: this.metrics.lastError,
      timestamp: new Date().toISOString()
    };
  }
}

// Create status page HTML
function createStatusPage() {
  const statusPageHTML = `
    <div id="statusPage" class="status-page" style="display: none;">
      <div class="status-header">
        <h2>系统监控</h2>
        <button id="closeStatusPage" class="close-btn">×</button>
      </div>
      
      <div class="status-grid">
        <div class="status-card">
          <h3>系统运行时间</h3>
          <div id="systemUptime" class="metric-value">加载中...</div>
        </div>
        
        <div class="status-card">
          <h3>命令处理次数</h3>
          <div id="commandsProcessed" class="metric-value">0</div>
        </div>
        
        <div class="status-card">
          <h3>成功率</h3>
          <div id="successRate" class="metric-value">0%</div>
        </div>
        
        <div class="status-card">
          <h3>平均响应时间</h3>
          <div id="averageResponseTime" class="metric-value">0秒</div>
        </div>
      </div>
      
      <div class="health-indicators">
        <h3>服务健康状态</h3>
        <div class="health-grid">
          <div class="health-item">
            <span class="health-label">Supabase连接</span>
            <span id="supabaseHealth" class="health-indicator">检查中...</span>
          </div>
          <div class="health-item">
            <span class="health-label">网络连接</span>
            <span id="networkHealth" class="health-indicator">检查中...</span>
          </div>
          <div class="health-item">
            <span class="health-label">本地存储</span>
            <span id="storageHealth" class="health-indicator">检查中...</span>
          </div>
        </div>
      </div>
      
      <div class="recent-activity">
        <h3>最近活动</h3>
        <div id="recentActivity" class="activity-list">暂无活动记录</div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', statusPageHTML);
}

// Instantiate monitoring service
window.systemMonitorService = new SystemMonitorService();

// For ease of use, also expose a simplified interface
window.SystemMonitor = {
  startMonitoring: () => window.systemMonitorService.startMonitoring(),
  stopMonitoring: () => window.systemMonitorService.stopMonitoring(),
  getMetrics: () => window.systemMonitorService.getMetrics(),
  updateMetrics: (metrics) => window.systemMonitorService.updateMetrics(metrics)
};
