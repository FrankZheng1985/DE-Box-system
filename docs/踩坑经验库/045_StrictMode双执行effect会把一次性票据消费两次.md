# 045 React StrictMode 双执行 effect，会把一次性票据消费两次

## 问题现象

员工点「进入客户门户」→ 客户门户确实进去了、横幅正常、数据正常，
**功能看起来完全没问题**。但浏览器控制台里躺着两条：

```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

翻网络面板才看清：

```
POST /api/v1/auth/impersonate/exchange → 200 OK
POST /api/v1/auth/impersonate/exchange → 401 Unauthorized
```

同一张一次性票据被兑换了两次，第二次必然失败。

## 根本原因

开发模式下 `React.StrictMode` 会把组件 **mount → unmount → mount**，
`useEffect` 因此执行两遍。第一遍换票成功，第二遍拿同一张已用过的票去换，
后端如实返回 401。

**为什么"看起来没问题"**：第一次换票已经把登录态写进 localStorage，
`isAuthenticated` 变 true，跳转照常发生。成功纯属时序运气——
如果第二个请求先返回，`setError` 就会盖掉正常状态，变成随机白屏/报错。

**为什么 cleanup 里的 `cancelled` 标志挡不住**：

```tsx
useEffect(() => {
  let cancelled = false
  run()                        // ← 请求已经发出去了
  return () => { cancelled = true }   // 只能丢弃结果，收不回请求
}, [ticket])
```

`cancelled` 解决的是「组件卸载后别 setState」，
解决不了「同一个副作用被触发两次」。**票据在服务端那一刻就已经被标记成已用**，
客户端事后丢弃响应毫无意义。

## 错误代码

```tsx
useEffect(() => {
  if (!ticket) return
  let cancelled = false
  const run = async () => {
    const result = await loginWithTicket(ticket)   // ❌ StrictMode 下发两次
    if (cancelled) return
    ...
  }
  run()
  return () => { cancelled = true }
}, [ticket])
```

## 正确代码

用 `useRef` 做「只跑一次」的闸门，**并且去掉 cleanup 里的取消逻辑**：

```tsx
const exchangeStartedRef = useRef(false)

useEffect(() => {
  if (!ticket || exchangeStartedRef.current) return
  exchangeStartedRef.current = true            // ✅ 第二遍直接 return

  const run = async () => {
    const result = await loginWithTicket(ticket)
    if (result.success) navigate('/', { replace: true })
    else setError(result.message)
  }
  run()
  // 换票不可撤销，刻意不写 cleanup 去"取消"它
}, [ticket])
```

⚠️ **ref 闸门和 `cancelled` 标志不能同时用**：
StrictMode 的第一次 unmount 会把 `cancelled` 置 true，
而 ref 已经拦掉了第二遍 effect，于是那唯一一次请求的结果被丢弃 —— 页面卡在 loading。

## 同族场景

凡是**不可重放**的副作用都要这样处理，不能只靠 `cancelled`：

- 一次性令牌/票据兑换
- 扣款、下单等写操作
- 发送验证码
- 消费掉就没了的 URL 参数

## 顺带：state 挡不住连点

管理端「进入客户门户」按钮原本用 `if (impersonatingId) return` 防连点。
**state 要等下一次渲染才更新**，同一个事件循环里的两次点击都读到旧值，等于没挡。
防连点一律用 ref：

```tsx
if (impersonatingRef.current) return
impersonatingRef.current = true
```

## 防护规则

1. **不可重放的副作用放进 useEffect 时，必须加 ref 闸门**，不能只靠 cleanup 的取消标志。
2. **加了 ref 闸门就删掉 cancelled 逻辑**，两者并存会让唯一一次请求的结果被丢弃。
3. **验收时别只看"功能能用"，要看控制台和网络面板**——本次功能全程正常，
   问题只暴露在两条 401 里。
4. 防连点、防重复提交用 ref，不用 state。

## 涉及文件

| 文件 | 说明 |
|------|------|
| `customer-portal/src/pages/Login.tsx` | 票据兑换加 `exchangeStartedRef` 闸门，去掉 cancelled |
| `admin/src/pages/ClientList.tsx` | 防连点从 state 改为 `impersonatingRef` |
