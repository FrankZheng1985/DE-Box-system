# 2026-08-01 FinanceManagement 类型错误修复任务（并行撞车复盘 + 文档沉淀）

## 模块

运营管理端 · 财务管理页面（admin/src/pages/FinanceManagement.tsx）

## 任务背景

`npx tsc --noEmit` 曾在 FinanceManagement.tsx 报 7 条存量类型错误（3 处 fmt 的
TS2345 + 4 处 ClientProfit 缺字段的 TS2339），从未暴露的原因是 admin 的 `build`
脚本只跑 `vite build` 不做类型检查（见踩坑 014）。

## 结果：本会话未上线任何代码改动

同一天有三个对话并行处理财务页，全部错误已由另外两个对话修复上线：

| 提交 | 内容 |
|------|------|
| 0818d81 | 修复利润卡片前后端字段名错配（ClientProfit 接口对齐 + company_name 显示） |
| 4149b6d | fmt 签名放宽为 `string \| number`、内部统一 `Number()`，消除 3 处 TS2345 |

本会话原本用"调用处逐个包 `Number()`"的方案修了同一批错误，rebase 后发现
主线方案已上线且更收敛（一处改完、后续金额字段直接传字符串也合法），按
「绝不和其他对话对着干」规则整体放弃本会话代码改动，以主线为准。

**过程中两次踩到 rebase 陷阱**（详见踩坑 015）：rebase 无文本冲突却把主线刚
上线的接口重写、fmt 方案、甚至主线新增的开发记录文档（重命名探测误判）静默
回退/删除，靠逐块检查 `git diff origin/main..HEAD` 才拦住，未污染主线。

## 本次实际修改（纯文档）

| 文件 | 操作 | 说明 |
|------|------|------|
| docs/开发记录/2026-08-01-修复FinanceManagement类型错误.md | 新增 | 本文，撞车复盘 |
| docs/踩坑经验库/014_build脚本不做类型检查错误静默累积.md | 新增 | vite build 不查类型的教训 |
| docs/踩坑经验库/015_rebase无文本冲突但语义回退主线修复.md | 新增 | rebase 静默回退陷阱与防护 |

另：全局 CLAUDE.md 上线流程已补第 5 步「push 前逐块检查 `git diff origin/main..HEAD`」。

## 关联影响分析

- **代码零改动**：admin/src/pages/FinanceManagement.tsx 与主线 4149b6d 完全一致；
  `npx tsc --noEmit` 全项目零错误。
- **验证**：确认 OrderManagement.tsx 的 7 条存量错误也已随主线修复清零。
- **遗留**：无。三个并行对话的产物已全部合流到 main。
