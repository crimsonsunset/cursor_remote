// 客户端连接测试脚本
// 在浏览器开发者工具控制台中运行此脚本

async function runConnectionTest() {
    console.log('🧪 开始Supabase连接测试...');
    
    try {
        // 检查环境配置
        if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
            throw new Error('环境配置未找到，请检查env-config.js是否正确加载');
        }
        
        console.log('✅ 环境配置检查通过');
        console.log('URL:', window.SUPABASE_URL);
        
        // 检查Supabase库是否加载
        if (typeof supabase === 'undefined') {
            throw new Error('Supabase库未加载，请检查CDN引用');
        }
        
        console.log('✅ Supabase库检查通过');
        
        // 初始化客户端
        const { createClient } = supabase;
        const client = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        
        console.log('✅ Supabase客户端初始化成功');
        
        // 测试RPC函数调用
        console.log('🔍 测试RPC函数调用...');
        
        // 1. 测试get_system_status
        console.log('🔍 测试 get_system_status...');
        const { data: systemStatus, error: systemError } = await client.rpc('get_system_status');
        if (systemError) {
            console.error('❌ get_system_status错误:', systemError);
            throw new Error(`get_system_status failed: ${systemError.message}`);
        } else {
            console.log('✅ get_system_status成功:', systemStatus);
        }
        
        // 2. 测试get_queue_status
        console.log('🔍 测试 get_queue_status...');
        const { data: queueStatus, error: queueError } = await client.rpc('get_queue_status');
        if (queueError) {
            console.error('❌ get_queue_status错误:', queueError);
            throw new Error(`get_queue_status failed: ${queueError.message}`);
        } else {
            console.log('✅ get_queue_status成功:', queueStatus);
        }
        
        // 3. 测试get_command_analytics
        console.log('🔍 测试 get_command_analytics...');
        const { data: analytics, error: analyticsError } = await client.rpc('get_command_analytics', { timeframe_hours: 24 });
        if (analyticsError) {
            console.error('❌ get_command_analytics错误:', analyticsError);
            throw new Error(`get_command_analytics failed: ${analyticsError.message}`);
        } else {
            console.log('✅ get_command_analytics成功:', analytics);
        }
        
        // 4. 测试get_favorite_commands
        console.log('🔍 测试 get_favorite_commands...');
        const { data: favorites, error: favoritesError } = await client.rpc('get_favorite_commands');
        if (favoritesError) {
            console.error('❌ get_favorite_commands错误:', favoritesError);
            throw new Error(`get_favorite_commands failed: ${favoritesError.message}`);
        } else {
            console.log('✅ get_favorite_commands成功:', favorites);
        }
        
        // 6. 测试get_command_history
        console.log('🔍 测试 get_command_history...');
        const { data: history, error: historyError } = await client.rpc('get_command_history', { 
            limit_count: 5, 
            search_text: null 
        });
        if (historyError) {
            console.error('❌ get_command_history错误:', historyError);
            throw new Error(`get_command_history failed: ${historyError.message}`);
        } else {
            console.log('✅ get_command_history成功:', history);
        }
        
        // 7. 测试submit_command
        console.log('🔍 测试 submit_command...');
        const testCommand = 'echo "Connection test successful at ' + new Date().toISOString() + '"';
        const { data: submitResult, error: submitError } = await client.rpc('submit_command', {
            p_command_text: testCommand,
            p_user_id: 'connection_test_user'
        });
        if (submitError) {
            console.error('❌ submit_command错误:', submitError);
            throw new Error(`submit_command failed: ${submitError.message}`);
        } else {
            console.log('✅ submit_command成功:', submitResult);
        }
        
        console.log('🎉 所有测试完成！如果看到这条消息且没有错误，说明连接正常');
        return true;
        
    } catch (error) {
        console.error('❌ 连接测试失败:', error.message);
        console.error('请检查以下项目:');
        console.error('1. Supabase URL和API密钥是否正确');
        console.error('2. 数据库函数是否已部署');
        console.error('3. 网络连接是否正常');
        return false;
    }
}

// 自动运行测试功能已禁用 - 只能手动调用测试
// 如需自动测试，请取消注释以下代码：
/*
if (typeof window !== 'undefined') {
    // 等待页面加载完成后运行测试
    if (document.readyState === 'complete') {
        setTimeout(runConnectionTest, 1000);
    } else {
        window.addEventListener('load', () => {
            setTimeout(runConnectionTest, 1000);
        });
    }
}
*/

// 也可以手动调用
console.log('💡 提示: 可以手动运行 runConnectionTest() 来测试连接');
