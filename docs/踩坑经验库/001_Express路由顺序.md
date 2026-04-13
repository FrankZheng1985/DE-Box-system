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

## 受影响的模块（共 5 个）
- quotation/routes.js — `/stats`
- cmr/routes.js — `/stats`
- customs/routes.js — `/stats`
- shipping-release/routes.js — `/stats`
- carrier/routes.js — `/match`

## 防护规则
**所有 Express 路由文件中，固定路径（/stats、/match、/export 等）必须写在参数路径（/:id、/:orderId）之前。**
