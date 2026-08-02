# 031 远程 `pkill -f <名字>` 会把执行这条命令的 shell 自己也杀掉

## 问题现象

P8 Webhook 上线验证时，在生产服务器起了个临时接收端 `hook-receiver.cjs`，
验完要清理，一条 ssh 命令里写了「杀进程 + 删文件 + 删测试数据」：

```bash
ssh eu-tms '
  psql ... -tAc "SELECT status FROM api_webhook_deliveries WHERE ..."   # ← 这句执行了
  pkill -f hook-receiver.cjs                                            # ← 到这里就断了
  rm -f /tmp/hook-receiver.cjs                                          # ← 没执行
  psql ... -c "DELETE FROM api_keys WHERE partner_code=..."             # ← 没执行
'
# 输出只有第一句的结果，然后：Exit code 255
```

退出码 255 是 ssh 连接异常断开。**测试钥匙和投递记录留在了生产库里**——
如果没注意到这个退出码，就是一条脏数据长期躺在生产。

## 根本原因

`pkill -f` 的 `-f` 是"匹配完整命令行"，而 ssh 远程执行时，
**承载这条命令的 bash 进程，它的命令行里就包含 `hook-receiver.cjs` 这个字符串**：

```
root  12345  bash -c \n  psql ...\n  pkill -f hook-receiver.cjs\n  rm -f /tmp/hook-receiver.cjs ...
                                            ↑ pkill 一扫，自己也命中
```

于是 pkill 把自己杀了，后面的命令自然全部没执行。
本地交互式 shell 里手敲 `pkill -f xxx` 一般不会这样（命令行只有 pkill 那一段），
**恰恰是"写成一整段脚本远程执行"这个用法才会踩**——平时的经验在这里失效。

## 正确做法

**按端口反查 PID，再按 PID kill**，完全不用名字匹配：

```bash
ssh eu-tms '
  PID=$(ss -lptn "sport = :3099" | grep -oP "pid=\K[0-9]+" | head -1)
  [ -n "$PID" ] && kill "$PID" && echo "已停止 $PID" || echo "已不在运行"
  rm -f /tmp/hook-receiver.cjs
  psql ... -c "DELETE FROM ..."
'
```

没有端口可依据时，用 `pgrep` 先看清楚再动手，并排除自己：

```bash
pgrep -f hook-receiver.cjs | grep -v $$ | xargs -r kill
```

## 防护规则

1. **ssh 远程脚本里禁用 `pkill -f <脚本名>`**：脚本文本本身就是匹配目标。
   改用端口反查 PID，或 `pgrep` 确认后按 PID kill。
2. **清理动作要能独立重跑**，不要和"查询结果"挤在同一条 ssh 里。
   一条命令中途断掉，后面的清理就全丢了。
3. **每条 ssh 命令都要看退出码**。255 = 连接断开，不是"命令执行完了"。
   本次就是靠 `Exit code 255` 才发现清理没做完。
4. **生产上造的任何临时数据（钥匙/测试单/进程/文件），清理后要再查一遍确认归零**：
   ```bash
   psql ... -tAc "SELECT COUNT(*) FROM api_keys"   # 期望 0
   ss -lntp | grep -c :3099                         # 期望 0
   ```

## 涉及文件

| 文件 | 说明 |
|------|------|
| `docs/开发记录/2026-08-03-P8Webhook状态推送.md` | 本次生产验证与清理过程 |
