#!/bin/bash

# CursorRemote 智能重启脚本
# 检测常见错误并自动重启服务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
SERVER_DIR="/Users/nick/CascadeProjects/CursorRemote/server"
LOG_FILE="$SERVER_DIR/restart.log"
PID_FILE="$SERVER_DIR/service.pid"
MAX_RETRIES=5
RETRY_DELAY=10

# 日志函数
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARN:${NC} $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO:${NC} $1" | tee -a "$LOG_FILE"
}

# 检查进程是否运行
is_service_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$PID_FILE"
            return 1
        fi
    fi
    return 1
}

# 停止服务
stop_service() {
    info "正在停止 CursorRemote 服务..."
    
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            kill -TERM "$pid" 2>/dev/null || true
            sleep 5
            
            # 如果进程仍在运行，强制终止
            if ps -p "$pid" > /dev/null 2>&1; then
                warn "进程未响应 SIGTERM，发送 SIGKILL..."
                kill -KILL "$pid" 2>/dev/null || true
                sleep 2
            fi
        fi
        rm -f "$PID_FILE"
    fi
    
    # 清理任何残留的node进程
    pkill -f "supabaseService.js" 2>/dev/null || true
    pkill -f "auto-restart.js" 2>/dev/null || true
    
    log "服务已停止"
}

# 启动服务
start_service() {
    info "正在启动 CursorRemote 服务..."
    
    cd "$SERVER_DIR"
    
    # 检查环境变量
    if [ ! -f ".env" ]; then
        error ".env 文件不存在，请先配置环境变量"
        exit 1
    fi
    
    # 启动自动重启监控器
    nohup node auto-restart.js > /dev/null 2>&1 &
    local pid=$!
    echo "$pid" > "$PID_FILE"
    
    sleep 3
    
    # 验证启动是否成功
    if is_service_running; then
        log "服务启动成功 (PID: $pid)"
        return 0
    else
        error "服务启动失败"
        rm -f "$PID_FILE"
        return 1
    fi
}

# 重启服务
restart_service() {
    log "重启 CursorRemote 服务..."
    stop_service
    sleep 3
    start_service
}

# 检查服务健康状态
check_health() {
    if ! is_service_running; then
        return 1
    fi
    
    # 简单的健康检查 - 查看最近的日志
    local recent_logs=$(tail -n 20 "$LOG_FILE" 2>/dev/null || echo "")
    
    # 检查是否有错误模式
    if echo "$recent_logs" | grep -qE "(errorRecoveryService.*not a function|TypeError.*is not a function|Failed to ensure Supabase connection)"; then
        warn "检测到服务错误模式"
        return 1
    fi
    
    return 0
}

# 主函数
main() {
    local action="${1:-restart}"
    
    case "$action" in
        start)
            if is_service_running; then
                warn "服务已在运行"
                exit 0
            fi
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            restart_service
            ;;
        status)
            if is_service_running; then
                log "服务正在运行 (PID: $(cat $PID_FILE))"
            else
                warn "服务未运行"
            fi
            ;;
        health)
            if check_health; then
                log "服务健康状态良好"
            else
                error "服务健康状态异常"
                exit 1
            fi
            ;;
        force-restart)
            log "强制重启服务..."
            
            # 强制停止所有相关进程
            pkill -9 -f "supabaseService.js" 2>/dev/null || true
            pkill -9 -f "auto-restart.js" 2>/dev/null || true
            rm -f "$PID_FILE"
            
            sleep 5
            start_service
            ;;
        monitor)
            log "开始监控服务..."
            while true; do
                if ! check_health; then
                    error "服务健康检查失败，尝试重启..."
                    restart_service
                    
                    # 等待服务稳定
                    sleep 30
                fi
                sleep 60  # 每分钟检查一次
            done
            ;;
        *)
            echo "用法: $0 {start|stop|restart|status|health|force-restart|monitor}"
            echo ""
            echo "命令说明:"
            echo "  start         启动服务"
            echo "  stop          停止服务"
            echo "  restart       重启服务"
            echo "  status        查看服务状态"
            echo "  health        检查服务健康状态"
            echo "  force-restart 强制重启服务"
            echo "  monitor       持续监控并自动重启"
            exit 1
            ;;
    esac
}

# 创建日志目录
mkdir -p "$(dirname "$LOG_FILE")"

# 执行主函数
main "$@" 