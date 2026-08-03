# 036 · 筛选 Tab 的 key 写成小写，每个状态筛选都查不到数据

> 发现日期：2026-08-03（P9 给 admin 单据物流域做三语时）
> 涉及文件：`admin/src/pages/{CustomsManagement,ShippingRelease,CMRManagement}.tsx`

## 问题现象

清关管理、船司放单、CMR 管理三个页面顶部都有一排状态筛选 Tab。
点「全部」有数据，**点任何一个具体状态，列表立刻变空**。

不报错、不转圈、接口返回 200 + 空数组，看起来就像"这个状态确实一条都没有"。

## 根本原因

Tab 的 key 是小写，后端拿它和数据库里的**大写枚举**做等值比较：

```tsx
// ❌ 前端
const STATUS_TABS = [
  { key: 'pending', label: '待清关' },
  { key: 'in_progress', label: '清关中' },
  { key: 'cleared', label: '已放行' },
]
```

```js
// 后端：直接等值比较，没有大小写归一
if (status) { params.push(status); sql += ` AND cc.status = $${++idx}` }
```

`customs_clearances.status` 实际存的是 `PENDING` / `IN_PROGRESS` / `CLEARED`，
`'pending' = 'PENDING'` 在 PostgreSQL 里是 false，**筛选条件永远匹配不到任何行**。

这是踩坑 004（状态枚举大小写）的又一次重演，但这次藏在 Tab 配置里，
而不是藏在显示用的 map 里 —— 显示是对的（Tab 上的中文照常显示），**只有筛选是坏的**。

## 更隐蔽的一种：名字压根就不对

船司放单页更严重，Tab 的 key 连**名字**都和枚举对不上：

| Tab 的 key | 数据库真实值 |
|---|---|
| `pending_mail` | `ORIGINAL_PENDING` |
| `mailed` | `ORIGINAL_SENT` |
| `pending_release` | `PENDING_RELEASE` ✅（只是大小写） |
| `released` | `RELEASED` ✅（只是大小写） |

前两个就算全大写也匹配不上。这和之前统计卡片踩的是同一个坑
（前端读 `pending_mail`/`mailed`，后端返回 `original_pending`/`original_sent`），
说明当初就是**同一份错误的字段名被抄到了两个地方**。

## 为什么一直没被发现

- 中文界面下 Tab 显示正常，看不出异常
- 空列表有合理解释（"这个状态确实没单子"），不像整列空白那么刺眼
- 类型检查完全沉默：key 是 `string`，写什么都合法

## 正确做法

**筛选值必须直接引用枚举常量，不要手写字符串**：

```tsx
// ✅ 值就是数据库里的值，label 走语言包
const STATUS_TABS = [
  { key: '', labelKey: 'common.all' },
  { key: 'PENDING', labelKey: 'clearanceStatus.PENDING' },
  { key: 'IN_PROGRESS', labelKey: 'clearanceStatus.IN_PROGRESS' },
  { key: 'CLEARED', labelKey: 'clearanceStatus.CLEARED' },
]
```

更好的是把枚举收进 `src/constants/`，页面只引用不重写
（`businessTypes.ts` / `inquiryQuotation.ts` 就是这么做的）。

## 防护规则

1. **凡是会拼进查询参数的常量，都必须能在迁移文件里原样搜到**：
   ```bash
   grep -n "ORIGINAL_PENDING" server/database/migrations/*.sql
   ```
   搜不到就是写错了。这条对 `filter(x => x.status === '常量')`（踩坑 033）
   和筛选 Tab 的 key 同样适用。
2. **改完筛选一定要逐个 Tab 点一遍**，不能只验证「全部」有数据。
   每个 Tab 都点到、每个都能出数据，才算验过。
3. **同一份枚举只允许有一个来源**。船司放单这次之所以两处都错，
   就是因为 Tab 配置和统计卡片各抄了一份，抄错了一起错。
4. 后端如果愿意做 `UPPER(status) = UPPER($1)` 归一，能兜住这类问题，
   但**别指望后端兜底**——前端传对值才是根治。

## 关联

- 踩坑 004（状态枚举大小写不匹配）：本条是它在筛选 Tab 上的实例
- 踩坑 033（字段名凭想象写）：同源，区别是那条让列空白、这条让筛选空
- 踩坑 013（业务类型与运输类型值域错配）：同样是"值域没对齐"
