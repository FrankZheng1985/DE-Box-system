/**
 * 询价管理列表页（需求 5.1 / 5.4）
 *
 * admin 端此前完全没有询价页面 —— 客户在门户提交的询价单运营根本看不到，
 * 只能等客户打电话。这页把三个来源（客户门户 / 运营代建 / 开放 API）
 * 提交的询价统一收在一处，并提供清平姐要的「复制摘要」和「导出 Excel」。
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageSquare, Search, Plus, Eye, Copy, RefreshCw, Upload,
  ChevronLeft, ChevronRight, Tag, CheckCircle, AlertCircle, Clock, FileSpreadsheet,
} from 'lucide-react'
import api, { type ApiResponse, getApiBaseUrl } from '../utils/api'
import StatCard from '../components/StatCard'
import InquiryQuotationTabs from '../components/InquiryQuotationTabs'
import InquiryImportModal from '../components/InquiryImportModal'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from 'react-i18next'
import { businessTypeLabelKey } from '../constants/businessTypes'
import {
  INQUIRY_STATUS, inquiryStatusLabelKey, INQUIRY_STATUS_STYLES, INQUIRY_STATUS_TABS,
} from '../constants/inquiryQuotation'

// ==================== 类型定义 ====================

/** 字段名与后端返回的 JSON key 完全一致（snake_case，踩坑 003） */
interface Inquiry {
  id: string
  inquiry_number: string
  customer_ref: string | null
  client_id: string
  client_name: string | null
  business_type: string
  transport_type: string | null
  route_from: { country?: string; city?: string; zipCode?: string; address?: string } | null
  route_to: { country?: string; city?: string; zipCode?: string; address?: string } | null
  cargo_description: string | null
  cargo_quantity: number | null
  cargo_weight_kg: string | null
  cargo_volume_m3: string | null
  ldm: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  status: string
  item_count: number
  quotation_count: number
  created_at: string
}

interface InquiryStats {
  month_total: number
  pending_quote: number
  quoted: number
  accepted: number
}

// ==================== 工具 ====================

/** NUMERIC 回来是字符串，显示前先转数字（踩坑 002） */
function fmtNumber(value: string | number | null, digits = 2): string {
  if (value === null || value === undefined || value === '') return '-'
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(digits) : '-'
}

function routeText(addr: Inquiry['route_from']): string {
  if (!addr) return '-'
  return [addr.country, addr.city].filter(Boolean).join(' ') || '-'
}

// ==================== Toast ====================

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed top-6 right-6 z-[60]">
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
        type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
      }`}>
        {type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
        {message}
      </div>
    </div>
  )
}

// ==================== 复制摘要弹窗 ====================

/**
 * 摘要预览 + 复制
 *
 * 直接调 navigator.clipboard 在 http（非 localhost）下不可用，
 * 生产是自签名 https 没问题，但仍保留可全选的文本框做兜底：
 * 复制失败时用户至少能手动选中复制，而不是干瞪眼。
 */
function SummaryModal({
  text, count, onClose, onToast,
}: {
  text: string
  count: number
  onClose: () => void
  onToast: (m: string, t: 'success' | 'error') => void
}) {
  const { t } = useTranslation()
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      onToast(t('inquiry.copied', { count }), 'success')
      onClose()
    } catch {
      onToast(t('inquiry.copyBlocked'), 'error')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900">{t('inquiry.summaryTitle', { count })}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">✕</button>
        </div>
        <div className="p-6 overflow-y-auto">
          <textarea
            readOnly
            value={text}
            rows={16}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 bg-slate-50 outline-none resize-none"
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="text-xs text-slate-400 mt-2">{t('inquiry.summaryHint')}</p>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all duration-200 ease-in-out">
            {t('common.close')}
          </button>
          <button onClick={handleCopy} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-1.5 transition-all duration-200 ease-in-out">
            <Copy className="w-4 h-4" />
            {t('inquiry.copyToClipboard')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

export default function InquiryManagement() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [stats, setStats] = useState<InquiryStats>({ month_total: 0, pending_quote: 0, quoted: 0, accepted: 0 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [summary, setSummary] = useState<{ text: string; count: number } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [showImport, setShowImport] = useState(false)
  const { hasPermission } = useAuth()

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<InquiryStats>>('/inquiries/stats')
      if (res.code === 200 && res.data) setStats(res.data)
    } catch (err) {
      console.error('获取询价统计失败:', err)
    }
  }, [])

  const fetchInquiries = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (statusFilter) params.append('status', statusFilter)
      if (search.trim()) params.append('search', search.trim())

      const res = await api.get<ApiResponse<Inquiry[]>>(`/inquiries?${params.toString()}`)
      if (res.code === 200) {
        setInquiries(res.data || [])
        setTotal(res.pagination?.total || 0)
      } else {
        showToast(res.message || t('inquiry.loadFailed'), 'error')
      }
    } catch (err) {
      console.error('获取询价列表失败:', err)
      showToast(t('inquiry.loadFailed'), 'error')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, search, showToast])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchInquiries() }, [fetchInquiries])

  // 切换筛选/搜索时回到第一页，否则会停在超出范围的空白页
  const handleStatusChange = (key: string) => { setStatusFilter(key); setPage(1); setSelectedIds([]) }
  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); fetchInquiries() }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === inquiries.length ? [] : inquiries.map((i) => i.id)))
  }

  /** 复制摘要：勾了就复制勾选的，没勾就提示先勾选 */
  const handleCopySummary = async () => {
    if (selectedIds.length === 0) {
      showToast(t('inquiry.selectFirst'), 'error')
      return
    }
    try {
      const res = await api.post<ApiResponse<{ text: string; count: number }>>('/inquiries/summary', { ids: selectedIds })
      if (res.code === 200 && res.data) {
        setSummary(res.data)
      } else {
        showToast(res.message || t('inquiry.summaryFailed'), 'error')
      }
    } catch (err) {
      console.error('生成摘要失败:', err)
      showToast(t('inquiry.summaryFailed'), 'error')
    }
  }

  /**
   * 导出 Excel
   *
   * 走原生 fetch 而不是 JSON api 客户端 —— 返回的是二进制 xlsx，
   * api 客户端会尝试 res.json() 解析然后报错（踩坑 016 的同类问题）。
   */
  const handleExport = async () => {
    try {
      const params = new URLSearchParams()
      if (selectedIds.length > 0) {
        params.append('ids', selectedIds.join(','))
      } else if (statusFilter) {
        params.append('status', statusFilter)
      }

      const auth = localStorage.getItem('eu_tms_auth')
      const token = auth ? JSON.parse(auth).token : null
      const res = await fetch(`${getApiBaseUrl()}/api/v1/inquiries/export?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(t('common.exportFailedWithCode', { code: res.status }))

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${t('inquiry.exportFileName')}_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      showToast(t('common.exportSuccess'), 'success')
    } catch (err) {
      console.error('导出失败:', err)
      showToast(err instanceof Error ? err.message : t('common.exportFailed'), 'error')
    }
  }

  /** 由此报价：把 inquiryId 带进报价创建页（后端一直支持，前端此前没接） */
  const handleQuote = (inquiry: Inquiry) => {
    navigate(`/quotes/create?inquiryId=${inquiry.id}`)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const allSelected = inquiries.length > 0 && selectedIds.length === inquiries.length

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {summary && (
        <SummaryModal
          text={summary.text}
          count={summary.count}
          onClose={() => setSummary(null)}
          onToast={showToast}
        />
      )}
      {showImport && (
        <InquiryImportModal
          onClose={() => setShowImport(false)}
          onImported={(count) => {
            setShowImport(false)
            showToast(t('inquiryImport.successNotice', { count }), 'success')
            fetchInquiries()
            fetchStats()
          }}
        />
      )}

      {/* 页头 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-3">
          <h1 className="text-xl font-semibold text-slate-900">{t('inquiry.pageTitle')}</h1>
          <InquiryQuotationTabs />
        </div>
        <button
          onClick={() => navigate('/inquiries/create')}
          className="h-9 px-4 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
        >
          <Plus className="w-4 h-4" />
          {t('inquiry.createForClient')}
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t('inquiry.statMonthTotal')} value={stats.month_total} icon={<MessageSquare className="w-5 h-5" />} color="blue" />
        <StatCard title={t('inquiryStatus.PENDING_QUOTE')} value={stats.pending_quote} icon={<Clock className="w-5 h-5" />} color="yellow" />
        <StatCard title={t('inquiryStatus.QUOTED')} value={stats.quoted} icon={<Tag className="w-5 h-5" />} color="purple" />
        <StatCard title={t('inquiryStatus.ACCEPTED')} value={stats.accepted} icon={<CheckCircle className="w-5 h-5" />} color="green" />
      </div>

      {/* 筛选 + 批量操作 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 p-4 border-b border-slate-100">
          <div className="flex items-center gap-1 overflow-x-auto">
            {INQUIRY_STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleStatusChange(tab.key)}
                className={`px-3 h-8 rounded-lg text-sm whitespace-nowrap transition-all duration-200 ease-in-out ${
                  statusFilter === tab.key
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2 lg:justify-end">
            <div className="relative flex-1 lg:flex-none lg:min-w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('inquiry.searchPlaceholder')}
                className="w-full h-9 pl-9 pr-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ease-in-out"
              />
            </div>
            <button type="button" onClick={fetchInquiries} className="h-9 w-9 flex items-center justify-center text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all duration-200 ease-in-out">
              <RefreshCw className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* 批量操作条 */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <span className="text-xs text-slate-500">
            {selectedIds.length > 0
              ? t('inquiry.selectedCount', { count: selectedIds.length })
              : t('inquiry.selectHint')}
          </span>
          <div className="flex-1" />
          <button
            onClick={handleCopySummary}
            className="h-8 px-3 text-xs text-slate-700 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
          >
            <Copy className="w-3.5 h-3.5" />
            {t('inquiry.copySummary')}
          </button>
          <button
            onClick={handleExport}
            className="h-8 px-3 text-xs text-slate-700 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {selectedIds.length > 0 ? t('inquiry.exportSelected') : t('inquiry.exportFiltered')}
          </button>
          {/* 批量导入＝批量建单，用建单权限拦（没有 inquiry:create 的人不该看到入口） */}
          {hasPermission('inquiry:create') && (
            <button
              onClick={() => setShowImport(true)}
              className="h-8 px-3 text-xs text-slate-700 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
            >
              <Upload className="w-3.5 h-3.5" />
              {t('inquiryImport.entry')}
            </button>
          )}
        </div>

        {/* 列表 */}
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[1100px]">
            <colgroup>
              <col className="w-[4%]" />
              <col className="w-[13%]" />
              <col className="w-[14%]" />
              <col className="w-[11%]" />
              <col className="w-[14%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[11%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-100 bg-slate-50/50">
                <th className="text-center px-3 py-3 font-medium">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded border-slate-300" />
                </th>
                <th className="text-left px-3 py-3 font-medium">{t('inquiry.colNumber')}</th>
                <th className="text-left px-3 py-3 font-medium">{t('common.client')}</th>
                <th className="text-left px-3 py-3 font-medium">{t('field.businessType')}</th>
                <th className="text-left px-3 py-3 font-medium">{t('common.route')}</th>
                <th className="text-right px-3 py-3 font-medium">{t('inquiry.colPieces')}</th>
                <th className="text-right px-3 py-3 font-medium">{t('inquiry.colWeightKg')}</th>
                <th className="text-right px-3 py-3 font-medium">LDM</th>
                <th className="text-center px-3 py-3 font-medium">{t('common.status')}</th>
                <th className="text-center px-3 py-3 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-3 py-3.5"><div className="h-3 bg-slate-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : inquiries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-sm text-slate-400">{t('inquiry.empty')}</td>
                </tr>
              ) : (
                inquiries.map((item) => (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                    <td className="text-center px-3 py-3.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="text-left px-3 py-3.5">
                      <button
                        onClick={() => navigate(`/inquiries/${item.id}`)}
                        className="text-xs font-medium text-slate-900 hover:text-blue-600 transition-colors truncate block max-w-full"
                      >
                        {item.inquiry_number}
                      </button>
                      {item.customer_ref && (
                        <span className="text-[10px] text-slate-400">
                          {t('inquiry.customerRef')} {item.customer_ref}
                        </span>
                      )}
                    </td>
                    <td className="text-left px-3 py-3.5 text-xs text-slate-600 truncate">{item.client_name || '-'}</td>
                    <td className="text-left px-3 py-3.5 text-xs text-slate-600">
                      {t(businessTypeLabelKey(item.business_type), { defaultValue: item.business_type })}
                    </td>
                    <td className="text-left px-3 py-3.5 text-xs text-slate-600 truncate">
                      {routeText(item.route_from)} → {routeText(item.route_to)}
                    </td>
                    <td className="text-right px-3 py-3.5 text-xs text-slate-600">{item.cargo_quantity ?? '-'}</td>
                    <td className="text-right px-3 py-3.5 text-xs text-slate-600">{fmtNumber(item.cargo_weight_kg)}</td>
                    <td className="text-right px-3 py-3.5 text-xs text-slate-600">{fmtNumber(item.ldm)}</td>
                    <td className="text-center px-3 py-3.5">
                      <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ${
                        INQUIRY_STATUS_STYLES[item.status] || 'bg-gray-100 text-gray-600'
                      }`}>
                        {t(inquiryStatusLabelKey(item.status), { defaultValue: item.status })}
                      </span>
                    </td>
                    <td className="text-center px-3 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => navigate(`/inquiries/${item.id}`)}
                          title={t('orderDetail.viewDetail')}
                          className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200 ease-in-out"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {item.status === INQUIRY_STATUS.PENDING_QUOTE && (
                          <button
                            onClick={() => handleQuote(item)}
                            title={t('inquiry.quoteFromThis')}
                            className="h-7 px-2 flex items-center gap-1 text-[11px] text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200 ease-in-out"
                          >
                            <Tag className="w-3.5 h-3.5" />
                            {t('inquiry.quote')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {total > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              {t('common.totalCount', { count: total })}
              <span className="mx-1">·</span>
              {t('common.page', { page, total: totalPages })}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 w-8 flex items-center justify-center text-slate-500 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-all duration-200 ease-in-out"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-8 w-8 flex items-center justify-center text-slate-500 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-all duration-200 ease-in-out"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
