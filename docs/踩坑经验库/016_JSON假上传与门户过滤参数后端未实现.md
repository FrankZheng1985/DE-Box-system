# 016 JSON 假上传与门户过滤参数后端未实现

## 问题现象

两个都是"界面看着能用，实际从没工作过"的坑（P2 订单文件中心开发时发现）：

1. **承运商门户"上传CMR"从来传不了文件**：页面有完整表单、提交显示"成功"，但库里的 CMR 记录永远没有文件，`file_url` 是拼出来的死链接。
2. **承运商能看到所有公司的 CMR**：门户列表页带着 `?carrierId=xxx` 请求，看起来做了过滤，实际返回的是全量数据（数据越权）。

## 根本原因

1. 前端用 `api.post('/cmr/upload', {...})` 提交 —— api 客户端把 body `JSON.stringify` 了。**JSON 里根本装不下文件**，后端 multer 只认 `multipart/form-data`，`req.file` 永远是 undefined。表单里的 signStatus/hasDamage 字段后端也从不读取，纯装饰。
2. 前端传了 `carrierId` 查询参数，但后端 `/cmr` 列表的 SQL **从来没实现这个过滤条件**——参数被静默忽略，返回全量。

## 错误代码

```ts
// 错误 1：JSON 提交文件（文件根本不在请求里）
await api.post('/cmr/upload', { orderId, cmrNo, signStatus, hasDamage })

// 错误 2：前端传过滤参数，后端没接
const params = `?carrierId=${user.linkedEntityId}`   // 后端 SQL 里没有这个条件
```

## 正确代码

```ts
// 文件上传必须 FormData + 原生 fetch（不要走 JSON api 客户端）
const formData = new FormData()
formData.append('orderId', orderId)
formData.append('file', file)
await fetch('/api/v1/cmr/upload', {
  method: 'POST',
  headers: getAuthHeaders(),   // 只带 Authorization，Content-Type 让浏览器自动生成 boundary
  body: formData,
})
```

```js
// 门户数据过滤必须后端按登录身份强制，不信任前端传参
const userType = req.user.userType || req.user.roleCode
if (userType === 'CARRIER') {
  params.push(req.user.linkedEntityId); sql += ` AND o.carrier_id = $${++idx}`
} else if (userType === 'CLIENT') {
  params.push(req.user.linkedEntityId); sql += ` AND o.client_id = $${++idx}`
}
```

## 防护规则

1. **凡是带文件的接口，前端一律 FormData + fetch**，且不要手动设 Content-Type（会破坏 multipart boundary）。JSON api 客户端只用于纯数据接口。
2. **门户（客户/承运商端）的数据范围过滤必须在后端按 JWT 身份强制**，前端传的 carrierId/clientId 之类只能当展示辅助，不能当安全边界。写门户接口时先问一句："这个接口被别家用户直接 curl 会返回什么？"
3. 联调时**必须看一次真实落库数据**（file_url 能不能打开、行数对不对），别只看前端 toast 说"成功"。
4. 前端表单字段要和后端实际读取的字段核对（本例 signStatus/hasDamage 后端从不读取），多余字段删掉，避免"看起来有这功能"的错觉。

## 涉及文件

- `carrier-portal/src/pages/UploadCMR.tsx`（重写为 FormData）
- `server/modules/cmr/routes.js`（列表按身份强制过滤）
- 同类正确范例：`admin/src/pages/CMRManagement.tsx` 的上传、`admin/src/components/OrderFilesSection.tsx`
