#!/bin/bash

# 修复 command_metrics 表结构的脚本
# 这个脚本会应用数据库迁移来修复缺失的列

echo "🔧 正在修复 command_metrics 表结构..."

# 检查是否有 psql 客户端
if ! command -v psql &> /dev/null; then
    echo "❌ psql 客户端未找到。"
    echo "请在 Supabase Dashboard 的 SQL Editor 中手动执行以下文件："
    echo "   database/fix-command-metrics.sql"
    echo ""
    echo "或者安装 PostgreSQL 客户端工具："
    echo "   brew install postgresql"
    exit 1
fi

# 检查环境变量
if [ -z "$SUPABASE_DB_URL" ]; then
    echo "❌ SUPABASE_DB_URL 环境变量未设置"
    echo ""
    echo "请设置数据库连接字符串："
    echo "   export SUPABASE_DB_URL='postgresql://postgres:[password]@[host]:[port]/postgres'"
    echo ""
    echo "你可以在 Supabase Dashboard -> Settings -> Database 中找到连接字符串"
    exit 1
fi

# 执行数据库迁移
echo "正在连接数据库..."
if psql "$SUPABASE_DB_URL" -f database/fix-command-metrics.sql; then
    echo ""
    echo "✅ 数据库迁移成功完成！"
    echo ""
    echo "现在可以重新启动服务器："
    echo "   npm start"
else
    echo ""
    echo "❌ 数据库迁移失败"
    echo ""
    echo "请检查："
    echo "1. 数据库连接字符串是否正确"
    echo "2. 是否有数据库修改权限"
    echo "3. 网络连接是否正常"
    echo ""
    echo "或者在 Supabase Dashboard 的 SQL Editor 中手动执行："
    echo "   database/fix-command-metrics.sql"
fi
