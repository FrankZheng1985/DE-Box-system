# 026 · 给表加敏感字段，会顺着 `SELECT *` 漏给所有人

**日期**：2026-08-02（P6 服务商询价开发中发现）
**涉及模块**：报价 quotation / 服务商询价 carrier-inquiry

---

## 问题现象

P6 给 `quotations` 表加了两个成本字段：

```sql
ALTER TABLE quotations ADD COLUMN carrier_cost NUMERIC(12,2);
ALTER TABLE quotations ADD COLUMN carrier_cost_source_id UUID;
```

字段本身没问题，权限也挂好了（`carrier_inquiry:view` 才能读服务商询价接口）。
但是**只加字段不动任何接口，成本就已经泄露了**：

| 接口 | 谁能调 | 会不会带出成本 |
|------|--------|---------------|
| `GET /quotations`（列表） | 运营专员、**客户门户账号** | 会（`SELECT q.*`） |
| `GET /quotations/:id`（详情） | 运营专员、**客户门户账号** | 会（`SELECT q.*`） |
| `POST /quotations`（创建返回） | 运营专员 | 会（`RETURNING *`） |
| `POST /:id/new-version` | 运营专员 | 会（`RETURNING *`） |

也就是说：**客户能在浏览器 Network 面板里看到我们付给服务商多少钱**，
运营专员（刻意不给成本权限的岗位）在前端不显示、但接口返回体里照样有。

前端"不显示"完全挡不住这件事 —— F12 一开就看见了。

---

## 根本原因

1. 业务查询习惯写 `SELECT q.*` / `RETURNING *`，**新增的列会自动被带进所有返回值**，
   加字段的人不会收到任何提示。
2. 权限体系防的是"能不能调这个接口"，防不了"这个接口顺手多返回了一列"。
   `quotations` 这类表是**多身份共读**的（运营 + 客户门户），
   一张表里混着"给客户看的价"和"不给客户看的成本"，字段级别的边界必须自己划。

---

## 解决方案

在模块出口处统一剥离，而不是去每条 SQL 里挑列（挑列会漏，而且以后加字段还得再挑一遍）：

```js
// server/modules/quotation/routes.js
const COST_FIELDS = ['carrier_cost', 'carrier_cost_source_id']

async function canSeeCarrierCost(req) {
  const userType = req.user.userType || req.user.roleCode
  if (userType !== 'OPERATOR') return false          // 客户/承运商一律不给
  return roleHasAnyPermission(req.user.roleCode, ['carrier_inquiry:view'])
}

async function stripCarrierCost(req, payload) {
  if (await canSeeCarrierCost(req)) return payload
  const strip = (row) => {
    if (!row || typeof row !== 'object') return row
    const copy = { ...row }
    for (const field of COST_FIELDS) delete copy[field]
    return copy
  }
  return Array.isArray(payload) ? payload.map(strip) : strip(payload)
}
```

然后**每个返回报价行的地方都过一道**：

```js
res.json({ code: 200, message: 'success', data: await stripCarrierCost(req, result.rows) })
```

写入方向同样要拦 —— 不能只拦读：

```js
// 没权限的人即使自己构造请求体，成本也写不进去
const costAllowed = await canSeeCarrierCost(req)
const carrierCost = costAllowed ? toNumberOrNull(req.body.carrierCost) : null
```

---

## 防护规则

1. **给一张"多身份共读"的表加敏感字段（成本、利润、内部备注、信用）时，
   必须同时检查该表所有 `SELECT *` / `RETURNING *` 的出口**，
   一个个确认要不要剥离。列一遍接口清单，别凭印象。
2. 剥离逻辑**集中一处**（一个 `COST_FIELDS` 常量 + 一个 `strip` 函数），
   并在常量旁边写清楚"以后加敏感字段记得加进来"。
3. **读要拦，写也要拦**。只拦读会让没权限的人把脏数据写进去。
4. 冒烟测试里必须有断言，而且要断言**字段不存在**而不是"值为 null"：
   ```js
   check('运营专员读详情看不到 carrier_cost',
     staffDetail.status === 200 && !('carrier_cost' in (staffDetail.json?.data || {})))
   ```
5. 前端隐藏不算防护，只是"少露一层"。**边界永远在后端**（和踩坑 016 是同一个道理）。

---

## 涉及文件

- `server/database/migrations/110_carrier_inquiry.sql` — 加字段的地方
- `server/modules/quotation/routes.js` — `COST_FIELDS` / `canSeeCarrierCost` / `stripCarrierCost`
- `server/scripts/test-carrier-inquiry.js` — 【6】组断言
