# 踩坑记录 002：PostgreSQL NUMERIC/BIGINT 返回字符串导致前端崩溃

## 问题现象
前端页面白屏，控制台报错 `TypeError: a.toFixed is not a function` 或 `Cannot read properties of undefined (reading 'toLocaleString')`。

## 根本原因
PostgreSQL 的 `NUMERIC`、`BIGINT` 类型通过 `pg` 驱动返回 JavaScript 时是**字符串**而不是数字。

```javascript
// 数据库返回
{ performance_score: "8.5", cargo_weight_kg: "12000.00", current_number: "1" }
// 前端期望
{ performance_score: 8.5, cargo_weight_kg: 12000, current_number: 1 }
```

## 受影响的场景
- `performance_score.toFixed(1)` → 报错（字符串没有 toFixed 方法）
- `monthlyRevenue.toLocaleString()` → 报错
- `current_number + 1` → 变成字符串拼接 `"11"` 而不是 `2`

## 解决方案
```javascript
// ❌ 错误
score.toFixed(1)
amount.toLocaleString()

// ✅ 正确
Number(score).toFixed(1)
parseFloat(amount).toLocaleString()
parseInt(current_number, 10) + 1
```

## 受影响的文件（共 8 个）
- OrderDetail.tsx — 评分 + 毛利率
- OrderAssign.tsx — 评分
- CarrierDetail.tsx — 评分
- CarrierList.tsx — 评分
- QuotationManagement.tsx — 转化率
- FinanceManagement.tsx — 毛利率 x2
- number-range.js — 编号范围递增

## 防护规则
**从数据库获取的 NUMERIC/BIGINT 值，在前端使用前必须用 `Number()` 或 `parseFloat()` 转换。**
