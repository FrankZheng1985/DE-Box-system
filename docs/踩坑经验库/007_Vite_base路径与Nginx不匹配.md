# 踩坑记录 007：Vite base 路径与 Nginx 部署路径不匹配

## 问题现象
前端页面空白，控制台报所有 JS/CSS 文件 404，URL 类似 `/assets/index-xxx.js`（缺少 `/customer/` 前缀）。

## 根本原因
Vite 构建时 `base: '/'`，但 Nginx 部署在 `/customer/` 子路径下。生成的 HTML 引用 `/assets/xxx.js`，但实际文件在 `/customer/assets/xxx.js`。

## 错误配置
```typescript
// ❌ vite.config.ts
base: '/'  // 但部署在 /customer/ 下
```

## 正确配置
```typescript
// ✅ 和 Nginx 部署路径一致
// customer-portal
base: '/customer/'

// carrier-portal
base: '/carrier/'

// admin（根路径部署）
base: '/'
```

## 防护规则
**Vite 的 `base` 配置必须与 Nginx 的 `location` 路径完全一致。**

| 项目 | Nginx location | Vite base |
|------|---------------|-----------|
| admin | `/` | `/` |
| customer-portal | `/customer` | `/customer/` |
| carrier-portal | `/carrier` | `/carrier/` |
