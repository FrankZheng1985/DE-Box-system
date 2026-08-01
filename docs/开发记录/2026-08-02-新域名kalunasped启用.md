# 新域名 kalunasped.com 启用

**日期**：2026-08-02
**模块**：运维 / nginx / 证书 / CORS / 官网
**状态**：✅ **网站侧已完成上线并验证**；⚠️ **邮件侧待办**（见「遗留」）

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

## 遗留：邮件侧尚未完成

### 方案调整的原因

原计划「继续用 Strato 加个邮箱」不成立 —— 新域名在 Cloudflare 而非 Strato。
实测确认 Strato 还不认识这个域名：

```
info@kalunasped.com  → 550 5.1.2 No such mailbox
info@box-cargo.de    → 250 Recipient ok
```

2026-08-02 Frank 定的新方案：

- **发信**：Brevo（EU 公司，SMTP 中继，**代码不用改**只换 SMTP_* 环境变量）
- **收信**：Cloudflare Email Routing，`info@kalunasped.com` 转发到实际邮箱

### 当前 DNS 状态（已 dig 核实）

| 记录 | 值 | 说明 |
|------|-----|------|
| MX | `5 smtpin.rzone.de` | **指向 Strato，改用 Brevo 后要换成 Cloudflare Email Routing 的** |
| SPF | `v=spf1 include:_spf.strato.com -all` | **要换成合并后的值** |
| DMARC | `v=DMARC1; p=none; rua=mailto:info@kalunasped.com` | ✅ 正确地从 p=none 起步，保留 |

### ⚠️ 一个域名只能有一条 SPF 记录

Cloudflare Email Routing 和 Brevo 各自会让你加一条 SPF，
**两条并存 SPF 直接判定失效**，必须合并：

```
v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com -all
```

### 待办清单

**Frank（我没有这些后台的权限）**
1. 注册 Brevo，在其后台添加并验证 `kalunasped.com`，拿到 SMTP 用户名 + API key
2. Cloudflare 开启 Email Routing，建 `info@kalunasped.com` 转发规则
3. 按 Brevo 的提示加 DKIM 记录；**SPF 合并成上面那一条**；MX 换成 Cloudflare Email Routing 的
4. DMARC 保持 `p=none`，等 SPF/DKIM 都验证通过再收紧到 `p=reject`

**我（拿到 Brevo 凭据后）**
5. 改生产 `.env` 的 `SMTP_HOST/PORT/USER/PASS/FROM/ADMIN_EMAIL`
6. `pm2 delete all && pm2 start`（踩坑 005：改环境变量必须删除重建）
7. 用 P4 的邮件队列真发一封，**以真人收件箱确认收到**，不能只看日志说"成功"（踩坑 012）

### 旧域名 box-cargo.de 的处理

- 仍在 Strato，DNS 仍指向本机；nginx 域名块只认 kalunasped.com，
  访问它会落到 IP 那个 default_server（自签名证书，会弹警告）
- 它的 Let's Encrypt 证书 2026-09-07 到期，续期会失败。
  确认不再需要后可 `certbot delete --cert-name box-cargo.de` 清掉
- `info@box-cargo.de` 在 Brevo 切换完成前仍是生产的发信账号
  （但因为它自己的 SPF/DKIM 从来没配过，实际发出去也会被丢弃 —— 踩坑 012）
