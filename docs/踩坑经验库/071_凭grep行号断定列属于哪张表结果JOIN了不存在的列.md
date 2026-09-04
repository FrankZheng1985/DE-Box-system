# 071 · 凭 grep 行号断定列属于哪张表，结果 JOIN 了一个不存在的列

> 发现日期：2026-09-04（做开发意见 #17「订单列表显示柜号」时）
> 涉及文件：`server/modules/order/model.js`

## 问题现象

本地派送的柜号记在询价单上（`inquiries.container_no`，迁移 129「一张询价单 = 一个柜」），
订单表这一列是空的。为了让订单列表也能显示柜号，给 `orderModel.list()` 的 SQL 加了一句：

```sql
LEFT JOIN inquiries iq ON iq.id = o.inquiry_id
```

**四道门禁全绿**：`tsc --noEmit` 通过、`eslint` 0 error、`vite build` 成功、`check-i18n-keys` 退出码 0。

直到在本地库随手查一句订单统计，才炸出来：

```
ERROR:  column "inquiry_id" does not exist
```

到生产库一查 `information_schema.columns`，**`orders` 表压根没有 `inquiry_id`，也没有 `quotation_id`**。

## 根本原因

判断"orders 有没有 inquiry_id"时，只 grep 了建表迁移：

```bash
grep -nE "inquiry_id|quotation_id" server/database/migrations/100_eu_tms_v2_full_rebuild.sql
# 598:  inquiry_id UUID REFERENCES inquiries(id),
```

看到有这么一行，就认定它是 `orders` 的列 —— **但 grep 只给行号，不给它属于哪个 `CREATE TABLE` 块**。
第 598 行实际落在 `quotations` 的建表语句里。一个几百行的建表脚本里，
`CREATE TABLE` 的边界肉眼根本不在 grep 输出的视野里。

订单和询价的真实关系是**两跳**：

```
orders.source_quotation_id → quotations.id → quotations.inquiry_id → inquiries.container_no
```

## 为什么这一条特别危险

**所有前端门禁都拦不住它** —— SQL 在 JS 里是个字符串，不参与类型检查，也不会被 lint 分析。
它只有在真正执行到那条查询时才报错。

如果没有本地库这一下，推上生产就是：**订单列表接口直接 500，而 `/api/health` 照样 200**，
报错只落在 `germany-box-error.log` 里，运营侧只看到"订单页打不开"。
这正是[踩坑 063](063_迁移没跑就先push了依赖新列的代码.md)的翻版 —— 代码依赖了一个数据库里不存在的东西。

## 错误做法

```bash
# ❌ 只看 grep 的行号就下结论
grep -n "inquiry_id" 100_eu_tms_v2_full_rebuild.sql
```

## 正确做法

**问"某张表有没有某列"，唯一可信的答案来自真库**，不是建表脚本：

```bash
ssh eu-tms "cd /var/www/germany-box-system/server && export \$(grep '^DATABASE_URL' .env | xargs) \
  && psql \"\$DATABASE_URL\" -A -F'|' -c \"SELECT column_name FROM information_schema.columns \
     WHERE table_name='orders' ORDER BY ordinal_position;\""
```

只能看脚本时，也要把 `CREATE TABLE` 的**块边界**一起取出来，别只看单行：

```bash
sed -n "/CREATE TABLE orders/,/^);/p" 100_eu_tms_v2_full_rebuild.sql | grep inquiry_id
```

另外，建表脚本本身也不等于现状 —— 列可能是后来的迁移加的（本项目 `inquiries.container_no`
就是迁移 129 才加的），所以 `ALTER TABLE ... ADD COLUMN` 也要一并搜。

## 防护规则

1. **写任何 JOIN / 新引用的列之前，先去真库确认它存在**，特别是跨表关联。
   前端四道门禁对 SQL 字符串**完全没有约束力**，"全绿"在这里不是证据。
2. **grep 出来的行号不能证明归属**。要断定某列属于哪张表，要么查 `information_schema`，
   要么把整个 `CREATE TABLE` 块取出来看。
3. **改了列表 SQL，必须在本地库真跑一次**，而且要有对照：
   一条能回落取到值的、一条取不到的，两条结果不同才说明改动真生效
  （只跑有值那条，看不出是回落生效还是本来就有值）。
4. 关联字段不要凭直觉命名。本项目订单**不直接挂询价**，只有 `source_quotation_id`，
   要拿询价上的东西一律经报价单绕一跳。
