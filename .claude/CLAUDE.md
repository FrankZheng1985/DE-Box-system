# EU-TMS 项目开发规范

> 项目专属规则，补充全局 CLAUDE.md

---

## 自动记录规则（必须执行）

1. **开发前必读**：每次开始开发任务前，必须先搜索 `docs/踩坑经验库/` 目录下的所有文件，了解已知问题，避免重复踩坑。
2. **踩坑记录**：每次修复 bug 或解决问题后，必须在 `docs/踩坑经验库/` 新建一篇记录，格式参照已有文件（问题现象 → 根本原因 → 错误代码 → 正确代码 → 防护规则），编号递增。
3. **开发记录**：每次开发完成后，在 `docs/开发记录/` 创建文档，包含修改文件路径、功能说明、影响分析。
4. **CLAUDE.md 更新**：如果发现新的架构规则或关键约束，同步更新本文件的"关键架构规则"章节。

---

## 项目信息

- **项目名称**: EU-TMS 欧洲运输管理系统
- **公司**: Box Cargo Service GmbH
- **访问地址**: https://47.83.241.117 ← **过渡期直接用 IP**（详见下方"域名迁移过渡期"）
- **架构**: SAP S/4HANA ERP 标准
- **三端**: 运营管理端 + 客户门户 + 承运商门户

---

## 服务器信息

- **ECS**: 47.83.241.117 (SSH 别名: `eu-tms`)
- **RDS**: pgm-j6crhh9h8562qvfm.pg.rds.aliyuncs.com:5432
- **数据库名**: germany_box_transport
- **OSS**: box-cargo-files (oss-cn-hongkong)

---

## 域名迁移过渡期（2026-08-01 起）

> **现状：服务器已不再绑定 box-cargo.de，只按 IP 访问。** 新域名尚未注册。

| 项 | 现状 |
|----|------|
| 访问地址 | `https://47.83.241.117`（HTTP 会 301 跳 HTTPS） |
| SSL 证书 | **自签名**（`/etc/nginx/ssl/eutms-ip.crt`，有效期到 2028-11-03）。Let's Encrypt 不给纯 IP 签证书，浏览器首次访问会弹警告，点"高级 → 继续前往"即可 |
| nginx | `server_name _` + `default_server`，不再匹配任何域名 |
| CORS_ORIGIN | `https://47.83.241.117` |
| 旧配置备份 | `/etc/nginx/sites-available/germany-box.bak-*`、`server/.env.bak-*` |
| box-cargo.de | DNS 仍指向本机，但 nginx 已不认它，访问会证书不匹配。Let's Encrypt 证书还在（2026-09-07 到期），未删除 |

### ⚠️ 新域名注册好之后必须做的事

1. **DNS 解析**指向 47.83.241.117
2. **签正式证书**：`certbot --nginx -d 新域名`
3. **nginx**：`server_name` 改成新域名，`ssl_certificate` 指回 Let's Encrypt
4. **`.env`**：`CORS_ORIGIN` 改成 `https://新域名`，改完必须 `pm2 delete all` 再 `pm2 start`（踩坑 005）
5. **邮件认证一定要第一天就配齐**（旧域名就是栽在这上面，详见踩坑 012）：
   - SPF（TXT `@`）：`v=spf1 include:_spf.strato.com -all`
   - DKIM：Strato 后台开启
   - DMARC（TXT `_dmarc`）：先 `p=none`，等 SPF/DKIM 验证通过再收紧到 `p=reject`
6. `SMTP_FROM` / `ADMIN_EMAIL` 换成新域名邮箱
7. 前端 Login 页两个 `mailto:` 链接（密码重置、账号申请）里的旧域名一并换掉

---

## 关键架构规则（必须遵守）

### 1. ERP 内核引擎优先
- 所有业务操作**必须通过 `server/core/` 内核引擎**执行
- 禁止在业务模块中直接 INSERT/UPDATE/DELETE 凭证相关表
- 凭证（documents 表）一旦 POSTED，**只能冲销，禁止修改/删除**

### 2. API 路由顺序
- **Express 路由中，固定路径必须在参数路径前面**
- `/stats` 必须在 `/:id` 之前
- `/match` 必须在 `/:id` 之前
- `/export` 必须在 `/:id` 之前
- 这个问题已经出现过 5 次（quotation/cmr/customs/shipping-release/carrier）

### 3. 数据库字段类型
- PostgreSQL 的 `NUMERIC` 和 `BIGINT` 返回**字符串**而不是数字
- 前端使用 `.toFixed()` 前必须先 `Number()` 转换
- 前端使用 `.toLocaleString()` 前必须先 `parseFloat()` 转换

### 4. 前后端字段名映射
- 后端 API 返回 **snake_case**（如 `order_number`, `client_name`）
- 前端如果用 camelCase interface，必须在获取数据时做映射
- **推荐**：前端 interface 直接用 snake_case，和 API 一致

### 5. 状态枚举值大小写
- 数据库存储的状态值是**大写**（如 `PENDING_REVIEW`, `CURTAIN_SIDE`）
- 前端筛选/查询参数必须传**大写**
- StatusBadge 组件同时支持大小写

---

## 目录结构

```
server/
├── core/              ← ERP 内核引擎（10 个引擎）
│   ├── document-engine.js    凭证引擎
│   ├── document-flow.js      单据流
│   ├── number-range.js       编号范围
│   ├── change-tracker.js     变更追踪
│   ├── posting-period.js     过账期间
│   ├── account-determination.js  科目确定
│   ├── credit-manager.js     信用管理
│   ├── pricing-engine.js     定价引擎
│   ├── notification-engine.js 通知引擎
│   ├── workflow-engine.js    工作流
│   ├── db.js                 数据库连接池
│   └── index.js              统一入口
├── modules/           ← 业务模块（15 个）
│   ├── auth/         认证
│   ├── order/        订单（model + service + controller + routes）
│   ├── client/       客户
│   ├── carrier/      承运商
│   ├── inquiry/      询价
│   ├── quotation/    报价
│   ├── cmr/          CMR 单据
│   ├── gps/          GPS 追踪
│   ├── shipping-release/ 船司放单
│   ├── customs/      清关
│   ├── finance/      财务
│   ├── invoice-template/ 发票模板
│   ├── contact/      客户咨询
│   ├── notification/ 通知
│   ├── dashboard/    仪表板
│   └── system/       系统设置
├── middleware/
│   ├── auth.js       认证 + requireUserType 中间件
│   └── ...
├── utils/
│   ├── oss-service.js    阿里云 OSS
│   ├── email-service.js  邮件服务
│   └── pdf-generator.js  PDF 发票
└── database/migrations/
    ├── 100_eu_tms_v2_full_rebuild.sql  建表
    └── 101_eu_tms_v2_seed_data.sql    初始数据

admin/src/             ← 运营管理端（React + TS + Tailwind）
├── components/        通用组件（Layout/Sidebar/Header/Modal/StatCard/StatusBadge）
├── contexts/          AuthContext
├── pages/             25+ 页面
├── types/             TypeScript 类型
└── utils/             API 客户端

customer-portal/src/   ← 客户门户（10 页面）
carrier-portal/src/    ← 承运商门户（7 页面）
```

---

## 部署规范

### 后端部署
```bash
# 上传文件
scp -i ~/.ssh/id_ed25519 文件 root@47.83.241.117:/var/www/germany-box-system/server/

# 重启（必须删除重建，否则环境变量不更新）
ssh eu-tms "pm2 delete all && cd /var/www/germany-box-system && pm2 start server/app.js --name germany-box-server -i 2"
```

### 前端部署
```bash
# 构建
cd admin && npm run build

# 上传（先清旧资源）
ssh eu-tms "rm -rf /var/www/germany-box-system/admin/dist/assets/*"
scp -r admin/dist/* root@47.83.241.117:/var/www/germany-box-system/admin/dist/
```

### 官网部署
```bash
# 官网放在两个位置
scp 原型图.html root@47.83.241.117:/var/www/germany-box-system/homepage/index.html
ssh eu-tms "cp /var/www/germany-box-system/homepage/index.html /var/www/germany-box-system/admin/dist/homepage.html"
```

---

## Nginx 路由规则

```
/                → 官网主页 (homepage.html)
/login, /orders  → 管理端 SPA (admin/dist/index.html)
/admin/          → 管理端 SPA
/customer/       → 客户门户 SPA
/carrier/        → 承运商门户 SPA
/api/*           → 后端 API (proxy to :3002)
/uploads/*       → 后端静态文件
```

---

## 数据库操作规范

- **禁止** `TRUNCATE ... CASCADE`、`DROP TABLE ... CASCADE`
- **禁止** `DELETE FROM table`（无 WHERE）
- 修改表结构前必须备份
- 所有业务数据通过 ERP 凭证引擎操作，不直接 SQL

---

## 测试账号

| 门户 | 账号 | 密码 |
|------|------|------|
| 运营管理端 | admin | admin123 |
| 客户门户 | siemens | client123 |
| 承运商门户 | speedtrans | carrier123 |

---

## 文件存储

- OSS Bucket: `box-cargo-files` (oss-cn-hongkong)
- CMR 文件路径: `cmr/{订单号}_{柜号}/文件名`
- 清关文件路径: `customs/{订单号}_{柜号}/文件名`
- OSS 不可用时回退到本地 `/var/www/germany-box-system/uploads/`

---

## SMTP 邮件

- SMTP: smtp.strato.de:587
- 发件人: info@box-cargo.de
- 客户咨询通知自动发送到 info@box-cargo.de
