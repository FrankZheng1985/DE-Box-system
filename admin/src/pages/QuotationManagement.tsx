import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, Search, Plus, Eye, Edit,
  Send, CheckCircle, XCircle, Clock, TrendingUp, ShoppingCart, AlertCircle, Ban,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import Modal from '../components/Modal'
import Toast from '../components/Toast'
import { useTranslation } from 'react-i18next'
import { businessTypeLabelKey } from '../constants/businessTypes'
import { formatMoney } from '../utils/format'
import ConfirmDialog from '../components/ConfirmDialog'
import InquiryQuotationTabs from '../components/InquiryQuotationTabs'
import Pagination from '../components/Pagination'
import { QUOTATION_STATUS, QUOTATION_STATUS_TABS } from '../constants/inquiryQuotation'

// ==================== 类型定义 ====================

/**
 * ⚠️ 字段名必须和后端 GET /quotations 返回的 JSON key 完全一致（snake_case）。
 *    旧版这里写的是 quote_number / amount / route 三个后端根本不返回的名字，
 *    结果报价编号列空白、路线列永远 '-'、金额列永远 €0.00 —— 踩坑 003 的重演。
 */
interface Quotation {
  id: string
  quotation_number: string
  client_name: string | null
  inquiry_number: string | null
  route_from: { country?: string; city?: string } | null
  route_to: { country?: string; city?: string } | null
  business_type: string
  total_price: string | null
  currency: string
  version: number
  valid_until: string | null
  status: string
  converted_order_id: string | null
  converted_order_number: string | null
  created_at: string
}

/** 同样对齐后端 GET /quotations/stats 的返回 */
interface QuotationStats {
  month_total: number
  pending_response: number
  pending_decision: number
  accepted: number
  rejected: number
  conversion_rate: number
}

// ==================== 常量 ====================

// 状态 Tab 用共享常量（PENDING_QUOTE 是询价单的状态，报价单没有这个值，旧版放在这里永远筛不出东西）
const STATUS_TABS = QUOTATION_STATUS_TABS

// 类型名统一走语言包 businessType.*，这里只配颜色
// （旧版键是小写 curtain_side/container，和库里的大写值永远匹配不上）
const BUSINESS_TYPE_STYLES: Record<string, string> = {
  TRUCK_LTL: 'bg-blue-100 text-blue-700',
  TRUCK_FTL: 'bg-purple-100 text-purple-700',
  LOCAL_DELIVERY: 'bg-green-100 text-green-700',
}

/** 路线是两个 JSONB 字段，拼成 "DE München → PL Warszawa" */
function routeText(q: Quotation): string {
  const fmt = (a: Quotation['route_from']) =>
    a ? [a.country, a.city].filter(Boolean).join(' ') : ''
  const from = fmt(q.route_from)
  const to = fmt(q.route_to)
  if (!from && !to) return '-'
  return `${from || '-'} → ${to || '-'}`
}

// ==================== 组件 ====================

export default function QuotationManagement() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [stats, setStats] = useState<QuotationStats>({ month_total: 0, pending_response: 0, pending_decision: 0, accepted: 0, rejected: 0, conversion_rate: 0 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  // Toast 通知
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // 操作弹窗状态
  const [rejectModal, setRejectModal] = useState<{ open: boolean; quotation: Quotation | null }>({ open: false, quotation: null })
  const [rejectReason, setRejectReason] = useState('')

  // 作废确认
  const [voidTarget, setVoidTarget] = useState<Quotation | null>(null)
  const [acceptModal, setAcceptModal] = useState<{ open: boolean; quotation: Quotation | null }>({ open: false, quotation: null })
  const [convertModal, setConvertModal] = useState<{ open: boolean; quotation: Quotation | null }>({ open: false, quotation: null })
  const [submitting, setSubmitting] = useState(false)

  // 获取统计
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get<ApiResponse<QuotationStats>>('/quotations/stats')
        if (res.code === 200 && res.data) setStats(res.data)
      } catch (err) {
        console.error('获取报价统计失败:', err)
      }
    }
    fetchStats()
  }, [])

  // 获取列表
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<Quotation[]>>(
        `/quotations?status=${statusFilter}&search=${encodeURIComponent(search)}&page=${page}&pageSize=${pageSize}`
      )
      if (res.code === 200) {
        const list = Array.isArray(res.data) ? res.data : ((res.data as any)?.items || [])
        setQuotations(list)
        setTotal(res.pagination?.total || (res.data as any)?.pagination?.total || 0)
      }
    } catch (err) {
      console.error('获取报价列表失败:', err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search, page])

  useEffect(() => {
    fetchList()
  }, [statusFilter, page, fetchList])

  const handleSearch = () => {
    setPage(1)
    fetchList()
  }

  // 刷新列表和统计
  const refreshData = async () => {
    await fetchList()
    try {
      const res = await api.get<ApiResponse<QuotationStats>>('/quotations/stats')
      if (res.code === 200 && res.data) setStats(res.data)
    } catch (err) {
      console.error('刷新统计失败:', err)
    }
  }

  // ==================== 操作：作废报价 ====================
  const handleVoid = async (reason?: string) => {
    if (!voidTarget) return
    const res = await api.post<ApiResponse<any>>(`/quotations/${voidTarget.id}/void`, { reason })
    if (res.code === 200) {
      setToast({ message: res.message || t('quotation.voided'), type: 'success' })
      setVoidTarget(null)
      await refreshData()
    } else {
      throw new Error(res.message || t('quotation.voidFailed'))
    }
  }

  // ==================== 操作：发送报价 ====================
  const handleSend = async (quotation: Quotation) => {
    setSubmitting(true)
    try {
      const res = await api.post<ApiResponse<any>>(`/quotations/${quotation.id}/send`)
      if (res.code === 200) {
        setToast({ message: t('quotation.sent'), type: 'success' })
        await refreshData()
      } else {
        setToast({ message: res.message || t('quotation.sendFailed'), type: 'error' })
      }
    } catch (err: any) {
      console.error('发送报价失败:', err)
      setToast({ message: err.message || t('quotation.sendFailedRetry'), type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  // ==================== 操作：接受报价 ====================
  const handleAccept = async () => {
    const quotation = acceptModal.quotation
    if (!quotation) return
    setSubmitting(true)
    try {
      const res = await api.post<ApiResponse<{ orderId: string; orderNumber: string }>>(
        `/quotations/${quotation.id}/accept`
      )
      if (res.code === 200) {
        // 需求 2：接受即自动建单，后端把新订单号带回来
        setToast({ message: res.message || t('quotation.acceptedOrderCreated'), type: 'success' })
        setAcceptModal({ open: false, quotation: null })
        await refreshData()
        if (res.data?.orderId) {
          setTimeout(() => navigate(`/orders/${res.data.orderId}`), 900)
        }
      } else {
        setToast({ message: res.message || t('common.operateFailed'), type: 'error' })
      }
    } catch (err: any) {
      console.error('接受报价失败:', err)
      setToast({ message: err.message || t('orderAction.failedRetry'), type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  // ==================== 操作：拒绝报价 ====================
  const handleReject = async () => {
    const quotation = rejectModal.quotation
    if (!quotation) return
    if (!rejectReason.trim()) {
      setToast({ message: t('quotation.rejectReasonRequired'), type: 'error' })
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post<ApiResponse<any>>(`/quotations/${quotation.id}/reject`, {
        reason: rejectReason.trim(),
      })
      if (res.code === 200) {
        setToast({ message: t('quotation.rejected'), type: 'success' })
        setRejectModal({ open: false, quotation: null })
        setRejectReason('')
        await refreshData()
      } else {
        setToast({ message: res.message || t('common.operateFailed'), type: 'error' })
      }
    } catch (err: any) {
      console.error('拒绝报价失败:', err)
      setToast({ message: err.message || t('orderAction.failedRetry'), type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  // ==================== 操作：一键下单 ====================
  const handleConvertToOrder = async () => {
    const quotation = convertModal.quotation
    if (!quotation) return
    setSubmitting(true)
    try {
      // 不再硬塞 cargoDescription —— 后端会从来源询价单把货物信息带进订单，
      // 旧版传的 quotation.route 是个根本不存在的字段（undefined）
      const res = await api.post<ApiResponse<{ id: string }>>(`/quotations/${quotation.id}/convert-order`, {})
      if (res.code === 200 && res.data) {
        setToast({ message: t('quotation.orderCreated'), type: 'success' })
        setConvertModal({ open: false, quotation: null })
        // convert-order 返回的是订单对象本身，主键是 id（旧版读 orderId 永远 undefined，跳到 /orders/undefined）
        setTimeout(() => {
          navigate(`/orders/${res.data.id}`)
        }, 800)
      } else {
        setToast({ message: res.message || t('quotation.createOrderFailed'), type: 'error' })
      }
    } catch (err: any) {
      console.error('一键下单失败:', err)
      setToast({ message: err.message || t('quotation.createOrderFailedRetry'), type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  // 根据报价状态返回可用的操作按钮
  function renderRowActions(q: Quotation) {
    const s = q.status?.toUpperCase()

    return (
      <div className="flex items-center justify-center gap-1">
        {/* 查看按钮（始终显示） */}
        <button
          onClick={() => navigate(`/quotes/${q.id}`)}
          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
          title={t('common.view')}
        >
          <Eye className="w-4 h-4" />
        </button>

        {/* 编辑按钮（仅草稿；PENDING_QUOTE 是询价单状态，报价单不会有） */}
        {s === QUOTATION_STATUS.DRAFT && (
          <button
            onClick={() => navigate(`/quotes/${q.id}/edit`)}
            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200"
            title={t('common.edit')}
          >
            <Edit className="w-4 h-4" />
          </button>
        )}

        {/* DRAFT 状态：发送按钮 */}
        {s === 'DRAFT' && (
          <button
            onClick={() => handleSend(q)}
            disabled={submitting}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200 disabled:opacity-40"
            title={t('quotation.send')}
          >
            <Send className="w-4 h-4" />
          </button>
        )}

        {/* 已发送 / 客户待定：代客户确认接受或拒绝（客户也可在门户自助操作） */}
        {(s === QUOTATION_STATUS.SENT || s === QUOTATION_STATUS.PENDING_DECISION) && (
          <>
            <button
              onClick={() => setAcceptModal({ open: true, quotation: q })}
              className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200"
              title={t('quotation.accept')}
            >
              <CheckCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setRejectModal({ open: true, quotation: q }); setRejectReason('') }}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
              title={t('quotation.reject')}
            >
              <XCircle className="w-4 h-4" />
            </button>
          </>
        )}

        {/* 已接受但没自动建单（多半是当时信用超额）：补一次手工下单 */}
        {s === QUOTATION_STATUS.ACCEPTED && !q.converted_order_id && (
          <button
            onClick={() => setConvertModal({ open: true, quotation: q })}
            className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all duration-200"
            title={t('quotation.convertToOrder')}
          >
            <ShoppingCart className="w-4 h-4" />
          </button>
        )}

        {/* 作废按钮（除 ACCEPTED/CANCELLED/CONVERTED 外都可作废） */}
        {!['ACCEPTED', 'CANCELLED', 'CONVERTED'].includes(s) && (
          <button
            onClick={() => setVoidTarget(q)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
            title={t('quotation.void')}
          >
            <Ban className="w-4 h-4" />
          </button>
        )}
      </div>
    )
  }


  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Toast 通知 */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* 页面标题 + 询价/报价 切换 */}
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-blue-50 rounded-xl">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">{t('quotation.pageTitle')}</h1>
        </div>
        <InquiryQuotationTabs />
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title={t('quotation.statMonthTotal')} value={stats.month_total} icon={<Send className="w-5 h-5" />} color="blue" />
        <StatCard title={t('quotation.statPendingResponse')} value={stats.pending_response} icon={<Clock className="w-5 h-5" />} color="yellow" />
        <StatCard title={t('quotationStatus.PENDING_DECISION')} value={stats.pending_decision} icon={<AlertCircle className="w-5 h-5" />} color="yellow" />
        <StatCard title={t('quotationStatus.ACCEPTED')} value={stats.accepted} icon={<CheckCircle className="w-5 h-5" />} color="green" />
        <StatCard title={t('quotationStatus.REJECTED')} value={stats.rejected} icon={<XCircle className="w-5 h-5" />} color="red" />
        <StatCard title={t('quotation.statConversionRate')} value={`${Number(stats.conversion_rate || 0).toFixed(1)}%`} icon={<TrendingUp className="w-5 h-5" />} color="purple" />
      </div>

      {/* 搜索栏 + 新建按钮 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t('quotation.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
          />
        </div>
        <button
          onClick={() => navigate('/quotes/create')}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          {t('quotation.create')}
        </button>
      </div>

      {/* 状态 Tab */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setStatusFilter(tab.key); setPage(1) }}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all duration-200 ${
              statusFilter === tab.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* 表格 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[12%]" /><col className="w-[11%]" /><col className="w-[11%]" />
              <col className="w-[13%]" /><col className="w-[9%]" /><col className="w-[11%]" />
              <col className="w-[6%]" /><col className="w-[9%]" /><col className="w-[9%]" />
              <col className="w-[9%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('quotation.colNumber')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('quotation.colSourceInquiry')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('common.client')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('common.route')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('field.businessType')}</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">{t('quotation.colAmount')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('quotation.colVersion')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('quotation.colValidity')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.status')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">{t('quotation.empty')}</p>
                  </td>
                </tr>
              ) : (
                quotations.map(q => (
                  <tr key={q.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                    <td className="px-4 py-3 text-xs text-slate-900 font-medium truncate">
                      {q.quotation_number}
                      {q.converted_order_number && (
                        <span className="block text-[10px] text-purple-600">
                          {t('docType.order')} {q.converted_order_number}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 truncate">{q.inquiry_number || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{q.client_name || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{routeText(q)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium ${BUSINESS_TYPE_STYLES[q.business_type] || 'bg-gray-100 text-gray-600'}`}>
                        {t(businessTypeLabelKey(q.business_type), { defaultValue: q.business_type })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-900 font-medium text-right">
                      {formatMoney(q.total_price, q.currency || 'EUR')}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 text-center">V{q.version || 1}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 text-center">{q.valid_until?.split('T')[0] || '-'}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={q.status} type="quotation" /></td>
                    <td className="px-4 py-3 text-center">
                      {renderRowActions(q)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} />
      </div>

      {/* ==================== 接受确认弹窗 ==================== */}
      <Modal
        isOpen={acceptModal.open}
        onClose={() => setAcceptModal({ open: false, quotation: null })}
        title={t('quotation.acceptTitle')}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setAcceptModal({ open: false, quotation: null })}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleAccept}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t('confirmDialog.processing') : t('quotation.acceptConfirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {t('quotation.acceptQuestion')}
          </p>
          {acceptModal.quotation && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{t('quotation.colNumber')}</span>
                <span className="text-sm font-medium text-slate-900">{acceptModal.quotation.quotation_number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{t('common.client')}</span>
                <span className="text-sm text-slate-700">{acceptModal.quotation.client_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{t('common.amount')}</span>
                <span className="text-sm font-medium text-slate-900">
                  {formatMoney(acceptModal.quotation.total_price, acceptModal.quotation.currency || 'EUR')}
                </span>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ==================== 拒绝弹窗 ==================== */}
      <Modal
        isOpen={rejectModal.open}
        onClose={() => { setRejectModal({ open: false, quotation: null }); setRejectReason('') }}
        title={t('quotation.rejectTitle')}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => { setRejectModal({ open: false, quotation: null }); setRejectReason('') }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleReject}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t('confirmDialog.processing') : t('quotation.rejectConfirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {t('quotation.rejectQuestionPrefix')}{' '}
            <span className="font-medium text-slate-900">{rejectModal.quotation?.quotation_number}</span>
            {t('quotation.rejectQuestionSuffix')}
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              {t('quotation.rejectReason')} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('quotation.rejectReasonPlaceholder')}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* ==================== 一键下单弹窗 ==================== */}
      <Modal
        isOpen={convertModal.open}
        onClose={() => setConvertModal({ open: false, quotation: null })}
        title={t('quotation.convertToOrder')}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setConvertModal({ open: false, quotation: null })}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleConvertToOrder}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t('quotation.creatingOrder') : t('quotation.createOrderConfirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {t('quotation.convertHint')}
          </p>
          {convertModal.quotation && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{t('quotation.colNumber')}</span>
                <span className="text-sm font-medium text-slate-900">{convertModal.quotation.quotation_number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{t('common.client')}</span>
                <span className="text-sm text-slate-700">{convertModal.quotation.client_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{t('common.route')}</span>
                <span className="text-sm text-slate-700">{routeText(convertModal.quotation)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{t('field.businessType')}</span>
                <span className="text-sm text-slate-700">
                  {t(businessTypeLabelKey(convertModal.quotation.business_type), {
                    defaultValue: convertModal.quotation.business_type,
                  })}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{t('quotation.colAmount')}</span>
                  <span className="text-sm font-semibold text-blue-600">
                    {formatMoney(convertModal.quotation.total_price, convertModal.quotation.currency || 'EUR')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* 作废报价确认弹窗 */}
      <ConfirmDialog
        isOpen={voidTarget !== null}
        onClose={() => setVoidTarget(null)}
        onConfirm={handleVoid}
        title={t('quotation.voidTitle')}
        message={t('quotation.voidMessage')}
        targetLabel={voidTarget?.quotation_number}
        requireReason
        reasonPlaceholder={t('quotation.voidReasonPlaceholder')}
        variant="danger"
        confirmText={t('quotation.voidConfirm')}
        warningText={t('quotation.voidWarning')}
      />
    </div>
  )
}
