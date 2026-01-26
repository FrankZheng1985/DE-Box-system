#!/bin/bash

# ================================================
# 德国Box运输管理系统 - 一键部署脚本
# ================================================
# 使用方法: 
#   chmod +x deploy.sh
#   ./deploy.sh
# ================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
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

# 检查是否为 root 用户
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "请使用 root 用户运行此脚本"
        exit 1
    fi
}

# 安装基础软件
install_dependencies() {
    print_info "正在安装基础软件..."
    
    apt update
    apt upgrade -y
    
    # 安装 Node.js 20.x
    if ! command -v node &> /dev/null; then
        print_info "安装 Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt install -y nodejs
    fi
    
    # 安装 PM2
    if ! command -v pm2 &> /dev/null; then
        print_info "安装 PM2..."
        npm install -g pm2
    fi
    
    # 安装 Nginx
    if ! command -v nginx &> /dev/null; then
        print_info "安装 Nginx..."
        apt install -y nginx
    fi
    
    # 安装 Git
    if ! command -v git &> /dev/null; then
        print_info "安装 Git..."
        apt install -y git
    fi
    
    print_success "基础软件安装完成！"
}

# 配置防火墙
configure_firewall() {
    print_info "配置防火墙..."
    
    ufw allow 22
    ufw allow 80
    ufw allow 443
    ufw allow 3002
    ufw --force enable
    
    print_success "防火墙配置完成！"
}

# 创建目录
create_directories() {
    print_info "创建必要目录..."
    
    mkdir -p /var/www
    mkdir -p /var/log/pm2
    mkdir -p /var/log/nginx
    
    print_success "目录创建完成！"
}

# 安装项目依赖
install_project() {
    print_info "安装项目依赖..."
    
    cd /var/www/germany-box-system
    
    npm install
    npm run install:all
    
    print_success "项目依赖安装完成！"
}

# 构建前端
build_frontend() {
    print_info "构建前端项目..."
    
    cd /var/www/germany-box-system
    
    npm run build:admin
    npm run build:customer || print_warning "客户端构建跳过"
    
    print_success "前端构建完成！"
}

# 配置 Nginx
configure_nginx() {
    print_info "配置 Nginx..."
    
    cp /var/www/germany-box-system/deploy/nginx.conf /etc/nginx/sites-available/germany-box
    
    # 创建符号链接
    if [ -L /etc/nginx/sites-enabled/germany-box ]; then
        rm /etc/nginx/sites-enabled/germany-box
    fi
    ln -s /etc/nginx/sites-available/germany-box /etc/nginx/sites-enabled/
    
    # 删除默认配置
    if [ -L /etc/nginx/sites-enabled/default ]; then
        rm /etc/nginx/sites-enabled/default
    fi
    
    # 测试配置
    nginx -t
    
    # 重启 Nginx
    systemctl restart nginx
    systemctl enable nginx
    
    print_success "Nginx 配置完成！"
}

# 启动后端服务
start_backend() {
    print_info "启动后端服务..."
    
    cd /var/www/germany-box-system
    
    # 停止已有进程
    pm2 delete germany-box-server 2>/dev/null || true
    
    # 启动服务
    pm2 start deploy/ecosystem.config.cjs --env production
    
    # 设置开机自启
    pm2 startup
    pm2 save
    
    print_success "后端服务启动完成！"
}

# 检查服务状态
check_status() {
    print_info "检查服务状态..."
    
    echo ""
    echo "=== PM2 状态 ==="
    pm2 status
    
    echo ""
    echo "=== Nginx 状态 ==="
    systemctl status nginx --no-pager
    
    echo ""
    print_success "部署完成！"
    echo ""
    print_info "访问地址："
    echo "  后台管理: http://$(curl -s ifconfig.me)/admin"
    echo "  客户端:   http://$(curl -s ifconfig.me)/customer"
    echo "  API:      http://$(curl -s ifconfig.me)/api"
    echo ""
    print_warning "请确保已配置 server/.env 文件中的数据库连接！"
}

# 主函数
main() {
    echo ""
    echo "========================================"
    echo "  德国Box运输管理系统 - 一键部署脚本"
    echo "========================================"
    echo ""
    
    check_root
    install_dependencies
    configure_firewall
    create_directories
    install_project
    build_frontend
    configure_nginx
    start_backend
    check_status
}

# 运行主函数
main
