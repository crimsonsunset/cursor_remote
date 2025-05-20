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
    // renderMessageHistory(); // addMessageToHistory should handle individual message rendering
    // scrollChatToBottom(); // addMessageToHistory should handle scrolling

    // Remove from pendingCommandsClientSide after processing
    let pendingCommands = JSON.parse(localStorage.getItem('pendingCommandsClientSide')) || [];
    pendingCommands = pendingCommands.filter(cmd => cmd.id !== commandDbId);
    localStorage.setItem('pendingCommandsClientSide', JSON.stringify(pendingCommands));
    console.log(`Command ${commandDbId} processed and removed from pending list.`);
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

                if (updatedCommand.status === 'completed' || updatedCommand.status === 'error') {
                    await handleCompletedCommand(updatedCommand.id, originalCommandText); 
                    supabaseClient.removeChannel(channel);
                    activeSubscriptions.delete(channelName);
                    // pendingCommandsClientSide removal is handled by handleCompletedCommand
                } else if (updatedCommand.status === 'processing') {
                    console.log(`Command ${updatedCommand.id} is processing.`);
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

            // Store command in localStorage as pending client-side processing
            let pendingCommands = JSON.parse(localStorage.getItem('pendingCommandsClientSide')) || [];
            pendingCommands.push({
                id: insertedCommand.id,
                text: commandPayload.command_text,
                timestamp: Date.now() 
            });
            localStorage.setItem('pendingCommandsClientSide', JSON.stringify(pendingCommands));

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
    // 设置事件监听器
    setupEventListeners();

    // 检查Supabase客户端是否已初始化
    if (!supabaseClient) {
        updateConnectionStatus(false, 'Supabase配置错误');
        return; 
    }
    
    // 如果 Supabase 客户端已成功初始化，我们更新连接状态
    updateConnectionStatus(true, '已连接 (Supabase)');
    
    // 加载主题设置
    loadThemePreference();
    
    // 显示历史消息
    renderMessageHistory();
    
    // 应用启动时检查并处理待处理的指令
    processPendingCommandsOnLoad();
    
    // 自动调整文本区域高度
    setupTextareaAutoResize();
}

// 设置事件监听器
function setupEventListeners() {
    // 发送按钮点击
    elements.sendButton.addEventListener('click', handleAndClearInput);
    
    // 主题切换按钮
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // 修改输入框按键事件，回车键进行换行而非发送消息
    elements.messageInput.addEventListener('keydown', async (event) => {
        // 当按下Ctrl+Enter或者发送按钮时才发送消息
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            await handleAndClearInput();
        }
        // 普通的Enter键不做特殊处理，允许换行
    });
    
    // 为所有出现的复制按钮添加事件监听器
    document.addEventListener('click', function(event) {
        if (event.target.closest('.copy-button')) {
            const messageElement = event.target.closest('.message');
            const contentElement = messageElement.querySelector('.message-content');
            copyToClipboard(contentElement.innerText);
        }
    });
    
    // 回到底部按钮
    const scrollToBottomBtn = document.getElementById('scrollToBottomBtn');
    if (scrollToBottomBtn) {
        // 点击按钮滚动到底部
        scrollToBottomBtn.addEventListener('click', function() {
            scrollChatToBottom();
        });
        
        // 监听页面滚动
        window.addEventListener('scroll', function() {
            const scrollPosition = window.scrollY;
            const viewportHeight = window.innerHeight;
            const documentHeight = document.body.scrollHeight;
            
            // 当距离底部超过300px时显示按钮
            if (documentHeight - (scrollPosition + viewportHeight) > 300) {
                scrollToBottomBtn.classList.add('visible');
            } else {
                scrollToBottomBtn.classList.remove('visible');
            }
        });
    }
}

// 优化文本区域自动高度调整
function setupTextareaAutoResize() {
    const textarea = elements.messageInput;
    const mainContent = document.querySelector('.main-content');
    const inputWrapper = document.querySelector('.input-wrapper');
    const MAX_ROWS = 5;
    const lineHeight = 24; // 基于行高 1.5 和字体大小 16px
    const BASE_PADDING = 120; // 默认底部填充值，与CSS中设置的相同
    
    // 初始高度设置为一行
    textarea.style.height = `${lineHeight}px`;
    
    // 更新主内容区域的底部填充，以适应输入框高度变化
    function updateContentPadding() {
        const inputHeight = inputWrapper.offsetHeight;
        mainContent.style.paddingBottom = `${inputHeight + 20}px`; // 额外添加20px作为缓冲
    }
    
    // 初始调用一次更新填充
    updateContentPadding();
    
    // 输入时自动调整高度
    textarea.addEventListener('input', function() {
        // 保存当前滚动位置
        const scrollTop = window.scrollY;
        
        // 记住光标位置
        const selectionStart = this.selectionStart;
        const selectionEnd = this.selectionEnd;
        
        // 临时设置高度为自动，以获取真实内容高度
        this.style.height = 'auto';
        
        // 计算当前内容的实际高度
        const currentHeight = this.scrollHeight;
        
        // 计算大约的行数
        const rowCount = Math.ceil(currentHeight / lineHeight);
        
        // 如果超过最大行数，添加scrollable类并设置固定高度
        if (rowCount > MAX_ROWS) {
            this.classList.add('scrollable');
            this.style.height = `${MAX_ROWS * lineHeight}px`;
        } else {
            // 否则，移除scrollable类并设置为实际内容高度
            this.classList.remove('scrollable');
            this.style.height = `${currentHeight}px`;
        }
        
        // 更新内容区域的底部填充，以适应输入框高度变化
        updateContentPadding();
        
        // 恢复光标位置
        this.setSelectionRange(selectionStart, selectionEnd);
        
        // 恢复滚动位置
        window.scrollTo(0, scrollTop);
    });
    
    // 初始触发一次自动调整
    const inputEvent = new Event('input');
    textarea.dispatchEvent(inputEvent);
    
    // 监听窗口大小变化，更新填充
    window.addEventListener('resize', updateContentPadding);
}

// 清除聊天历史
function clearChat() {
    // 清空本地存储和消息历史数组
    localStorage.removeItem('cursorRemoteHistory');
    appState.messageHistory = [];
    
    // 清空聊天容器，只保留欢迎消息
    elements.chatContainer.innerHTML = '';
    
    // 添加系统欢迎消息
    const welcomeMessage = document.createElement('div');
    welcomeMessage.className = 'message system-message';
    welcomeMessage.innerHTML = `
        <div class="message-content">
            <p>欢迎使用Cursor远程控制！请输入您想问Cursor的问题。</p>
        </div>
    `;
    elements.chatContainer.appendChild(welcomeMessage);
}

// 切换暗黑/亮色主题
function toggleTheme() {
    const body = document.body;
    const themeToggle = document.getElementById('themeToggle');
    const isDarkMode = body.classList.toggle('dark-mode');
    
    // 更新主题图标
    if (themeToggle) {
        themeToggle.innerHTML = isDarkMode ? 
            '<i class="ri-sun-line"></i>' : 
            '<i class="ri-moon-line"></i>';
    }
    
    // 保存主题偏好到本地存储
    localStorage.setItem('cursorRemoteTheme', isDarkMode ? 'dark' : 'light');
}

// 加载主题偏好
function loadThemePreference() {
    const savedTheme = localStorage.getItem('cursorRemoteTheme');
    const themeToggle = document.getElementById('themeToggle');
    
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        if (themeToggle) {
            themeToggle.innerHTML = '<i class="ri-sun-line"></i>';
        }
    }
}

// 复制文本到剪贴板
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // 显示复制成功提示
        showToast('复制成功');
    }).catch(err => {
        console.error('复制失败:', err);
    });
}

// 显示临时提示
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // 2秒后自动消失
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 2000);
}

// 渲染单条消息
function renderMessage(message) {
    console.log('Rendering message:', message);
    
    // 根据消息类型使用正确的模板
    let template;
    if (message.type === 'user') {
        template = document.getElementById('userMessageTemplate');
    } else if (message.type === 'cursor' || message.type === 'assistant') { // 兼容旧代码与新UI
        template = document.getElementById('assistantMessageTemplate');
    } else {
        // 对于系统消息或通知，创建一个简单的div
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.type}-message`;
        
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        
        // 确保使用 Marked.js 解析 Markdown
        if (typeof marked !== 'undefined' && message.content) {
            try {
                // 设置marked选项以确保正确渲染
                marked.setOptions({
                    breaks: true, // 将换行符转换为 <br>
                    gfm: true,    // 启用GitHub风格的Markdown
                    headerIds: true, // 为标题添加ID
                    sanitize: false // 允许HTML标签
                });
                contentElement.innerHTML = marked.parse(message.content);
            } catch (e) {
                console.error('Error parsing Markdown:', e);
                contentElement.textContent = message.content;
            }
        } else if (message.content) {
            contentElement.textContent = message.content;
        } else {
            contentElement.textContent = '';
        }
        
        messageElement.appendChild(contentElement);
        elements.chatContainer.appendChild(messageElement);
        
        // 使用Prism.js高亮代码块
        if (typeof Prism !== 'undefined') {
            Prism.highlightAllUnder(messageElement);
        }
        
        return;
    }
    
    // 使用模板创建消息元素
    if (template) {
        const clone = document.importNode(template.content, true);
        const contentElement = clone.querySelector('.message-content');
        
        // 确保使用 Marked.js 解析 Markdown
        if (typeof marked !== 'undefined' && message.content) {
            try {
                // 设置marked选项以确保正确渲染
                marked.setOptions({
                    breaks: true, // 将换行符转换为 <br>
                    gfm: true,    // 启用GitHub风格的Markdown
                    headerIds: true, // 为标题添加ID
                    sanitize: false // 允许HTML标签
                });
                contentElement.innerHTML = marked.parse(message.content);
            } catch (e) {
                console.error('Error parsing Markdown:', e);
                contentElement.textContent = message.content;
            }
        } else if (message.content) {
            contentElement.textContent = message.content;
        }
        
        elements.chatContainer.appendChild(clone);
        
        // 获取刚刚添加的消息元素
        const messageElement = elements.chatContainer.lastElementChild;
        
        // 使用Prism.js高亮代码块
        if (typeof Prism !== 'undefined') {
            Prism.highlightAllUnder(messageElement);
        }
    }
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
    console.log('[DEBUG] Before saving to localStorage, appState.messageHistory:', JSON.parse(JSON.stringify(appState.messageHistory)));
    localStorage.setItem('cursorRemoteHistory', JSON.stringify(appState.messageHistory));
    console.log('[DEBUG] After saving to localStorage, localStorage.getItem(\'cursorRemoteHistory\'):', localStorage.getItem('cursorRemoteHistory'));

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
    console.log('[DEBUG] renderMessageHistory called.');
    console.log('[DEBUG] Initial localStorage.getItem(\'cursorRemoteHistory\'):', localStorage.getItem('cursorRemoteHistory'));
    console.log('[DEBUG] Initial appState.messageHistory:', JSON.parse(JSON.stringify(appState.messageHistory)));

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
    console.log('[DEBUG] After trying to load from localStorage, appState.messageHistory:', JSON.parse(JSON.stringify(appState.messageHistory)));
}

// 滚动聊天到底部
function scrollChatToBottom() {
    // 滚动整个页面到底部，而不只是聊天容器
    window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
    });
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

// 新增函数：在应用加载时处理之前待处理的指令
async function processPendingCommandsOnLoad() {
    let pendingCommands = JSON.parse(localStorage.getItem('pendingCommandsClientSide')) || [];
    if (pendingCommands.length === 0) {
        console.log('No pending commands to process on load.');
        return;
    }

    console.log(`Processing ${pendingCommands.length} pending commands on load.`);

    for (const command of pendingCommands) {
        if (!command.id || !command.text) {
            console.warn('Invalid pending command entry:', command);
            continue; 
        }

        try {
            const { data: commandData, error: cmdError } = await supabaseClient
                .from('commands')
                .select('status') // Only select status, not error_message
                .eq('id', command.id)
                .single();

            if (cmdError) {
                console.error(`Error fetching status for pending command ${command.id} on load. Message:`, cmdError.message || 'No message property', 'Full error object:', cmdError);
                // 如果获取状态失败，可以选择暂时保留或移除，这里暂时跳过
                continue;
            }

            if (commandData) {
                if (commandData.status === 'completed' || commandData.status === 'error') {
                    console.log(`Pending command ${command.id} found as '${commandData.status}'. Handling result/error via handleCompletedCommand.`);
                    await handleCompletedCommand(command.id, command.text); 
                    // handleCompletedCommand will remove it from localStorage and display message
                } else if (commandData.status === 'pending' || commandData.status === 'processing') {
                    console.log(`Command ${command.id} is still '${commandData.status}'. Re-subscribing.`);
                    subscribeToCommandUpdates(command.id, command.text);
                } else {
                    // Unknown status, maybe remove it to prevent clutter
                    console.warn(`Command ${command.id} has unknown status '${commandData.status}'. Removing from pending list.`);
                    let currentPending = JSON.parse(localStorage.getItem('pendingCommandsClientSide')) || [];
                    currentPending = currentPending.filter(pCmd => pCmd.id !== command.id);
                    localStorage.setItem('pendingCommandsClientSide', JSON.stringify(currentPending));
                }
            } else {
                 // Command not found in DB, might have been deleted or an issue. Remove from pending.
                console.warn(`Pending command ${command.id} not found in database. Removing from pending list.`);
                let currentPending = JSON.parse(localStorage.getItem('pendingCommandsClientSide')) || [];
                currentPending = currentPending.filter(pCmd => pCmd.id !== command.id);
                localStorage.setItem('pendingCommandsClientSide', JSON.stringify(currentPending));
            }
        } catch (error) {
            console.error(`Unexpected error processing pending command ${command.id} on load:`, error);
        }
    }
}

// 新增：处理发送消息并清空输入框的辅助函数
async function handleAndClearInput() {
    const messageText = elements.messageInput.value.trim();
    if (messageText) {
        const commandPayload = buildSupabaseCommandPayload(messageText);
        await sendSupabaseCommand(commandPayload); // sendSupabaseCommand 内部已处理历史记录和UI更新
        elements.messageInput.value = ''; // 发送后清空输入框
    }
}

// 页面加载时初始化应用
document.addEventListener('DOMContentLoaded', initApp); 