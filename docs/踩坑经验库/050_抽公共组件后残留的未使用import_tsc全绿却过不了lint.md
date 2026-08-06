# 050 抽公共组件后残留的未使用 import：tsc 全绿，却过不了 lint

## 问题现象

把 8 个页面里各写一份的内联 `Toast`、11 个页面里各写一份的分页 UI 抽成公共组件，
删掉页面里的内联定义、换成 import 之后：

```
npx tsc --noEmit     → 退出码 0，一个错都没有 ✅
npm run lint         → ✖ 5 errors  ❌
```

报的全是同一类：

```
'CheckCircle' is defined but never used.   @typescript-eslint/no-unused-vars
'ChevronLeft' is defined but never used.   @typescript-eslint/no-unused-vars
```

如果按「tsc 过了就等于没问题」收工，CI 会直接挂在 lint 这一步。

## 根本原因

被删掉的内联组件是**图标的唯一使用者**：

```tsx
// 删之前：这几个图标只在内联 Toast 里用到
import { CheckCircle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'

function Toast({ type, ... }) {
  return type === 'success' ? <CheckCircle /> : <AlertCircle />   // ← 唯一用处
}
```

删掉函数体，import 就成了孤儿。而**本项目的 tsconfig 明确关掉了这项检查**：

```jsonc
// admin/tsconfig.json
"noUnusedLocals": false,      // ← 所以 tsc 对未使用的 import 完全沉默
"noUnusedParameters": false,
```

未使用变量的把关全靠 eslint 的 `@typescript-eslint/no-unused-vars`，而它是 **error 级**
（规范里「未使用的变量用 `_` 前缀忽略」说的就是这条规则）。
于是形成一个盲区：**类型安全的门禁和代码整洁的门禁是两套，各管各的，只跑一个必然漏。**

## 正确做法

删除任何一段代码后，**先数一下它用到的符号在文件里还剩几处**，再决定 import 留不留：

```bash
# 删 Toast 定义前，先确认这些图标是不是只有它在用
grep -c 'CheckCircle' pages/OrderDetail.tsx     # 4 → import + Toast + 别处 2 处，要留
grep -c 'AlertCircle' pages/InquiryEdit.tsx     # 2 → import + Toast，删完就是孤儿，要一起删
```

同一批改动里，不同文件的答案可能不一样：本次 8 个页面里，
OrderDetail / QuotationManagement 的 `CheckCircle` 别处还在用（保留），
而 InquiryEdit / InquiryDetail 的删完就成孤儿（必须删）。**不能一刀切。**

## 附带踩到的第二个坑：组件名和本地 interface 重名

`OrderManagement.tsx` 里本来就有一个描述分页元数据的类型：

```tsx
interface Pagination { total: number; page: number; pageSize: number }
const [pagination, setPagination] = useState<Pagination>({ ... })
```

新组件也叫 `Pagination`，直接 `import Pagination from '../components/Pagination'`
会和它撞成 `Duplicate identifier`。这个 tsc 倒是会报，但顺手把本地 interface 改名
就属于「重构不相关的代码」了。正确做法是**导入时起别名**：

```tsx
import PaginationBar from '../components/Pagination'   // 本地已有 interface Pagination
```

## 防护规则

1. **前端改动的验收门禁是三条，缺一不可**：
   `npx tsc --noEmit` + `npm run lint` + `npm run build`。
   tsc 绿 ≠ lint 绿 —— 本项目 `noUnusedLocals: false`，未使用 import 只有 lint 抓得到。
2. **跑门禁前先取基线**。本次改动前主工作区跑出的是 `0 error / 25 warning`，
   改完仍是 `0 error / 25 warning` 才敢说「没引入新问题」。
   不取基线就无法区分「我引入的」和「本来就有的」，容易要么白改一通、要么放过自己的错。
3. **删代码要连它的 import 一起结算**，别只删函数体。判断依据是 `grep -c` 的计数，不是印象。
4. 新公共组件命名前，先 `grep -rn "interface <名字>" src/` 看有没有撞车；
   撞了就在导入侧起别名，不要去改别人的类型定义。

## 涉及文件

- `admin/tsconfig.json`（`noUnusedLocals: false` —— 盲区的来源）
- `admin/.eslintrc.cjs`（`no-unused-vars` 为 error）
- 本次涉及的 16 个页面文件，详见 `docs/开发记录/2026-08-06-前端基础组件抽取.md`
