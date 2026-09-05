# 073 · DATE 列被 pg 解析成「本地时区午夜」，前端显示整整少一天

> 发现日期：2026-09-05（做「预计到仓日期」时，对照实测撞出来的）
> 涉及文件：`server/core/db.js`（已修）、`server/modules/finance/routes.js`（同根因，本次一并修对）

## 问题现象

往 `inquiries.expected_arrival_date`（DATE）写入 `2026-09-20`，
读回来是 **`2026-09-19`**。库里查是对的，一到 JS 就少一天。

## 根本原因

`DATE` 在数据库里表示「哪一天」，**没有时区概念**。
但 node-postgres 默认会把它解析成一个 JS `Date` 对象，取的是 **node 进程本地时区**的午夜：

```
库里          2026-09-20
pg 解析成      Date(2026-09-20 00:00:00 +08:00)   ← 生产服务器是 Asia/Shanghai
JSON 序列化    "2026-09-19T16:00:00.000Z"          ← 转成 UTC 就退回前一天
德国浏览器渲染  2026 年 9 月 19 日
```

**生产服务器时区是 `Asia/Shanghai (UTC+8)`**（`timedatectl` 可查，`.env` 里没有设 `TZ`），
而客户在德国（UTC+1/+2）。UTC+8 的午夜换算成 UTC 就是**前一天下午 4 点**，
所以只要客户端时区比 UTC+8 靠西，看到的日期就整整少一天。

**这不是新字段独有的**：库里有 12 个 DATE 列（`orders.delivery_date`、
`carriers.insurance_expiry`、`financial_records.due_date` …），全都吃这一套。
`finance/routes.js` 里那两处

```js
dueDate: row.due_date ? new Date(row.due_date).toISOString().slice(0, 10) : '-'
```

就是现成的受害者 —— **财务的到期日在生产上一直少一天**，只是没人往这个方向查过。

## 正确做法

在连接池初始化时告诉 pg：DATE 直接给字符串，别转 Date。

```js
// server/core/db.js
import pg from 'pg'

// DATE（OID 1082）按 'YYYY-MM-DD' 原样返回，不要转成带时区的 JS Date
pg.types.setTypeParser(1082, (value) => value)
```

- 只影响 `DATE`，**不动 `TIMESTAMP`** —— 带时分秒的时间点本来就该保留时区语义；
- SQL 里的日期比较（`CURRENT_DATE`、`>= $1::date`）都在数据库侧算，完全不受影响；
- 前端 `formatDate` 收到纯日期字符串反而更稳，`new Date('2026-09-20')` 按 UTC 午夜解析，
  在欧洲任何时区渲染都是 9 月 20 日。

## 怎么验才算数

**只看"现在显示对了"不算** —— 本机时区可能恰好不暴露问题。要让新旧两种行为跑出不同结果：

```js
// 改之前：存 2026-09-20 → 读出 "2026-09-19"
// 改之后：存 2026-09-20 → 读出 "2026-09-20"
```

本次是写了一次性探针，走 controller 真正调用的 `withTransaction + createInquiryRecord`，
三种服务类型各建一张单，比对写入值和读出值。

## 防护规则

1. **新加 DATE 列之前，先确认 pg 类型解析器已经配好**（本项目已在 `core/db.js` 配置）。
   没配的话，任何"只到日期"的字段都会在跨时区场景下差一天。
2. **不要用 `new Date(dateValue).toISOString().slice(0,10)` 处理 DATE 列** ——
   这个写法本身就是 bug 的放大器：它把"本地时区的某一天"硬转成 UTC，必然偏移。
   DATE 已经是字符串了，直接用。
3. **判断日期类问题时先查服务器时区**：`ssh <host> "timedatectl"`。
   本项目生产是 `Asia/Shanghai`，而客户全在欧洲 —— 这个组合下所有时区 bug 都会被放大。
4. 时区问题在开发机上**可能不复现**（开发机时区若与服务器一致，或恰好是 UTC），
   所以要按"服务器时区 + 客户时区"两头去推，不能只看本机。
