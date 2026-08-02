# 024 模块顶层裸 mkdirSync 让整个后端起不来

## 问题现象

在本机（或任何没有 `/var/www` 写权限的环境）启动后端，进程直接崩掉，
报的还是一个跟业务八竿子打不着的错：

```
Error: EACCES: permission denied, mkdir '/var/www/germany-box-system/uploads/cmr'
    at Object.mkdirSync (node:fs:1377:26)
    at file:///.../server/modules/cmr/routes.js:20:4
Node.js v22.22.0
```

不是某个接口 500，是**整个服务起不来**——所有模块一个都跑不了。
P5 开发时想在本地起服务验证权限中间件，就卡在这里，只能绕路写一个
"只挂部分路由"的迷你 express 才测得下去。

## 根本原因

`cmr/routes.js` 和 `customs/routes.js` 在**模块顶层**裸写了：

```js
const CMR_UPLOAD_DIR = '/var/www/germany-box-system/uploads/cmr'
fs.mkdirSync(CMR_UPLOAD_DIR, { recursive: true })
```

模块顶层的代码在 `import` 时就执行，抛出的异常没人接，
于是**一个可选的本地回退目录建不出来，代价是整个应用启动失败**。

这个目录本身只是 OSS 不可用时的兜底，平时根本用不到——
"建不出来"的实际影响远小于"服务起不来"。失效方向又反了
（同踩坑 023 的那类问题：容错设计要问"这一步失败会怎样"）。

`order/routes.js`（P2 写的）是对的，它包了 try/catch，
所以这个坑一直只在 cmr / customs 两个文件里潜伏着。

## 错误代码

```js
// ❌ 模块顶层裸跑，抛异常 = 整个后端起不来
const CMR_UPLOAD_DIR = '/var/www/germany-box-system/uploads/cmr'
fs.mkdirSync(CMR_UPLOAD_DIR, { recursive: true })
```

## 正确代码

```js
// ✅ 建不出来就算了，不能连累整个服务启动
const CMR_UPLOAD_DIR = '/var/www/germany-box-system/uploads/cmr'
try {
  fs.mkdirSync(CMR_UPLOAD_DIR, { recursive: true })
} catch {
  // 本地开发机没有 /var/www 写权限；OSS 正常时用不到这个目录
}
```

## 防护规则

1. **模块顶层（import 期）不做任何会抛异常的副作用**——建目录、读文件、
   连外部服务，全部要么包 try/catch，要么挪进真正用到它的函数里。
   顶层抛异常没有任何模块能兜住，直接是进程级失败。
2. **可选的兜底资源，初始化失败必须降级而不是终止。**
   判断标准：这个东西没有，功能是"少一条退路"还是"完全不能用"？
   前者一律 try/catch。
3. **一个模块的初始化不该能拖垮整个应用。** 同一类写法在别处已经做对了
   （`order/routes.js`），新增模块时照抄已有的正确范式，别自己重写一遍。
4. **本地能起服务是底线。** 如果一段代码让后端只能在生产环境跑起来，
   那所有本地验证都被堵死了——这本身就是要修的 bug，不是"本机环境问题"。

## 涉及文件

| 文件 | 说明 |
|------|------|
| `server/modules/cmr/routes.js` | mkdirSync 加 try/catch |
| `server/modules/customs/routes.js` | 同上 |
| `server/modules/order/routes.js` | 参照的正确写法（本次未改） |
| `server/scripts/test-permissions.js` | 修好后把 cmr/customs 一并挂进冒烟测试 |
