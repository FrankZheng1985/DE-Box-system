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
- **公司**: Kaluna UG (haftungsbeschränkt) — HRB 108503，Amtsgericht Düsseldorf
  - 注册／办公／开票地址：Niederbeckstraße 35, 40472 Düsseldorf
  - Geschäftsführer: Shunyi Wang
  - 品牌名 **KALUNA SPED**（营销文案用），法人名 **Kaluna UG (haftungsbeschränkt)**（发票／Impressum／CMR 等法律位置必须用全称，
    `(haftungsbeschränkt)` 是 §5a GmbHG 强制的，省略可能导致个人无限责任）
  - 旧主体 Box Cargo Service GmbH（Mintarder Weg 53, 45219 Essen）已停用，
    但**历史发票不可追溯改名**——已开出的是已生效税务凭证，发票模板须按开票日期区分主体
- **访问地址**: https://kalunasped.com （IP 直访 https://47.83.241.117 保留作应急回退，详见下方"域名"章节）
- **架构**: SAP S/4HANA ERP 标准
- **三端**: 运营管理端 + 客户门户 + 承运商门户

---

## 服务器信息

- **ECS**: 47.83.241.117 (SSH 别名: `eu-tms`)
- **RDS**: pgm-j6crhh9h8562qvfm.pg.rds.aliyuncs.com:5432
- **数据库名**: germany_box_transport
- **OSS**: box-cargo-files (oss-cn-hongkong)

---

## 域名 kalunasped.com（2026-08-02 启用）

> **正式域名已上线**：`https://kalunasped.com`。域名注册与 DNS 均在 **Cloudflare**
> （旧域名 box-cargo.de 在 Strato，已弃用）。

| 项 | 现状 |
|----|------|
| 访问地址 | `https://kalunasped.com`（`www` 同样可用，HTTP 会 301 跳 HTTPS） |
| DNS | Cloudflare，A `@` 和 A `www` → `47.83.241.117`，**代理状态必须是「仅 DNS」灰云** |
| SSL 证书 | Let's Encrypt，`/etc/letsencrypt/live/kalunasped.com/`，到 2026-10-30，certbot 自动续期 |
| nginx | 公共配置在 `snippets/eutms-app.conf`，域名块与 IP 块各自 include |
| IP 直访 | `https://47.83.241.117` **保留作应急回退**，仍是自签名证书（会弹警告），nginx 里是 `default_server` |
| CORS_ORIGIN | `https://kalunasped.com,https://www.kalunasped.com,https://47.83.241.117`（**逗号分隔多来源**） |
| APP_BASE_URL | `https://kalunasped.com`（报价确认邮件的链接前缀，只能单值） |
| 备份 | `/etc/nginx/sites-available/germany-box.bak-*`、`server/.env.bak-*`、`homepage/index.html.bak-*` |

### ⚠️ 为什么 Cloudflare 代理必须关（灰云）

开橙云后 Cloudflare 会挡在源站前面，Let's Encrypt 的 HTTP-01 验证拿不到
`/.well-known/acme-challenge/`，certbot 续期会失败；而且还要额外配 Cloudflare
到源站的加密模式。要用 CDN/WAF 的话得先改成 DNS-01 验证再开。

### 证书续期

certbot 用的是 `--webroot -w /var/www/certbot`。nginx 的 80 端口块里有一段
`location ^~ /.well-known/acme-challenge/` 例外**不能删** —— 删了续期就会失败，
因为其余请求全被 301 到 HTTPS 了。

### 邮件（2026-08-02 方案调整）

域名在 Cloudflare 而非 Strato，Strato 的邮箱套餐不再适用，改为：

- **发信**：Resend（爱尔兰 eu-west-1，SMTP 中继，**代码不用改**只换 SMTP_* 环境变量）
- **收信**：Cloudflare Email Routing，`info@kalunasped.com` 转发到实际邮箱

生产 SMTP：`smtp.resend.com:587`，`SMTP_SECURE=false`（STARTTLS），
用户名固定 `resend`，密码是 API key（**Sending access + 仅限本域**，
该 Resend 账号下还有别的项目，别用 Full access / All domains）。

⚠️ **根域只能有一条 SPF TXT 记录**，两条并存 SPF 直接判定失效。当前是：

```
v=spf1 include:_spf.mx.cloudflare.net ~all
```

**不需要在根域 include Resend** —— Resend 把 Return-Path 放在 `send` 子域，
SPF 检查针对那个子域（`send` 的 TXT 是 `v=spf1 include:amazonses.com ~all`）。
DMARC 照样对齐：send 子域与根域同组织域（relaxed），DKIM 签的是 `d=kalunasped.com`。

两个 DKIM 选择器共存是正常的：`resend._domainkey`（发信）+ `cf2024-1._domainkey`（转发）。

DMARC 现为 **`p=quarantine`**（2026-08-02 从 `p=none` 收紧一档，实测未误伤）。
**下一档 `p=reject` 还没做**，前提是：收到 DMARC 聚合报告（`rua` 已能收到）
并确认 SPF/DKIM pass 率 100%，一般要等 1-2 周。
**没看过报告就上 reject = 拿生产邮件赌 —— 旧域名 box-cargo.de 就是这么废掉的，详见踩坑 012。**

> 新域名首次发信进收件方垃圾箱是常态（零发信信誉），和旧域名"静默丢弃"性质不同，
> 靠时间和正常发信量自然好转，不是配置问题。

### 旧域名 box-cargo.de 遗留

- 仍在 Strato，DNS 仍指向本机，但 nginx 的域名块只认 kalunasped.com，
  访问 box-cargo.de 会落到 IP 那个 default_server（自签名证书，会弹警告）
- 它的 Let's Encrypt 证书 2026-09-07 到期，续期会失败（webroot 例外只对当前配置有效），
  确认不再需要后可以 `certbot delete --cert-name box-cargo.de` 清掉
- `info@box-cargo.de` 邮箱在 Brevo 切换完成前仍是生产的发信账号

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

### 6. 主键一律是 UUID
- V2 所有业务表主键都是 `UUID`（`users.id`、`roles.id`、`clients.id`、`carriers.id`…）
- 前端一律按 **string** 处理，**禁止 `Number(id)`** —— `Number(uuid)` 得 `NaN`，
  `JSON.stringify(NaN)` 变成 `null`，接口照样回 200，是典型静默失败（踩坑 023）

### 7. 权限体系（P5 起）
- 权限码格式 `模块:动作`，字典在 `server/database/migrations/109_permission_system.sql`
- 后端：`requirePermission('order:view', ...)` 多个码是**任意一个满足即放行**；
  纯运营内部模块还要在模块顶部加 `router.use(requireUserType('OPERATOR'))`
- 前端：`admin/src/constants/permissions.ts` 的 `MENU_PERMISSIONS` 控制菜单和路由守卫；
  页面内用 `hasPermission()` / `hasAnyPermission()`（**不要再用旧的 `hasAuth` 系列**，
  它查的是空表 `auth_values`）
- **新增菜单/页面必做四件套**：迁移加权限码 → `MENU_PERMISSIONS` 加映射 →
  页面用 `hasPermission()` 拦 → 后端挂 `requirePermission()`。
  提交前跑 `cd server && node scripts/check-permission-menu-sync.js`

### 8. 门户可访问接口必须后端强制租户隔离
- 凡是客户门户/承运商门户会调的列表接口，`clientId` / `carrierId`
  **一律取 JWT 里的 `linkedEntityId`，忽略前端传参**
- 详情接口要校验这条记录属不属于当前登录方；不属于就按"不存在"返回 404
  （回 403 等于告诉对方这个 UUID 是有效记录）
- 历史上订单、清关、GPS、应收应付都栽在"直接用 query 参数筛选"上（踩坑 016、023）
- **过滤条件的失效方向必须是拒绝**：`if (linkedEntityId) { 加过滤 }` 这种写法，
  绑定为空时条件不加 = 返回全部。八个共享模块已在入口挂 `requireTenantBinding` 统一挡掉，
  新增门户可访问的模块记得一并挂上

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
│   ├── permission-service.js 权限码查询 + 缓存（P5）
│   ├── db.js                 数据库连接池
│   └── index.js              统一入口
├── modules/           ← 业务模块（19 个）
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
│   ├── quotation-response/ 报价邮件确认链接（免登录）
│   ├── user/         员工账号管理（运营端）
│   ├── portal-user/  客户门户本公司账号管理（子系统专属端点）
│   └── system/       系统设置 + 角色权限管理
├── middleware/
│   ├── auth.js       认证 + requireUserType + requirePermission 中间件
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

### ⚠️ push 到 main = 立刻上生产

`.github/workflows/deploy.yml` 的触发条件是 `on: push: branches: [main]`，
流程为「装依赖 → 四包 lint → 构建三端 → rsync 上传后端与前端 → pm2 重启」。
**没有「只提交不部署」这回事** —— 推上去两分半钟后就在生产跑了。

**但这条流水线不跑数据库迁移。** `database/migrations/` 会被 rsync 传上去，
只是躺在那儿，得有人手工 `psql -f` 才生效。

所以**带迁移的改动，顺序只能是「先迁移、后 push」**：

```bash
# 1. 结构变更前必须备份
ssh eu-tms "cd /var/www/germany-box-system/server && export \$(grep '^DATABASE_URL' .env | xargs) \
  && pg_dump \"\$DATABASE_URL\" | gzip > /var/backups/germany-box-db/germany_box_transport_\$(date +%Y%m%d_%H%M%S).sql.gz"

# 2. 跑迁移（按编号顺序，一个一个来）
ssh eu-tms "cd /var/www/germany-box-system/server && export \$(grep '^DATABASE_URL' .env | xargs) \
  && psql \"\$DATABASE_URL\" -f database/migrations/1XX_xxx.sql"

# 3. 确认库结构到位后再 push，让 CI 部署代码
```

反过来做的后果见踩坑 063：2026-08-15 三次 push 把需要新列的代码推上生产而迁移没跑，
建询价和批量导入 500 了约 14 小时，期间有真实用户在用，运营侧毫无察觉
（接口 500 只在 pm2 的 **error** 日志里，`/api/health` 照样 200）。

**判断生产上跑的是哪一版，看 `gh run list` 和服务器文件时间，不要靠"我有没有手工 scp"推断。**

### 后端手工部署（应急用，正常走 CI）
```bash
# 上传文件
scp -i ~/.ssh/id_ed25519 文件 root@47.83.241.117:/var/www/germany-box-system/server/

# 重启（必须删除重建，否则环境变量不更新）
# ⚠️ 一律用 ecosystem 配置启动，不要用裸的 pm2 start server/app.js。
#    裸命令起来的进程不带 time/merge_logs/日志路径设置，会把日志静默打回
#    ~/.pm2/logs/ 且没有时间戳，等于把 2026-08-16 的治理成果冲掉（踩坑 064）。
ssh eu-tms "cd /var/www/germany-box-system && pm2 delete germany-box-server \
  && pm2 start deploy/ecosystem.config.cjs --env production && pm2 save"
```

### 前端手工部署（应急用，正常走 CI）
```bash
# 构建
cd admin && npm run build

# 上传（先清旧资源）
ssh eu-tms "rm -rf /var/www/germany-box-system/admin/dist/assets/*"
scp -r admin/dist/* root@47.83.241.117:/var/www/germany-box-system/admin/dist/
```

### 部署后必查

```bash
gh run list --limit 3                     # CI 是否成功
curl -s -o /dev/null -w '%{http_code}' https://kalunasped.com/api/health   # 应为 200
ssh eu-tms "tail -40 /var/log/pm2/germany-box-error.log"                    # 关键：500 只在这里
```

**`/api/health` 200 不代表功能正常** —— 它走的是不碰业务表的路径。
`console.error` 走 stderr，进的是 `germany-box-error.log`，
out 日志里看不到（全局 CLAUDE.md 也记了这条）。

> **日志位置 2026-08-16 变过**（踩坑 064）：现在是 `/var/log/pm2/germany-box-{out,error}.log`，
> 两个实例合并写一份，每行带时间戳。旧路径 `~/.pm2/logs/germany-box-server-*-{0,1}.log`
> **已停止更新**，去那里 tail 会看到一个静止在 2026-08-16 06:09 的旧文件，
> 很容易把陈年报错当成刚发生的。日志由 pm2-logrotate 每天 0:00 或满 10M 切分、留 30 份。

### 官网部署
```bash
# 官网不在 CI/CD 流程里，改了必须手工 scp，否则线上不会变
# 覆盖前先 diff 一下线上那份，确认只差你要改的地方
scp Box-Cargo-Homepage原型图.html root@47.83.241.117:/var/www/germany-box-system/homepage/index.html
ssh eu-tms "cp /var/www/germany-box-system/homepage/index.html /var/www/germany-box-system/admin/dist/homepage.html"
```

---

## Nginx 路由规则

```
/                → 官网主页 (homepage.html)
/login, /orders  → 管理端 SPA (admin/dist/index.html)，管理端就在【根路径】
/admin/*         → 301 到去掉 /admin 前缀的根路径版本（/admin/ → /dashboard）
/customer/       → 客户门户 SPA
/carrier/        → 承运商门户 SPA
/api/*           → 后端 API (proxy to :3002)
/uploads/*       → 后端静态文件
```

> **管理端没有 `/admin` 前缀**：`admin/vite.config.ts` 是 `base:'/'`，`App.tsx` 的路由
> 也全是 `/dashboard`、`/orders` 这类无前缀路径，React Router 没设 basename。
> 历史上 nginx 给 `/admin/` 挂过 alias 返回同一份 index.html，结果 SPA 能加载、
> 侧边栏和登录态全正常，但前端路由匹配不到任何一条，内容区显示「页面不存在」——
> 2026-08-07 已改成 301。**别再给管理端加 `/admin` 前缀的 location**，
> 要加就得同时改 vite base + Router basename，三处必须一致（踩坑 007、058）。
>
> 配置源文件在 `deploy/nginx-eutms-app.conf`（线上 `/etc/nginx/snippets/eutms-app.conf`
> 的版本管理副本），**不在 CI 里，改了必须手工 scp 上去**。

---

## 数据库操作规范

- **禁止** `TRUNCATE ... CASCADE`、`DROP TABLE ... CASCADE`
- **禁止** `DELETE FROM table`（无 WHERE）
- 修改表结构前必须备份
- 所有业务数据通过 ERP 凭证引擎操作，不直接 SQL

---

## 账号凭据

> **仓库内一律不记录任何密码**（含测试/演示账号）。历史上 admin/siemens/speedtrans
> 三个账号的明文密码长期写在这里，且生产库用的就是这套密码——任何拿到仓库读权限的人
> 都等于拿到了生产超管。2026-08-02 已清除。

| 门户 | 账号 | 密码存放处 |
|------|------|-----------|
| 运营管理端 | admin | Frank 的密码管理器 |
| 客户门户 | siemens | Frank 的密码管理器 |
| 承运商门户 | speedtrans | Frank 的密码管理器 |

- 需要密码找 Frank 取，**不要**写进代码、文档、提交信息、issue 或聊天记录
- 本地初始化用的种子密码通过环境变量传入，不写死在脚本里
- 生产密码轮换后，密码管理器里的条目同步更新即可，本表不需要改

---

## 文件存储

- OSS Bucket: `box-cargo-files` (oss-cn-hongkong)
- CMR 文件路径: `cmr/{订单号}_{柜号}/文件名`
- 清关文件路径: `customs/{订单号}_{柜号}/文件名`
- OSS 不可用时回退到本地 `/var/www/germany-box-system/uploads/`

---

## SMTP 邮件

> 2026-08-02 随域名迁移从 Strato 切到 Resend，已完成并验证。

| 项 | 现状（2026-08-02 起） |
|----|---------------------|
| SMTP | `smtp.resend.com:587`，STARTTLS，用户名 `resend` |
| 发件人 | `EU-TMS <info@kalunasped.com>` |
| 收信 | Cloudflare Email Routing 转发 |

- 全部走环境变量（`SMTP_HOST/PORT/USER/PASS/FROM`），**换服务商不用改代码**
- 客户咨询通知自动发送到 `ADMIN_EMAIL`
- 改完 `.env` 必须删除重建才会重读环境变量，`pm2 restart` 无效（踩坑 005）。
  用上面「后端手工部署」那条 ecosystem 命令重启，别用裸 `pm2 start server/app.js`（踩坑 064）
- **验证发信一律以真人收件箱为准**，不能只看队列日志说"成功"（踩坑 012）
