import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ArrowLeft, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'

// ==================== 类型定义 ====================

interface Account {
  id: string
  account_code: string
  account_name: string
  account_type: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE'
  parent_code: string | null
  is_reconciliation: boolean
  is_postable: boolean
}

// 类型颜色映射
const TYPE_STYLES: Record<string, { bg: string; text: string; labelKey: string }> = {
  ASSET:     { bg: 'bg-blue-100', text: 'text-blue-700', labelKey: 'accountType.ASSET' },
  LIABILITY: { bg: 'bg-red-100', text: 'text-red-700', labelKey: 'accountType.LIABILITY' },
  REVENUE:   { bg: 'bg-green-100', text: 'text-green-700', labelKey: 'accountType.REVENUE' },
  EXPENSE:   { bg: 'bg-orange-100', text: 'text-orange-700', labelKey: 'accountType.EXPENSE' },
}

// ==================== 组件 ====================

export default function ChartOfAccounts() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  // 获取科目表数据
  useEffect(() => {
    let cancelled = false

    async function fetchAccounts() {
      try {
        const res = await api.get<ApiResponse<Account[]>>('/system/chart-of-accounts')
        if (cancelled) return
        if (res.code === 200 && res.data) {
          setAccounts(res.data)
        }
      } catch (err: any) {
        if (cancelled) return
        console.error('[ChartOfAccounts] 获取科目表失败:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAccounts()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts
    return accounts.filter(a => a.account_code.includes(search) || a.account_name.includes(search))
  }, [accounts, search])

  // 按类型统计
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of accounts) {
      counts[a.account_type] = (counts[a.account_type] || 0) + 1
    }
    return counts
  }, [accounts])

  // 骨架屏
  if (loading) {
    return (
      <div className="p-4 lg:p-6 animate-pulse">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-10 h-10 bg-slate-200 rounded-xl" />
          <div className="h-7 w-32 bg-slate-200 rounded-lg" />
        </div>
        <div className="bg-white/80 rounded-2xl p-6 h-96" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6">
      {/* 页面标题 */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="p-2 hover:bg-slate-100 rounded-xl transition-all duration-200"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="p-2 bg-green-50 rounded-xl">
          <BookOpen className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t('coa.pageTitle')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('coa.pageSubtitle')}</p>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('coa.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
          />
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[30%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">{t('coa.colCode')}</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">{t('coa.colName')}</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">{t('coa.colType')}</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">{t('coa.colReconciliation')}</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">{t('coa.colPostable')}</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">{t('coa.colLevel')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const style = TYPE_STYLES[a.account_type] || TYPE_STYLES.EXPENSE
                const isChild = a.parent_code !== null
                return (
                  <tr
                    key={a.id}
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200"
                  >
                    <td className="px-4 py-3 text-xs font-mono font-medium text-slate-900">
                      {a.account_code}
                    </td>
                    <td className={`px-4 py-3 text-sm text-slate-700 ${isChild ? 'pl-10' : ''}`}>
                      {isChild && <span className="text-slate-300 mr-1">└</span>}
                      {a.account_name}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${style.bg} ${style.text}`}>
                        {t(style.labelKey)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.is_reconciliation ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500" title={t('coa.colReconciliation')} />
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.is_postable ? (
                        <span className="text-xs text-green-600 font-medium">{t('common.yes')}</span>
                      ) : (
                        <span className="text-xs text-slate-400">{t('common.no')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-slate-500">{isChild ? t('coa.childAccount') : t('coa.summaryAccount')}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 底部统计 */}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-6">
          <span className="text-xs text-slate-500">{t('coa.totalAccounts', { count: filtered.length })}</span>
          <div className="flex items-center gap-4">
            {Object.entries(TYPE_STYLES).map(([key, style]) => (
              <span key={key} className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className={`w-2 h-2 rounded-full ${style.bg.replace('100', '500')}`} />
                {t(style.labelKey)} {typeCounts[key] || 0}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
