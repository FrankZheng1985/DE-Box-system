# 054 草稿报价只靠前端 filter 藏起来，接口照样把金额返回给客户

## 问题现象

客户门户「我的报价」页面上看不到草稿报价，看起来一切正常。

但客户带着**自己的**登录 token 直接调接口：

```bash
curl -H "Authorization: Bearer <客户自己的token>" \
     'https://kalunasped.com/api/v1/quotations?pageSize=100'
```

返回的列表里带着 `status: "DRAFT"` 的报价，`total_price` 一分不少 ——
那是运营还在编、还没点「发送」的价，客户提前看到了。

同一个口子还有三处：报价详情 `GET /quotations/:id`、版本列表
`GET /quotations/:id/versions`、询价详情 `GET /inquiries/:id` 带出的报价子列表。

## 根本原因

草稿的过滤**只写在前端**：

```tsx
// customer-portal/src/pages/MyQuotations.tsx
setQuotations((res.data || []).filter((q) => q.status !== QUOTATION_STATUS.DRAFT))
```

后端 `GET /quotations` 只按 `client_id` 收窄了租户范围（踩坑 016 修过一轮），
**从来没有按状态收窄**。租户隔离和"这条记录该不该给他看"是两件事，
上一轮只补了前者，后者被前端的 `.filter` 掩盖了三个月没人发现。

浏览器里的过滤挡的是"眼睛"，挡不住 curl / Postman / 改前端代码 / 抓包，
所以它从来不是安全边界。

## 错误代码

```js
// server/modules/quotation/routes.js —— 只过滤了租户，没过滤状态
if (req.user.userType === 'CLIENT' && req.user.linkedEntityId) {
  params.push(req.user.linkedEntityId); sql += ` AND q.client_id = $${++idx}`
}
```

```js
// 详情：只校验"是不是他家的"，没校验"这张单发出来了没有"
if (userType === 'CLIENT' && quotation.client_id !== req.user.linkedEntityId) {
  res.status(403).json({ code: 403, message: '无权访问该报价单', data: null })
  return null
}
return quotation      // ← DRAFT 就这么回给客户了
```

## 正确代码

状态清单定义在一处，四个查询点共用：

```js
// server/modules/quotation/service.js
export const CLIENT_HIDDEN_STATUSES = [QUOTATION_STATUS.DRAFT]
```

```js
// 列表：判断条件里【不带】linkedEntityId ——
// 绑定为空时应该查不到东西，而不是跳过过滤返回全部（失效方向必须是拒绝）
if (isClientUser(req)) {
  params.push(req.user.linkedEntityId); sql += ` AND q.client_id = $${++idx}`
  params.push(CLIENT_HIDDEN_STATUSES); sql += ` AND q.status <> ALL($${++idx}::text[])`
}
```

```js
// 详情：客户读自己公司的草稿，一律按"不存在"回，不回 403
// （403 等于告诉对方"这张单确实存在"）
if (userType === 'CLIENT' && CLIENT_HIDDEN_STATUSES.includes(quotation.status)) {
  res.status(404).json({ code: 404, message: '报价不存在', data: null })
  return null
}
```

> `<> ALL($n::text[])` 的 `::text[]` 不能省：node-pg 传数组时类型是 unknown，
> 不显式转型 Postgres 可能推断不出来直接报错。

## 防护规则

1. **前端的 `.filter` / `v-if` / 条件渲染永远不是安全边界。**
   凡是"这条记录客户不该看到"的判断，必须同时写在后端 SQL 里；
   前端那行可以留着当双保险，但要写注释说明真正挡它的是后端。
2. 写门户能调的接口时，问**两个**问题，不是一个：
   - 「别家公司 curl 会返回什么？」（租户隔离，架构规则 8）
   - 「**他自己家的**、但还没发出去 / 内部状态的记录，会不会一起返回？」（本条）
3. **同一份数据可能有多个出口，改一个不够。** 本例报价金额有 4 个出口：
   列表、详情、版本列表、询价详情的子列表。加过滤前先
   `grep -rn "FROM quotations" server/modules` 把出口找全。
4. 状态白/黑名单**定义在一处并导出**（本例 `CLIENT_HIDDEN_STATUSES`），
   跨模块 import 复用，不要在四个地方各写一遍 `'DRAFT'` 字面量。
5. 验证要**用真实 token 打真实接口**（curl / 脚本），不能看页面上没显示就算过。
   本次把常量临时改成 `[]` 跑了一遍对照，确认改前确实泄露、改后确实挡住。

## 涉及文件

- `server/modules/quotation/service.js`（新增 `CLIENT_HIDDEN_STATUSES`）
- `server/modules/quotation/routes.js`（列表 / 详情 / 版本列表）
- `server/modules/inquiry/routes.js`（询价详情的报价子列表、列表的 `quotation_count`）
- `customer-portal/src/pages/MyQuotations.tsx`（前端过滤降级为双保险，改注释）
- 同类正确范例：`server/modules/open-api/service.js` 的
  `status NOT IN ('DRAFT', 'CANCELLED')` —— 开放 API 一开始就做对了
