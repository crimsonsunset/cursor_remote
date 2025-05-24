// 客户端功能增强模块 - 使用Supabase
class ClientEnhancementService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.commandHistory = [];
    
    // 初始化数据
    this.loadAllData();
  }

  // 加载所有数据
  async loadAllData() {
    await this.loadCommandHistory();
  }

  // 命令历史管理 - 从Supabase获取
  async loadCommandHistory(limit = 50, search = null) {
    try {
      const { data, error } = await this.supabase.rpc('get_command_history', {
        limit_count: limit,
        search_text: search
      });
      
      if (error) {
        throw error;
      }
      
      // 处理数据库返回的JSON格式
      let historyData = data;
      if (typeof data === 'string') {
        historyData = JSON.parse(data);
      }
      
      // 转换数据格式以匹配客户端期望的格式
      this.commandHistory = (historyData || []).map(item => ({
        id: item.id,
        command: item.command_text,
        timestamp: new Date(item.created_at).getTime(),
        status: item.status,
        created_at: item.created_at,
        updated_at: item.updated_at,
        metrics: item.metrics
      }));
      
      return this.commandHistory;
    } catch (error) {
      // fallback to localStorage
      return this.loadCommandHistoryFromLocal();
    }
  }

  // 本地存储fallback
  loadCommandHistoryFromLocal() {
    try {
      this.commandHistory = JSON.parse(localStorage.getItem('cursorRemote_commandHistory')) || [];
      return this.commandHistory;
    } catch {
      this.commandHistory = [];
      return [];
    }
  }

  // 智能命令建议
  getSuggestions(currentInput) {
    const suggestions = [];

    // 基于历史记录的建议
    const historyMatches = this.commandHistory
      .filter(item => item.command.toLowerCase().includes(currentInput.toLowerCase()))
      .slice(0, 5)
      .map(item => ({
        type: 'history',
        text: item.command,
        title: '历史命令',
        icon: '🕒'
      }));

    // 智能补全建议
    const smartSuggestions = this.getSmartSuggestions(currentInput);

    return [...historyMatches, ...smartSuggestions];
  }

  getSmartSuggestions(input) {
    const smartPatterns = {
      '创建': ['创建一个React组件', '创建数据库表', '创建API接口'],
      '修复': ['修复这个bug', '修复代码错误', '修复性能问题'],
      '优化': ['优化代码性能', '优化数据库查询', '优化用户体验'],
      '解释': ['解释这段代码', '解释算法原理', '解释设计模式'],
      '重构': ['重构这个函数', '重构代码结构', '重构数据模型']
    };

    const suggestions = [];
    const lowerInput = input.toLowerCase();

    for (const [keyword, patterns] of Object.entries(smartPatterns)) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        patterns.forEach(pattern => {
          suggestions.push({
            type: 'smart',
            text: pattern,
            title: '智能建议',
            icon: '💡'
          });
        });
        break; // 只匹配第一个关键字
      }
    }

    return suggestions.slice(0, 3);
  }

  // 导出/导入功能
  exportData() {
    return {
      commandHistory: this.commandHistory,
      exportedAt: new Date().toISOString()
    };
  }

  importData(data) {
    if (data.commandHistory) {
      this.commandHistory = [...data.commandHistory, ...this.commandHistory].slice(0, 100);
      localStorage.setItem('cursorRemote_commandHistory', JSON.stringify(this.commandHistory));
    }
  }

  // Getter方法 - 为了向后兼容
  getCommandHistory() {
    return this.commandHistory;
  }

  // 添加到历史记录的方法
  addToHistory(command) {
    const historyItem = {
      id: Date.now(),
      command: command,
      timestamp: Date.now(),
      created_at: new Date().toISOString()
    };
    
    this.commandHistory.unshift(historyItem);
    
    // 限制历史记录数量
    if (this.commandHistory.length > 100) {
      this.commandHistory = this.commandHistory.slice(0, 100);
    }
    
    // 保存到本地存储
    localStorage.setItem('cursorRemote_commandHistory', JSON.stringify(this.commandHistory));
    
    return historyItem;
  }

  // 清除历史记录
  clearHistory() {
    this.commandHistory = [];
    localStorage.removeItem('cursorRemote_commandHistory');
  }

  // 从历史记录中移除特定命令
  removeCommand(command) {
    if (!command) return false;
    
    const originalLength = this.commandHistory.length;
    this.commandHistory = this.commandHistory.filter(item => 
      item.command !== command && item.command_text !== command
    );
    
    const wasRemoved = this.commandHistory.length < originalLength;
    if (wasRemoved) {
      // 更新本地存储
      localStorage.setItem('cursorRemote_commandHistory', JSON.stringify(this.commandHistory));
    }
    
    return wasRemoved;
  }
}

// 实例化全局服务 - 需要等待supabaseClient准备好
let globalEnhancementService = null;

function initGlobalEnhancementService(supabaseClient) {
  if (!globalEnhancementService && supabaseClient) {
    globalEnhancementService = new ClientEnhancementService(supabaseClient);
    window.clientEnhancementService = globalEnhancementService;
    
    // 为了向后兼容和便于使用，也将各个功能单独暴露
    window.CommandHistory = {
      getHistory: () => globalEnhancementService.getCommandHistory(),
      addCommand: (command) => globalEnhancementService.addToHistory(command),
      clearHistory: () => globalEnhancementService.clearHistory(),
      removeCommand: (command) => globalEnhancementService.removeCommand(command),
      clearCache: () => globalEnhancementService.clearHistory() // 兼容性别名
    };
  }
  return globalEnhancementService;
}

// 暴露初始化函数
window.initGlobalEnhancementService = initGlobalEnhancementService;
