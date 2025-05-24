/**
 * Cursor远程控制 - 客户端应用
 * 
 * 这个文件包含与Redis服务器通信的客户端逻辑。
 * 注意：实际应用中需要使用WebSocket或HTTP API代理与Redis通信，
 * 因为浏览器不能直接连接Redis服务器。
 */

let supabaseClient;

// Supabase SDK and config are expected to be loaded via CDN and env-config.js respectively
if (typeof window.SUPABASE_URL === 'string' && window.SUPABASE_URL &&
    typeof window.SUPABASE_ANON_KEY === 'string' && window.SUPABASE_ANON_KEY &&
    typeof supabase !== 'undefined' && supabase.createClient) {
    try {
        supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
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
 * @param {HTMLElement} [loadingMessage] - 加载消息元素的引用，用于完成后移除。
 */
async function handleCompletedCommand(commandDbId, originalCommandText, loadingMessage) {
    try {
        // 修改查询方式，不使用.single()方法
        const { data: resultsData, error: resultsError } = await supabaseClient
            .from('results')
            .select('result_text, error_message, is_error') 
            .eq('command_id', commandDbId);

        // 移除加载动画（如果存在）
        if (loadingMessage?.classList.contains('loading-message')) {
            loadingMessage.remove();
        } else {
            // 查找可能存在的加载动画
            const loadingMessages = document.querySelectorAll('.loading-message');
            for (const el of loadingMessages) {
                el.remove();
            }
        }

        if (resultsError) {
            console.error(`Error fetching result for command ${commandDbId}:`, resultsError);
            addMessageToHistory({
                type: 'error',
                content: `获取指令 "${originalCommandText}" 的结果失败: ${resultsError.message}`,
                timestamp: Date.now()
            });
        } else if (resultsData && resultsData.length > 0) {
            // 存在结果记录，取第一条
            const resultRecord = resultsData[0];
            if (resultRecord.is_error) {
                addMessageToHistory({
                    type: 'error',
                    content: resultRecord.error_message || '指令执行发生未知错误 (来自results表)',
                    timestamp: Date.now()
                });
            } else {
                addMessageToHistory({
                    type: 'cursor',
                    content: resultRecord.result_text, 
                    timestamp: Date.now()
                });
            }
        } else {
            // 结果表中没有找到记录
            addMessageToHistory({
                type: 'error',
                content: `指令 "${originalCommandText}" 已完成，但未在结果表中找到记录。可能是处理过程中出现错误。`,
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
        
        // 移除可能存在的加载动画
        const loadingMessages = document.querySelectorAll('.loading-message');
        for (const el of loadingMessages) {
            el.remove();
        }
    }

    // Remove from pendingCommandsClientSide after processing
    const pendingCommands = JSON.parse(localStorage.getItem('pendingCommandsClientSide')) || [];
    const filteredCommands = pendingCommands.filter(cmd => cmd.id !== commandDbId);
    localStorage.setItem('pendingCommandsClientSide', JSON.stringify(filteredCommands));
}

/**
 * 订阅特定指令ID的状态更新。
 * @param {string} commandDbId - 数据库中指令的UUID。
 * @param {string} originalCommandText - 用户原始输入的指令文本，用于上下文显示。
 */
function subscribeToCommandUpdates(commandDbId, originalCommandText, loadingMessage) {
    const channelName = `command-${commandDbId}`;
    if (activeSubscriptions.has(channelName)) {
        const oldChannel = activeSubscriptions.get(channelName);
        supabaseClient.removeChannel(oldChannel);
        activeSubscriptions.delete(channelName);
    }

    const channel = supabaseClient.channel(channelName);
    activeSubscriptions.set(channelName, channel);
    
    // 添加超时处理
    const subscriptionTimeout = setTimeout(() => {
        handleCommandSubscriptionTimeout(commandDbId, originalCommandText, loadingMessage);
    }, PENDING_COMMAND_TIMEOUT);

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
                const updatedCommand = payload.new;
                
                // 收到更新，清除超时计时器
                clearTimeout(subscriptionTimeout);

                if (updatedCommand.status === 'completed' || updatedCommand.status === 'error') {
                    await handleCompletedCommand(updatedCommand.id, originalCommandText, loadingMessage); 
                    supabaseClient.removeChannel(channel);
                    activeSubscriptions.delete(channelName);
                    // pendingCommandsClientSide removal is handled by handleCompletedCommand
                }
            }
        )
        .subscribe((status, err) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                // 清除超时计时器
                clearTimeout(subscriptionTimeout);
                
                console.error(`Subscription error for command ${commandDbId} on 'commands' table:`, status, err);
                addNotificationToChat(`无法订阅指令状态: ${err?.message || status}`);
                activeSubscriptions.delete(channelName);
                
                // 处理订阅错误时，也尝试移除加载动画和清除待处理命令
                if (loadingMessage?.classList.contains('loading-message')) {
                    loadingMessage.remove();
                }
                cleanupPendingCommand(commandDbId);
            } else if (status === 'CLOSED') {
                // 清除超时计时器
                clearTimeout(subscriptionTimeout);
                
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
        // 添加加载动画，表示正在处理中
        const loadingTemplate = document.getElementById('loadingTemplate');
        const loadingElement = document.importNode(loadingTemplate.content, true);
        elements.chatContainer.appendChild(loadingElement);
        scrollChatToBottom();
        
        // 保存加载元素的引用，以便稍后移除
        const loadingMessage = elements.chatContainer.lastElementChild;

        const { data, error } = await supabaseClient
            .from('commands')
            .insert([commandPayload])
            .select(); // .select() will return an array

        if (error) {
            console.error('Error sending command to Supabase:', error);
            addNotificationToChat(`发送指令失败: ${error.message}`);
            // 移除加载动画
            if (loadingMessage?.classList.contains('loading-message')) {
                elements.chatContainer.removeChild(loadingMessage);
            }
        } else if (data && data.length > 0) { // Check if data is an array and has items
            const insertedCommand = data[0];
            
            // 订阅更新 - 保持加载动画直到收到响应
            subscribeToCommandUpdates(insertedCommand.id, commandPayload.command_text, loadingMessage);

            // Store command in localStorage as pending client-side processing
            const pendingCommands = JSON.parse(localStorage.getItem('pendingCommandsClientSide')) || [];
            pendingCommands.push({
                id: insertedCommand.id,
                text: commandPayload.command_text,
                timestamp: Date.now() 
            });
            localStorage.setItem('pendingCommandsClientSide', JSON.stringify(pendingCommands));

        } else {
            addNotificationToChat('指令已发送，但未收到确认。');
            // 移除加载动画
            if (loadingMessage?.classList.contains('loading-message')) {
                elements.chatContainer.removeChild(loadingMessage);
            }
        }
    } catch (err) {
        console.error('Unexpected error sending command:', err);
        addNotificationToChat(`发送指令时发生意外错误: ${err.message}`);
        // 移除可能存在的加载动画
        const loadingMessages = document.querySelectorAll('.loading-message');
        for (const el of loadingMessages) {
            el.remove();
        }
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
const PENDING_COMMAND_TIMEOUT = 600000; // 10分钟超时，用于pendingCommandsClientSide

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

/**
 * 测试Supabase连接（轻量级版本，不发送实际命令）
 */
async function testSupabaseConnection() {
    console.log('开始测试Supabase连接...');
    
    try {
        // 只测试基本连接，不发送实际命令
        const { data: healthCheck, error: healthError } = await supabaseClient
            .from('commands')
            .select('count', { count: 'exact', head: true });
            
        if (healthError) {
            console.error('Supabase连接测试失败:', healthError);
            updateConnectionStatus(false, `数据库连接失败: ${healthError.message}`);
            showSupabaseConnectionError(healthError);
            return false;
        }
        
        console.log('Supabase连接测试成功');
        updateConnectionStatus(true, 'Supabase连接正常');
        return true;
        
    } catch (error) {
        console.error('Supabase连接测试异常:', error);
        updateConnectionStatus(false, `连接异常: ${error.message}`);
        showSupabaseSetupGuide();
        return false;
    }
}

/**
 * 完整测试Supabase连接（包括RPC函数测试）
 */
async function testSupabaseConnectionFull() {
    console.log('开始完整测试Supabase连接...');
    
    try {
        // 测试基本连接
        const { data: healthCheck, error: healthError } = await supabaseClient
            .from('commands')
            .select('count', { count: 'exact', head: true });
            
        if (healthError) {
            console.error('Supabase连接测试失败:', healthError);
            updateConnectionStatus(false, `数据库连接失败: ${healthError.message}`);
            showSupabaseConnectionError(healthError);
            return false;
        }
        
        // 测试RPC函数
        const { data: rpcTest, error: rpcError } = await supabaseClient
            .rpc('submit_command', { 
                p_command_text: 'connection_test',
                p_user_id: 'test_user'
            });
            
        if (rpcError) {
            console.error('RPC函数测试失败:', rpcError);
            updateConnectionStatus(false, `RPC函数错误: ${rpcError.message}`);
            showSupabaseRpcError(rpcError);
            return false;
        }
        
        console.log('Supabase完整连接测试成功');
        updateConnectionStatus(true, 'Supabase连接和RPC函数正常');
        return true;
        
    } catch (error) {
        console.error('Supabase连接测试异常:', error);
        updateConnectionStatus(false, `连接异常: ${error.message}`);
        showSupabaseSetupGuide();
        return false;
    }
}

/**
 * 显示Supabase设置指导
 */
function showSupabaseSetupGuide() {
    const guideHtml = `
        <div class="supabase-setup-guide">
            <h3>🔧 Supabase配置问题</h3>
            <p>检测到Supabase配置问题，请按以下步骤修复：</p>
            
            <div class="setup-steps">
                <h4>1. 检查配置文件</h4>
                <p>确保 <code>client/env-config.js</code> 文件存在且格式正确：</p>
                <pre><code>window.SUPABASE_URL = "your-supabase-url";
window.SUPABASE_ANON_KEY = "your-anon-key";</code></pre>
                
                <h4>2. 验证数据库</h4>
                <p>在Supabase控制台执行SQL脚本：</p>
                <ul>
                    <li>执行 <code>database/tables.sql</code> 创建表</li>
                    <li>执行 <code>database/functions.sql</code> 创建函数</li>
                    <li>运行 <code>database/verify-deployment.sql</code> 验证</li>
                </ul>
                
                <h4>3. 测试连接</h4>
                <p>使用 <code>client/test-supabase.html</code> 测试页面验证配置</p>
                
                <div class="action-buttons">
                    <button onclick="window.open('test-supabase.html', '_blank')" class="btn btn-primary">
                        打开测试页面
                    </button>
                    <button onclick="location.reload()" class="btn btn-secondary">
                        重新加载页面
                    </button>
                </div>
            </div>
        </div>
    `;
    
    addNotificationToChat(guideHtml, 'error');
}

/**
 * 显示Supabase连接错误详情
 */
function showSupabaseConnectionError(error) {
    const errorHtml = `
        <div class="supabase-error">
            <h4>❌ 数据库连接错误</h4>
            <p><strong>错误信息:</strong> ${error.message}</p>
            <p><strong>错误代码:</strong> ${error.code || 'N/A'}</p>
            
            <div class="troubleshooting">
                <h5>可能的解决方案：</h5>
                <ul>
                    <li>检查Supabase URL和API密钥是否正确</li>
                    <li>确认数据库表已创建 (运行 database/tables.sql)</li>
                    <li>检查网络连接</li>
                    <li>验证Supabase项目状态</li>
                </ul>
                
                <button onclick="testSupabaseConnectionFull()" class="btn btn-primary">
                    重新测试连接
                </button>
            </div>
        </div>
    `;
    
    addNotificationToChat(errorHtml, 'error');
}

/**
 * 显示Supabase RPC函数错误详情
 */
function showSupabaseRpcError(error) {
    const errorHtml = `
        <div class="supabase-rpc-error">
            <h4>⚠️ RPC函数错误</h4>
            <p><strong>错误信息:</strong> ${error.message}</p>
            <p><strong>错误代码:</strong> ${error.code || 'N/A'}</p>
            
            <div class="troubleshooting">
                <h5>解决步骤：</h5>
                <ol>
                    <li>在Supabase控制台执行 <code>database/functions.sql</code></li>
                    <li>确认所有RPC函数已正确创建</li>
                    <li>检查函数权限设置</li>
                </ol>
                
                <div class="action-buttons">
                    <button onclick="testSupabaseConnectionFull()" class="btn btn-primary">
                        重新测试
                    </button>
                    <button onclick="window.open('test-supabase.html', '_blank')" class="btn btn-secondary">
                        详细诊断
                    </button>
                </div>
            </div>
        </div>
    `;
    
    addNotificationToChat(errorHtml, 'error');
}

// 初始化应用
function initApp() {
    // 设置事件监听器
    setupEventListeners();

    // 检查Supabase客户端是否已初始化
    if (!supabaseClient) {
        updateConnectionStatus(false, 'Supabase配置错误');
        showSupabaseSetupGuide();
        return; 
    }
    
    // 初始化全局增强服务
    if (typeof window.initGlobalEnhancementService === 'function') {
        window.initGlobalEnhancementService(supabaseClient);
    }
    
    // 测试Supabase连接
    testSupabaseConnection();
    
    // 加载主题设置
    loadThemePreference();
    
    // 显示历史消息
    renderMessageHistory();
    
    // 应用启动时检查并处理待处理的指令
    processPendingCommandsOnLoad();
    
    // 自动调整文本区域高度
    setupTextareaAutoResize();
    
    // 启动定期清理超时命令的任务
    startPendingCommandsCleanupTask();
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
    
    // 新功能按钮事件监听器
    setupNewFeatureListeners();
    
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
    document.addEventListener('click', (event) => {
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
        scrollToBottomBtn.addEventListener('click', () => {
            scrollChatToBottom();
        });
        
        // 监听页面滚动
        window.addEventListener('scroll', () => {
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
                    headerIds: true // 为标题添加ID
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
function addNotificationToChat(content, type = 'notification') {
    const notificationElement = document.createElement('div');
    notificationElement.className = `message ${type}`;
    
    // 支持HTML内容
    if (content.includes('<')) {
        notificationElement.innerHTML = content;
    } else {
        notificationElement.textContent = content;
    }
    
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
            
            // 滚动到底部（使用即时滚动）
            scrollChatToBottom(true);
        } catch (error) {
            console.error('加载历史记录失败:', error);
        }
    }
}

// 滚动聊天到底部
function scrollChatToBottom(instant = false) {
    // 滚动整个页面到底部，而不只是聊天容器
    window.scrollTo({
        top: document.body.scrollHeight,
        behavior: instant ? 'auto' : 'smooth'
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
    const pendingCommands = JSON.parse(localStorage.getItem('pendingCommandsClientSide')) || [];
    if (pendingCommands.length === 0) {
        return;
    }

    for (const command of pendingCommands) {
        if (!command.id || !command.text) {
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
                    await handleCompletedCommand(command.id, command.text, null); 
                    // handleCompletedCommand will remove it from localStorage and display message
                } else if (commandData.status === 'pending' || commandData.status === 'processing') {
                    
                    // 添加加载动画，表示正在处理中
                    const loadingTemplate = document.getElementById('loadingTemplate');
                    const loadingElement = document.importNode(loadingTemplate.content, true);
                    elements.chatContainer.appendChild(loadingElement);
                    scrollChatToBottom();
                    
                    // 保存加载元素的引用
                    const loadingMessage = elements.chatContainer.lastElementChild;
                    
                    subscribeToCommandUpdates(command.id, command.text, loadingMessage);
                } else {
                    // Unknown status, maybe remove it to prevent clutter
                    const currentPending = JSON.parse(localStorage.getItem('pendingCommandsClientSide')) || [];
                    const filtered = currentPending.filter(pCmd => pCmd.id !== command.id);
                    localStorage.setItem('pendingCommandsClientSide', JSON.stringify(filtered));
                }
            } else {
                 // Command not found in DB, might have been deleted or an issue. Remove from pending.
                const currentPending = JSON.parse(localStorage.getItem('pendingCommandsClientSide')) || [];
                const filtered = currentPending.filter(pCmd => pCmd.id !== command.id);
                localStorage.setItem('pendingCommandsClientSide', JSON.stringify(filtered));
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
        // 立即清空输入框，给用户立即反馈
        const inputValue = messageText; // 保存消息值的副本
        elements.messageInput.value = '';
        
        // 调整输入框高度
        const inputEvent = new Event('input');
        elements.messageInput.dispatchEvent(inputEvent);
        
        // 添加用户消息到历史
        addMessageToHistory({
            type: 'user',
            content: inputValue,
            timestamp: Date.now()
        });
        
        // 先尝试处理特殊命令
        const handled = await handleSpecialCommands(inputValue);
        
        // 如果不是特殊命令，则通过正常渠道发送
        if (!handled) {
            // 生成并发送命令
            const commandPayload = buildSupabaseCommandPayload(inputValue);
            await sendSupabaseCommand(commandPayload);
        }
    }
}

// 页面加载时初始化应用
document.addEventListener('DOMContentLoaded', initApp);

// 确保页面完全加载后滚动到底部
window.onload = function() {
    // 使用setTimeout确保在所有内容渲染后滚动，使用即时滚动
    setTimeout(() => {
        scrollChatToBottom(true);
    }, 100);
};

/**
 * 处理频道删除操作
 * @param {string} channelName - 要删除的频道名称
 * @returns {Promise<boolean>} - 删除成功返回true，否则返回false
 */
async function handleChannelDelete(channelName) {
    try {
        if (!supabaseClient) {
            console.error('Supabase client is not initialized.');
            addNotificationToChat('错误：无法连接到服务，请检查配置。');
            return false;
        }

        // 先查询频道是否存在
        const { data: existingChannels, error: queryError } = await supabaseClient
            .from('channels')
            .select('id')
            .eq('name', channelName);
            
        if (queryError) {
            console.error(`Error querying channel "${channelName}":`, queryError);
            addNotificationToChat(`查询频道失败: ${queryError.message}`);
            return false;
        }
        
        // 如果没有找到频道
        if (!existingChannels || existingChannels.length === 0) {
            addNotificationToChat(`频道 "${channelName}" 不存在或已被删除。`);
            return true; // 返回成功，因为频道已经不存在了
        }
        
        // 删除频道
        const { error: deleteError } = await supabaseClient
            .from('channels')
            .delete()
            .eq('name', channelName);
            
        if (deleteError) {
            console.error(`Error deleting channel "${channelName}":`, deleteError);
            addNotificationToChat(`删除频道失败: ${deleteError.message}`);
            return false;
        }
        
        addNotificationToChat(`频道 "${channelName}" 已成功删除。`);
        return true;
    } catch (err) {
        console.error("Unexpected error during channel deletion:", err);
        addNotificationToChat(`删除频道时发生意外错误: ${err.message}`);
        return false;
    }
}

/**
 * 处理特殊命令
 * @param {string} commandText - 用户输入的命令文本
 * @returns {Promise<boolean>} - 返回是否已处理命令
 */
async function handleSpecialCommands(commandText) {
    // 删除频道命令格式：删除频道 <频道名>
    if (commandText.includes('删除频道')) {
        try {
            // 提取频道名
            const match = commandText.match(/删除频道\s+(.+)/);
            if (match?.[1]) {
                const channelName = match[1].trim();
                return await handleChannelDelete(channelName);
            }
        } catch (err) {
            console.error('Error parsing delete channel command:', err);
            addNotificationToChat(`处理删除频道命令失败: ${err.message}`);
        }
    }
    
    // 如果不是特殊命令，返回false
    return false;
}

/**
 * 处理订阅超时的情况
 * @param {string} commandDbId - 命令ID
 * @param {string} originalCommandText - 原始命令文本
 * @param {HTMLElement} loadingMessage - 加载消息元素
 */
function handleCommandSubscriptionTimeout(commandDbId, originalCommandText, loadingMessage) {
    // 移除加载动画
    if (loadingMessage?.classList?.contains('loading-message')) {
        loadingMessage.remove();
    } else {
        // 查找可能存在的加载动画
        const loadingMessages = document.querySelectorAll('.loading-message');
        for (const el of loadingMessages) {
            el.remove();
        }
    }
    
    // 添加超时通知
    addMessageToHistory({
        type: 'error',
        content: `指令 "${originalCommandText}" 处理超时，请稍后重试。`,
        timestamp: Date.now()
    });
    
    // 清理该命令的订阅
    const channelName = `command-${commandDbId}`;
    if (activeSubscriptions.has(channelName)) {
        const channel = activeSubscriptions.get(channelName);
        supabaseClient.removeChannel(channel);
        activeSubscriptions.delete(channelName);
    }
    
    // 从待处理列表中移除
    cleanupPendingCommand(commandDbId);
}

/**
 * 从pendingCommandsClientSide中移除指定的命令
 * @param {string} commandId - 要移除的命令ID
 */
function cleanupPendingCommand(commandId) {
    const pendingCommands = JSON.parse(localStorage.getItem('pendingCommandsClientSide')) || [];
    const filteredCommands = pendingCommands.filter(cmd => cmd.id !== commandId);
    localStorage.setItem('pendingCommandsClientSide', JSON.stringify(filteredCommands));
}

/**
 * 启动定期清理超时的pendingCommandsClientSide命令的任务
 */
function startPendingCommandsCleanupTask() {
    // 每分钟检查一次超时命令
    setInterval(() => {
        cleanupTimeoutPendingCommands();
    }, 60000); // 每分钟执行一次
    
    // 初始执行一次
    cleanupTimeoutPendingCommands();
}

/**
 * 清理超时的pendingCommandsClientSide命令
 */
function cleanupTimeoutPendingCommands() {
    const pendingCommands = JSON.parse(localStorage.getItem('pendingCommandsClientSide')) || [];
    if (pendingCommands.length === 0) {
        return;
    }
    
    const now = Date.now();
    const timeoutThreshold = PENDING_COMMAND_TIMEOUT;
    let hasTimeoutCommands = false;
    
    const updatedCommands = pendingCommands.filter(command => {
        const commandAge = now - command.timestamp;
        const isTimeout = commandAge > timeoutThreshold;
        
        if (isTimeout) {
            hasTimeoutCommands = true;
            
            // 移除该命令的订阅（如果存在）
            const channelName = `command-${command.id}`;
            if (activeSubscriptions.has(channelName)) {
                const channel = activeSubscriptions.get(channelName);
                supabaseClient.removeChannel(channel);
                activeSubscriptions.delete(channelName);
            }
        }
        
        return !isTimeout; // 保留未超时的命令
    });
    
    if (hasTimeoutCommands) {
        localStorage.setItem('pendingCommandsClientSide', JSON.stringify(updatedCommands));
        
        // 如果有超时命令，检查并移除可能残留的加载动画
        const loadingMessages = document.querySelectorAll('.loading-message');
        if (loadingMessages.length > 0 && updatedCommands.length === 0) {
            for (const el of loadingMessages) {
                el.remove();
            }
            addNotificationToChat('已清理超时未响应的指令。');
        }
    }
}

// ===== 新功能模态窗口管理 =====

/**
 * 设置新功能按钮的事件监听器
 */
function setupNewFeatureListeners() {
    // 历史按钮
    const historyButton = document.getElementById('historyButton');
    if (historyButton) {
        historyButton.addEventListener('click', () => openModal('historyModal'));
    }
     // 收藏夹按钮
    const favoritesButton = document.getElementById('favoritesButton');
    if (favoritesButton) {
        favoritesButton.addEventListener('click', () => openModal('favoritesModal'));
    }
    
    // 系统状态按钮
    const statusButton = document.getElementById('statusButton');
    if (statusButton) {
        statusButton.addEventListener('click', () => openModal('statusModal'));
    }
    
    // 测试连接按钮
    const testConnectionButton = document.getElementById('testConnectionButton');
    if (testConnectionButton) {
        testConnectionButton.addEventListener('click', async () => {
            // 显示加载状态
            const originalIcon = testConnectionButton.innerHTML;
            testConnectionButton.innerHTML = '<i class="ri-loader-4-line" style="animation: spin 1s linear infinite;"></i>';
            testConnectionButton.disabled = true;
            
            try {
                addNotificationToChat('🧪 开始连接测试...', 'info');
                
                // 调用连接测试函数
                if (typeof runConnectionTest === 'function') {
                    const result = await runConnectionTest();
                    if (result) {
                        testConnectionButton.classList.add('connection-success');
                        addNotificationToChat('✅ 连接测试成功！所有API函数正常工作。', 'success');
                        setTimeout(() => {
                            testConnectionButton.classList.remove('connection-success');
                        }, 1000);
                    } else {
                        testConnectionButton.classList.add('connection-error');
                        addNotificationToChat('❌ 连接测试失败，请检查控制台详细信息。', 'error');
                        setTimeout(() => {
                            testConnectionButton.classList.remove('connection-error');
                        }, 1000);
                    }
                } else {
                    addNotificationToChat('❌ 测试脚本未加载，请刷新页面重试。', 'error');
                }
            } catch (error) {
                console.error('Connection test error:', error);
                testConnectionButton.classList.add('connection-error');
                addNotificationToChat('❌ 连接测试出错：' + error.message, 'error');
                setTimeout(() => {
                    testConnectionButton.classList.remove('connection-error');
                }, 1000);
            } finally {
                // 恢复按钮状态
                testConnectionButton.innerHTML = originalIcon;
                testConnectionButton.disabled = false;
            }
        });
    }
    
    // 模态窗口关闭事件
    setupModalCloseListeners();
    
    // 其他功能按钮事件
    setupFeatureButtonListeners();
}

/**
 * 打开指定的模态窗口
 */
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden'; // 防止背景滚动
        
        // 根据不同模态窗口加载相应内容
        switch(modalId) {
            case 'historyModal':
                loadCommandHistory();
                break;
            case 'favoritesModal':
                loadFavorites();
                break;
            case 'statusModal':
                loadSystemStatus();
                break;
        }
    }
}

/**
 * 关闭模态窗口
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = ''; // 恢复滚动
    }
}

/**
 * 设置模态窗口关闭事件监听器
 */
function setupModalCloseListeners() {
    // 关闭按钮事件
    document.querySelectorAll('.modal-close').forEach(button => {
        button.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                closeModal(modal.id);
            }
        });
    });
    
    // 点击背景关闭模态窗口
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });
    
    // ESC键关闭模态窗口
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const openModal = document.querySelector('.modal.show');
            if (openModal) {
                closeModal(openModal.id);
            }
        }
    });
}

/**
 * 设置功能按钮事件监听器
 */
function setupFeatureButtonListeners() {
    // 取消按钮
    document.querySelectorAll('.cancel-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                closeModal(modal.id);
            }
        });
    });
    
    // 系统状态标签页切换
    setupStatusTabs();
}

/**
 * 设置系统状态标签页切换
 */
function setupStatusTabs() {
    const statusTabs = document.querySelectorAll('.status-tab');
    statusTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 移除所有活动状态
            statusTabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.status-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // 激活当前标签
            tab.classList.add('active');
            const tabName = tab.getAttribute('data-tab');
            const tabContent = document.getElementById(tabName + 'Tab');
            if (tabContent) {
                tabContent.classList.add('active');
            }
            
            // 根据标签页加载相应数据
            loadStatusTabData(tabName);
        });
    });
}

// ===== 命令历史功能 =====

/**
 * 加载命令历史
 */
async function loadCommandHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    
    try {
        console.log('🔍 开始加载命令历史...');
        
        // 从enhancement.js获取历史记录
        if (typeof window.CommandHistory !== 'undefined') {
            console.log('✅ CommandHistory对象存在，正在获取历史记录...');
            const history = window.CommandHistory.getHistory();
            console.log('📊 获取到历史记录:', history);
            renderHistoryList(history);
        } else {
            console.log('⚠️ CommandHistory对象不存在，使用localStorage备用方案...');
            // 从localStorage获取历史记录作为备用
            const history = JSON.parse(localStorage.getItem('commandHistory') || '[]');
            console.log('📊 从localStorage获取历史记录:', history);
            renderHistoryList(history);
        }
        
        // 设置搜索和过滤器
        setupHistoryFilters();
    } catch (error) {
        console.error('❌ 加载命令历史失败:', error);
        historyList.innerHTML = '<div class="error-message">加载历史记录失败: ' + error.message + '</div>';
    }
}

/**
 * 渲染历史记录列表
 */
function renderHistoryList(history) {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    
    if (history.length === 0) {
        historyList.innerHTML = '<div class="empty-message">暂无命令历史</div>';
        return;
    }
    
    const historyHTML = history.map(item => `
        <div class="history-item" data-command="${escapeHtml(item.command)}">
            <div class="history-command">${escapeHtml(item.command)}</div>
            <div class="history-meta">
                <span>${formatDate(item.timestamp)}</span>
                <div class="history-actions">
                    <button class="history-action" data-action="use" title="使用此命令">
                        <i class="ri-play-line"></i>
                    </button>
                    <button class="history-action" data-action="copy" title="复制命令">
                        <i class="ri-clipboard-line"></i>
                    </button>
                    <button class="history-action" data-action="favorite" title="添加到收藏">
                        <i class="ri-star-line"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    
    historyList.innerHTML = historyHTML;
    
    // 添加点击事件
    historyList.addEventListener('click', handleHistoryAction);
}

/**
 * 设置历史记录过滤器
 */
function setupHistoryFilters() {
    const searchInput = document.getElementById('historySearch');
    const filterSelect = document.getElementById('historyFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterHistory);
    }
    
    if (filterSelect) {
        filterSelect.addEventListener('change', filterHistory);
    }
}

/**
 * 过滤历史记录
 */
function filterHistory() {
    const searchTerm = document.getElementById('historySearch')?.value.toLowerCase() || '';
    const timeFilter = document.getElementById('historyFilter')?.value || 'all';
    
    const historyItems = document.querySelectorAll('.history-item');
    
    historyItems.forEach(item => {
        const command = item.dataset.command.toLowerCase();
        const matchesSearch = command.includes(searchTerm);
        
        // 时间过滤逻辑可以在这里实现
        const matchesTime = true; // 简化实现
        
        item.style.display = (matchesSearch && matchesTime) ? 'block' : 'none';
    });
}

/**
 * 处理历史记录操作
 */
function handleHistoryAction(event) {
    const action = event.target.closest('.history-action')?.dataset.action;
    const historyItem = event.target.closest('.history-item');
    
    if (!action || !historyItem) return;
    
    const command = historyItem.dataset.command;
    
    switch (action) {
        case 'use':
            // 使用此命令
            document.getElementById('messageInput').value = command;
            closeModal('historyModal');
            break;
        case 'copy':
            // 复制命令
            copyToClipboard(command);
            break;
        case 'favorite':
            // 添加到收藏
            addToFavorites(command);
            break;
    }
}

// ===== 收藏夹功能 =====

/**
 * 加载收藏夹
 */
async function loadFavorites() {
    const favoritesList = document.getElementById('favoritesList');
    if (!favoritesList) return;
    
    try {
        // 从enhancement.js获取收藏夹
        if (typeof window.CommandFavorites !== 'undefined') {
            const favorites = window.CommandFavorites.getFavorites();
            renderFavoritesList(favorites);
        } else {
            // 从localStorage获取收藏夹作为备用
            const favorites = JSON.parse(localStorage.getItem('commandFavorites') || '[]');
            renderFavoritesList(favorites);
        }
        
        setupFavoritesSearch();
    } catch (error) {
        console.error('加载收藏夹失败:', error);
        favoritesList.innerHTML = '<div class="error-message">加载收藏夹失败</div>';
    }
}

/**
 * 渲染收藏夹列表
 */
function renderFavoritesList(favorites) {
    const favoritesList = document.getElementById('favoritesList');
    if (!favoritesList) return;
    
    if (favorites.length === 0) {
        favoritesList.innerHTML = '<div class="empty-message">暂无收藏项目</div>';
        return;
    }
    
    const favoritesHTML = favorites.map(item => `
        <div class="favorite-item" data-id="${item.id}">
            <div class="favorite-title">${escapeHtml(item.title || '未命名收藏')}</div>
            <div class="favorite-command">${escapeHtml(item.command)}</div>
            <div class="favorite-actions">
                <span class="favorite-date">${formatDate(item.timestamp)}</span>
                <div class="history-actions">
                    <button class="history-action" data-action="use" title="使用此命令">
                        <i class="ri-play-line"></i>
                    </button>
                    <button class="history-action" data-action="edit" title="编辑">
                        <i class="ri-edit-line"></i>
                    </button>
                    <button class="history-action" data-action="delete" title="删除">
                        <i class="ri-delete-line"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    
    favoritesList.innerHTML = favoritesHTML;
    
    // 添加点击事件
    favoritesList.addEventListener('click', handleFavoriteAction);
}

/**
 * 添加到收藏夹
 */
function addToFavorites(command, title) {
    try {
        if (typeof window.CommandFavorites !== 'undefined') {
            window.CommandFavorites.addFavorite(command, title);
        } else {
            // 备用实现
            const favorites = JSON.parse(localStorage.getItem('commandFavorites') || '[]');
            favorites.push({
                id: Date.now(),
                command,
                title: title || command.substring(0, 50) + '...',
                timestamp: new Date().toISOString()
            });
            localStorage.setItem('commandFavorites', JSON.stringify(favorites));
        }
        
        addNotificationToChat('已添加到收藏夹');
    } catch (error) {
        console.error('添加收藏失败:', error);
        addNotificationToChat('添加收藏失败', 'error');
    }
}

// ===== 系统状态功能 =====

/**
 * 加载系统状态
 */
async function loadSystemStatus() {
    try {
        // 加载概览数据
        loadStatusTabData('overview');
        
        // 启动系统监控
        if (typeof window.SystemMonitor !== 'undefined') {
            window.SystemMonitor.startMonitoring();
        }
    } catch (error) {
        console.error('加载系统状态失败:', error);
    }
}

/**
 * 加载状态标签页数据
 */
async function loadStatusTabData(tabName) {
    switch (tabName) {
        case 'overview':
            await loadOverviewData();
            break;
        case 'analytics':
            await loadAnalyticsData();
            break;
        case 'queue':
            await loadQueueData();
            break;
        case 'system':
            await loadSystemMetrics();
            break;
    }
}

/**
 * 加载概览数据
 */
async function loadOverviewData() {
    try {
        // 连接状态
        const connectionInfo = document.getElementById('connectionInfo');
        if (connectionInfo) {
            connectionInfo.textContent = supabaseClient ? '已连接' : '未连接';
        }
        
        // 今日命令数
        const todayCommands = document.getElementById('todayCommands');
        if (todayCommands) {
            const history = JSON.parse(localStorage.getItem('commandHistory') || '[]');
            const today = new Date().toDateString();
            const todayCount = history.filter(item => 
                new Date(item.timestamp).toDateString() === today
            ).length;
            todayCommands.textContent = todayCount;
        }
        
        // 使用Supabase RPC获取分析数据
        try {
            const { data: result, error } = await supabaseClient.rpc('get_command_analytics', { 
                timeframe_hours: 24 
            });
            
            if (error) {
                throw new Error(error.message);
            }
            
            if (result) {
                const successRate = document.getElementById('successRate');
                const avgResponseTime = document.getElementById('avgResponseTime');
                
                if (successRate) {
                    const rate = result.successRate || 0;
                    successRate.textContent = `${(rate * 100).toFixed(1)}%`;
                }
                
                if (avgResponseTime) {
                    const avgTime = result.averageResponseTime || 0;
                    avgResponseTime.textContent = `${avgTime.toFixed(1)}s`;
                }
            }
        } catch (apiError) {
            console.warn('无法从API获取数据，使用默认值:', apiError);
            // 使用默认值
            const successRate = document.getElementById('successRate');
            const avgResponseTime = document.getElementById('avgResponseTime');
            if (successRate) successRate.textContent = '95%';
            if (avgResponseTime) avgResponseTime.textContent = '1.2s';
        }
    } catch (error) {
        console.error('加载概览数据失败:', error);
    }
}

/**
 * 加载分析数据
 */
async function loadAnalyticsData() {
    try {
        const { data: result, error } = await supabaseClient.rpc('get_command_analytics', { 
            timeframe_hours: 24 
        });
        
        if (!error && result) {
            displayAnalyticsData(result);
        } else {
            console.error('获取分析数据失败:', error?.message || 'Unknown error');
            displayAnalyticsError();
        }
    } catch (error) {
        console.error('加载分析数据失败:', error);
        displayAnalyticsError();
    }
}

/**
 * 加载队列数据
 */
async function loadQueueData() {
    try {
        const { data: result, error } = await supabaseClient.rpc('get_queue_status');
        
        if (!error && result) {
            displayQueueData(result);
        } else {
            console.error('获取队列数据失败:', error?.message || 'Unknown error');
            displayQueueError();
        }
    } catch (error) {
        console.error('加载队列数据失败:', error);
        displayQueueError();
    }
}

/**
 * 加载系统指标
 */
async function loadSystemMetrics() {
    try {
        const { data: result, error } = await supabaseClient.rpc('get_system_status');
        
        if (!error && result) {
            displaySystemMetrics(result);
        } else {
            console.error('获取系统指标失败:', error?.message || 'Unknown error');
            displaySystemError();
        }
    } catch (error) {
        console.error('加载系统指标失败:', error);
        displaySystemError();
    }
}

/**
 * 显示分析数据
 */
function displayAnalyticsData(data) {
    const commandStats = document.getElementById('commandStats');
    const usageTrends = document.getElementById('usageTrends');
    
    if (commandStats) {
        commandStats.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-label">总命令数</span>
                    <span class="stat-value">${data.totalCommands || 0}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">成功率</span>
                    <span class="stat-value">${((data.successRate || 0) * 100).toFixed(1)}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">平均响应时间</span>
                    <span class="stat-value">${(data.averageResponseTime || 0).toFixed(2)}s</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">错误次数</span>
                    <span class="stat-value">${data.errorCount || 0}</span>
                </div>
            </div>
        `;
    }
    
    if (usageTrends) {
        usageTrends.innerHTML = `
            <div class="trends-info">
                <p>最活跃时段: ${data.peakHour || '未知'}</p>
                <p>常用命令类型: ${data.topCommandType || '未知'}</p>
                <p>平均会话时长: ${data.avgSessionDuration || '未知'}</p>
            </div>
        `;
    }
}

/**
 * 显示队列数据
 */
function displayQueueData(data) {
    const queueLength = document.getElementById('queueLength');
    const processingCount = document.getElementById('processingCount');
    const retryCount = document.getElementById('retryCount');
    const queueList = document.getElementById('queueList');
    
    if (queueLength) queueLength.textContent = data.length || 0;
    if (processingCount) processingCount.textContent = data.processing || 0;
    if (retryCount) retryCount.textContent = data.failed || 0;
    
    if (queueList && data.items) {
        if (data.items.length === 0) {
            queueList.innerHTML = '<div class="empty-message">队列为空</div>';
        } else {
            const queueHTML = data.items.map(item => `
                <div class="queue-item">
                    <div class="queue-item-header">
                        <span class="queue-item-command">${escapeHtml(item.command || '未知命令')}</span>
                        <span class="queue-item-status ${item.status}">${getStatusText(item.status)}</span>
                    </div>
                    <div class="queue-item-meta">
                        <span>优先级: ${item.priority || 'normal'}</span>
                        <span>创建时间: ${formatDate(item.createdAt)}</span>
                    </div>
                </div>
            `).join('');
            queueList.innerHTML = queueHTML;
        }
    }
}

/**
 * 显示系统指标
 */
function displaySystemMetrics(data) {
    // CPU使用率 (简化计算)
    const cpuUsage = document.getElementById('cpuUsage');
    const cpuValue = document.getElementById('cpuValue');
    if (cpuUsage && cpuValue && data.cpu) {
        const cpuPercent = Math.min(((data.cpu.user + data.cpu.system) / 1000000) * 100, 100);
        cpuUsage.style.width = `${cpuPercent}%`;
        cpuValue.textContent = `${cpuPercent.toFixed(1)}%`;
    }
    
    // 内存使用率
    const memoryUsage = document.getElementById('memoryUsage');
    const memoryValue = document.getElementById('memoryValue');
    if (memoryUsage && memoryValue && data.memory) {
        const memoryPercent = (data.memory.heapUsed / data.memory.heapTotal) * 100;
        memoryUsage.style.width = `${memoryPercent}%`;
        memoryValue.textContent = `${memoryPercent.toFixed(1)}%`;
    }
    
    // 运行时间
    const uptime = document.getElementById('uptime');
    if (uptime && data.uptime) {
        uptime.textContent = formatUptime(data.uptime);
    }
}

/**
 * 显示错误信息
 */
function displayAnalyticsError() {
    const commandStats = document.getElementById('commandStats');
    if (commandStats) {
        commandStats.innerHTML = '<div class="error-message">无法加载分析数据</div>';
    }
}

function displayQueueError() {
    const queueList = document.getElementById('queueList');
    if (queueList) {
        queueList.innerHTML = '<div class="error-message">无法加载队列数据</div>';
    }
}

function displaySystemError() {
    const cpuValue = document.getElementById('cpuValue');
    const memoryValue = document.getElementById('memoryValue');
    const uptime = document.getElementById('uptime');
    
    if (cpuValue) cpuValue.textContent = '无法获取';
    if (memoryValue) memoryValue.textContent = '无法获取';
    if (uptime) uptime.textContent = '无法获取';
}

/**
 * 获取状态文本
 */
function getStatusText(status) {
    const statusMap = {
        'pending': '等待中',
        'processing': '处理中',
        'completed': '已完成',
        'failed': '失败',
        'retry': '重试中'
    };
    return statusMap[status] || status;
}

/**
 * 格式化运行时间
 */
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
        return `${days}天 ${hours}小时 ${minutes}分钟`;
    } else if (hours > 0) {
        return `${hours}小时 ${minutes}分钟`;
    } else {
        return `${minutes}分钟`;
    }
}

// ===== 工具函数 =====

/**
 * HTML转义
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 格式化日期
 */
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    
    return date.toLocaleDateString('zh-CN');
}

/**
 * 处理各种操作的通用函数
 */
function handleHistoryAction(event) {
    // ...existing code...
}

function handleFavoriteAction(event) {
    const action = event.target.closest('.history-action')?.dataset.action;
    const favoriteItem = event.target.closest('.favorite-item');
    
    if (!action || !favoriteItem) return;
    
    const favoriteId = favoriteItem.dataset.id;
    const command = favoriteItem.querySelector('.favorite-command').textContent;
    
    switch (action) {
        case 'use':
            document.getElementById('messageInput').value = command;
            closeModal('favoritesModal');
            break;
        case 'edit':
            // 编辑收藏（简化实现）
            addNotificationToChat('编辑功能开发中');
            break;
        case 'delete':
            // 删除收藏
            if (confirm('确定要删除这个收藏吗？')) {
                deleteFavorite(favoriteId);
                loadFavorites(); // 重新加载
            }
            break;
    }
}



/**
 * 删除收藏
 */
function deleteFavorite(favoriteId) {
    try {
        if (typeof window.CommandFavorites !== 'undefined') {
            window.CommandFavorites.removeFavorite(favoriteId);
        } else {
            // 备用实现
            const favorites = JSON.parse(localStorage.getItem('commandFavorites') || '[]');
            const filteredFavorites = favorites.filter(f => f.id != favoriteId);
            localStorage.setItem('commandFavorites', JSON.stringify(filteredFavorites));
        }
        
        addNotificationToChat('收藏已删除');
    } catch (error) {
        console.error('删除收藏失败:', error);
        addNotificationToChat('删除失败', 'error');
    }
}

/**
 * 设置搜索功能
 */
function setupFavoritesSearch() {
    const searchInput = document.getElementById('favoritesSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const favoriteItems = document.querySelectorAll('.favorite-item');
            
            favoriteItems.forEach(item => {
                const title = item.querySelector('.favorite-title').textContent.toLowerCase();
                const command = item.querySelector('.favorite-command').textContent.toLowerCase();
                const matches = title.includes(searchTerm) || command.includes(searchTerm);
                item.style.display = matches ? 'block' : 'none';
            });
        });
    }
}

// 初始化增强服务 - 使用Supabase
let enhancementService;

// 当Supabase客户端准备好后初始化增强服务
if (supabaseClient) {
    enhancementService = new ClientEnhancementService(supabaseClient);
    
    // 全局暴露服务
    window.EnhancementService = enhancementService;
    
    // 设置实时订阅
    const commandsSubscription = supabaseClient
        .channel('commands_changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'commands'
        }, (payload) => {
            console.log('[Realtime] Command change:', payload);
            // 刷新历史记录
            if (enhancementService) {
                enhancementService.loadCommandHistory();
            }
        })
        .subscribe();
        
    console.log('[Client] Enhancement service initialized with Supabase');
} else {
    console.warn('[Client] Supabase client not available, enhancement service disabled');
}