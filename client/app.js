/**
 * Cursor远程控制 - 客户端应用
 * 
 * 这个文件包含与Redis服务器通信的客户端逻辑。
 * 注意：实际应用中需要使用WebSocket或HTTP API代理与Redis通信，
 * 因为浏览器不能直接连接Redis服务器。
 */

// const SUPABASE_URL = 'https://rzsupavqzxhyrgcexrpx.supabase.co'; // To be replaced by env var
// const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6c3VwYXZxenhoeXJnY2V4cnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0NzI4MTMsImV4cCI6MjA2MzA0ODgxM30.6S5s7ruZA6x3JRc6d9Oq8USOBxoDlJCXOXTOaJKimPA'; // To be replaced by env var

let supabaseClient;

// Supabase SDK and config are expected to be loaded via CDN and env-config.js respectively
if (typeof window.SUPABASE_URL === 'string' && window.SUPABASE_URL &&
    typeof window.SUPABASE_ANON_KEY === 'string' && window.SUPABASE_ANON_KEY &&
    typeof supabase !== 'undefined' && supabase.createClient) {
    try {
        supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        console.log('Supabase client initialized with credentials from window object:', supabaseClient);
    } catch (error) {
        console.error('Error initializing Supabase client with provided credentials:', error);
        supabaseClient = null; // Ensure client is null if initialization fails
    }
} else {
    console.error('Supabase URL/Anon Key not found on window object, or Supabase SDK not loaded. Supabase client NOT initialized.');
    // UI update for this error is handled in initApp
}

// At the top of the file, or with other app-level state variables
const activeSubscriptions = new Map(); // To keep track of active subscriptions

/**
 * 生成一个简单的 UUID v4 字符串。
 * @returns {string} UUID v4.
 */
function generateUUIDv4() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Basic fallback if crypto.randomUUID is not available
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * 构建用于发送到 Supabase 'commands' 表的指令对象。
 * @param {string} commandText - 用户输入的指令文本。
 * @returns {object} - 符合 'commands' 表结构的指令对象。
 */
function buildSupabaseCommandPayload(commandText) {
    // 为匿名用户生成一个临时的 UUID 作为 user_id
    const userId = generateUUIDv4(); 
    return {
        user_id: userId,
        command_text: commandText,
        status: 'pending'
    };
}

/**
 * 处理已完成的指令，从 results 表获取并显示结果。
 * @param {string} commandDbId - 数据库中 commands 表指令的UUID。
 * @param {string} originalCommandText - 用户原始输入的指令文本，用于上下文显示。
 */
async function handleCompletedCommand(commandDbId, originalCommandText) {
    console.log(`Command ${commandDbId} completed. Fetching result from 'results' table.`);
    try {
        const { data: resultsData, error: resultsError } = await supabaseClient
            .from('results')
            .select('result_text, error_message, is_error') 
            .eq('command_id', commandDbId) 
            .single(); 

        if (resultsError) {
            console.error(`Error fetching result for command ${commandDbId}:`, resultsError);
            addMessageToHistory({
                type: 'error',
                content: `获取指令 "${originalCommandText}" 的结果失败: ${resultsError.message}`,
                timestamp: Date.now()
            });
        } else if (resultsData) {
            if (resultsData.is_error) {
                addMessageToHistory({
                    type: 'error',
                    content: resultsData.error_message || '指令执行发生未知错误 (来自results表)',
                    timestamp: Date.now()
                });
            } else {
                addMessageToHistory({
                    type: 'cursor',
                    content: resultsData.result_text, 
                    timestamp: Date.now()
                });
            }
        } else {
            addMessageToHistory({
                type: 'error',
                content: `指令 "${originalCommandText}" 已完成，但未找到结果。`,
                timestamp: Date.now()
            });
        }
    } catch (fetchErr) {
        console.error(`Unexpected error fetching result for command ${commandDbId}:`, fetchErr);
        addMessageToHistory({
            type: 'error',
            content: `获取指令 "${originalCommandText}" 结果时发生意外错误。`,
            timestamp: Date.now()
        });
    }
    renderMessageHistory(); 
    scrollChatToBottom();
}

/**
 * 订阅特定指令ID的状态更新。
 * @param {string} commandDbId - 数据库中指令的UUID。
 * @param {string} originalCommandText - 用户原始输入的指令文本，用于上下文显示。
 */
function subscribeToCommandUpdates(commandDbId, originalCommandText) {
    console.log(`[DEBUG] Attempting to subscribe for command ID: ${commandDbId}`);
    const channelName = `command-${commandDbId}`;
    if (activeSubscriptions.has(channelName)) {
        const oldChannel = activeSubscriptions.get(channelName);
        supabaseClient.removeChannel(oldChannel);
        activeSubscriptions.delete(channelName);
    }

    const channel = supabaseClient.channel(channelName);
    activeSubscriptions.set(channelName, channel);

    channel
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'commands',
                filter: `id=eq.${commandDbId}`
            },
            async (payload) => { // 注意这里变成 async
                console.log('[DEBUG] postgres_changes CALLBACK TRIGGERED. Payload:', payload);
                const updatedCommand = payload.new;

                if (updatedCommand.status === 'completed') {
                    await handleCompletedCommand(updatedCommand.id, originalCommandText); 
                    supabaseClient.removeChannel(channel);
                    activeSubscriptions.delete(channelName);
                } else if (updatedCommand.status === 'error') {
                    addMessageToHistory({
                        type: 'error',
                        content: `指令处理错误: ${updatedCommand.error_message || '未知错误'} (来自commands表)`,
                        timestamp: Date.now()
                    });
                    renderMessageHistory();
                    scrollChatToBottom();
                    supabaseClient.removeChannel(channel);
                    activeSubscriptions.delete(channelName);
                } else if (updatedCommand.status === 'processing') {
                    console.log(`Command ${commandDbId} is processing.`);
                }
            }
        )
        .subscribe((status, err) => {
            console.log(`[DEBUG] SUBSCRIBE CALLBACK TRIGGERED. Status: ${status}`, err ? `Error: ${JSON.stringify(err)}` : '');
            if (status === 'SUBSCRIBED') {
                console.log(`Subscribed to updates for command ${commandDbId} on 'commands' table.`);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error(`Subscription error for command ${commandDbId} on 'commands' table:`, status, err);
                addNotificationToChat(`无法订阅指令状态: ${err?.message || status}`);
                activeSubscriptions.delete(channelName);
            } else if (status === 'CLOSED') {
                console.log(`Subscription closed for command ${commandDbId} on 'commands' table.`);
                activeSubscriptions.delete(channelName);
            }
        });
}

/**
 * 异步发送指令到 Supabase 'commands' 表。
 * @param {object} commandPayload - 要发送的指令对象。
 */
async function sendSupabaseCommand(commandPayload) {
    if (!supabaseClient) {
        console.error('Supabase client is not initialized. Cannot send command.');
        addNotificationToChat('错误：无法连接到服务，请检查配置。');
        return;
    }

    try {
        addMessageToHistory({
            type: 'user',
            content: commandPayload.command_text,
            timestamp: Date.now()
        });
        renderMessageHistory();
        scrollChatToBottom();

        const { data, error } = await supabaseClient
            .from('commands')
            .insert([commandPayload])
            .select(); // .select() will return an array

        if (error) {
            console.error('Error sending command to Supabase:', error);
            addNotificationToChat(`发送指令失败: ${error.message}`);
        } else if (data && data.length > 0) { // Check if data is an array and has items
            const insertedCommand = data[0];
            console.log('Command sent to Supabase successfully:', insertedCommand);
            console.log('Command ID:', insertedCommand.id);
            subscribeToCommandUpdates(insertedCommand.id, commandPayload.command_text);
        } else {
            console.error('Command sent to Supabase, but no data returned.');
            addNotificationToChat('指令已发送，但未收到确认。');
        }
    } catch (err) {
        console.error('Unexpected error sending command:', err);
        addNotificationToChat(`发送指令时发生意外错误: ${err.message}`);
    }
}

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

    // 检查Supabase客户端是否已初始化
    if (!supabaseClient) {
        updateConnectionStatus(false, 'Supabase配置错误');
        // 可以选择显示设置模态框或特定错误消息
        // showSettingsModal(); // 或者其他UI提示
        return; // 阻止进一步执行，因为Supabase未初始化
    }
    
    // 如果 Supabase 客户端已成功初始化，我们更新连接状态
    // 并跳过旧的 Redis 连接尝试及设置窗口的显示逻辑
    updateConnectionStatus(true, '已连接 (Supabase)');
    
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
        redisPort: Number.parseInt(formData.get('redisPort')),
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
    elements.sendButton.addEventListener('click', async () => { // 注意 async
        const messageText = elements.messageInput.value.trim();
        if (messageText) {
            const commandPayload = buildSupabaseCommandPayload(messageText);
            // console.log('Command payload for Supabase:', commandPayload); // 用于调试

            await sendSupabaseCommand(commandPayload); // 调用新的异步函数
            
            // 旧的 sendMessage() 逻辑可以暂时保留或逐步替换
            // sendMessage(); // 这是旧的 Redis 相关逻辑调用

            elements.messageInput.value = ''; // 清空输入框
        }
    });
    
    // 输入框按Enter发送
    elements.messageInput.addEventListener('keydown', async (event) => { // 注意 async
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            const messageText = elements.messageInput.value.trim();
            if (messageText) {
                const commandPayload = buildSupabaseCommandPayload(messageText);
                // console.log('Command payload for Supabase:', commandPayload); // 用于调试

                await sendSupabaseCommand(commandPayload); // 调用新的异步函数

                // 旧的 sendMessage() 逻辑可以暂时保留或逐步替换
                // sendMessage(); // 这是旧的 Redis 相关逻辑调用

                elements.messageInput.value = ''; // 清空输入框
            }
        }
    });
    
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
    console.log('[DEBUG] updateConnectionStatus called with:', connected, message);
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
        const success = response.result?.success;
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
            for (const message of appState.messageHistory) {
                renderMessage(message);
            }
            
            // 滚动到底部
            scrollChatToBottom();
        } catch (error) {
            console.error('加载历史记录失败:', error);
        }
    }
}

// 渲染单条消息
function renderMessage(message) {
    console.log('Rendering message:', message); // 已存在的DEBUG日志
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.type}-message`;
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';

    // 使用 Marked.js 解析 Markdown (如果已加载)
    if (typeof marked !== 'undefined' && message.content) {
        try {
            contentElement.innerHTML = marked.parse(message.content);
        } catch (e) {
            console.error('Error parsing Markdown:', e);
            contentElement.textContent = message.content; // Fallback to raw text on error
        }
    } else if (message.content) {
        contentElement.textContent = message.content; // Fallback if marked is not loaded
    } else {
        contentElement.textContent = ''; // Handle cases where content might be null/undefined explicitly
    }
    
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