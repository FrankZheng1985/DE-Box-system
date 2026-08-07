# 057 · nginx 前缀匹配把管理端路由吃掉，页内点没事、一刷新就白屏

> 发现日期：2026-08-07（想验车型下拉，直接输网址进「运输公司」页，一片空白）
> 涉及文件：`/etc/nginx/snippets/eutms-app.conf`（**不在仓库里**）

## 问题现象

管理端「运输公司」页：

- **从侧边栏点进去** → 正常
- **直接输网址 `/carriers`，或在该页按 F5** → **整页空白**

不报 404、不报错，就是白屏。控制台也没有明显异常（加载的是另一个 SPA 的壳）。

## 根本原因

nginx 的 `location /carrier` 是**前缀匹配**，`/carriers` 同样以 `/carrier` 开头，
于是被承运商门户接走了：

```nginx
location /carrier {                      # ← 少一个结尾斜杠
    alias /var/www/germany-box-system/carrier-portal/dist;
    try_files $uri $uri/ /carrier/index.html;
}
```

```bash
curl -s https://…/carriers | grep '<title>'
#  <title>KALUNA SPED 承运商门户   ← 错，应该是运输管理系统
curl -s https://…/orders   | grep '<title>'
#  <title>KALUNA SPED 运输管理系统  ← 对
```

浏览器拿到的是**承运商门户的 index.html**，它的前端路由里没有 `/carriers`
这条路由，于是渲染出一片空白。

**为什么页内点击没事**：那是 React Router 的前端跳转，压根不经过 nginx。
只有「首次加载 / 刷新 / 直接输网址」才会真的向服务器要这个路径。

## 解决方案

三个门户的 location **都加结尾斜杠**，并各配一条精确匹配处理裸路径：

```nginx
location = /carrier { return 301 /carrier/; }
location /carrier/ {
    alias /var/www/germany-box-system/carrier-portal/dist/;   # alias 也要加斜杠
    include snippets/eutms-security-headers.conf;
    try_files $uri $uri/ /carrier/index.html;
}
```

加斜杠后 `/carriers` 不再匹配，落到最后的 `location /` 交给管理端 SPA。
精确匹配那条负责把用户输的裸 `/carrier` 301 到 `/carrier/`，
否则它会掉进管理端。

**三个门户一起改**：今天只有 `/carriers` 撞上，但 `/admin` 会吃
`/administrators`、`/customer` 会吃 `/customers`，是同一个隐患。

## 防护规则

1. **nginx 的 `location /前缀` 是前缀匹配，不是目录匹配**。
   凡是给 SPA 挂子路径，一律写成 `location /前缀/`（带斜杠）
   ＋ `location = /前缀`（301 到带斜杠版本）。
2. **加子路径前先想一遍：现有路由里有没有以它开头的？**
   本例 `/carrier` vs `/carriers` 只差一个 s。
   （`/customs` 和 `/customer` 差一个字母，侥幸没撞。）
3. **SPA 的路由必须"直接输网址"验一遍，不能只在页内点**。
   前端路由跳转不经过 nginx，页内点击**永远测不出**这类问题。
4. **改 nginx 前后各跑一遍同一套探测脚本，逐行 diff**。
   本次 14 条路径里应当**只有 `/carriers` 一行变化**，其余一字不动；
   有第二行变化就说明改出了副作用。
5. 别忘了验 **静态资源**（`alias` 加斜杠最容易改坏路径）、
   **深层路由刷新**、**安全响应头还在不在**。

## 排查/验证命令

```bash
# 看某路径实际返回哪个 SPA
curl -s https://kalunasped.com/carriers | grep -oE '<title>[^<]*'

# 裸路径应当 301
curl -s -o /dev/null -w '%{http_code} → %{redirect_url}\n' https://kalunasped.com/carrier

# 改配置必须先语法检查，通不过绝不 reload
nginx -t && systemctl reload nginx
```

## ⚠️ nginx 配置原本不在仓库里（本次已纳入）

改动只存在于服务器上时，**git 里零记录，重装服务器修复就丢了**。
本次已把线上生效的这份存进仓库：`deploy/nginx-eutms-app.conf`。

- **它不会被 CI 自动部署**：改了必须手工 `scp` 到
  `/etc/nginx/snippets/eutms-app.conf` 再 `nginx -t` + `reload`
- 回滚仍靠服务器备份 `/etc/nginx/snippets/eutms-app.conf.bak-<时间戳>`
  （改前务必先 `cp` 一份）

**同目录的 `deploy/nginx.conf` 是过时的**（只有 `/admin` `/customer`、
没有 `/carrier`、也不是 snippets 结构），照着它改会得到错配置，别用。

## 关联

- 踩坑 050（`rsync --delete` 让手工放进部署目录的文件静默消失）：
  同属"服务器上的东西不在 git 里，说没就没"
