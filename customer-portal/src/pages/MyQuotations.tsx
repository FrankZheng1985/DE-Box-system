/**
 * 客户门户 · 我的报价（需求 2）
 *
 * 此前客户门户完全看不到报价，运营发出去的报价只能靠邮件/电话确认。
 * 现在客户可以在这里直接【接受 / 拒绝 / 待定】，
 * 接受即由后端自动生成待审核订单，不再需要运营手工点「一键下单」。
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, CheckCircle, XCircle, Clock, FileText, X, AlertCircle, Loader2,
} from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { BUSINESS_TYPE_LABELS, type BusinessType } from '../constants/businessTypes'
import {
  QUOTATION_STATUS, QUOTATION_STATUS_LABELS, QUOTATION_STATUS_STYLES, CLIENT_DECIDABLE,
} from '../constants/inquiryQuotation'

// ==================== 类型定义 ====================

/** 字段名与后端 GET /quotations 返回的 JSON key 一致（snake_case，踩坑 003） */
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

const DECISION_META: Record<DecisionType, { title: string; verb: string; endpoint: string; needNote: boolean }> = {
  accept: { title: '接受报价', verb: '接受', endpoint: 'accept', needNote: false },
  reject: { title: '拒绝报价', verb: '拒绝', endpoint: 'reject', needNote: true },
  pending: { title: '标记待定', verb: '标记待定', endpoint: 'pending', needNote: false },
}

// ==================== 工具 ====================

/** NUMERIC 回来是字符串，格式化前先转数字（踩坑 002） */
function fmtMoney(value: string | number | null, currency = 'EUR'): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '-'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
}

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
  quotation, type, submitting, onClose, onConfirm,
}: {
  quotation: Quotation
  type: DecisionType
  submitting: boolean
  onClose: () => void
  onConfirm: (note: string) => void
}) {
  const [note, setNote] = useState('')
  const meta = DECISION_META[type]

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-slate-900">{meta.title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">报价单号</span>
              <span className="font-medium text-slate-900">{quotation.quotation_number}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">路线</span>
              <span className="text-slate-700">{routeText(quotation)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">报价金额</span>
              <span className="font-semibold text-slate-900">{fmtMoney(quotation.total_price, quotation.currency)}</span>
            </div>
          </div>

          {type === 'accept' && (
            <div className="flex gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-xl">
              <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 leading-relaxed">
                接受后系统会立即生成运输订单并转入我司审核，审核通过即开始安排。
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-500 mb-1">
              {type === 'reject' ? '拒绝原因 *' : '备注（选填）'}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={type === 'reject' ? '例如：价格超出预算 / 时效不符合要求' : '有什么想让我们知道的？'}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary-500 resize-none transition-all duration-200 ease-in-out"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="h-8 px-3 text-xs text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-200 ease-in-out">
            取消
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
            确认{meta.verb}
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

export default function MyQuotations() {
  const navigate = useNavigate()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [decision, setDecision] = useState<{ quotation: Quotation; type: DecisionType } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 后端按登录身份强制只返回本公司的报价（踩坑 016），前端不用传 clientId
      const res = await api.get<ApiResponse<Quotation[]>>('/quotations?pageSize=100')
      if (res.code === 200) {
        // 草稿是运营还没发出来的，客户不该看到
        setQuotations((res.data || []).filter((q) => q.status !== QUOTATION_STATUS.DRAFT))
      } else {
        setMessage({ text: res.message || '加载报价失败', type: 'error' })
      }
    } catch (err) {
      console.error('加载报价失败:', err)
      setMessage({ text: '加载报价失败', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!message) return
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
        setMessage({ text: res.message || '操作成功', type: 'success' })
        setDecision(null)
        await load()
        // 接受后后端会带回自动创建的订单号，直接引导客户去看订单
        if (type === 'accept' && res.data?.orderId) {
          setTimeout(() => navigate('/orders'), 1200)
        }
      } else {
        // else 分支必须把后端 message 显示出来 —— 信用超额等业务拒绝都靠它传达（踩坑 011）
        setMessage({ text: res.message || '操作失败', type: 'error' })
      }
    } catch (err) {
      console.error('提交报价决策失败:', err)
      setMessage({ text: err instanceof Error ? err.message : '操作失败，请稍后重试', type: 'error' })
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
        <p className="text-xs text-slate-500">收到报价后请及时确认，接受即自动生成订单</p>
        <button onClick={load} className="h-8 px-2 text-slate-500 hover:bg-gray-100 rounded-lg transition-all duration-200 ease-in-out">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {decision && (
        <DecisionModal
          quotation={decision.quotation}
          type={decision.type}
          submitting={submitting}
          onClose={() => setDecision(null)}
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
                <th className="text-left px-3 py-2.5 font-medium">报价单号</th>
                <th className="text-left px-3 py-2.5 font-medium">来源询价</th>
                <th className="text-left px-3 py-2.5 font-medium">服务类型</th>
                <th className="text-left px-3 py-2.5 font-medium">路线</th>
                <th className="text-right px-3 py-2.5 font-medium">报价金额</th>
                <th className="text-center px-3 py-2.5 font-medium">有效期至</th>
                <th className="text-center px-3 py-2.5 font-medium">状态</th>
                <th className="text-center px-3 py-2.5 font-medium">操作</th>
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
                    <p className="text-sm text-slate-400">暂无报价</p>
                    <p className="text-xs text-slate-400 mt-1">提交询价后，我司会尽快给出报价</p>
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
                          <span className="block text-[10px] text-purple-600">订单 {q.converted_order_number}</span>
                        )}
                      </td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-500 truncate">{q.inquiry_number || '-'}</td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600">
                        {BUSINESS_TYPE_LABELS[q.business_type as BusinessType] || q.business_type}
                      </td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">{routeText(q)}</td>
                      <td className="text-right px-3 py-2.5 text-xs font-semibold text-slate-900">
                        {fmtMoney(q.total_price, q.currency)}
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs">
                        <span className={expired ? 'text-red-600' : 'text-slate-500'}>
                          {q.valid_until ? new Date(q.valid_until).toLocaleDateString('de-DE') : '-'}
                        </span>
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ${
                          QUOTATION_STATUS_STYLES[q.status] || 'bg-gray-100 text-gray-600'
                        }`}>
                          {QUOTATION_STATUS_LABELS[q.status] || q.status}
                        </span>
                      </td>
                      <td className="text-center px-3 py-2.5">
                        {decidable ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setDecision({ quotation: q, type: 'accept' })}
                              title="接受报价"
                              className="h-7 px-2 flex items-center gap-1 text-[11px] text-green-700 hover:bg-green-50 rounded-lg transition-all duration-200 ease-in-out"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              接受
                            </button>
                            {/* 已经标过待定的不用再标一次 */}
                            {q.status === QUOTATION_STATUS.SENT && (
                              <button
                                onClick={() => setDecision({ quotation: q, type: 'pending' })}
                                title="暂时无法决定"
                                className="h-7 px-2 flex items-center gap-1 text-[11px] text-amber-700 hover:bg-amber-50 rounded-lg transition-all duration-200 ease-in-out"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                待定
                              </button>
                            )}
                            <button
                              onClick={() => setDecision({ quotation: q, type: 'reject' })}
                              title="拒绝报价"
                              className="h-7 px-2 flex items-center gap-1 text-[11px] text-red-700 hover:bg-red-50 rounded-lg transition-all duration-200 ease-in-out"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              拒绝
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
