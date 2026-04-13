#!/bin/bash
# ================================================
# 快速部署脚本（手动使用）
# 德国Box运输管理系统 (EU-TMS)
# ================================================
#
# 用法:
#   ./deploy/quick-deploy.sh [admin|customer|carrier|server|all]
#
# 示例:
#   ./deploy/quick-deploy.sh admin      # 只部署管理后台
#   ./deploy/quick-deploy.sh customer   # 只部署客户门户
#   ./deploy/quick-deploy.sh carrier    # 只部署承运商门户
#   ./deploy/quick-deploy.sh server     # 只部署后端
#   ./deploy/quick-deploy.sh all        # 部署全部
#   ./deploy/quick-deploy.sh            # 不带参数，显示帮助
#
# 前提条件:
#   1. 本地已配置 SSH 免密登录到服务器（ssh root@47.83.241.117）
#   2. 本地已安装 rsync
#   3. 在项目根目录下执行
# ================================================

set -e

# ---- 配置 ----
SSH_HOST="47.83.241.117"
SSH_USER="root"
REMOTE_DIR="/var/www/germany-box-system"
REMOTE="${SSH_USER}@${SSH_HOST}"

# ---- 颜色 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ---- 检查项目根目录 ----
check_project_root() {
    if [ ! -f "package.json" ] || [ ! -d "admin" ] || [ ! -d "server" ]; then
        print_error "请在项目根目录下执行此脚本"
        exit 1
    fi
}

# ---- 检查 SSH 连通性 ----
check_ssh() {
    print_info "检查 SSH 连接..."
    if ! ssh -o ConnectTimeout=5 -o BatchMode=yes ${REMOTE} "echo ok" > /dev/null 2>&1; then
        print_error "无法连接到 ${SSH_HOST}，请检查 SSH 配置"
        exit 1
    fi
    print_success "SSH 连接正常"
}

# ---- 部署管理后台 ----
deploy_admin() {
    print_info "构建管理后台..."
    cd admin
    npm ci
    npm run build
    cd ..

    print_info "上传管理后台..."
    rsync -avz --delete admin/dist/ ${REMOTE}:${REMOTE_DIR}/admin/dist/

    print_success "管理后台部署完成"
}

# ---- 部署客户门户 ----
deploy_customer() {
    print_info "构建客户门户..."
    cd customer-portal
    npm ci
    npm run build
    cd ..

    print_info "上传客户门户..."
    rsync -avz --delete customer-portal/dist/ ${REMOTE}:${REMOTE_DIR}/customer-portal/dist/

    print_success "客户门户部署完成"
}

# ---- 部署承运商门户 ----
deploy_carrier() {
    print_info "构建承运商门户..."
    cd carrier-portal
    npm ci
    npm run build
    cd ..

    print_info "上传承运商门户..."
    rsync -avz --delete carrier-portal/dist/ ${REMOTE}:${REMOTE_DIR}/carrier-portal/dist/

    print_success "承运商门户部署完成"
}

# ---- 部署后端 ----
deploy_server() {
    print_info "上传后端代码..."
    rsync -avz --delete \
        --exclude 'node_modules' \
        --exclude '.env' \
        --exclude 'uploads/' \
        --exclude '*.log' \
        server/ ${REMOTE}:${REMOTE_DIR}/server/

    print_info "上传部署配置..."
    rsync -avz deploy/ecosystem.config.cjs ${REMOTE}:${REMOTE_DIR}/deploy/

    print_info "安装后端依赖并重启服务..."
    ssh ${REMOTE} << 'EOF'
        set -e
        cd /var/www/germany-box-system/server
        npm install --production

        cd ..
        if pm2 describe germany-box-server > /dev/null 2>&1; then
            pm2 reload germany-box-server --update-env
        else
            pm2 start deploy/ecosystem.config.cjs --env production
        fi
        pm2 status
EOF

    print_success "后端部署完成"
}

# ---- 部署全部 ----
deploy_all() {
    deploy_admin
    deploy_customer
    deploy_carrier
    deploy_server

    print_info "重载 Nginx..."
    ssh ${REMOTE} "nginx -t && systemctl reload nginx"

    print_success "全部部署完成"
}

# ---- 显示帮助 ----
show_help() {
    echo ""
    echo "================================================"
    echo "  德国Box运输管理系统 - 快速部署脚本"
    echo "================================================"
    echo ""
    echo "用法: ./deploy/quick-deploy.sh [目标]"
    echo ""
    echo "可用目标:"
    echo "  admin      只部署管理后台 (构建 + 上传)"
    echo "  customer   只部署客户门户 (构建 + 上传)"
    echo "  carrier    只部署承运商门户 (构建 + 上传)"
    echo "  server     只部署后端 (上传 + 安装依赖 + 重启)"
    echo "  all        部署全部"
    echo ""
    echo "示例:"
    echo "  ./deploy/quick-deploy.sh admin"
    echo "  ./deploy/quick-deploy.sh all"
    echo ""
}

# ---- 主入口 ----
main() {
    TARGET="${1:-help}"

    if [ "$TARGET" = "help" ] || [ "$TARGET" = "-h" ] || [ "$TARGET" = "--help" ]; then
        show_help
        exit 0
    fi

    echo ""
    echo "=========================================="
    echo "  开始部署: ${TARGET}"
    echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "=========================================="
    echo ""

    check_project_root
    check_ssh

    case "$TARGET" in
        admin)
            deploy_admin
            ;;
        customer)
            deploy_customer
            ;;
        carrier)
            deploy_carrier
            ;;
        server)
            deploy_server
            ;;
        all)
            deploy_all
            ;;
        *)
            print_error "未知目标: ${TARGET}"
            show_help
            exit 1
            ;;
    esac

    echo ""
    echo "=========================================="
    echo "  部署完成: ${TARGET}"
    echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "=========================================="
    echo ""
}

main "$@"
