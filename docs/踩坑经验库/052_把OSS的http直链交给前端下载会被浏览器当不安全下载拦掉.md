# 052 把 OSS 的 http 直链交给前端下载，会被浏览器当"不安全下载"拦掉

> 2026-08-07 · 客户门户 · 文件下载

## 问题现象

客户在客户门户点"下载"（装车图 / CMR / 签收凭证），**页面毫无反应**，文件下不来。
运营端在后台确实已经把文件传上去了，列表里也能看到这些文件的名字和上传时间——
就是点了没用。

迷惑之处：
- 后端接口都是 200，日志里一点错都没有；
- 文件在 OSS 里是好的，直接把地址贴进浏览器地址栏能打开；
- 于是很容易往"权限没配""接口没返回 file_url""OSS 挂了"上查，全是死路。

## 根本原因

**三件事叠在一起**，前两件各自就足以让下载失败：

### 1）库里存的是 `http://` 直链，页面是 `https://`

上传时后端把 ali-oss `put()` 返回的 `result.url` 原样存进了 `file_url`：

```
http://box-cargo-files.oss-cn-hongkong.aliyuncs.com/orders/EU-20260806-0002/1786003325022-643.jpg
```

注意是 **http**。而门户跑在 `https://kalunasped.com` 上。
Chrome 从 88 版起会**拦截 https 页面发起的 http 下载**（mixed content download），
而且拦得很安静——不弹窗、不报错，控制台最多一行提示，用户看到的就是"点了没反应"。

### 2）`<a download>` 对跨域地址根本不生效

```tsx
<a href={file.file_url} download>下载</a>
```

`download` 这个属性**只对同源地址有效**。OSS 是另一个域名，浏览器会直接忽略它，
把这个链接当成普通跳转。所以就算把 http 换成 https，结果也只是
"在新标签页里把图片打开了"，不是另存为——对用户来说仍然是"下载不了"。

### 3）顺带的安全问题

OSS 直链不带任何鉴权，bucket 又是公共读。把它渲染到页面上，
等于**客户的装车图、CMR、签收凭证对全网公开**，谁拿到 URL 谁就能看。

## 错误代码

```tsx
// customer-portal/src/pages/MyOrders.tsx（订单文件弹窗）
<a href={file.file_url} target="_blank" rel="noreferrer">
  <Download className="w-3.5 h-3.5" />
  {t('common.download')}
</a>

// customer-portal/src/pages/CMRFiles.tsx
<a href={doc.file_url} download>下载</a>
```

## 正确代码

**后端加代理下载接口**，前端一律走它——同源、https、带 JWT、
`Content-Disposition` 由后端说了算：

```js
// server/modules/order/routes.js
router.get('/files/:fileId/download', requirePermission(...CAN_VIEW_ORDER, 'portal:file_download'), async (req, res) => {
  if (!UUID_RE.test(String(req.params.fileId))) {
    return res.status(404).json({ code: 404, message: '文件不存在', data: null })
  }
  const result = await pool.query(
    `SELECT order_id, file_name, file_url, oss_path FROM order_files WHERE id = $1`,
    [req.params.fileId]
  )
  if (result.rows.length === 0) {
    return res.status(404).json({ code: 404, message: '文件不存在', data: null })
  }
  const file = result.rows[0]
  // 租户校验：客户/承运商只能下载自己订单下的文件
  const order = await loadOrderWithAccessCheck(file.order_id, req.user, res)
  if (!order) return

  await sendStoredFile(res, {
    fileUrl: file.file_url,
    ossPath: file.oss_path,
    fileName: file.file_name,
    inline: req.query.inline === '1',
  })
})
```

前端用 blob 另存（接口要带 JWT，所以不能用裸 `<a href>`）：

```ts
// customer-portal/src/utils/fileDownload.ts
export async function downloadFile(endpoint: string, fileName: string): Promise<void> {
  const blob = await fetchFileBlob(endpoint)   // fetch + Authorization 头
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // 立刻 revoke 在 Safari 上会让下载拿不到内容，延一拍再释放
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
}
```

## 三个容易连带踩的小坑

1. **`cmr_documents` 表没有 `oss_path` 列**，只有 `file_url`。
   所以下载时要能从 URL 反推 OSS key（见 `ossPathFromUrl()`），
   不能假设库里一定存了对象路径。

2. **CMR 的下载文件名用的是 `cmr_number`（如 `CMR-2026-000001`），本身不带扩展名**，
   不补扩展名的话存下来的文件双击打不开。

3. **在新标签页预览必须先同步开窗**：

   ```ts
   const win = window.open('', '_blank')   // ← 必须在点击的同步阶段
   const blob = await fetchFileBlob(endpoint, true)
   win.location.href = URL.createObjectURL(blob)
   ```

   等 `fetch` 回来再 `window.open`，浏览器会当成非用户触发的弹窗直接拦掉。

## 防护规则

1. **凡是要给用户下载的业务文件，一律走后端代理接口，不把存储直链渲染到页面上。**
   直链同时踩三个雷：协议不匹配被拦、跨域 `download` 失效、无鉴权对外泄露。

2. **`<a download>` 只在同源时有效。** 需要"另存为"就用 blob + `createObjectURL`，
   或者让后端回 `Content-Disposition: attachment`。

3. **下载接口必须做租户校验**，而且和列表接口用同一套（`loadOrderWithAccessCheck` /
   `loadCmrWithAccessCheck`）。列表按登录身份收窄了、详情/下载按 id 直取却不校验，
   是本项目反复出现的漏法（踩坑 016 / 023 同族）。

4. **接口里凡是拿路径参数直接进 SQL 查 UUID 列的，先校验格式**，
   否则 pg 类型转换失败会抛 500，把"不存在"变成"服务器炸了"。

5. **"点了没反应"这类现象，先看浏览器控制台和 Network，别一头扎进后端日志。**
   后端 200 + 前端毫无动静 = 十有八九是浏览器在客户端侧拦掉了。

## 涉及文件

| 文件 | 说明 |
|------|------|
| `server/utils/file-response.js` | 新增，统一的文件回传（OSS 流 / 本地回退 + Content-Disposition） |
| `server/utils/oss-service.js` | 新增 `getOSSStream()` 和 `ossPathFromUrl()` |
| `server/modules/order/routes.js` | 新增 `GET /orders/files/:fileId/download` |
| `server/modules/cmr/routes.js` | 新增 `GET /cmr/:id/download`，并给 `GET /cmr/:id` 补上租户校验 |
| `customer-portal/src/utils/fileDownload.ts` | 新增，前端下载/预览封装 |
| `customer-portal/src/pages/MyOrders.tsx` | 订单文件弹窗改走下载接口 |
| `customer-portal/src/pages/CMRFiles.tsx` | 查看/下载改走下载接口 |
| `admin/src/utils/fileDownload.ts` | 新增（同一份封装，三端各一份） |
| `admin/src/components/OrderFilesSection.tsx` | 订单文件区块改走下载接口 |
| `carrier-portal/src/utils/fileDownload.ts` | 新增 |
| `carrier-portal/src/pages/UploadCMR.tsx` | CMR 列表改走下载接口 |

> 三端是同一个坏法、同一天一起修的。以后再新增"能下载文件"的页面，
> 直接用各端的 `utils/fileDownload.ts`，别再写 `<a href={file_url}>`。
