/**
 * Cursor远程控制 - 客户端应用
 * 
 * 这个文件包含与Redis服务器通信的客户端逻辑。
 * 注意：实际应用中需要使用WebSocket或HTTP API代理与Redis通信，
 * 因为浏览器不能直接连接Redis服务器。
 */

// 应用状态
const appState = {
    connected: false,
    settings: {
        redisHost: '',
        redisPort: 6379,
        redisPassword: '',
        commandChannel: 'cursor:commands',
        resultChannel: 'cursor:results'
    },
    pendingCommands: new Map(), // 存储待响应的命令
    messageHistory: [] // 存储聊天历史
};

// 常量
const MAX_HISTORY_LENGTH = 50;
const COMMAND_TIMEOUT = 30000; // 30秒超时
const RECONNECT_INTERVAL = 5000; // 5秒重连间隔

// DOM元素
const elements = {
    chatContainer: document.getElementById('chatContainer'),
    messageInput: document.getElementById('messageInput'),
    sendButton: document.getElementById('sendButton'),
    connectionStatus: document.getElementById('connectionStatus'),
    statusText: document.getElementById('statusText'),
    settingsButton: document.getElementById('settingsButton'),
    settingsModal: document.getElementById('settingsModal'),
    closeModal: document.getElementById('closeModal'),
    settingsForm: document.getElementById('settingsForm'),
    actionButtons: document.querySelectorAll('.action-button')
};

// 初始化应用
function initApp() {
    // 加载设置
    loadSettings();
    
    // 设置事件监听器
    setupEventListeners();
    
    // 尝试连接到服务器
    if (appState.settings.redisHost) {
        updateConnectionStatus(false, '正在连接...');
        connectToServer();
    } else {
        showSettingsModal();
    }
    
    // 显示历史消息
    renderMessageHistory();
}

// 加载保存的设置
function loadSettings() {
    const savedSettings = localStorage.getItem('cursorRemoteSettings');
    if (savedSettings) {
        try {
            appState.settings = JSON.parse(savedSettings);
            
            // 填充设置表单
            document.getElementById('redisHost').value = appState.settings.redisHost;
            document.getElementById('redisPort').value = appState.settings.redisPort;
            document.getElementById('redisPassword').value = appState.settings.redisPassword;
            document.getElementById('commandChannel').value = appState.settings.commandChannel;
            document.getElementById('resultChannel').value = appState.settings.resultChannel;
        } catch (error) {
            console.error('加载设置失败:', error);
        }
    }
}

// 保存设置
function saveSettings(formData) {
    // 更新状态
    appState.settings = {
        redisHost: formData.get('redisHost'),
        redisPort: parseInt(formData.get('redisPort')),
        redisPassword: formData.get('redisPassword'),
        commandChannel: formData.get('commandChannel'),
        resultChannel: formData.get('resultChannel')
    };
    
    // 保存到本地存储
    localStorage.setItem('cursorRemoteSettings', JSON.stringify(appState.settings));
    
    // 如果设置已更改，重新连接
    updateConnectionStatus(false, '正在重新连接...');
    connectToServer();
}

// 设置事件监听器
function setupEventListeners() {
    // 发送按钮点击
    elements.sendButton.addEventListener('click', () => {
        sendMessage();
    });
    
    // 输入框按Enter发送
    elements.messageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });
    
    // 显示设置对话框
    elements.settingsButton.addEventListener('click', (event) => {
        event.preventDefault();
        showSettingsModal();
    });
    
    // 关闭设置对话框
    elements.closeModal.addEventListener('click', () => {
        hideSettingsModal();
    });
    
    // 点击模态框外部关闭
    elements.settingsModal.addEventListener('click', (event) => {
        if (event.target === elements.settingsModal) {
            hideSettingsModal();
        }
    });
    
    // 设置表单提交
    elements.settingsForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(elements.settingsForm);
        saveSettings(formData);
        hideSettingsModal();
    });
    
    // 动作按钮点击
    elements.actionButtons.forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.action;
            if (action) {
                performAction(action);
            }
        });
    });
}

// 显示设置对话框
function showSettingsModal() {
    elements.settingsModal.classList.add('visible');
}

// 隐藏设置对话框
function hideSettingsModal() {
    elements.settingsModal.classList.remove('visible');
}

// 连接到服务器
// 注意：实际应用中，这应该连接到一个代理WebSocket或HTTP服务
function connectToServer() {
    // 在实际应用中，这里应当建立WebSocket连接
    // 这里只是模拟连接状态
    setTimeout(() => {
        appState.connected = true;
        updateConnectionStatus(true, '已连接');
        
        // 在真实应用中，这里应当设置WebSocket消息处理程序
        // 模拟启动接收结果的循环
        pollForResults();
    }, 1500);
}

// 轮询获取结果
// 注意：实际应用中，应使用WebSocket接收实时消息
function pollForResults() {
    // 这是一个模拟，实际应通过WebSocket接收消息
    
    // 每2秒检查一次超时的命令
    setInterval(() => {
        const now = Date.now();
        appState.pendingCommands.forEach((command, id) => {
            if (now - command.timestamp > COMMAND_TIMEOUT) {
                handleCommandTimeout(id);
            }
        });
    }, 2000);
}

// 处理命令超时
function handleCommandTimeout(commandId) {
    const command = appState.pendingCommands.get(commandId);
    if (command) {
        // 创建超时响应
        const response = {
            id: commandId,
            error: true,
            message: '命令执行超时'
        };
        
        // 处理响应
        handleResponse(response);
        
        // 从待处理命令中移除
        appState.pendingCommands.delete(commandId);
    }
}

// 更新连接状态显示
function updateConnectionStatus(connected, message) {
    appState.connected = connected;
    
    if (connected) {
        elements.connectionStatus.classList.add('connected');
    } else {
        elements.connectionStatus.classList.remove('connected');
    }
    
    elements.statusText.textContent = message || (connected ? '已连接' : '未连接');
}

// 发送消息
function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (!message) return;
    
    if (!appState.connected) {
        alert('未连接到服务器，请检查设置并重试。');
        return;
    }
    
    // 生成命令ID
    const commandId = generateId();
    
    // 创建命令对象
    const command = {
        id: commandId,
        type: 'chat',
        command: message,
        timestamp: Date.now()
    };
    
    // 添加到历史记录
    addMessageToHistory({
        id: commandId,
        type: 'user',
        content: message,
        timestamp: Date.now()
    });
    
    // 发送命令到服务器
    sendCommand(command);
    
    // 清空输入框
    elements.messageInput.value = '';
}

// 执行动作
function performAction(action) {
    if (!appState.connected) {
        alert('未连接到服务器，请检查设置并重试。');
        return;
    }
    
    // 生成命令ID
    const commandId = generateId();
    
    // 创建命令对象
    const command = {
        id: commandId,
        type: 'action',
        command: action,
        timestamp: Date.now()
    };
    
    // 显示正在执行
    addNotificationToChat(`执行操作: ${getActionName(action)}...`);
    
    // 发送命令到服务器
    sendCommand(command);
}

// 获取动作名称
function getActionName(action) {
    const actionNames = {
        'new_chat': '新建聊天',
        'clear_chat': '清除聊天',
        'save_code': '保存代码',
        'run_code': '运行代码'
    };
    
    return actionNames[action] || action;
}

// 发送命令到服务器
function sendCommand(command) {
    // 将命令添加到待响应队列
    appState.pendingCommands.set(command.id, command);
    
    // 在实际应用中，这里应当通过WebSocket或API发送命令
    // 这里模拟服务器响应
    simulateServerResponse(command);
}

// 模拟服务器响应（仅用于演示）
function simulateServerResponse(command) {
    // 在实际应用中，不需要这个函数，因为响应将从WebSocket接收
    
    // 模拟网络延迟
    const delay = 1000 + Math.random() * 2000;
    
    setTimeout(() => {
        let response;
        
        if (command.type === 'chat') {
            response = {
                id: command.id,
                timestamp: Date.now(),
                result: {
                    success: true,
                    type: 'chat',
                    message: `这是对"${command.command}"的模拟响应。在真实应用中，这将是Cursor的实际回复。`
                }
            };
        } else if (command.type === 'action') {
            response = {
                id: command.id,
                timestamp: Date.now(),
                result: {
                    success: true,
                    type: 'action',
                    action: command.command,
                    result: `已执行操作: ${getActionName(command.command)}`
                }
            };
        }
        
        // 处理响应
        handleResponse(response);
    }, delay);
}

// 处理响应
function handleResponse(response) {
    // 查找对应的命令
    const command = appState.pendingCommands.get(response.id);
    if (!command) {
        console.warn('收到未知命令的响应:', response);
        return;
    }
    
    // 从待处理队列中移除
    appState.pendingCommands.delete(response.id);
    
    // 处理聊天响应
    if (command.type === 'chat' && response.result && response.result.message) {
        // 添加到历史
        addMessageToHistory({
            id: response.id,
            type: 'cursor',
            content: response.result.message,
            timestamp: response.timestamp
        });
    } 
    // 处理动作响应
    else if (command.type === 'action') {
        const success = response.result && response.result.success;
        const message = success
            ? response.result.result
            : `操作失败: ${response.result?.error || '未知错误'}`;
            
        addNotificationToChat(message);
    }
}

// 添加消息到历史
function addMessageToHistory(message) {
    appState.messageHistory.push(message);
    
    // 限制历史长度
    if (appState.messageHistory.length > MAX_HISTORY_LENGTH) {
        appState.messageHistory.shift();
    }
    
    // 保存到本地存储
    localStorage.setItem('cursorRemoteHistory', JSON.stringify(appState.messageHistory));
    
    // 渲染新消息
    renderMessage(message);
    
    // 滚动到底部
    scrollChatToBottom();
}

// 添加通知到聊天
function addNotificationToChat(content) {
    const notificationElement = document.createElement('div');
    notificationElement.className = 'notification';
    notificationElement.textContent = content;
    
    elements.chatContainer.appendChild(notificationElement);
    scrollChatToBottom();
}

// 渲染消息历史
function renderMessageHistory() {
    // 清空聊天容器
    elements.chatContainer.innerHTML = '';
    
    // 加载历史记录
    const savedHistory = localStorage.getItem('cursorRemoteHistory');
    if (savedHistory) {
        try {
            appState.messageHistory = JSON.parse(savedHistory);
            
            // 渲染每条消息
            appState.messageHistory.forEach(message => {
                renderMessage(message);
            });
            
            // 滚动到底部
            scrollChatToBottom();
        } catch (error) {
            console.error('加载历史记录失败:', error);
        }
    }
}

// 渲染单条消息
function renderMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.type}-message`;
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    contentElement.textContent = message.content;
    
    const timeElement = document.createElement('div');
    timeElement.className = 'message-time';
    timeElement.textContent = formatTime(message.timestamp);
    
    messageElement.appendChild(contentElement);
    messageElement.appendChild(timeElement);
    
    elements.chatContainer.appendChild(messageElement);
}

// 滚动聊天到底部
function scrollChatToBottom() {
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

// 格式化时间
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// 生成唯一ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// 初始化应用
document.addEventListener('DOMContentLoaded', initApp); 