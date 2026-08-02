# 踩坑记录 001：Express 路由顺序导致 500 错误

## 问题现象
访问 `/api/v1/quotations/stats`、`/api/v1/cmr/stats`、`/api/v1/carriers/match` 等端点时返回 500 错误，错误信息为"获取报价详情失败"或"获取承运商详情失败"。

## 根本原因
Express 路由匹配是**顺序优先**的。`/:id` 参数路由写在 `/stats` 前面，Express 会把 `stats` 当作 ID 参数传给详情处理函数，导致 UUID 解析失败或查询不到数据。

## 错误代码
```javascript
// ❌ 错误：/:id 在 /stats 前面
router.get('/:id', async (req, res) => { ... })     // stats 被当成 id
router.get('/stats', async (req, res) => { ... })    // 永远不会执行
```

## 正确代码
```javascript
// ✅ 正确：固定路径在参数路径前面
router.get('/stats', async (req, res) => { ... })    // 先匹配
router.get('/match', async (req, res) => { ... })    // 先匹配
router.get('/export', async (req, res) => { ... })   // 先匹配
router.get('/:id', async (req, res) => { ... })      // 最后匹配
```

## 受影响的模块（共 6 个）
- quotation/routes.js — `/stats`
- cmr/routes.js — `/stats`
- customs/routes.js — `/stats`
- shipping-release/routes.js — `/stats`
- carrier/routes.js — `/match`
- **invoice-template/routes.js — `/rules`（2026-08-02 P5 期间发现，第 6 次）**

## 第 6 次：invoice-template 的 /rules（2026-08-02）

`GET /rules` 写在文件最末尾、`/:id` 之后，被 `/:id` 接走。
`invoice_templates.id` 是 UUID，`WHERE id = 'rules'` 直接抛
`invalid input syntax for type uuid` → 接口恒 500。

**比前 5 次更隐蔽的地方**：这个端点前端从没调过，所以两个多月没人报错；
是 P5 给全部路由挂权限码、逐条过路由表时才顺带发现的。

## 防护规则
1. **所有 Express 路由文件中，固定路径（/stats、/match、/export、/rules 等）
   必须写在参数路径（/:id、/:orderId）之前。**
2. **新增固定路径时，先看这个文件里有没有 `/:xxx`**——有的话一律往它前面插，
   不要图省事追加到文件末尾（这次就是追加到末尾造成的）。
3. **主键是 UUID 时这个坑会变成 500 而不是 404**，错误信息还是数据库类型错，
   跟"路由写错了"看不出关系，排查会绕远路。
