# 014 admin build 脚本不做类型检查，类型错误静默累积

## 问题现象

FinanceManagement.tsx 累积了 7 条 TypeScript 类型错误、OrderManagement.tsx 累积了
7 条，日常开发和部署全程无人发现——`npm run build` 一直是绿的，页面也能正常跑。

## 根本原因

admin/package.json 的 `build` 脚本只有 `vite build`。Vite 用 esbuild 转译 TS，
**只剥类型不做检查**，所以类型错误完全不拦构建。带类型检查的是 `build:check`
（`tsc && vite build`），但它不是部署流程用的默认脚本。

## 错误做法

```bash
# 只跑这个就以为类型没问题
npm run build
```

## 正确做法

```bash
# 想暴露类型错误，要么单独跑 tsc：
npx tsc --noEmit

# 要么用带检查的构建：
npm run build:check
```

## 防护规则

1. 改动 admin 前端后，提交前跑一次 `npx tsc --noEmit`，确认没有新增类型错误。
2. 看到"build 通过"不等于"类型没问题"——esbuild/Vite 不查类型。
3. 写 interface 时对照后端实际返回字段（踩坑 002：NUMERIC/BIGINT 是字符串；
   踩坑 011：字段名要对上），从源头少欠类型债。

## 涉及文件

- admin/package.json（`build` vs `build:check` 脚本）
- admin/src/pages/FinanceManagement.tsx（本次修复，2026-08-01）
- admin/src/pages/OrderManagement.tsx（存量错误已随 P1 改造 a50ffe2 一并修复）
