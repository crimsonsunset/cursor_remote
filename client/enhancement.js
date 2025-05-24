// 客户端功能增强模块 - 使用Supabase
class ClientEnhancementService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.commandHistory = [];
    this.favorites = [];
    
    // 初始化数据
    this.loadAllData();
  }

  // 加载所有数据
  async loadAllData() {
    await Promise.all([
      this.loadCommandHistory(),
      this.loadFavorites()
    ]);
  }

  // 命令历史管理 - 从Supabase获取
  async loadCommandHistory(limit = 50, search = null) {
    console.log('🔄 开始从Supabase加载命令历史...');
    try {
      const { data, error } = await this.supabase.rpc('get_command_history', {
        limit_count: limit,
        search_text: search
      });
      
      if (error) {
        console.error('❌ Supabase查询出错:', error);
        throw error;
      }
      
      console.log('📥 Supabase原始响应:', data);
      
      // 处理数据库返回的JSON格式
      let historyData = data;
      if (typeof data === 'string') {
        historyData = JSON.parse(data);
      }
      
      console.log('📊 解析后的历史数据:', historyData);
      
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
      
      console.log('✅ 历史记录加载成功，数量:', this.commandHistory.length);
      return this.commandHistory;
    } catch (error) {
      console.error('❌ 加载命令历史失败:', error);
      console.log('🔄 回退到localStorage...');
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

  // 常用命令收藏 - 从Supabase获取
  async loadFavorites(category = null) {
    try {
      const { data, error } = await this.supabase.rpc('get_favorite_commands', {
        category_filter: category
      });
      
      if (error) throw error;
      
      // 处理数据库返回的JSON格式
      let favoritesData = data;
      if (typeof data === 'string') {
        favoritesData = JSON.parse(data);
      }
      
      this.favorites = favoritesData || [];
      return this.favorites;
    } catch (error) {
      console.error('加载收藏命令失败:', error);
      return this.loadFavoritesFromLocal();
    }
  }

  loadFavoritesFromLocal() {
    try {
      this.favorites = JSON.parse(localStorage.getItem('cursorRemote_favorites')) || [];
      return this.favorites;
    } catch {
      this.favorites = [];
      return [];
    }
  }

  // 添加到收藏 - 保存到Supabase
  async addToFavorites(command, title, category = 'general') {
    try {
      const result = await this.supabase.rpc('add_favorite_command', {
        command_text: command,
        category: category,
        description: title || command.substring(0, 30) + '...'
      });
      
      if (result.success) {
        await this.loadFavorites(); // 重新加载
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('添加收藏失败:', error);
      return this.addToFavoritesLocal(command, title);
    }
  }

  addToFavoritesLocal(command, title) {
    const favorite = {
      id: Date.now(),
      command_text: command,
      description: title || command.substring(0, 30) + '...',
      category: 'general',
      usage_count: 0,
      created_at: new Date().toISOString()
    };

    this.favorites.push(favorite);
    localStorage.setItem('cursorRemote_favorites', JSON.stringify(this.favorites));
    return favorite;
  }

  // 智能命令建议
  getSuggestions(currentInput) {
    const suggestions = [];

    // 基于历史记录的建议
    const historyMatches = this.commandHistory
      .filter(item => item.command.toLowerCase().includes(currentInput.toLowerCase()))
      .slice(0, 3)
      .map(item => ({
        type: 'history',
        text: item.command,
        title: '历史命令',
        icon: '🕒'
      }));

    // 基于收藏的建议
    const favoriteMatches = this.favorites
      .filter(item => item.command.toLowerCase().includes(currentInput.toLowerCase()))
      .slice(0, 2)
      .map(item => ({
        type: 'favorite',
        text: item.command,
        title: item.title,
        icon: '⭐'
      }));

    // 智能补全建议
    const smartSuggestions = this.getSmartSuggestions(currentInput);

    return [...historyMatches, ...favoriteMatches, ...smartSuggestions];
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
      favorites: this.favorites,
      exportedAt: new Date().toISOString()
    };
  }

  importData(data) {
    if (data.commandHistory) {
      this.commandHistory = [...data.commandHistory, ...this.commandHistory].slice(0, 100);
      localStorage.setItem('cursorRemote_commandHistory', JSON.stringify(this.commandHistory));
    }

    if (data.favorites) {
      this.favorites = [...this.favorites, ...data.favorites];
      localStorage.setItem('cursorRemote_favorites', JSON.stringify(this.favorites));
    }
  }

  // Getter方法 - 为了向后兼容
  getCommandHistory() {
    console.log('📚 getCommandHistory被调用，当前历史记录数量:', this.commandHistory.length);
    console.log('📚 历史记录内容:', this.commandHistory);
    return this.commandHistory;
  }

  getFavorites() {
    return this.favorites;
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

  // 从收藏中移除
  removeFromFavorites(id) {
    this.favorites = this.favorites.filter(item => item.id !== id);
    localStorage.setItem('cursorRemote_favorites', JSON.stringify(this.favorites));
  }
}

// 实例化全局服务 - 需要等待supabaseClient准备好
let globalEnhancementService = null;

function initGlobalEnhancementService(supabaseClient) {
  console.log('🚀 初始化全局增强服务...', supabaseClient ? '有Supabase客户端' : '无Supabase客户端');
  if (!globalEnhancementService && supabaseClient) {
    globalEnhancementService = new ClientEnhancementService(supabaseClient);
    window.clientEnhancementService = globalEnhancementService;
    
    console.log('✅ 全局增强服务初始化完成');
    
    // 为了向后兼容和便于使用，也将各个功能单独暴露
    window.CommandHistory = {
      getHistory: () => globalEnhancementService.getCommandHistory(),
      addCommand: (command) => globalEnhancementService.addToHistory(command),
      clearHistory: () => globalEnhancementService.clearHistory()
    };

    window.CommandFavorites = {
      getFavorites: () => globalEnhancementService.getFavorites(),
      addFavorite: (command, title) => globalEnhancementService.addToFavorites(command, title),
      removeFavorite: (id) => globalEnhancementService.removeFromFavorites(id)
    };
    
    console.log('✅ 全局对象暴露完成');
  }
  return globalEnhancementService;
}

// 暴露初始化函数
window.initGlobalEnhancementService = initGlobalEnhancementService;
