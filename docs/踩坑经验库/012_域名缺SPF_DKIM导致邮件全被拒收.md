# 踩坑记录 012：域名缺 SPF/DKIM 但 DMARC 配了 p=reject，邮件全被收件方丢弃

## 问题现象

P0 把邮件链路修通后，系统日志显示发送成功：

```
[邮件队列] 本轮处理 1 封：成功 1，失败 0
email_status = SENT, email_attempts = 1, email_sent_at = 2026-08-01 20:44:10
```

但收件人（iCloud 邮箱）**什么都没收到，垃圾箱里也没有**。

## 排查过程

先确认发信这一端到底有没有问题 —— 打开 nodemailer 的 debug 抓 SMTP 全过程：

```
S: 235 2.7.0 OK Authenticated
C: MAIL FROM:<info@box-cargo.de>
S: 250 2.1.0 Sender ok
C: RCPT TO:<fengzheng9@icloud.com>
S: 250 2.1.5 Recipient ok
S: 250 2.0.0 OK queued with id q52360271Cnbvpx     ← Strato 明确收下了
accepted: [ 'fengzheng9@icloud.com' ]   rejected: []
```

**发信端完全正常**，问题在收件方。于是查域名的邮件认证 DNS：

```bash
dig +short TXT box-cargo.de            # 空 —— 一条 TXT 都没有，即没有 SPF
dig +short TXT _dmarc.box-cargo.de     # "v=DMARC1;p=reject;"
dig +short TXT strato._domainkey.box-cargo.de   # 空 —— 没有 DKIM
```

## 根本原因

**这是最糟的组合：DMARC 开了最严格的 `p=reject`，但 SPF 和 DKIM 一个都没配。**

DMARC 的判定逻辑是：SPF 或 DKIM **至少一个通过且与发件域对齐**，才算 DMARC 通过。

- 没有 SPF → SPF 判定 `none`
- 没有 DKIM → DKIM 判定 `none`
- → DMARC 必定失败
- → 策略 `p=reject` 明确告诉收件方："认证失败的邮件请直接拒收"

Apple/iCloud、Gmail 这类严格执行 DMARC 的服务商会**直接丢弃，连垃圾箱都不放**。
等于域名所有者亲手给自己下了封杀令，而且发信方看到的是"发送成功"，毫无察觉。

## 正确配置（以 Strato 为例）

```
# 1. SPF —— TXT 记录，主机名 @ 或留空
v=spf1 include:_spf.strato.com -all

# 2. DMARC —— TXT 记录，主机名 _dmarc
#    先用 p=none 观察，确认 SPF/DKIM 都通过后再收紧到 p=reject
v=DMARC1; p=none; rua=mailto:你的邮箱

# 3. DKIM —— 在 Strato 邮箱控制面板开启，会自动下发 DNS 记录
```

**怎么确认 include 值是对的**（别照抄网上的，各家不一样）：

```bash
# 看 include 覆盖哪些 IP 段
dig +short TXT _spf.strato.com
# → v=spf1 ip4:81.169.146.128/25 ip4:85.215.255.0/24 ...

# 看实际出站服务器 IP 落不落在里面
dig +short A ap4-p00-ob.smtp.rzone.de
# → 81.169.146.243 / 85.215.255.40 / 85.215.255.41   ✅ 都在范围内
```

注意 `_spf.strato.de` 和 `spf.strato.de` **都不存在**，只有 `_spf.strato.com` 是对的。

## 防护规则

1. **配 DMARC 之前先配 SPF/DKIM。** 顺序反了（先 `p=reject` 后配认证）等于全域断邮。
2. **DMARC 上线一律从 `p=none` 开始**，挂 `rua=` 收报告，确认认证都通过了再逐步收紧到
   `p=quarantine` → `p=reject`。
3. **"SMTP 返回 250 = 发送成功"是错觉。** 250 只代表你的发信服务器收下了，
   不代表收件方会投递。验证邮件功能必须**真人去收件箱确认**，不能只看程序日志。
4. **新域名上线第一天就要把 SPF/DKIM/DMARC 配齐**，别等到发现收不到才查。
5. SPF 的 include 值要**用 dig 实际验证**覆盖了自己的出站 IP，不要凭印象抄。

## 后续

2026-08-01 Frank 决定弃用 box-cargo.de，改用 IP 过渡，等新域名注册。

**2026-08-02 已彻底解决**：新域名 `kalunasped.com` 启用，邮件链路整体重建 ——
发信改 **Resend**、收信改 **Cloudflare Email Routing**，SPF / DKIM / DMARC
第一天就配齐，收发两个方向都实测真实送达。
详见 `docs/开发记录/2026-08-02-新域名kalunasped启用.md`。

**这次做对的几件事，正是本篇教训的反面：**

1. **先配认证，再谈收紧**。新域名 DMARC 一上来就是 `p=none`，
   等真实发信中 SPF/DKIM 稳定通过（1-2 周）再依次收紧到
   `p=quarantine` / `p=reject`。本篇的事故就是顺序反了。
2. **SPF 只能有一条**。开 Cloudflare Email Routing 时它也要求加一条 SPF，
   事后专门 dig 确认根域仍然只有一条（是替换不是新增）。两条并存等于没配。
3. **不要凭印象抄 include**。Resend 把 Return-Path 放在 `send` 子域，
   所以根域**不需要** include Resend —— 抄错反而会让 SPF 记录变长变乱。
4. **以真人收件箱为准**。两封测试信都是让收件人亲自确认收到的，
   没有停在"队列日志显示 SENT"。

> ⚠️ 新域名首次发信落进收件方垃圾箱是**正常现象**（零发信信誉），
> 和本篇的"静默丢弃、垃圾箱都没有"是两回事，别误判成认证又出问题了。
> 前者靠时间和正常发信量自然好转，后者必须改 DNS。

## 涉及文件

| 文件 | 说明 |
|------|------|
| （无代码改动） | 纯 DNS 配置问题，代码侧 P0 已修好 |
| `server/utils/email-queue.js` | 发信逻辑本身验证正常 |
| `.claude/CLAUDE.md` | 域名迁移过渡期清单 |
