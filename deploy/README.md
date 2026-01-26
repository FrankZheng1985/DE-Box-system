# 德国Box运输管理系统 - 阿里云部署指南

## 一、阿里云资源购买指南

### 1.1 ECS 云服务器

**推荐配置：**
- 规格：2核4G（入门）/ 4核8G（推荐）
- 系统：Ubuntu 22.04 LTS 或 CentOS 8
- 带宽：5Mbps 起
- 磁盘：40GB SSD 起

**购买步骤：**
1. 登录 [阿里云控制台](https://www.aliyun.com/)
2. 进入 ECS 云服务器
3. 创建实例，选择上述配置
4. 设置安全组（开放端口：22, 80, 443, 3002）
5. 记录公网 IP 地址

### 1.2 RDS PostgreSQL 数据库

**推荐配置：**
- 规格：1核2G（入门）/ 2核4G（推荐）
- 存储：20GB SSD 起
- 版本：PostgreSQL 14 或 15

**购买步骤：**
1. 进入 RDS 数据库服务
2. 创建 PostgreSQL 实例
3. 设置数据库账号和密码
4. 配置白名单（添加 ECS 内网 IP）
5. 记录连接地址

---

## 二、服务器环境配置

### 2.1 连接服务器

```bash
ssh root@你的ECS公网IP
```

### 2.2 安装基础软件

```bash
# 更新系统
apt update && apt upgrade -y

# 安装 Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 验证安装
node -v  # 应该显示 v20.x.x
npm -v

# 安装 PM2 进程管理器
npm install -g pm2

# 安装 Nginx
apt install -y nginx

# 安装 Git
apt install -y git
```

### 2.3 配置防火墙

```bash
# 开放必要端口
ufw allow 22
ufw allow 80
ufw allow 443
ufw allow 3002
ufw enable
```

---

## 三、部署步骤

### 3.1 上传代码

**方式一：通过 Git**
```bash
# 在服务器上
cd /var/www
git clone https://github.com/你的用户名/germany-box-system.git
cd germany-box-system
```

**方式二：通过 SCP 上传**
```bash
# 在本地执行
scp -r /Users/fengzheng/德国Box系统 root@你的ECS公网IP:/var/www/germany-box-system
```

### 3.2 安装依赖

```bash
cd /var/www/germany-box-system

# 安装根项目依赖
npm install

# 安装所有子项目依赖
npm run install:all
```

### 3.3 配置环境变量

```bash
# 复制并编辑生产环境配置
cp deploy/production.env server/.env
nano server/.env
```

编辑以下内容：
```
PORT=3002
NODE_ENV=production
DATABASE_URL=postgresql://用户名:密码@RDS内网地址:5432/germany_box_transport
JWT_SECRET=生成一个随机字符串（至少32位）
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://你的ECS公网IP
```

### 3.4 初始化数据库

```bash
# 在 RDS 控制台创建数据库 germany_box_transport
# 然后运行初始化脚本
npm run server:init
```

### 3.5 构建前端

```bash
# 构建后台管理系统
npm run build:admin

# 构建客户端（如需要）
npm run build:customer
```

### 3.6 配置 Nginx

```bash
# 复制 Nginx 配置
cp deploy/nginx.conf /etc/nginx/sites-available/germany-box
ln -s /etc/nginx/sites-available/germany-box /etc/nginx/sites-enabled/

# 删除默认配置
rm /etc/nginx/sites-enabled/default

# 测试配置
nginx -t

# 重启 Nginx
systemctl restart nginx
```

### 3.7 启动后端服务

```bash
# 使用 PM2 启动
cd /var/www/germany-box-system
pm2 start deploy/ecosystem.config.cjs

# 设置开机自启
pm2 startup
pm2 save
```

---

## 四、访问地址

部署完成后，可通过以下地址访问：

- **后台管理系统**: `http://你的ECS公网IP/admin`
- **客户端门户**: `http://你的ECS公网IP/customer`
- **后端 API**: `http://你的ECS公网IP/api`

---

## 五、常用运维命令

### PM2 管理

```bash
# 查看进程状态
pm2 status

# 查看日志
pm2 logs

# 重启应用
pm2 restart all

# 停止应用
pm2 stop all
```

### Nginx 管理

```bash
# 重启 Nginx
systemctl restart nginx

# 查看 Nginx 状态
systemctl status nginx

# 查看 Nginx 日志
tail -f /var/log/nginx/error.log
```

### 更新部署

```bash
cd /var/www/germany-box-system

# 拉取最新代码
git pull

# 安装依赖
npm run install:all

# 重新构建前端
npm run build:admin

# 重启后端
pm2 restart all
```

---

## 六、域名配置（可选）

如果您购买了域名：

1. 在阿里云域名控制台添加 A 记录，指向 ECS 公网 IP
2. 修改 Nginx 配置中的 `server_name`
3. 申请 SSL 证书（推荐使用阿里云免费证书）
4. 配置 HTTPS

---

## 七、安全建议

1. **修改 SSH 端口**：将默认 22 端口改为其他端口
2. **禁用 root 登录**：创建普通用户，使用 sudo
3. **定期更新系统**：`apt update && apt upgrade`
4. **配置数据库备份**：使用 RDS 自动备份功能
5. **启用 HTTPS**：申请 SSL 证书

---

## 八、故障排查

### 后端无法启动
```bash
# 查看 PM2 日志
pm2 logs germany-box-server

# 检查端口占用
netstat -tlnp | grep 3002
```

### 前端无法访问
```bash
# 检查 Nginx 配置
nginx -t

# 查看 Nginx 错误日志
tail -f /var/log/nginx/error.log
```

### 数据库连接失败
```bash
# 测试数据库连接
psql -h RDS地址 -U 用户名 -d germany_box_transport

# 检查 RDS 白名单是否包含 ECS IP
```
