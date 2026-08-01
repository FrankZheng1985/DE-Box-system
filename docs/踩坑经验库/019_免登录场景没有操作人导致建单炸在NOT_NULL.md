# 019 免登录场景没有"操作人"，建单直接炸在 NOT NULL 上

## 问题现象

P4 做"报价邮件里的确认链接"时，客户点「同意报价」→ 后端要自动建单 →
凭证引擎直接抛：

```
error: null value in column "created_by" of relation "documents"
       violates not-null constraint
```

代码逻辑完全正确、单元测试也过（token 签发、校验、单次使用全对），
**只有把整条链路真跑一遍才会撞上**。

## 根本原因

系统里所有写操作都隐含一个前提：**有一个登录用户**。
`documents.created_by` 是 `NOT NULL REFERENCES users(id)`，
`orderService.createOrder(client, data, userId)` 的 userId 一路传进凭证引擎。

但邮件确认链接是**全站唯一没有登录态**的入口 —— 客户从邮箱点进来，
`req.user` 根本不存在。我按"没有登录用户就传 null"写：

```js
// ❌ 免登录场景传 null，一路传到 NOT NULL 列上
order = await createOrderFromQuotation(client, quo, null)
```

这类问题的普遍形态是：**新增一个"没有人"的执行路径，
撞上老代码里"一定有人"的假设**。定时任务、Webhook、开放 API 都会踩。
（同一个项目里，过账期间的定时任务就因为往 UUID 列写 '系统自动' 而
常年失败，见 cron-jobs.js 里的注释 —— 同一类病，不同表现。）

## 正确做法

不要伪造身份，也不要为此放开 NOT NULL，而是**找一个语义上说得通的真实用户**：

```js
/**
 * 免登录场景以谁的身份建单
 * 顺序：开这张报价的运营 → 任意在职系统管理员 → 抛错
 */
async function resolveActingUser(client, quotation) {
  if (quotation.created_by) {
    const owner = await client.query(
      `SELECT id FROM users WHERE id = $1 AND is_active = true`, [quotation.created_by])
    if (owner.rows.length > 0) return owner.rows[0].id
  }
  const admin = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.role_code = 'sys_admin' AND u.is_active = true
     ORDER BY u.created_at LIMIT 1`)
  if (admin.rows.length > 0) return admin.rows[0].id
  throw new Error('系统没有可用的操作人账号，无法自动建单')
}

const actingUserId = userId || await resolveActingUser(client, quo)
```

"开这张报价的运营"是最合适的人选：业务上这单本来就是他跟的，
而且是真实用户、可追溯。

**客户本人的动作另外留痕**，不要靠 created_by 表达：
- `quotations.client_response_at` / `client_response_note`
- `quotation_response_tokens.used_ip` / `used_action` / `sent_to`

## 防护规则

1. **新增任何"没有登录用户"的执行路径**（邮件链接、定时任务、Webhook、开放 API）时，
   先把这条路径上会写到的表列一遍，检查哪些列是 `NOT NULL REFERENCES users(id)`。
2. **不要为了迁就免登录场景去放开 NOT NULL**。审计列变成可空，
   等于全系统所有记录都失去"谁干的"这个保证，代价远大于收益。
3. **不要伪造一个"系统用户"塞进去**，除非你真的在 users 表里建了这么一行并明确它的语义。
   往 UUID 列写 '系统自动' 这种字符串一定会炸。
4. **单元测试过 ≠ 链路通**。token 的生成/校验/过期都单独测过并全绿，
   问题出在"拿到 token 之后要干的那件事"上。写完必须端到端跑一次完整业务链路。

## 涉及文件

| 文件 | 说明 |
|------|------|
| `server/modules/quotation/service.js` | 新增 `resolveActingUser()`，`applyClientDecision` 里 `userId \|\| resolveActingUser(...)` |
| `server/modules/quotation-response/routes.js` | 免登录入口，调用时 userId 传 null |
| `server/core/document-engine.js` | `documents.created_by` NOT NULL 的消费方 |
