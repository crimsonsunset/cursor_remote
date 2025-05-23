// 客户端功能增强模块
class ClientEnhancementService {
  constructor() {
    this.commandHistory = this.loadCommandHistory();
    this.favorites = this.loadFavorites();
    this.templates = this.loadTemplates();
  }

  // 命令历史管理
  loadCommandHistory() {
    try {
      return JSON.parse(localStorage.getItem('cursorRemote_commandHistory')) || [];
    } catch {
      return [];
    }
  }

  saveCommandToHistory(command, result) {
    const historyItem = {
      id: Date.now(),
      command: command,
      result: result,
      timestamp: new Date().toISOString(),
      success: !result.includes('错误') && !result.includes('失败')
    };

    this.commandHistory.unshift(historyItem);
    // 保持最近100条记录
    this.commandHistory = this.commandHistory.slice(0, 100);
    localStorage.setItem('cursorRemote_commandHistory', JSON.stringify(this.commandHistory));
  }

  // 常用命令收藏
  loadFavorites() {
    try {
      return JSON.parse(localStorage.getItem('cursorRemote_favorites')) || [];
    } catch {
      return [];
    }
  }

  addToFavorites(command, title) {
    const favorite = {
      id: Date.now(),
      title: title || command.substring(0, 30) + '...',
      command: command,
      createdAt: new Date().toISOString(),
      useCount: 0
    };

    this.favorites.push(favorite);
    localStorage.setItem('cursorRemote_favorites', JSON.stringify(this.favorites));
    return favorite;
  }

  // 命令模板系统
  loadTemplates() {
    const defaultTemplates = [
      {
        id: 'debug_fix',
        title: '调试和修复代码',
        template: '请帮我调试和修复以下代码中的问题：\n\n[在此粘贴代码]\n\n具体问题：[描述问题]',
        category: '调试'
      },
      {
        id: 'code_review',
        title: '代码审查',
        template: '请对以下代码进行审查，重点关注：\n1. 代码质量\n2. 性能优化\n3. 安全性\n4. 最佳实践\n\n[在此粘贴代码]',
        category: '审查'
      },
      {
        id: 'refactor',
        title: '重构代码',
        template: '请帮我重构以下代码，使其更加清晰和高效：\n\n[在此粘贴代码]\n\n重构目标：[描述目标]',
        category: '重构'
      },
      {
        id: 'explain_code',
        title: '解释代码',
        template: '请详细解释以下代码的功能和工作原理：\n\n[在此粘贴代码]',
        category: '学习'
      },
      {
        id: 'write_tests',
        title: '编写测试',
        template: '请为以下代码编写单元测试：\n\n[在此粘贴代码]\n\n测试框架：[指定框架，如Jest、Mocha等]',
        category: '测试'
      }
    ];

    try {
      const saved = JSON.parse(localStorage.getItem('cursorRemote_templates')) || [];
      return [...defaultTemplates, ...saved];
    } catch {
      return defaultTemplates;
    }
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
      templates: this.templates.filter(t => !t.id.includes('default')), // 不导出默认模板
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

    if (data.templates) {
      const customTemplates = this.templates.filter(t => !t.id.includes('default'));
      this.templates = [...this.loadTemplates().filter(t => t.id.includes('default')), ...customTemplates, ...data.templates];
      localStorage.setItem('cursorRemote_templates', JSON.stringify(this.templates.filter(t => !t.id.includes('default'))));
    }
  }
}

// 实例化全局服务
window.clientEnhancementService = new ClientEnhancementService();
