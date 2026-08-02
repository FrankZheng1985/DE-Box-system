# 德国Box运输管理系统

完整的物流运输管理解决方案，包含后台管理系统和客户服务平台。

## 项目结构

```
德国Box系统/
├── admin/              # 后台管理系统 (内部员工使用)
│   ├── src/            # 前端源码
│   └── ...
├── customer-portal/    # 客户服务平台 (客户使用)
│   ├── src/            # 前端源码
│   └── ...
├── server/             # 共享后端服务
│   ├── modules/        # 业务模块
│   ├── database/       # 数据库迁移
│   └── ...
└── package.json        # 根项目配置
```

## 系统说明

### 后台管理系统 (Admin)
- 端口: http://localhost:5174
- 功能: 订单管理、TMS、CRM、供应商管理、财务管理、产品定价、系统管理

### 客户服务平台 (Customer Portal)
- 端口: http://localhost:5175
- 功能: 订单查询、物流追踪、客户自助服务

### 后端服务 (Server)
- 端口: http://localhost:3002
- 技术: Node.js + Express + PostgreSQL

## 快速开始

### 1. 安装依赖

```bash
# 安装根项目依赖
npm install

# 安装所有子项目依赖
npm run install:all
```

### 2. 配置数据库

```bash
# 复制环境配置文件
cp server/env.example server/.env

# 编辑 server/.env 设置数据库连接
# DATABASE_URL=postgresql://username@localhost:5432/germany_box_transport
```

### 3. 初始化数据库

```bash
npm run server:init
```

### 4. 启动开发服务器

```bash
# 启动后端 + 后台管理系统
npm run dev:all

# 或者启动全部（包括客户端）
npm run dev:full
```

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev:admin` | 启动后台管理前端 |
| `npm run dev:customer` | 启动客户端前端 |
| `npm run dev:server` | 启动后端服务 |
| `npm run dev:all` | 启动后端 + 后台管理 |
| `npm run dev:full` | 启动全部服务 |
| `npm run server:init` | 初始化数据库 |
| `npm run install:all` | 安装所有依赖 |

## 默认账号

### 后台管理系统
- 用户名: `admin`
- 密码: 向项目负责人索取（**不在仓库中记录**）

## 技术栈

- **前端**: React 18 + TypeScript + Vite + Tailwind CSS
- **后端**: Node.js + Express.js
- **数据库**: PostgreSQL
- **认证**: JWT
