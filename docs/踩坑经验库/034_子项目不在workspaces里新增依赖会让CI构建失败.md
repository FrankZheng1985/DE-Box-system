# 034 · 子项目不在 workspaces 里，新增独有依赖会让 CI 构建失败（本地却全绿）

> 发现日期：2026-08-03（P9 给 carrier-portal 引入 react-i18next 之后）
> 涉及文件：`package.json`（根）、`.github/workflows/deploy.yml`

## 问题现象

本地一切正常：`npm run build:check` 通过、手工 scp 部署上线、生产页面验证全对。
但 GitHub Actions 的 **Deploy to Production 连续三次全红**：

```
[vite]: Rollup failed to resolve import "i18next"
  from "carrier-portal/src/i18n/index.ts"
```

关键是**在这之前 CI 一直是绿的**，同一个 carrier-portal 也一直在 CI 里构建。

## 根本原因

根 `package.json` 的 workspaces 漏了 `carrier-portal`：

```json
"workspaces": ["admin", "customer-portal", "server"]
```

而 CI 只在根目录跑一次 `npm install`，然后直接 `cd carrier-portal && npm run build`。
`carrier-portal` 不在 workspaces 里 → 它的依赖**从来没被安装过**。

**那为什么以前能构建成功？**
因为 carrier-portal 原有的依赖（`react`、`react-dom`、`react-router-dom`、
`lucide-react`、`clsx`）**admin 和 customer-portal 也都有**，npm 把它们提升（hoist）
到了根 `node_modules/`，carrier-portal 构建时顺着 Node 的向上查找规则**借到了**。

所以这是个**一直存在、但被依赖提升掩盖着的配置错误**。
只要给 carrier-portal 加一个**别人没有的新依赖**，掩盖立刻失效。
`i18next` 就是那第一个。

同样的遗漏还有两处，都是同一个原因（carrier-portal 是后加的，加的时候没同步）：
- 根 `package.json` 的 `install:all` 脚本里也没有它
- `carrier-portal/src/vite-env.d.ts` 缺失（另外两端都有，见开发记录）

## 为什么本地发现不了

本地是 `cd carrier-portal && npm install`，装进了它自己的 `carrier-portal/node_modules/`，
所以本地怎么构建都对。**CI 是从干净仓库开始的，没有那个目录。**

这是"本地绿、CI 红"最经典的一类：**本地有历史遗留的安装产物，CI 没有。**

## 解决方案

CI 里给它补一次独立安装（`carrier-portal/package-lock.json` 已提交且同步，用 `npm ci` 可复现）：

```yaml
- name: Install Carrier Portal Dependencies
  run: cd carrier-portal && npm ci

- name: Build Carrier Portal
  run: cd carrier-portal && npm run build
```

同时把 carrier-portal 补进根 `install:all` 脚本。

> **没有选"把 carrier-portal 加进 workspaces"**：那样更彻底，但会重算根
> `package-lock.json`，可能连带改动 admin / customer-portal / **server** 的依赖版本，
> 而 server 是跑生产的。为一个 CI 问题去动生产后端的依赖树，风险不划算。
> 真要做，应该单独开一个任务、三端加后端逐个回归验证。

## 防护规则

1. **给任何子项目加新依赖前，先确认它在不在根 `workspaces` 里**：
   ```bash
   node -p "require('./package.json').workspaces"
   ```
   不在里面，就得确认 CI 有没有为它单独安装。
2. **判断"这个依赖是不是别人也有"**——如果是全新的、独有的依赖，
   依赖提升就救不了你，八成会在 CI 炸。
3. **改完 CI 要在本地按 CI 的顺序完整复现一遍**，而不是只在子目录里 build：
   ```bash
   rm -rf carrier-portal/node_modules   # 模拟干净环境
   npm install                          # 根
   cd admin && npm run build
   cd ../customer-portal && npm run build
   cd ../carrier-portal && npm ci && npm run build
   ```
4. **push 之后要回头看一眼 Actions 是不是绿的**。本次是连红三次、
   靠 Frank 主动截图才发现——手工 scp 部署成功会给人"已经上线了"的错觉，
   掩盖 CI 已经瘫了的事实。

## 附带发现：CI 失败时生产是什么状态

CI 是**先构建、后 rsync**。构建这一步就失败了，所以 **rsync 从未执行**——
生产上跑的一直是手工 scp 上去的版本，没有被半吊子部署污染。
但反过来说：**这三次提交的后端代码 CI 也没传过**，
如果当时只依赖 CI 而没手工部署，生产就是旧代码。

## 关联

- 踩坑 014（build 脚本不做类型检查）：同属"验证手段没覆盖到，问题静默积累"
- 踩坑 006（NPM 包装错目录）：同样是依赖装到了预期之外的位置
