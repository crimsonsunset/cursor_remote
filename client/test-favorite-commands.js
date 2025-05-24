// 快速测试 get_favorite_commands 函数
import { createClient } from 'https://cdn.skypack.dev/@supabase/supabase-js@2';

// Supabase 配置
const supabaseUrl = 'https://rzsupavqzxhyrgcexrpx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6c3VwYXZxenhoeXJnY2V4cnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTU5Mzg2MTMsImV4cCI6MjAzMTUxNDYxM30.DjYaXzJ_FxnsBB5oaBFEqJBQzKnKHMvSdqEMOwKa8gs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFavoriteCommands() {
    console.log('🧪 测试 get_favorite_commands 函数...');
    
    try {
        // 测试无参数调用
        console.log('1. 测试无参数调用:');
        const { data: allFavorites, error: error1 } = await supabase.rpc('get_favorite_commands');
        if (error1) {
            console.error('❌ 错误:', error1);
        } else {
            console.log('✅ 成功:', allFavorites);
        }
        
        // 测试带参数调用
        console.log('\n2. 测试带category_filter参数:');
        const { data: devFavorites, error: error2 } = await supabase.rpc('get_favorite_commands', {
            category_filter: 'development'
        });
        if (error2) {
            console.error('❌ 错误:', error2);
        } else {
            console.log('✅ 成功 (development):', devFavorites);
        }
        
        // 测试不存在的分类
        console.log('\n3. 测试不存在的分类:');
        const { data: nonExistentFavorites, error: error3 } = await supabase.rpc('get_favorite_commands', {
            category_filter: 'nonexistent'
        });
        if (error3) {
            console.error('❌ 错误:', error3);
        } else {
            console.log('✅ 成功 (nonexistent):', nonExistentFavorites);
        }
        
    } catch (error) {
        console.error('💥 测试失败:', error);
    }
}

// 在窗口加载后运行测试
window.addEventListener('DOMContentLoaded', () => {
    testFavoriteCommands();
});

// 也可以手动调用
window.testFavoriteCommands = testFavoriteCommands;
