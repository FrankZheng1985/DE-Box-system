# 039 · date 列经 pg 驱动回填少一天，会把日期静默改坏

## 问题现象

打开订单编辑页，**什么都不改**直接点保存，装货日期和送达日期各被改早一天。
每保存一次早一天，全程没有任何报错或提示。

界面上也看得出来：库里装货日期是 `2026-08-10`，编辑页的日期框里显示的是 `2026-08-09`。

## 根本原因

PostgreSQL 的 `date` 列（不带时区）经 `pg` 驱动会被解析成**本地时区零点的 JS Date**，
再经 `JSON.stringify` 序列化成 UTC ISO 串，日期就回退了一天：

```
库里          2026-08-10           (date 列)
pg 驱动解析    2026-08-10 00:00 +08:00   (本地时区零点)
JSON 序列化    "2026-08-09T16:00:00.000Z"  ← 日期变成 09 号
```

前端拿这个串去回填 `<input type="date">` 时用了字符串截断：

```js
setPickupDate(o.pickup_date?.split('T')[0] || '')   // 得到 "2026-08-09"
```

截出来就是 UTC 那天，比真实日期早一天。用户不改任何东西点保存，
这个早了一天的值就被提交回去，**真的把数据改坏了**。

**这不是东八区特有的。** 欧洲同样中招：UTC+1/+2 下本地零点也落在前一天的 UTC。

## 错误代码

```js
// ❌ 截字符串：拿到的是 UTC 那天，不是本地那天
setPickupDate(o.pickup_date?.split('T')[0] || '')
setDeliveryDate(o.delivery_date?.split('T')[0] || '')
validUntil: row.valid_until ? row.valid_until.slice(0, 10) : ''
```

## 正确代码

按本地时区取年月日，与 `formatDate` 的显示口径保持一致：

```ts
// admin/src/utils/format.ts
export function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
```

```js
// ✅
setPickupDate(toDateInputValue(o.pickup_date))
```

## 防护规则

1. **任何 `<input type="date">` 的回填，一律走 `toDateInputValue()`**，
   禁止 `split('T')[0]` 和 `slice(0, 10)`。
2. **显示日期一律走 `formatDate()`**（它用 `Intl` 按本地时区格式化，本来就是对的）。
   `updated_at?.split('T')[0]` 这种写法在 timestamp 列上同样会显示错一天。
3. 排查手法：拿一条日期填了的记录，比对
   `psql` 查出来的值 ↔ 接口返回的 ISO 串 ↔ 页面输入框里的值，三者要一致。
4. 这类 bug **不会报错、不会白屏**，只会让日期悄悄漂移，
   属于必须靠对账发现的一类，光点页面看不出来。

## 涉及文件

| 文件 | 说明 |
|---|---|
| `admin/src/utils/format.ts` | 新增 `toDateInputValue()` |
| `admin/src/pages/OrderEdit.tsx` | 装货日期 / 送达日期 / ETA / 预计送达 4 处（会写坏数据） |
| `admin/src/components/CarrierInquiryPanel.tsx` | 服务商回价有效期（会写坏数据） |
| `admin/src/pages/QuotationCreate.tsx` | 报价有效期回填 |
| `admin/src/pages/FinanceManagement.tsx` | 到期日显示 |
| `admin/src/pages/CustomsManagement.tsx`、`ShippingRelease.tsx` | 更新时间显示 |

发现日期：2026-08-05（全系统测试中发现，此前从未暴露）
