#!/bin/bash

# ================================================
# 德国Box运输管理系统 - 自动更新部署脚本
# ================================================
# 使用方法: 
#   chmod +x auto-deploy.sh
#   ./auto-deploy.sh
# ================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 项目目录
PROJECT_DIR="/var/www/germany-box-system"

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 部署函数
deploy() {
    echo ""
    echo "=========================================="
    echo "  德国Box运输管理系统 - 自动更新部署"
    echo "  $(date '+%Y-%m-%d %H:%M:%S')"
    echo "=========================================="
    echo ""
    
    cd $PROJECT_DIR
    
    # 1. 拉取最新代码
    print_info "拉取最新代码..."
    git fetch origin main
    git reset --hard origin/main
    print_success "代码更新完成"
    
    # 2. 安装依赖
    print_info "安装依赖..."
    npm install
    npm run install:all
    print_success "依赖安装完成"
    
    # 3. 运行数据库迁移
    print_info "运行数据库迁移..."
    cd server
    node scripts/init-db.js || print_warning "数据库迁移已完成或无需更新"
    cd ..
    print_success "数据库迁移完成"
    
    # 4. 构建前端
    print_info "构建管理后台..."
    cd admin && npm run build && cd ..
    print_success "管理后台构建完成"
    
    print_info "构建客户门户..."
    cd customer-portal && npm run build && cd ..
    print_success "客户门户构建完成"
    
    # 5. 重启后端服务
    print_info "重启后端服务..."
    pm2 reload germany-box-server --update-env || pm2 start deploy/ecosystem.config.cjs --env production
    print_success "后端服务重启完成"
    
    # 6. 重载 Nginx
    print_info "重载 Nginx..."
    nginx -t && systemctl reload nginx
    print_success "Nginx 重载完成"
    
    echo ""
    echo "=========================================="
    echo "  部署完成！"
    echo "=========================================="
    echo ""
    
    # 显示服务状态
    pm2 status
    
    echo ""
    print_info "访问地址："
    echo "  管理后台: http://47.83.241.117/admin"
    echo "  客户门户: http://47.83.241.117/customer"
    echo "  API 接口: http://47.83.241.117/api"
    echo ""
}

# 运行部署
deploy
