# 063 push 即部署、而迁移要手工跑，于是生产代码比库超前

## 问题现象

2026-08-15 15:49（CST）起，生产的**批量导入询价**和**新建询价**开始失败，
到 08-16 05:47 修复为止约 14 小时，pm2 error 日志里累计 16 次：

```
批量导入询价失败: error: column "vehicle_length_code" of relation "inquiries" does not exist
创建询价失败: error: column "vehicle_length_code" of relation "inquiries" does not exist
```

期间**有真实用户在用批量导入**（15 次失败都来自它），而运营侧毫无察觉 ——
接口 500 只在服务器日志里，客户看到的只是「导入失败」。

更糟的是：做这批改动的对话（也就是我）全程认为「还没部署」，
每次收尾都写着「未部署，上线前记得先跑迁移」。

## 根本原因

**这个项目 `push main` 会自动部署，而数据库迁移不在自动流程里。**

`.github/workflows/deploy.yml`：

```yaml
on:
  push:
    branches: [main]
```

流程是「装依赖 → lint → 构建三端 → rsync 上传后端与前端 → pm2 重启」，
**没有任何一步跑 `database/migrations/`**。迁移文件会被 rsync 传上去，
但只是躺在那儿，得有人手工 `psql -f` 才生效。

于是每 push 一次，就把「需要新列的代码」推上生产，而库还是旧的：

| 时间（CST） | 动作 | 结果 |
|---|---|---|
| 08-15 15:49 | push 313800d（迁移 128：车型列） | 后端上线，建询价立刻开始 500 |
| 08-16 01:05 | push e32807b（迁移 129：柜与子订单） | 询价详情也开始查不存在的表 |
| 08-16 05:41 | push 6aed1d1（迁移 130：逐票报价） | 报价详情同理 |
| 08-16 05:47 | 手工跑 128/129/130 | 恢复 |

我的认知错在两处，两处都可以被检查出来：

1. **项目 CLAUDE.md 的「部署规范」章节写的是手工 `scp` + `pm2 delete/start`**，
   完全没提 GitHub Actions。那段是 CI 建起来之前写的，一直没更新，
   照着它读会得出「不手工 scp 就没上线」的结论。
2. **记忆里其实有「push main 自动触发 CI/CD 部署」这条**（2026-08-01 记的），
   但我没在 push 前把它调出来核对，而是照着 CLAUDE.md 的旧描述行事。

## 正确做法

**push 到 main 之前，先问一句「这次 push 会不会立刻上生产」，并去看 workflow 文件确认**：

```bash
grep -A5 '^on:' .github/workflows/deploy.yml
```

**带数据库迁移的改动，顺序只能是「先迁移、后代码」**。这个项目的 CI 不管迁移，
所以必须在 push 之前把迁移跑到生产库：

```bash
# 1. 备份（结构变更前必做）
ssh eu-tms "cd /var/www/germany-box-system/server && export \$(grep '^DATABASE_URL' .env | xargs) \
  && pg_dump \"\$DATABASE_URL\" | gzip > /var/backups/germany-box-db/germany_box_transport_\$(date +%Y%m%d_%H%M%S).sql.gz"

# 2. 跑迁移（迁移文件此时还没上传，可以本地 psql 连生产，或先 scp 过去）
# 3. 再 push，让 CI 部署代码
```

**如果已经反了**（代码先上去了），补救就是立刻跑迁移 —— 本次的三个迁移都是
「加列 / 建表」的向后兼容变更，跑完即恢复，不需要回滚代码。
但**如果迁移里有破坏性变更（改列类型、加 NOT NULL、删列），代码先上就没法这样收场**，
那种情况必须先回滚代码。

## 防护规则

1. **改了 `server/database/migrations/` 的分支，push 前必须先在生产跑迁移。**
   把这条当成硬前置，不是「上线注意事项」里的一句提醒 —— 提醒只在人读文档时有用，
   而 push 是随手就发生的。
2. **不要用「我还没手工 scp」推断「还没上线」。** 判断生产上跑的是哪版代码，
   看 `gh run list`（部署记录）和服务器上的文件时间，不看自己做过什么。
3. **收尾说「未部署」之前先核实。** 本次连续三轮收尾都写了「未部署」，
   每一轮都是错的，而核实只需要一条 `gh run list`。
4. **部署后要看 pm2 的 error 日志，不只看 `/api/health`。** 健康检查走的是不碰新列的路径，
   它 200 的时候建单可能已经全线 500 了（本次正是如此）。
   `console.error` 走 stderr，在 `germany-box-server-error*.log` 里，out 日志看不到。

## 涉及文件

- `.github/workflows/deploy.yml`（只读确认：`on.push.branches: [main]`，且不含迁移步骤）
- `.claude/CLAUDE.md`（本次已更新「部署规范」章节，写明 push 即部署 + 迁移要手工先跑）
- `server/database/migrations/128_inquiries_vehicle_length.sql`
- `server/database/migrations/129_local_delivery_container_orders.sql`
- `server/database/migrations/130_quotation_delivery_lines.sql`
- 生产备份：`/var/backups/germany-box-db/germany_box_transport_20260816_054702.sql.gz`
