/**
 * 客户门户 · 我的报价（需求 2）
 *
 * 此前客户门户完全看不到报价，运营发出去的报价只能靠邮件/电话确认。
 * 现在客户可以在这里直接【接受 / 拒绝 / 待定】，
 * 接受即由后端自动生成待审核订单，不再需要运营手工点「一键下单」。
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  RefreshCw, CheckCircle, XCircle, Clock, FileText, X, AlertCircle, Loader2,
} from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { formatMoney, formatDate } from '../utils/format'
import {
  QUOTATION_STATUS, QUOTATION_STATUS_STYLES, CLIENT_DECIDABLE,
} from '../constants/inquiryQuotation'

// ==================== 类型定义 ====================

/** 字段名与后端 GET /quotations 返回的 JSON key 一致（snake_case，踩坑 003） */
/** 本地派送报价的一票明细（GET /quotations/:id 的 deliveryLines） */
interface DeliveryLine {
  id: string
  line_number: number
  customer_sub_ref: string | null
  delivery_address: { companyName?: string; city?: string } | null
  price: string
  currency: string | null
}

interface Quotation {
  id: string
  quotation_number: string
  inquiry_number: string | null
  customer_ref: string | null
  business_type: string
  transport_type: string | null
  route_from: { country?: string; city?: string } | null
  route_to: { country?: string; city?: string } | null
  base_freight: string | null
  surcharge: string | null
  insurance_fee: string | null
  total_price: string | null
  currency: string
  valid_until: string | null
  status: string
  version: number
  remarks: string | null
  converted_order_number: string | null
  created_at: string
}

type DecisionType = 'accept' | 'reject' | 'pending'

// 文案走 quotations.decision.* 语言包（P9），这里只留行为配置
const DECISION_META: Record<DecisionType, { endpoint: string; needNote: boolean }> = {
  accept: { endpoint: 'accept', needNote: false },
  reject: { endpoint: 'reject', needNote: true },
  pending: { endpoint: 'pending', needNote: false },
}

// ==================== 工具 ====================

/** 金额格式化统一走 utils/format 的 Intl 实现，跟随当前界面语言（P9） */
const fmtMoney = formatMoney

function routeText(q: Quotation): string {
  const fmt = (a: Quotation['route_from']) => (a ? [a.country, a.city].filter(Boolean).join(' ') : '')
  const from = fmt(q.route_from)
  const to = fmt(q.route_to)
  if (!from && !to) return '-'
  return `${from || '-'} → ${to || '-'}`
}

/** 有效期是否已过（只比日期，不比时分） */
function isExpired(validUntil: string | null): boolean {
  if (!validUntil) return false
  const d = new Date(validUntil)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}

// ==================== 决策弹窗 ====================

function DecisionModal({
  quotation, type, submitting, error, onClose, onConfirm,
}: {
  quotation: Quotation
  type: DecisionType
  submitting: boolean
  /** 提交失败时后端给的原因；弹窗不关，就在这里显示 */
  error?: string
  onClose: () => void
  onConfirm: (note: string) => void
}) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const meta = DECISION_META[type]
  /**
   * 本地派送的逐票报价（开发意见 #7 第 2 步）
   *
   * 客户是按票核价的，只给一个整柜总额他没法确认。列表接口不带明细，
   * 所以弹窗打开时单独拉一次详情；拉失败只是少一块明细，不挡住决策。
   */
  const [lines, setLines] = useState<DeliveryLine[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get<ApiResponse<{ deliveryLines?: DeliveryLine[] }>>(`/quotations/${quotation.id}`)
        if (!cancelled && res.code === 200) setLines(res.data?.deliveryLines || [])
      } catch (err) {
        console.warn('加载逐票报价失败:', err)
      }
    })()
    return () => { cancelled = true }
  }, [quotation.id])

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-slate-900">{t(`quotations.decision.${type}.title`)}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">{t('quotations.quotationNo')}</span>
              <span className="font-medium text-slate-900">{quotation.quotation_number}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">{t('common.route')}</span>
              <span className="text-slate-700">{routeText(quotation)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">{t('quotations.amount')}</span>
              <span className="font-semibold text-slate-900">{fmtMoney(quotation.total_price, quotation.currency)}</span>
            </div>
          </div>

          {/* 逐票报价：确认前要能逐票核对，不能只看一个整柜总额 */}
          {lines.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <p className="px-3 py-2 text-[11px] font-medium text-slate-600 bg-gray-50 border-b border-gray-200">
                {t('quotations.deliveryLines', { count: lines.length })}
              </p>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-[26%]" />
                    <col className="w-[44%]" />
                    <col className="w-[30%]" />
                  </colgroup>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id} className="border-b border-gray-50 last:border-0">
                        <td className="text-left px-3 py-1.5 text-[11px] text-slate-900 truncate">
                          {l.customer_sub_ref || `#${l.line_number}`}
                        </td>
                        <td className="text-left px-3 py-1.5 text-[11px] text-slate-500 truncate">
                          {[l.delivery_address?.companyName, l.delivery_address?.city]
                            .filter(Boolean).join(' · ') || '-'}
                        </td>
                        <td className="text-right px-3 py-1.5 text-[11px] font-medium text-slate-900">
                          {fmtMoney(l.price, l.currency || quotation.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {type === 'accept' && (
            <div className="flex gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-xl">
              <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 leading-relaxed">
                {t('quotations.acceptHint')}
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-500 mb-1">
              {type === 'reject' ? t('quotations.rejectReason') : t('quotations.noteOptional')}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={type === 'reject' ? t('quotations.rejectPlaceholder') : t('quotations.notePlaceholder')}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary-500 resize-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* 失败原因必须显示在弹窗里：页面顶部的提示条会被这个弹窗整个遮住，
              客户只会看到「点了没反应」 */}
          {error && (
            <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-xs text-red-700 leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="h-8 px-3 text-xs text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-200 ease-in-out">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => onConfirm(note.trim())}
            disabled={submitting || (meta.needNote && !note.trim())}
            className={`h-8 px-4 text-xs text-white rounded-lg flex items-center gap-1.5 disabled:opacity-50 transition-all duration-200 ease-in-out ${
              type === 'accept' ? 'bg-green-600 hover:bg-green-700'
                : type === 'reject' ? 'bg-red-600 hover:bg-red-700'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t(`quotations.decision.${type}.confirm`)}
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

export default function MyQuotations() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [decision, setDecision] = useState<{ quotation: Quotation; type: DecisionType } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 后端按登录身份强制只返回本公司的、且已发出的报价（踩坑 016、054），
      // 前端不用传 clientId，也不需要靠自己藏草稿
      const res = await api.get<ApiResponse<Quotation[]>>('/quotations?pageSize=100')
      if (res.code === 200) {
        // 这行是双保险，不是安全边界——真正挡草稿的是后端 SQL（踩坑 054）
        setQuotations((res.data || []).filter((q) => q.status !== QUOTATION_STATUS.DRAFT))
      } else {
        setMessage({ text: res.message || t('quotations.loadFailed'), type: 'error' })
      }
    } catch (err) {
      console.error('加载报价失败:', err)
      setMessage({ text: t('quotations.loadFailed'), type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!message) return
    // 只自动清成功提示。失败原因（信用超额、暂不支持的转单…）要留着让人读完，
    // 4 秒后自己消失等于把唯一的解释拿走了
    if (message.type === 'error') return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  const handleDecision = async (note: string) => {
    if (!decision) return
    const { quotation, type } = decision
    setSubmitting(true)
    try {
      const res = await api.post<ApiResponse<{ orderId?: string; orderNumber?: string }>>(
        `/quotations/${quotation.id}/${DECISION_META[type].endpoint}`,
        { note }
      )
      if (res.code === 200) {
        setMessage({ text: res.message || t('quotations.actionSuccess'), type: 'success' })
        setDecision(null)
        await load()
        // 接受后后端会带回自动创建的订单号，直接引导客户去看订单
        if (type === 'accept' && res.data?.orderId) {
          setTimeout(() => navigate('/orders'), 1200)
        }
      } else {
        // else 分支必须把后端 message 显示出来 —— 信用超额等业务拒绝都靠它传达（踩坑 011）
        setMessage({ text: res.message || t('quotations.actionFailed'), type: 'error' })
      }
    } catch (err) {
      console.error('提交报价决策失败:', err)
      setMessage({ text: err instanceof Error ? err.message : t('quotations.actionFailedRetry'), type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 提示条 */}
      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs ${
          message.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{t('quotations.pageHint')}</p>
        <button onClick={load} className="h-8 px-2 text-slate-500 hover:bg-gray-100 rounded-lg transition-all duration-200 ease-in-out">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {decision && (
        <DecisionModal
          quotation={decision.quotation}
          type={decision.type}
          submitting={submitting}
          error={message?.type === 'error' ? message.text : ''}
          onClose={() => { setMessage(null); setDecision(null) }}
          onConfirm={handleDecision}
        />
      )}

      {/* 列表 */}
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[900px]">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[11%]" />
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-slate-500 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 font-medium">{t('quotations.quotationNo')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('quotations.fromInquiry')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('quotations.serviceType')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('common.route')}</th>
                <th className="text-right px-3 py-2.5 font-medium">{t('quotations.amount')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('quotations.validUntil')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.status')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">{t('quotations.empty')}</p>
                    <p className="text-xs text-slate-400 mt-1">{t('quotations.emptyHint')}</p>
                  </td>
                </tr>
              ) : (
                quotations.map((q) => {
                  const decidable = CLIENT_DECIDABLE.includes(q.status)
                  const expired = isExpired(q.valid_until)
                  return (
                    <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="text-left px-3 py-2.5">
                        <span className="text-xs font-medium text-slate-900 block truncate">{q.quotation_number}</span>
                        {q.version > 1 && <span className="text-[10px] text-slate-400">V{q.version}</span>}
                        {q.converted_order_number && (
                          <span className="block text-[10px] text-purple-600">{t('common.orderNo')} {q.converted_order_number}</span>
                        )}
                      </td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-500 truncate">{q.inquiry_number || '-'}</td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600">
                        {t(`businessType.${q.business_type}`, { defaultValue: q.business_type })}
                      </td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">{routeText(q)}</td>
                      <td className="text-right px-3 py-2.5 text-xs font-semibold text-slate-900">
                        {fmtMoney(q.total_price, q.currency)}
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs">
                        <span className={expired ? 'text-red-600' : 'text-slate-500'}>
                          {formatDate(q.valid_until)}
                        </span>
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ${
                          QUOTATION_STATUS_STYLES[q.status] || 'bg-gray-100 text-gray-600'
                        }`}>
                          {t(`quotationStatus.${q.status}`, { defaultValue: q.status })}
                        </span>
                      </td>
                      <td className="text-center px-3 py-2.5">
                        {decidable ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setDecision({ quotation: q, type: 'accept' })}
                              title={t('quotations.decision.accept.title')}
                              className="h-7 px-2 flex items-center gap-1 text-[11px] text-green-700 hover:bg-green-50 rounded-lg transition-all duration-200 ease-in-out"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              {t('quotations.decision.accept.verb')}
                            </button>
                            {/* 已经标过待定的不用再标一次 */}
                            {q.status === QUOTATION_STATUS.SENT && (
                              <button
                                onClick={() => setDecision({ quotation: q, type: 'pending' })}
                                title={t('quotations.decision.pending.title')}
                                className="h-7 px-2 flex items-center gap-1 text-[11px] text-amber-700 hover:bg-amber-50 rounded-lg transition-all duration-200 ease-in-out"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                {t('quotations.decision.pending.verb')}
                              </button>
                            )}
                            <button
                              onClick={() => setDecision({ quotation: q, type: 'reject' })}
                              title={t('quotations.decision.reject.title')}
                              className="h-7 px-2 flex items-center gap-1 text-[11px] text-red-700 hover:bg-red-50 rounded-lg transition-all duration-200 ease-in-out"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              {t('quotations.decision.reject.verb')}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
