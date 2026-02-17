# GitHub 自动部署设置指南

本文档指导您如何设置 GitHub 到阿里云服务器 (47.83.241.117) 的自动部署。

## 一、前置条件

确保您的服务器已经：
- 安装了 Node.js、PM2、Nginx、Git
- 已克隆项目到 `/var/www/germany-box-system`
- 配置了 `server/.env` 数据库连接

## 二、在服务器上生成 SSH 密钥对

在您的**本地电脑**或**服务器**上执行：

```bash
# 生成专用于部署的 SSH 密钥（不要设置密码，直接回车）
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy_key

# 查看公钥（复制到服务器）
cat ~/.ssh/github_deploy_key.pub

# 查看私钥（复制到 GitHub Secrets）
cat ~/.ssh/github_deploy_key
```

## 三、在服务器上添加公钥

SSH 登录到服务器 47.83.241.117：

```bash
# 将公钥添加到 authorized_keys
echo "你的公钥内容" >> ~/.ssh/authorized_keys

# 设置权限
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

## 四、在 GitHub 配置 Secrets

1. 打开您的仓库：https://github.com/FrankZheng1985/DE-Box-system
2. 点击 **Settings** → **Secrets and variables** → **Actions**
3. 点击 **New repository secret**，添加以下 3 个密钥：

| Secret 名称 | 值 |
|------------|-----|
| `SERVER_HOST` | `47.83.241.117` |
| `SERVER_USER` | `root` |
| `SSH_PRIVATE_KEY` | 粘贴私钥内容（包含 `-----BEGIN` 和 `-----END` 行） |

### 私钥示例格式：
```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
...（中间内容）...
-----END OPENSSH PRIVATE KEY-----
```

## 五、验证自动部署

### 方式一：推送代码触发
```bash
git add .
git commit -m "test: 测试自动部署"
git push origin main
```

### 方式二：手动触发
1. 打开 https://github.com/FrankZheng1985/DE-Box-system/actions
2. 选择 **Deploy to Production** 工作流
3. 点击 **Run workflow** 按钮

## 六、在服务器上手动部署（备用方案）

如果需要在服务器上手动触发部署：

```bash
cd /var/www/germany-box-system
chmod +x deploy/auto-deploy.sh
./deploy/auto-deploy.sh
```

## 七、查看部署日志

### GitHub Actions 日志
访问：https://github.com/FrankZheng1985/DE-Box-system/actions

### 服务器日志
```bash
# 查看 PM2 日志
pm2 logs germany-box-server

# 查看 Nginx 错误日志
tail -f /var/log/nginx/error.log
```

## 八、数据库迁移说明

自动部署会自动运行 `server/scripts/init-db.js` 来执行数据库迁移。

如果需要手动运行迁移：
```bash
cd /var/www/germany-box-system/server
node scripts/init-db.js
```

## 九、常见问题

### Q: 部署失败，提示 SSH 连接超时
A: 检查服务器防火墙是否开放 22 端口：
```bash
ufw allow 22
```

### Q: 部署失败，提示权限不足
A: 确保 SSH 密钥已正确添加到服务器的 authorized_keys

### Q: 前端构建失败
A: 检查服务器内存是否充足，可尝试增加 swap：
```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

---

## 线上访问地址

- **管理后台**: http://47.83.241.117/admin
- **客户门户**: http://47.83.241.117/customer
- **API 接口**: http://47.83.241.117/api
# 测试自动部署 - Tue Feb 17 14:18:44 CST 2026
