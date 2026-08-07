# 060 · SPA 的 index.html 没设 no-cache，每次部署都白屏一批人

## 问题现象

刚部署完前端，用户打开页面报「应用渲染错误」，控制台一片：

```
Failed to load module script: Expected a JavaScript-or-Wasm module script
but the server responded with a MIME type of "text/html".

TypeError: Failed to fetch dynamically imported module:
https://kalunasped.com/assets/CarrierDetail-8MLjU73o.js
```

迷惑点在于：**服务器上根本没有 `CarrierDetail-8MLjU73o.js` 这个文件**，
线上是 `CarrierDetail-Cj0a5prC.js`。用户请求的是一个**上一版**的文件名，
而且请求还返回 **200**（不是 404），内容却是 HTML。

同时用户还会撞上「明明后端已经修好的 bug 还在」——因为他跑的整个前端都是旧的。

## 根本原因

三件事叠在一起：

1. **index.html 被浏览器缓存了**。nginx 的 `location /` 没写 `Cache-Control`，
   走的是默认的**启发式缓存**（只有 ETag / Last-Modified 时，浏览器按
   「上次修改到现在的时长 × 10%」自己估一个过期时间，可能几分钟到几小时）。
   index.html 里写死了带 hash 的入口文件名，它一旦被缓存住，
   用户就会**继续去要上一版的 chunk**。

2. **旧 chunk 已经被删了**。部署规范里那句 `rm -rf .../dist/assets/*`
   是为了不留垃圾，但它同时把缓存住旧 index.html 的用户的"退路"也断了。

3. **SPA 兜底把 404 伪装成了 200**。`try_files $uri $uri/ /index.html`
   对 `/assets/xxx.js` 同样生效：文件不存在 → 返回 index.html，
   HTTP 200 + `Content-Type: text/html`。浏览器按 ES module 解析 HTML，
   于是报出「MIME type」这种和真实病因八竿子打不着的错。

**每次部署都会咬一批人**，只是不一定谁会反馈。

## 错误代码

```nginx
# ❌ 没有 Cache-Control，index.html 走启发式缓存
location / {
    try_files $uri $uri/ /index.html;
    include snippets/eutms-security-headers.conf;
}
```

## 正确代码

```nginx
# ✅ 带 hash 的构建产物：文件名变了才是新文件，可以永久缓存
#    故意不配 try_files —— 找不到就老实 404，别返回 index.html 冒充 JS
location /assets/ {
    include snippets/eutms-security-headers.conf;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

# ✅ index.html 与不带 hash 的文件：每次都验一下
location / {
    try_files $uri $uri/ /index.html;
    include snippets/eutms-security-headers.conf;
    add_header Cache-Control "no-cache";
}
```

三端（管理端 / 客户门户 / 承运商门户）是同一个病，要一起改。
门户是 `alias` 部署，assets 的 location 也要各自写 alias：

```nginx
location /customer/assets/ {
    alias /var/www/germany-box-system/customer-portal/dist/assets/;
    include snippets/eutms-security-headers.conf;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

## 防护规则

1. **凡是 SPA，`index.html` 必须 `no-cache`，带 hash 的 assets 才能 `immutable`**。
   这两条是一对，只做一半没意义：光给 assets 加长缓存而 index.html 也被缓存，
   等于把用户钉死在旧版本上。
2. **`no-cache` 不是"不缓存"**，是"每次带 ETag 回来验一下"，命中直接 304。
   实测 `/dashboard` 带 `If-None-Match` 回的就是 304，开销可以忽略。
   要"完全不存"是 `no-store`，SPA 不需要。
3. **assets 的 location 不要配 try_files**。让缺失的资源老实 404，
   比返回 index.html 冒充 JS 好得多——后者会把"资源过期"伪装成"语法错误"，
   排查方向直接跑偏。
4. **dist 根目录里不带 hash 的文件**（本项目的 `legal.css` / `legal.js` /
   `impressum.html` / `datenschutz.html` / `agb.html`）正需要 no-cache，
   别为了性能顺手把 `location /` 也改成长缓存。
5. **改完必须逐项探测，不能只看 `nginx -t` 通过**：
   ```bash
   curl -sI https://域名/dashboard | grep -i cache-control      # 应 no-cache
   curl -sI https://域名/assets/index-xxx.js | grep -i cache-control  # 应 immutable
   ```
   并且回归 `/admin/`、`/carrier`、`/customer` 的 301 和官网首页，别改坏路由。
6. 用户报「部署了但没生效 / 白屏」时，**先让他硬刷新（Cmd+Shift+R）确认是不是缓存**，
   再去查代码。对照方法：看控制台里加载的 bundle hash 和线上 `index.html`
   引用的 hash 是否一致，不一致就是缓存。

## 涉及文件

| 文件 | 说明 |
|---|---|
| `deploy/nginx-eutms-app.conf` | 三端各加 assets 长缓存 location + index.html no-cache |

> 这份配置**不在 CI 里**，改了必须手工 scp 到 `/etc/nginx/snippets/eutms-app.conf`，
> 再 `nginx -t` + `systemctl reload nginx`。
