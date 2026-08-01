# 新域名 kalunasped.com 启用

**日期**：2026-08-02
**模块**：运维 / nginx / 证书 / CORS / 官网
**状态**：✅ **网站侧与邮件侧均已完成并验证**

---

## 背景

旧域名 `box-cargo.de` 于 2026-08-01 弃用，服务器改为纯 IP 访问过渡
（详见上一版 CLAUDE.md 的「域名迁移过渡期」章节）。
2026-08-02 新域名 `kalunasped.com` 注册完成，**注册与 DNS 都在 Cloudflare**
（旧域名在 Strato），本次完成网站侧全部迁移。

---

## 已完成

### 1. DNS（Cloudflare）

| 类型 | 名称 | 值 | 代理 |
|------|------|-----|------|
| A | `@` | 47.83.241.117 | **仅 DNS（灰云）** |
| A | `www` | 47.83.241.117 | **仅 DNS（灰云）** |

**代理必须关**：开橙云后 Cloudflare 挡在源站前面，Let's Encrypt 的 HTTP-01
验证拿不到 `/.well-known/acme-challenge/`，证书签发和后续自动续期都会失败。

### 2. SSL 证书

```bash
certbot certonly --webroot -w /var/www/certbot \
  -d kalunasped.com -d www.kalunasped.com --cert-name kalunasped.com
```

签发成功，有效期到 **2026-10-30**，certbot 已自动配置续期任务。

为让 HTTP-01 验证走得通，在 nginx 的 80 端口块里加了明文例外：

```nginx
location ^~ /.well-known/acme-challenge/ {
    root /var/www/certbot;
    default_type "text/plain";
}
location / { return 301 https://$host$request_uri; }
```

**这段例外不能删** —— 删了续期就失败，因为其余请求全被 301 到 HTTPS。

### 3. nginx 重构

原来只有一个 `server_name _` 的块。现在拆成三块，公共配置抽成 snippet
避免两处各改一遍：

| 块 | 作用 |
|----|------|
| `listen 80 default_server` | ACME 例外 + 其余 301 到 HTTPS |
| `listen 443 ssl http2` + `server_name kalunasped.com www.kalunasped.com` | 正式域名，Let's Encrypt 证书 |
| `listen 443 ssl http2 default_server` + `server_name _` | **IP 直访应急回退**，自签名证书 |

公共部分（root / gzip / `/api` / `/socket.io` / `/uploads` / 三端 SPA / 官网首页）
放在 `/etc/nginx/snippets/eutms-app.conf`，两个 443 块各自 `include`。

> ⚠️ 本机 nginx 是 1.24，**不支持独立的 `http2 on;` 指令**（那是 1.25.1 起才有的），
> 必须写成 `listen 443 ssl http2;`。第一版写错了，被 `nginx -t` 在 reload 前拦下。

### 4. 代码改动

| 文件 | 说明 |
|------|------|
| `server/app.js` | `CORS_ORIGIN` 改为支持逗号分隔多来源；cors 与 socket.io 共用同一套来源判定，拒绝时打日志 |
| `server/modules/quotation/email.js` | `getBaseUrl()` 只取第一个来源 |
| `admin/src/pages/Login.tsx` | 两个 `mailto:` → `info@kalunasped.com` |
| `Box-Cargo-Homepage原型图.html` | 联系邮箱 → `info@kalunasped.com` |
| `server/env.example` | 同步新域名与多来源写法 |

**为什么 CORS 要支持多来源**：域名和 IP 回退都得能调 API，只写一个另一个就被浏览器拦。

**`getBaseUrl()` 那处是本次改动自己带出来的坑**：它原本是
`APP_BASE_URL || CORS_ORIGIN`，CORS_ORIGIN 变成逗号分隔后，
P4 报价确认邮件的链接会拼成 `https://a,https://b/api/...` 这种废地址。
改成 `raw.split(',')[0]`，并在注释里写明 APP_BASE_URL 只允许单值。

### 5. 生产环境变量

```
CORS_ORIGIN=https://kalunasped.com,https://www.kalunasped.com,https://47.83.241.117
APP_BASE_URL=https://kalunasped.com
```

（改前已备份 `.env.bak-20260802_000403`；CI/CD 部署会重启 PM2，环境变量随之生效。）

### 6. 官网

官网**不在 CI/CD 流程里** —— workflow 只做
`homepage/index.html` → `admin/dist/homepage.html` 的拷贝，源文件本身要手工 scp。
所以改了仓库里的 `Box-Cargo-Homepage原型图.html` 线上不会变。

本次覆盖前先把线上那份拉下来 diff，确认除邮箱外 2216 行完全一致，
并备份了 `homepage/index.html.bak-*` 才覆盖。

---

## 生产验证结果

| 验证项 | 结果 |
|--------|------|
| `https://kalunasped.com/` | 200 |
| `https://www.kalunasped.com/` | 200 |
| `/admin/` `/customer/` `/carrier/` | 均 200 |
| 证书 | `CN=kalunasped.com`，签发者 Let's Encrypt，`SSL certificate verify ok`，浏览器不再弹警告 |
| 新域名下 API | `POST /api/v1/auth/login` 200 |
| IP 直访回退 | `https://47.83.241.117/` 200（自签名，需 `-k`） |
| 官网联系邮箱 | 线上已是 `info@kalunasped.com` |
| 生产环境变量 | `CORS_ORIGIN` / `APP_BASE_URL` 已生效 |

> reload 后第一次请求根路径返回过一次 HTTP 000，重测三次均 200、TLS 握手 37ms，
> 属 reload 瞬时抖动，非配置问题。

---

## 邮件（已完成）

### 方案：Resend 发信 + Cloudflare Email Routing 收信

原计划「继续用 Strato 加个邮箱」不成立 —— 新域名在 Cloudflare 而非 Strato。
实测确认 Strato 不认识这个域名：

```
info@kalunasped.com  → 550 5.1.2 No such mailbox
info@box-cargo.de    → 250 Recipient ok
```

最终方案：

| 方向 | 服务 | 说明 |
|------|------|------|
| 发信 | **Resend**（爱尔兰 eu-west-1，EU 数据存放） | 标准 SMTP 中继，**后端代码一行没改**，只换环境变量 |
| 收信 | **Cloudflare Email Routing** | `info@kalunasped.com` 转发到实际邮箱 |

### 最终 DNS（逐条 dig 核实）

| 记录 | 值 | 用途 |
|------|-----|------|
| MX `@` | `8 route1` / `17 route2` / `71 route3 .mx.cloudflare.net` | 收信 |
| TXT `@` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | **有且仅有一条 SPF** |
| TXT `send` | `v=spf1 include:amazonses.com ~all` | Resend 发信的 Return-Path 域 |
| MX `send` | `10 feedback-smtp.eu-west-1.amazonses.com` | Resend 退信处理 |
| TXT `resend._domainkey` | RSA 公钥 | Resend 的 DKIM |
| TXT `cf2024-1._domainkey` | RSA 公钥 | Cloudflare 转发的 DKIM |
| TXT `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:info@kalunasped.com` | 2026-08-02 已从 p=none 收紧一档 |

**⚠️ 两个 DKIM 选择器共存是正常的**（`resend._domainkey` 与 `cf2024-1._domainkey`），
选择器不同互不干扰。但**SPF 必须只有一条** —— 开 Email Routing 时 Cloudflare
会要求加一条 SPF，它的值和手工设的一致，是替换而非新增，事后 dig 确认过只有一条。

**为什么根域 SPF 不用写 Resend**：Resend 把 Return-Path 放在 `send` 子域，
SPF 检查针对的是那个子域，根域留给 Cloudflare Email Routing 即可。
DMARC 对齐仍然通过：`send.kalunasped.com` 与根域同组织域（relaxed 对齐），
DKIM 签的是 `d=kalunasped.com`（直接对齐）。

### 生产 SMTP 配置

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_SECURE=false          # 587 走 STARTTLS，不是隐式 TLS
SMTP_USER=resend           # Resend 的用户名固定是 resend
SMTP_PASS=<API key>        # Sending access 权限、限定 kalunasped.com 域
SMTP_FROM=EU-TMS <info@kalunasped.com>
ADMIN_EMAIL=info@kalunasped.com
```

API key 由 Frank 在自己终端用 `sed` 直接写进服务器 `.env`，**没有经过对话记录**。
改完 `pm2 delete all && pm2 start`（踩坑 005）。

### 验证结果

| 验证项 | 结果 |
|--------|------|
| 服务器 → smtp.resend.com | 587 / 465 均可达，TLS 正常 |
| SMTP 认证 | ✅ 服务器上实测 login 通过 |
| PM2 重建 | ✅ 两进程在线，重启计数归零 |
| **发信（真实投递）** | ✅ **收件人确认收到**（详见下方「进垃圾箱」） |
| **收信（Cloudflare 转发）** | ✅ **收件人确认收到** —— 发往 `info@kalunasped.com` 的信经 Cloudflare 转发到达 iCloud |

> 两封测试邮件（一封发给 iCloud、一封发给 `info@kalunasped.com` 再转发到 iCloud）
> **都实际收到了**，收发两个方向均已闭环验证。

### ⚠️ 两封测试邮件都进了 iCloud 垃圾箱

这和旧域名的问题**性质完全不同**，不要混为一谈：

| | 旧域名 box-cargo.de | 新域名 kalunasped.com |
|---|---|---|
| 结果 | **静默丢弃**，垃圾箱都没有 | **投递成功**，进了垃圾箱 |
| 原因 | DMARC `p=reject` 但 SPF/DKIM 一个没配，认证必然失败 | 认证通过，但域名当天注册、零发信信誉 |
| 能否修 | 配 DNS 即可 | 只能靠时间和正常发信量养 |

新域名首发进垃圾箱是常态。处理方式：

1. 收件人点「非垃圾邮件」或把邮件拖回收件箱（只影响该收件人自己的过滤器，对客户无效）
2. 随着系统正常发报价单、账单提醒，信誉会逐步建立，一般几天到两三周
3. **DMARC 已于 2026-08-02 收紧到 `p=quarantine`**（见下节）

### DMARC 收紧节奏

**2026-08-02 已完成第一档：`p=none` → `p=quarantine`。**

之所以敢在没看到聚合报告时就走这一档，是因为**此刻它的风险接近于零**：

| 认证实际情况 | `p=quarantine` 的后果 |
|---|---|
| 通过 | 策略永不触发，无影响 |
| 有问题 | 收件方丢垃圾箱 —— **但邮件本来就在垃圾箱**，不会更糟 |

而"域名配了强制策略"本身对收件方是个正面信任信号，对养信誉有微弱帮助。
收紧后实测又发了一封，正常送达，没有误伤。

**⚠️ `p=reject` 完全是另一回事，还没做，条件如下：**

- 等 1-2 周，收到几份 DMARC 聚合报告（`rua` 指向 `info@kalunasped.com`，
  经 Cloudflare Email Routing 转发，现在收得到了）
- 报告里 SPF 和 DKIM 的 pass 率都是 100%
- 满足后才改成 `p=reject`

认证一旦有问题，`p=reject` 是让收件方**直接拒收** —— 就是旧域名 box-cargo.de
死掉的那个方式。**没看过聚合报告就上 reject 等于拿生产邮件赌**（踩坑 012）。

---

## 遗留

1. **DMARC 现为 `p=quarantine`**（2026-08-02 收紧）。**下一档 `p=reject` 尚未做**，
   条件见上节「DMARC 收紧节奏」：必须先看到聚合报告确认 SPF/DKIM pass 率 100%。
2. **旧域名 box-cargo.de**：仍在 Strato，DNS 仍指向本机；nginx 域名块只认
   kalunasped.com，访问它会落到 IP 那个 default_server（自签名证书，会弹警告）。
   它的 Let's Encrypt 证书 2026-09-07 到期、续期会失败，确认不再需要后可
   `certbot delete --cert-name box-cargo.de` 清掉。
3. **Resend API key 权限**：已限定为 Sending access + 仅 kalunasped.com 域。
   该 Resend 账号下还有其它项目（railway-prod / shipglobal-prod / solo-ai-team 等），
   不要图省事换成 Full access + All domains。
4. 验证用的两条 notifications 测试记录（`user_id` 为 NULL 的对外邮件行）留在库里，
   不影响任何人的站内信列表，作为链路验证的痕迹保留。
