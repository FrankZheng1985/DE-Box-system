import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// ==================== 类型定义 ====================

interface PaginationProps {
  /** 当前页码，从 1 开始 */
  page: number
  /** 总条数（后端 pagination.total） */
  total: number
  /** 每页条数 */
  pageSize: number
  /** 翻页回调 */
  onChange: (page: number) => void
}

// 中间连续页码最多显示几个
const MAX_VISIBLE = 5

// ==================== 页码计算 ====================

/**
 * 算出要显示哪些页码，中间用 '...' 省略
 * 例：总 20 页当前第 9 页 → [1, '...', 8, 9, 10, '...', 20]
 */
function buildPageList(currentPage: number, totalPages: number): (number | string)[] {
  const pages: (number | string)[] = []

  // 页数不多就全部列出来
  if (totalPages <= MAX_VISIBLE + 2) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
    return pages
  }

  // 第一页始终显示
  pages.push(1)

  let start = Math.max(2, currentPage - 1)
  let end = Math.min(totalPages - 1, currentPage + 1)

  // 保证中间至少显示 3 个页码
  if (start <= 2) {
    end = Math.min(totalPages - 1, start + 2)
  }
  if (end >= totalPages - 1) {
    start = Math.max(2, end - 2)
  }

  if (start > 2) pages.push('...')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < totalPages - 1) pages.push('...')

  // 最后一页始终显示
  pages.push(totalPages)

  return pages
}

// ==================== 组件 ====================

/**
 * 列表分页条
 *
 * 统一了原来 11 个列表页各自重复的分页 UI —— 之前有的只有「< 1/5 >」，
 * 有的带 5 个固定页码，有的带省略号，行为和样式都对不齐。
 * 这里取原 OrderManagement 那份最完整的省略号算法作为统一实现。
 *
 * 总条数为 0 时不渲染（列表为空时页面会显示自己的空状态）。
 */
export default function Pagination({ page, total, pageSize, onChange }: PaginationProps) {
  const { t } = useTranslation()

  if (total <= 0) return null

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageList = buildPageList(page, totalPages)

  return (
    <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-4">
      <div className="text-xs text-slate-500">
        {t('common.totalCount', { count: total })}
        <span className="mx-1">·</span>
        {t('common.page', { page, total: totalPages })}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label={t('common.prevPage')}
          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50
            disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {pageList.map((item, idx) =>
          item === '...' ? (
            <span key={`ellipsis-${idx}`} className="px-2 py-1 text-xs text-slate-400">
              ...
            </span>
          ) : (
            <button
              key={item}
              onClick={() => onChange(item as number)}
              className={`min-w-[32px] h-8 px-2 text-xs rounded-lg border transition-all duration-200 ${
                page === item
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {item}
            </button>
          )
        )}

        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label={t('common.nextPage')}
          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50
            disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
