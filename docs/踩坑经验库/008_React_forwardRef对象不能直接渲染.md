# 踩坑记录 008：lucide-react 图标作为 React children 渲染报错

## 问题现象
页面白屏，报错 `Minified React error #31`，错误信息包含 `object with keys {$$typeof, render, displayName}`。

## 根本原因
lucide-react 的图标组件是 `forwardRef` 对象。直接作为 JSX children 渲染（而不是作为组件调用）会报错。

```jsx
// ❌ 错误：把组件对象当 children 渲染
<div>{Package}</div>           // Package 是 forwardRef 对象
<StatCard icon={Package} />    // StatCard 内部 {icon} 渲染对象

// ✅ 正确：调用组件
<div><Package className="w-5 h-5" /></div>
<StatCard icon={<Package className="w-5 h-5" />} />
```

## 解决方案（StatCard 组件兼容处理）
```typescript
import { isValidElement } from 'react'

// 判断传入的是 JSX 元素还是组件引用
if (isValidElement(Icon)) {
  iconElement = Icon                          // 已经是 <Package />
} else if (Icon) {
  iconElement = <Icon className="w-5 h-5" />  // 是 Package，需要调用
}
```

## 防护规则
**组件 props 接收图标时，类型用 `any`，内部用 `isValidElement()` 判断后再渲染。不要假设一定是 JSX 元素或一定是组件引用。**
