// Client Enhancement Module - Using Supabase
class ClientEnhancementService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.commandHistory = [];
    
    // Initialize data
    this.loadAllData();
  }

  // Load all data
  async loadAllData() {
    await this.loadCommandHistory();
  }

  // Command history management - Get from Supabase
  async loadCommandHistory(limit = 50, search = null) {
    try {
      const { data, error } = await this.supabase.rpc('get_command_history', {
        limit_count: limit,
        search_text: search
      });
      
      if (error) {
        throw error;
      }
      
      // Process database returned JSON format
      let historyData = data;
      if (typeof data === 'string') {
        historyData = JSON.parse(data);
      }
      
      // Convert data format to match client expectations
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

  // Local storage fallback
  loadCommandHistoryFromLocal() {
    try {
      this.commandHistory = JSON.parse(localStorage.getItem('cursorRemote_commandHistory')) || [];
      return this.commandHistory;
    } catch {
      this.commandHistory = [];
      return [];
    }
  }

  // Smart command suggestions
  getSuggestions(currentInput) {
    const suggestions = [];

    // Suggestions based on history
    const historyMatches = this.commandHistory
      .filter(item => item.command.toLowerCase().includes(currentInput.toLowerCase()))
      .slice(0, 5)
      .map(item => ({
        type: 'history',
        text: item.command,
        title: __('enhancement.history_commands'),
        icon: '🕒'
      }));

    // Smart completion suggestions
    const smartSuggestions = this.getSmartSuggestions(currentInput);

    return [...historyMatches, ...smartSuggestions];
  }

  getSmartSuggestions(input) {
    const smartPatterns = {
      '创建': [__('enhancement.suggestions.create.react_component'), __('enhancement.suggestions.create.database_table'), __('enhancement.suggestions.create.api_interface')],
      '修复': [__('enhancement.suggestions.fix.this_bug'), __('enhancement.suggestions.fix.code_error'), __('enhancement.suggestions.fix.performance_issue')],
      '优化': [__('enhancement.suggestions.optimize.code_performance'), __('enhancement.suggestions.optimize.database_query'), __('enhancement.suggestions.optimize.user_experience')],
      '解释': [__('enhancement.suggestions.explain.this_code'), __('enhancement.suggestions.explain.algorithm_principle'), __('enhancement.suggestions.explain.design_pattern')],
      '重构': [__('enhancement.suggestions.refactor.this_function'), __('enhancement.suggestions.refactor.code_structure'), __('enhancement.suggestions.refactor.data_model')]
    };

    const suggestions = [];
    const lowerInput = input.toLowerCase();

    for (const [keyword, patterns] of Object.entries(smartPatterns)) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        patterns.forEach(pattern => {
          suggestions.push({
            type: 'smart',
            text: pattern,
            title: __('enhancement.smart_suggestions'),
            icon: '💡'
          });
        });
        break; // Only match the first keyword
      }
    }

    return suggestions.slice(0, 3);
  }

  // Export/Import functionality
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

  // Getter methods - for backward compatibility
  getCommandHistory() {
    return this.commandHistory;
  }

  // Add to history method
  addToHistory(command) {
    const historyItem = {
      id: Date.now(),
      command: command,
      timestamp: Date.now(),
      created_at: new Date().toISOString()
    };
    
    this.commandHistory.unshift(historyItem);
    
    // Limit history record count
    if (this.commandHistory.length > 100) {
      this.commandHistory = this.commandHistory.slice(0, 100);
    }
    
    // Save to local storage
    localStorage.setItem('cursorRemote_commandHistory', JSON.stringify(this.commandHistory));
    
    return historyItem;
  }

  // Clear history
  clearHistory() {
    this.commandHistory = [];
    localStorage.removeItem('cursorRemote_commandHistory');
  }

  // Remove specific command from history
  removeCommand(command) {
    if (!command) return false;
    
    const originalLength = this.commandHistory.length;
    this.commandHistory = this.commandHistory.filter(item => 
      item.command !== command && item.command_text !== command
    );
    
    const wasRemoved = this.commandHistory.length < originalLength;
    if (wasRemoved) {
      // Update local storage
      localStorage.setItem('cursorRemote_commandHistory', JSON.stringify(this.commandHistory));
    }
    
    return wasRemoved;
  }
}

// Instantiate global service - need to wait for supabaseClient to be ready
let globalEnhancementService = null;

function initGlobalEnhancementService(supabaseClient) {
  if (!globalEnhancementService && supabaseClient) {
    globalEnhancementService = new ClientEnhancementService(supabaseClient);
    window.clientEnhancementService = globalEnhancementService;
    
    // For backward compatibility and ease of use, also expose each function separately
    window.CommandHistory = {
      getHistory: () => globalEnhancementService.getCommandHistory(),
      addCommand: (command) => globalEnhancementService.addToHistory(command),
      clearHistory: () => globalEnhancementService.clearHistory(),
      removeCommand: (command) => globalEnhancementService.removeCommand(command),
      clearCache: () => globalEnhancementService.clearHistory() // Compatibility alias
    };
  }
  return globalEnhancementService;
}

// Expose initialization function
window.initGlobalEnhancementService = initGlobalEnhancementService;
