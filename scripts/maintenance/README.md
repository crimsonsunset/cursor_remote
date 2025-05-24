# 🔧 维护脚本

本目录包含项目维护相关的脚本工具。

## 脚本列表

### `check-status.sh`
检查系统状态的脚本，用于快速诊断系统健康状况。

**用法:**
```bash
./check-status.sh
```

### `fix-db.sh`
修复数据库结构问题的脚本，特别是修复 command_metrics 表结构。

**用法:**
```bash
# 设置数据库连接字符串
export SUPABASE_DB_URL='postgresql://postgres:[password]@[host]:[port]/postgres'

# 运行修复脚本
./fix-db.sh
```

**注意事项:**
- 需要设置 `SUPABASE_DB_URL` 环境变量
- 需要安装 PostgreSQL 客户端工具 (`psql`)
- 如果没有 psql，可以在 Supabase Dashboard 的 SQL Editor 中手动执行相关 SQL

## 权限设置

确保脚本有执行权限：
```bash
chmod +x *.sh
```

## 相关文档

- [数据库设置指南](../docs/deployment/SETUP_DATABASE.md)
- [修复文档](../docs/fixes/)

---

*最后更新: 2025年5月24日*
