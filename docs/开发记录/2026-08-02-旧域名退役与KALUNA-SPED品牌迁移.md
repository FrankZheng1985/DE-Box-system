# 旧域名 box-cargo.de 退役 与 KALUNA SPED 品牌迁移

> 日期：2026-08-02　模块：运维 / 品牌
> 状态：**阶段一已完成并上线；阶段二等待工商信息，未开工**

---

## 一、背景

box-cargo.de 虽然 nginx 已不再绑定该域名，但仍然能正常打开整个系统。
原因是配置里存在 `default_server` 兜底块（`server_name _`），任何没有匹配到
具体 server_name 的请求都会落进兜底块，于是 box-cargo.de 照样被服务，
只是用的是自签名 IP 证书，浏览器显示"不安全"。

同时确认：新域名 **kalunasped.com** 已启用并签发了 Let's Encrypt 证书，
生产 `.env` 的 CORS_ORIGIN / SMTP_FROM / ADMIN_EMAIL / APP_BASE_URL 均已切换完毕。

---

## 二、阶段一：旧域名断开（已完成并验证）

### 服务器改动

| 位置 | 操作 | 说明 |
|------|------|------|
| `/etc/nginx/sites-available/germany-box` | 追加 2 个 server 块 | 80 端口 `return 444`（直接关闭连接）；443 端口 `ssl_reject_handshake on`（拒绝 TLS 握手） |
| `germany-box.bak-20260802_004836-before-block-oldDomain` | 新建备份 | 改动前原配置，可回滚 |
| Let's Encrypt 证书 | `certbot delete --cert-name box-cargo.de` | 删除证书与续期任务。因 80 端口已返回 444，HTTP-01 验证必然失败，留着只会持续发送续期失败报警邮件 |

### 代码改动

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/modules/contact/routes.js` | 修改 | 管理员通知邮件的兜底收件人、来源文案、后台链接。后台链接改走 `APP_BASE_URL` 环境变量，以后换域名不必改代码 |
| `docs/generate-prd-docx.js` | 修改 | PRD「域名与路径」表格的四个入口地址 |

> 提交 `d6762d4`。此前提交 `2787352` 做过一轮旧域名清理，但遗漏了这两处。

### 验证结果（服务器本地实测，排除本机代理干扰）

| 目标 | 结果 |
|------|------|
| box-cargo.de HTTP | `000` 连接被关闭 |
| box-cargo.de HTTPS | `000` TLS 握手被拒 |
| www.box-cargo.de | 同样断开 |
| kalunasped.com | `200` 正常 |
| IP 直访 47.83.241.117 | `200` 正常 |
| 后端 API | 正常 |

### ⚠️ 仍未完成的一步（需 Frank 本人操作）

**DNS 解析仍指向本机**：`box-cargo.de` → `47.83.241.117`，`www` CNAME 过来。
需要去域名注册商（Strato）删除 A / CNAME 记录，才算真正断开。
服务器侧只能做到"拒绝服务"，删不掉别人的解析记录。

---

## 三、阶段二：KALUNA SPED 品牌迁移（进行中）

### 已完成：Logo 套件

采用方案 **C · Graphite & Vermilion**（石墨黑 + 朱砂红）。

- 主色 `#1C1C1E`　强调色 `#E5432E`　深色底强调色 `#FF6A55`
- 灰阶 `#6E6E73` / `#A1A1A6` / `#D2D2D7` / `#E5E5EA`

选型理由（货代品牌特有的硬约束）：
1. 要能上货车车身 —— 几何块面远距离可识别
2. 要能黑白打印 —— CMR 运单、报关单常是黑白激光打印，去色后靠形状仍成立
3. 16px favicon 不糊

产物：`brand/kaluna-sped/`（10 个文件，规格对标旧的 `brand/logo/`）

| 文件 | 尺寸 | 用途 |
|------|------|------|
| logo-full-light / dark | 480×200 | 文档封面、名片 |
| logo-horizontal-light / dark | 360×60 | 导航栏、文档页头 |
| logo-compact-light / dark | 200×40 | 移动端导航 |
| logo-icon-light / dark | 80×80 | 水印、头像 |
| logo-favicon | 32×32 | 浏览器标签页 |
| logo-email-signature | 300×80 | 邮件签名、文档页脚 |

> 旧的 `brand/logo/`（Box Cargo 版 10 个文件）**保留不动**，历史文件仍需引用。
>
> 技术要点：文字用 `<tspan dx>` 流式排布，不用固定 x 坐标。
> 初版按估算字宽写死坐标，渲染出来 KALUNA 和 SPED 挤成了 "KALUNASPED"。
> 已用 Chrome headless 实际渲染验证过明暗底、灰度打印、16px favicon 三种场景。

### ⛔ 阻塞：等待新公司工商信息

Frank 确认 **Kaluna Sped 是新注册公司，要完整替换法人主体**（不是仅换品牌名）。
以下信息缺失，缺一项则发票不合规、Impressum 违法，**在拿到之前不得改动相关代码**：

| 信息 | 用途 | 状态 |
|------|------|------|
| 完整法人名称（含 GmbH / UG (haftungsbeschränkt) 等法律形式后缀） | 发票、Impressum、CMR、合同 | ❌ 待补 |
| 注册地址 | Impressum、发票、页脚 | ❌ 待补 |
| HRB 商业登记号 + 登记法院（Amtsgericht） | Impressum 强制 | ❌ 待补 |
| USt-IdNr（DE 开头增值税识别号） | 发票强制，客户凭此抵扣进项税 | ❌ 待补 |
| Steuernummer 税号 | 发票 | ❌ 待补 |
| 法定代表人 Geschäftsführer 姓名 | Impressum 强制 | ❌ 待补 |
| IBAN / BIC | 发票收款信息 | ❌ 待补 |
| 运输经营许可号（EU-Lizenz / §3 GüKG Erlaubnis） | 官网资质、承运商对接 | ❌ 待补（如有） |

Logo 文件中凡涉及法人后缀处已留 `TODO` 注释，等信息到位后补入。

### 法律约束（务必遵守）

德国对以下三处有强制要求，**品牌名（Marke）不等于法人名（Firma）**：

| 位置 | 依据 | 违反后果 |
|------|------|----------|
| 官网 Impressum | §5 TMG/DDG，须标真实法人名、HRB 号、法定代表人 | 竞争对手可发律师警告信（Abmahnung）索赔 |
| 发票 | §14 UStG，须完整正确法人名 + 税号 | 客户无法抵扣进项税，税务稽查风险 |
| CMR 运单 | 承运人 / 发货人为法律责任主体 | 出险时保险与索赔的主体认定问题 |

### ⚠️ 历史发票不可追溯改名

已开给客户的 `Box Cargo Service GmbH` 发票是**已生效的税务凭证**，
只能保持原样。发票模板需按**开票日期**区分主体，禁止批量刷历史数据。

### 待办：代码层改名范围（尚未开工）

| 位置 | 内容 |
|------|------|
| `Box-Cargo-Homepage原型图.html` | title / meta / og / 关于我们 / 地址块 / 页脚版权 / 三语 i18n 文案 |
| `admin/src/pages/InvoiceTemplates.tsx` | 发票模板品牌信息 |
| `server/modules/contact/routes.js` | 邮件主题 `[Box Cargo]`、邮件模板抬头 `BOX · CARGO` |
| `docs/generate-prd-docx.js` | PRD 封面与页眉法人名 |
| 三端 favicon / Logo 引用 | admin / customer-portal / carrier-portal |

---

## 四、并行开发提醒

本次期间主线出现另一对话的提交（`2787352`、`8b9706c`、`e2d37c9` 等域名与邮件迁移相关）。
经确认该对话在做**新功能开发**，不冲突。
但品牌改名会大面积改动官网原型图与三端，**开工前须再次确认无人同时改这些文件**，
避免重演踩坑 014 / 015 的「rebase 无文本冲突却把主线修复拼回旧版本」事故。
