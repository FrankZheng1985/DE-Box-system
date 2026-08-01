# 020 把唯一约束换成部分唯一索引，ON CONFLICT 会当场失效

## 问题现象

P4 给 `notification_preferences` 加客户公司维度时，把原来的

```sql
UNIQUE(user_id, event_type)
```

换成了两个**部分**唯一索引（因为公司级记录的 user_id 全是 NULL，
而 UNIQUE 里 NULL 互不相等，同一家公司同一事件能插进无数条重复行）：

```sql
CREATE UNIQUE INDEX uq_notification_pref_user
  ON notification_preferences(user_id, event_type) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX uq_notification_pref_client
  ON notification_preferences(client_id, event_type) WHERE client_id IS NOT NULL;
```

结果原来好好的保存接口直接 500：

```
there is no unique or exclusion constraint matching the ON CONFLICT specification
```

## 根本原因

`ON CONFLICT (a, b)` 需要**推断**出一个匹配的唯一索引。
普通唯一约束能直接推断出来，但**部分索引带了 WHERE 条件**，
PostgreSQL 要求你在语句里把同样的 WHERE 写出来，才认得出是哪个索引：

```js
// ❌ 迁移改完之后这句就死了
ON CONFLICT (user_id, event_type) DO UPDATE SET ...
```

隐蔽之处在于：**迁移本身跑得很顺，表结构也完全正确**，
炸的是几十行之外另一个文件里的 INSERT 语句。
只改迁移不去搜消费方，就会在上线后才发现"保存通知设置"这个功能没了。

## 正确做法

把索引的 WHERE 条件原样抄进 ON CONFLICT：

```js
// ✅ 个人偏好
INSERT INTO notification_preferences (user_id, event_type, channel_email, channel_system)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id, event_type) WHERE user_id IS NOT NULL
DO UPDATE SET channel_email = $3, channel_system = $4

// ✅ 公司级偏好走另一个索引
INSERT INTO notification_preferences (client_id, event_type, channel_email, channel_system)
VALUES ($1, $2, $3, $4)
ON CONFLICT (client_id, event_type) WHERE client_id IS NOT NULL
DO UPDATE SET channel_email = $3, channel_system = $4
```

同时加 CHECK 保证归属明确，防止插进"两个 id 都为空"的孤儿行：

```sql
ALTER TABLE notification_preferences ADD CONSTRAINT chk_notification_pref_owner
  CHECK ((user_id IS NOT NULL AND client_id IS NULL)
      OR (user_id IS NULL AND client_id IS NOT NULL));
```

## 防护规则

1. **动了任何唯一约束/唯一索引，立刻全仓搜 `ON CONFLICT`**，
   逐个确认还能不能推断到索引：
   ```bash
   grep -rn "ON CONFLICT" server/modules/ server/core/
   ```
   这和踩坑 010「代码在用但库里没有的列」是一对：那个是列没了，这个是约束变了。
2. **部分唯一索引的 ON CONFLICT 必须带上同样的 WHERE**，没有例外。
3. **一个字段允许为空却又要参与唯一性时，先想清楚 NULL 的语义**。
   `UNIQUE(a, b)` 在 a 为 NULL 时形同虚设，这正是本次必须改成部分索引的原因。
4. 迁移改约束后，**在空库上跑一遍迁移 + 实际执行一次那条 INSERT**，
   光看迁移成功不算验证过。

## 涉及文件

| 文件 | 说明 |
|------|------|
| `server/database/migrations/108_quotation_email_notify.sql` | 换成两个部分唯一索引 + 归属 CHECK |
| `server/modules/notification/routes.js` | 两处 ON CONFLICT 补上 WHERE 条件 |
