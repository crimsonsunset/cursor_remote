#!/bin/bash

# Cursor远程控制 - 最终状态检查脚本
# 验证所有组件是否正确配置

echo "🔍 Cursor远程控制 - 最终状态检查"
echo "=================================="

# 检查客户端文件
echo ""
echo "📁 检查客户端文件:"
client_files=(
    "client/index.html"
    "client/app.js"
    "client/styles.css"
    "client/env-config.js"
    "client/connection-test.js"
    "client/enhancement.js"
    "client/systemMonitor.js"
)

for file in "${client_files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file (缺失)"
    fi
done

# 检查数据库文件
echo ""
echo "🗄️  检查数据库文件:"
db_files=(
    "database/tables.sql"
    "database/functions.sql"
    "database/verify-deployment.sql"
    "database/quick-check.sql"
)

for file in "${db_files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file (缺失)"
    fi
done

# 检查文档文件
echo ""
echo "📚 检查文档文件:"
doc_files=(
    "README.md"
    "SETUP_DATABASE.md"
    "DEPLOYMENT_STATUS.md"
)

for file in "${doc_files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file (缺失)"
    fi
done

# 检查环境配置
echo ""
echo "⚙️  检查环境配置:"
if [ -f "client/env-config.js" ]; then
    if grep -q "SUPABASE_URL" client/env-config.js && grep -q "SUPABASE_ANON_KEY" client/env-config.js; then
        echo "  ✅ Supabase配置存在"
    else
        echo "  ❌ Supabase配置不完整"
    fi
else
    echo "  ❌ env-config.js 不存在"
fi

# 检查开发服务器是否运行
echo ""
echo "🌐 检查开发服务器:"
if curl -s http://localhost:8080 > /dev/null 2>&1; then
    echo "  ✅ 客户端服务器 (端口 8080) 正在运行"
else
    echo "  ❌ 客户端服务器 (端口 8080) 未运行"
    echo "     运行: cd client && python3 -m http.server 8080"
fi

echo ""
echo "📋 下一步操作:"
echo "1. 确保Supabase数据库已部署 (执行 database/tables.sql 和 database/functions.sql)"
echo "2. 在浏览器中访问 http://localhost:8080"
echo "3. 点击WiFi图标测试连接"
echo "4. 如有问题，查看浏览器控制台"

echo ""
echo "🎯 测试建议:"
echo "1. 打开浏览器开发者工具"
echo "2. 访问 http://localhost:8080"
echo "3. 点击右上角的WiFi图标进行连接测试"
echo "4. 查看控制台输出和聊天界面的反馈"
echo ""
echo "如果一切正常，404错误应该已经解决！ 🎉"
