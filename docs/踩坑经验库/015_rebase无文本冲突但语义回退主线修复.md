# 015 rebase 无文本冲突，但把主线刚上线的修复语义回退了

## 问题现象

在 worktree 里修 FinanceManagement.tsx 的类型错误并提交后，`git rebase origin/main`
一次通过、零冲突，`tsc --noEmit` 也全绿。但检查 rebase 结果发现：主线 P1 提交
（a50ffe2）刚重写过同一个 `ClientProfit` 接口和利润卡片（修掉了 `client_name`
字段落空 bug），rebase 后的文件却变回了我基于旧代码写的版本——**如果直接 push，
就会把主线刚修好的 bug 原样带回生产**。

## 根本原因

git 的三方合并只看文本，不懂语义。双方改同一区域时合并结果可能"碰巧拼得通"而
不报冲突；类型检查也拦不住——回退后的版本恰好也能通过 tsc。
"rebase 成功 + CI 绿" 完全不等于 "没有覆盖别人的改动"。

## 错误做法

```bash
git rebase origin/main   # 无冲突
npx tsc --noEmit         # 通过
git push origin HEAD:main   # ← 直接推，把主线的修复回退了
```

## 正确做法

```bash
git rebase origin/main
# 除了看"将上线哪些提交"，还必须看"内容 diff 是否只含自己本意的改动"：
git diff origin/main..HEAD
# 逐块检查：凡是出现"自己没打算改的内容被改了/别人刚改的内容变回旧样子"，
# 都说明 rebase 语义翻车，要以主线版本为底重做自己的改动（git restore
# --source=origin/main -- <文件> 后重新叠加），再提交
```

本次的处理：`git restore --source=origin/main` 恢复文件，只重新叠加自己那三处
`Number()` 转换，`git commit --amend` 重做提交。

## 防护规则

1. rebase 后，`git diff origin/main..HEAD` 的每一块都必须是自己本意的改动，
   多一行都要查清来历——这一步和"看将上线哪些提交"同等强制。
2. rebase 前后发现主线动过自己正在改的文件（`git diff --name-only 旧base..origin/main`
   里出现自己的目标文件），一律人工核对该文件的合并结果，不信任"无冲突"。
3. 多对话并行开发时这种撞车概率高，见全局 CLAUDE.md「多对话并行协同」。

## 涉及文件

- admin/src/pages/FinanceManagement.tsx（本次差点被回退的接口与利润卡片）
