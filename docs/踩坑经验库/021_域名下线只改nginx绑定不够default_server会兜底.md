# 021 域名下线只改 nginx 绑定不够，default_server 会兜底放行

## 问题现象

已经把 nginx 里旧域名 `box-cargo.de` 的 `server_name` 删掉、改成按 IP 访问，
以为域名就此失效。结果浏览器打开 `https://box-cargo.de/dashboard`
**整个系统照常加载，能登录、能看数据**，只是地址栏显示"不安全"。

## 根本原因

nginx 的 `default_server` 是**兜底**，不是**白名单**。

配置里保留了这么一块给 IP 直访：

```nginx
server {
    listen 443 ssl http2 default_server;
    server_name _;
    ...
    include /etc/nginx/snippets/eutms-app.conf;
}
```

`server_name _` 配合 `default_server` 的语义是：
**任何没有匹配到具体 server_name 的请求，全部落到这里。**

旧域名的 DNS 还指向这台服务器 → 请求打进来 → 没有任何 server 块声明
`server_name box-cargo.de` → 落进 default_server 兜底块 → 系统被正常服务。

所以"不再绑定域名"和"域名访问不了"是两回事。删掉绑定只是让它**不再有专属配置**，
反而让它掉进兜底块。浏览器显示"不安全"只是因为兜底块用的是自签名 IP 证书，
和"能不能访问"无关 —— 用户点一下"继续前往"就进去了。

## 解决方案

要断开某个域名，必须**显式给它一个拒绝块**，不能靠"不配置"：

```nginx
# 旧域名：已弃用，明确断开
server {
    listen 80;
    server_name box-cargo.de www.box-cargo.de;
    return 444;                    # 直接关闭连接，不返回任何内容
}

server {
    listen 443 ssl http2;
    server_name box-cargo.de www.box-cargo.de;
    ssl_reject_handshake on;       # nginx 1.19.4+ 拒绝 TLS 握手，连证书都不出示
}
```

`ssl_reject_handshake on` 比 `return 444` 更彻底：连接在 TLS 握手阶段就被拒，
浏览器连证书警告页都拿不到，不存在"点继续前往就能进"的余地。

## 配套动作（容易漏）

1. **删掉该域名的 Let's Encrypt 证书和续期任务**
   `certbot delete --cert-name 旧域名`
   因为 80 端口现在返回 444，HTTP-01 验证必然失败，留着只会持续发续期失败报警邮件。

2. **DNS 才是真正的断开 —— 但删不掉也不一定要紧**
   服务器侧只能做到"拒绝服务"。域名解析记录在注册商那里，
   要彻底断开得去后台删 A / CNAME 记录。

   **如果进不去注册商后台（本项目 2026-08-02 就是这样），可以不删**，前提是
   解析指向的 IP 仍在自己手里：服务器已拒绝服务，访问者看不到任何内容，
   别人也拿不到那个 IP，不存在接管风险。

   🚨 **但释放或更换那台服务器之前，必须先处理这条 DNS。**
   云厂商会回收 IP 再分配，届时旧域名还指着它的话，新的 IP 持有者就能用
   你的域名提供任意内容 —— 而且能通过 HTTP-01 验证**合法申请到 Let's Encrypt
   证书**，做出一个带绿锁的假站。这就是域名接管（domain takeover）。
   风险不是"现在有"，而是"换服务器那天突然成立"，最容易忘。

3. **验证要在服务器本地做**
   在自己电脑上 `curl` 可能被本机 HTTP 代理截胡返回 502，
   看起来像是服务器返回的，其实不是。用：

   ```bash
   ssh 服务器 "curl -s -o /dev/null -w '%{http_code}' -H 'Host: 旧域名' http://127.0.0.1/"
   ssh 服务器 "curl -sk -o /dev/null -w '%{http_code}' --resolve 旧域名:443:127.0.0.1 https://旧域名/"
   ```

   两个都返回 `000` 才算真断开。

## 防护规则

- **下线域名 = 加拒绝块，不是删配置块。** 只要 default_server 存在，删掉绑定等于放行。
- 改完必须**逐个域名实测**：旧域名断开、新域名 200、IP 直访 200，三者都要验，
  别只测旧域名就收工 —— 拒绝块写错 server_name 会误伤兜底块。
- 本机 curl 结果不可信，一律回服务器本地测。

## 涉及文件

- `/etc/nginx/sites-available/germany-box`
- 备份：`germany-box.bak-20260802_004836-before-block-oldDomain`
