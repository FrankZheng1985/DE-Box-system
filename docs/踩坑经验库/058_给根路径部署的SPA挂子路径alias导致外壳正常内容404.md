# 058 给根路径部署的 SPA 挂子路径 alias，导致「外壳正常、内容 404」

**日期**：2026-08-07
**模块**：运维 / nginx / 管理端路由
**相关**：踩坑 007（Vite base 与 nginx 不匹配）、踩坑 057（nginx 前缀匹配吃掉管理端路由）

---

## 问题现象

浏览器打开 `https://kalunasped.com/admin/`：

- 页面**不是白屏、不是 502**，KALUNA SPED 的左侧菜单、顶栏、语言切换、
  右上角「系统管理员」全都正常渲染出来了
- 但正中间的内容区显示一张卡片：**「页面不存在 / 地址栏里的这个页面找不到。可能是链接过期或输错了地址。」**
- 点左侧任意一个菜单，一切又立刻正常

这种「一半对一半错」的样子最容易误判方向——看着像某个页面组件坏了、
或者权限/登录态出了问题，实际跟业务代码毫无关系。

---

## 根本原因

**管理端 SPA 部署在根路径，从来就没有 `/admin` 这个前缀。**

三处证据：

| 位置 | 实际值 |
|------|--------|
| `admin/vite.config.ts` | `base: '/'` |
| `admin/src/App.tsx` | 路由是 `/dashboard`、`/orders`、`/inquiries`…**没有一条带 `/admin`** |
| `<BrowserRouter>` | **没有设 `basename`** |

而 nginx 里却另外挂了一个 `/admin/` 的 alias 块，把 `admin/dist` 也映射了一份。
于是访问 `/admin/` 时发生的是：

1. nginx 命中 `location /admin/`，正常返回管理端 `index.html`（HTTP 200）
2. HTML 里的资源引用是 `/assets/index-xxx.js`（因为 `base:'/'`），
   走最后的 `location /` 也能正常拿到 → **SPA 成功启动**
3. `AuthContext` 读到 localStorage 里的有效登录态 → `Layout` 正常渲染，
   侧边栏、顶栏、用户名全出来
4. React Router 拿 `pathname = "/admin/"` 去比对路由表，**一条都不匹配**
   → 落到兜底的 `<Route path="*" element={<NotFound />} />`

所以「外壳」由 Layout 渲染（对的），「内容」由路由决定（404）。

**危险之处**：任何一步都不报错，nginx 日志里是干净的 200，
前端 console 也没有异常。它是一个纯粹的「地址空间不匹配」，
没有任何一个环节会主动喊出来。

---

## 错误代码

```nginx
# deploy/nginx-eutms-app.conf —— 管理端明明在根路径，却给它挂了 /admin/ 的 alias
location = /admin { return 301 /admin/; }
location /admin/ {
    alias /var/www/germany-box-system/admin/dist/;
    include snippets/eutms-security-headers.conf;
    try_files $uri $uri/ /admin/index.html;
}
```

注意这里**不能靠删掉这个 block 解决**：删了以后 `/admin/` 会落到最后的
`location /`，照样返回 index.html，前端照样匹配不到路由，还是 404。
必须显式重定向。

---

## 正确代码

```nginx
# 运营管理端：SPA 部署在**根路径**，不在 /admin 下。
location = /admin  { return 301 /dashboard; }
location = /admin/ { return 301 /dashboard; }
location /admin/   { rewrite ^/admin/(.*)$ /$1 permanent; }
```

三行各管一件事：

- `= /admin` / `= /admin/` 是**精确匹配**（优先级高于前缀匹配），
  裸路径没有下级页面可去，直接送到仪表板
- `location /admin/` 前缀匹配 + `rewrite` 负责带路径的老书签：
  `/admin/orders` → `/orders`、`/admin/settings/number-ranges` → `/settings/number-ranges`，
  query string 会自动保留
- 用 `permanent`（301）而不是 302，让浏览器和搜索引擎记住新地址

同时保留了踩坑 057 的修复：`location = /admin`（精确）不会再吃掉
`/administrators` 这类同前缀的管理端路由。

---

## 验证方法

改完必须逐条探，不能只看 `/admin/` 一条：

```bash
for u in /admin /admin/ /admin/orders /administrators /dashboard /customer/ /carrier/ / ; do
  printf "%-20s %s\n" "$u" "$(curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}' https://kalunasped.com$u)"
done
```

期望结果：

```
/admin               301 -> https://kalunasped.com/dashboard
/admin/              301 -> https://kalunasped.com/dashboard
/admin/orders        301 -> https://kalunasped.com/orders
/administrators      200            ← 没被 /admin 吃掉（踩坑 057）
/dashboard           200
/customer/           200            ← 门户不受影响
/carrier/            200
/                    200            ← 官网
```

两个门户还要额外核 `<title>`，确认返回的是各自的 index.html
而不是被管理端串了：

```bash
for u in /customer/ /carrier/ /dashboard / ; do
  printf "%-14s " "$u"; curl -s https://kalunasped.com$u | grep -o '<title>[^<]*</title>'
done
```

---

## 防护规则

1. **子路径部署是三处一致的事**，缺一处就出这种静默错乱：
   `vite.config.ts` 的 `base` + `<BrowserRouter basename>` + nginx 的 `location`/`alias`。
   要给管理端加 `/admin` 前缀，三处必须一起改；不打算改，就**别在 nginx 里
   单独给它开子路径入口**。
2. **「外壳正常但内容显示页面不存在」= 先怀疑 URL 前缀，不要先查业务代码。**
   判据很简单：点侧边栏菜单能恢复正常 → 说明 SPA 和登录态都是好的，
   问题只在你输入的那个 pathname 上。
3. **删 location 不等于修好**，SPA 兜底路由会把「路径不存在」伪装成
   「页面不存在」。要么正确设 basename，要么显式 301。
4. `deploy/nginx-eutms-app.conf` 是线上 snippet 的版本管理副本，
   **不在 CI 里**，改完必须 `scp` + `nginx -t` + `systemctl reload nginx`，
   并在改前后各做一次逐行 diff 确认只动了预期那几行。
5. 门户（`/customer/`、`/carrier/`）是**真的**子路径部署，各有独立 dist，
   那两块的 alias 是对的，别顺手一起改。

---

## 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `deploy/nginx-eutms-app.conf` | 修改 | `/admin` 的 alias 块改为 301/rewrite，附带原因注释 |
| `/etc/nginx/snippets/eutms-app.conf`（线上） | 同步 | scp 覆盖，备份为 `eutms-app.conf.bak-20260807-212003` |
| `.claude/CLAUDE.md` | 修改 | 「Nginx 路由规则」章节原来写 `/admin/ → 管理端 SPA`，是错的，已改正并加说明 |
