# 🔧 Maintenance Scripts

This directory contains project maintenance related script tools.

## Script List

### `check-status.sh`
Script to check system status for quick system health diagnosis.

**Usage:**
```bash
./check-status.sh
```

### `fix-db.sh`
Script to fix database structure issues, specifically for fixing command_metrics table structure.

**Usage:**
```bash
# Set database connection string
export SUPABASE_DB_URL='postgresql://postgres:[password]@[host]:[port]/postgres'

# Run fix script
./fix-db.sh
```

**Notes:**
- Requires setting `SUPABASE_DB_URL` environment variable
- Requires PostgreSQL client tools (`psql`) to be installed
- If psql is not available, you can manually execute the relevant SQL in Supabase Dashboard's SQL Editor

## Permission Setup

Ensure scripts have execute permissions:
```bash
chmod +x *.sh
```

## Related Documentation

- [Database Setup Guide](../docs/deployment/SETUP_DATABASE.md)
- [Fix Documentation](../docs/fixes/)

---

*Last updated: May 24, 2025*
