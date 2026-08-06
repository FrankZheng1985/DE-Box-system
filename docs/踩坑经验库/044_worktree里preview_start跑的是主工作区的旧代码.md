# 044 worktree 里用 preview_start 起服务，跑的是主工作区的旧代码

## 问题现象

在 worktree 里写完新接口 `POST /api/v1/clients/:id/impersonate`，
用 `preview_start` 起后端（3002）验证，curl 过去稳定返回：

```
Cannot POST /api/v1/clients/xxx/impersonate
```

而 `grep impersonate server/modules/client/routes.js` 明明能查到那条路由，
`app.js` 里 `app.use('/api/v1/clients', clientRoutes)` 也在。
服务启动日志一切正常，数据库连接成功，「业务模块: 15 个模块全部加载」。

看起来像是路由注册顺序、Express 版本、模块导出这类玄学问题，
很容易一头扎进去查半天。

## 根本原因

**服务确实起来了，但起在主工作区，跑的是没有这次改动的旧代码。**

`.claude/launch.json` 里写的是相对路径 `"cwd": "server"`，
而 `preview_start` 解析这个相对路径的基准目录是**会话启动时的原始目录**
（主工作区 `/Users/fengzheng/德国Box系统`），不是 `EnterWorktree` 之后的当前目录。
于是它起的是 `/Users/fengzheng/德国Box系统/server/app.js`。

把 `cwd` 改成 worktree 的**绝对路径**也没用——实测仍然起在主工作区，
说明 preview 读的根本就是主工作区那份 `.claude/launch.json`。

这是全局 CLAUDE.md 里「进 worktree 后所有编辑必须用 worktree 路径」那条坑的同族变体：
**工具沿用了进 worktree 之前的路径，于是验证的对象根本不是你改的那份代码。**
危险之处在于它不报错——服务正常启动、日志漂亮，只有那个新接口 404。

## 错误做法

```
EnterWorktree → 在 worktree 里改代码 → preview_start({name: "eu-tms-server"})
→ curl 新接口 → 404 → 开始怀疑路由顺序 / Express / 模块导出
```

## 正确做法

**起服务前先确认进程的 cwd 到底在哪**，一条命令的事：

```bash
PID=$(lsof -nP -iTCP:3002 -sTCP:LISTEN -t | head -1)
lsof -a -p $PID -d cwd | tail -1
```

在 worktree 里，改用后台命令直接起，cwd 显式写死：

```bash
cd /绝对路径/.claude/worktrees/<分支>/server && exec node app.js
```

（用 `run_in_background`，别用 `preview_start` 的 `name` 模式。
浏览器验证仍可用 `preview_start({url: "http://localhost:5174"})`，
那个只是开标签页，不管进程。）

## 附带的两个坑

1. **worktree 里没有 `node_modules` 和 `.env`**（都被 gitignore）。
   `npm install` 一遍太慢，可以从主工作区软链过来：
   `ln -s /主工作区/admin/node_modules admin/node_modules`，
   `.env` 直接 `cp`。**但 `.env` 复制前必须确认 `DATABASE_URL` 指向本地**——
   本项目主工作区的 `.env` 指的是 localhost，如果指的是 RDS，
   在上面跑迁移就是直接改生产库。
2. **同一台机器上可能有别的对话的服务在跑**。本次 `ps` 里就有一个跑在
   `.claude/worktrees/fix-test-findings/server` 的后端进程。
   端口冲突时**先查是谁在用**（`lsof -a -p <pid> -d cwd`），别直接杀。

## 防护规则

1. **在 worktree 里起服务后，第一件事是核对进程 cwd**，别等接口 404 才怀疑。
   同理适用于任何「跑起来验证」的工具：先确认它跑的是不是你改的那份。
2. **`preview_start` 的 `name` 模式在 worktree 里不可信**，用后台命令 + 绝对路径代替。
3. **接口 404 而代码里明明有**，排查顺序应该是：
   进程 cwd → 服务是否重启过 → 才轮到路由顺序（踩坑 001）和模块导出。

## 涉及文件

| 文件 | 说明 |
|------|------|
| `.claude/launch.json` | 相对 `cwd` 在 worktree 下会解析到主工作区（该文件未纳入版本管理） |
