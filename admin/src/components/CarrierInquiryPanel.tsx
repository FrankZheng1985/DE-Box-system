/**
 * 服务商询价区块（P6 · 需求 5.3）
 *
 * 挂在询价详情页下半部分：上面是客户询价，这里是对同一张单发起的服务商询价。
 *
 * ⚠️ 信息隔离：调用方必须先判 hasPermission('carrier_inquiry:view') 再渲染本组件，
 *    组件内部的写操作再判一次 carrier_inquiry:manage。后端同样两道，前端只是少露一层。
 *
 * 单独拆成组件而不是塞进 InquiryDetail：详情页已经 490 行，
 * 把这一整块（列表 + 三个弹窗）塞进去会直接冲到 800 行红线。
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Truck, Plus, Loader2, CheckCircle2, Ban, XCircle, Trash2, Pencil, Search,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import Modal from './Modal'
import { formatDate, formatMoney, toDateInputValue } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'
import {
  CARRIER_INQUIRY_STATUS, carrierInquiryStatusLabelKey,
  CARRIER_INQUIRY_STATUS_STYLES, CARRIER_INQUIRY_PERMISSIONS,
  type CarrierInquiry,
} from '../constants/carrierInquiry'

// ==================== 类型 ====================

interface CarrierOption {
  id: string
  carrier_code: string
  company_name: string
  country: string | null
  status: string
}

/** 列表接口比标准响应多一个 summary（最低价标记由后端算） */
interface CarrierInquiryListResponse extends ApiResponse<CarrierInquiry[]> {
  summary?: { lowest_id: string | null; lowest_cost: number | null }
}

interface Props {
  inquiryId: string
  /** 服务商成本变化时通知父组件（例如刷新报价的成本提示） */
  onChanged?: () => void
  onToast: (message: string, type: 'success' | 'error') => void
}

interface ReplyForm {
  quotedCost: string
  currency: string
  transitDays: string
  validUntil: string
  replyRemarks: string
}

const EMPTY_REPLY: ReplyForm = {
  quotedCost: '', currency: 'EUR', transitDays: '', validUntil: '', replyRemarks: '',
}

// ==================== 工具 ====================

/** NUMERIC 回来是字符串，显示前先转数字（踩坑 002） */
// ==================== 组件 ====================

export default function CarrierInquiryPanel({ inquiryId, onChanged, onToast }: Props) {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canManage = hasPermission(CARRIER_INQUIRY_PERMISSIONS.MANAGE)

  const [rows, setRows] = useState<CarrierInquiry[]>([])
  const [lowestId, setLowestId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  // 发起询价弹窗
  const [sendOpen, setSendOpen] = useState(false)
  const [carriers, setCarriers] = useState<CarrierOption[]>([])
  const [carrierSearch, setCarrierSearch] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [requestRemarks, setRequestRemarks] = useState('')
  const [sending, setSending] = useState(false)

  // 回价弹窗
  const [replyTarget, setReplyTarget] = useState<CarrierInquiry | null>(null)
  const [replyForm, setReplyForm] = useState<ReplyForm>(EMPTY_REPLY)
  const [replying, setReplying] = useState(false)

  // 用 ref 拿最新的 onToast：把它写进 useCallback 依赖，
  // 父组件每次渲染换个新函数就会让列表反复重拉
  const toastRef = useRef(onToast)
  toastRef.current = onToast

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<CarrierInquiryListResponse>(`/carrier-inquiries?inquiryId=${inquiryId}`)
      if (res.code === 200 && Array.isArray(res.data)) {
        setRows(res.data)
        setLowestId(res.summary?.lowest_id ?? null)
      } else {
        toastRef.current(res.message || t('carrierInquiry.loadFailed'), 'error')
      }
    } catch (err) {
      console.error('获取服务商询价失败:', err)
      toastRef.current(t('carrierInquiry.loadFailed'), 'error')
    } finally {
      setLoading(false)
    }
  }, [inquiryId])

  useEffect(() => { fetchRows() }, [fetchRows])

  // ---------- 发起询价 ----------

  const openSendModal = async () => {
    setSendOpen(true)
    setPicked([])
    setRequestRemarks('')
    setCarrierSearch('')
    try {
      const res = await api.get<ApiResponse<CarrierOption[]>>('/carriers?status=ACTIVE&pageSize=200')
      if (res.code === 200 && Array.isArray(res.data)) {
        setCarriers(res.data)
      }
    } catch (err) {
      console.error('获取服务商列表失败:', err)
      onToast(t('carrierInquiry.loadCarriersFailed'), 'error')
    }
  }

  const togglePick = (id: string) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleSend = async () => {
    if (picked.length === 0) {
      onToast(t('carrierInquiry.pickAtLeastOne'), 'error')
      return
    }
    setSending(true)
    try {
      const res = await api.post<ApiResponse<CarrierInquiry[]>>('/carrier-inquiries/batch', {
        inquiryId,
        carrierIds: picked,
        requestRemarks: requestRemarks || undefined,
      })
      if (res.code === 200) {
        onToast(res.message || t('carrierInquiry.started'), 'success')
        setSendOpen(false)
        await fetchRows()
        onChanged?.()
      } else {
        onToast(res.message || t('carrierInquiry.startFailed'), 'error')
      }
    } catch (err) {
      console.error('发起服务商询价失败:', err)
      onToast(t('carrierInquiry.startFailedRetry'), 'error')
    } finally {
      setSending(false)
    }
  }

  // ---------- 回价 ----------

  const openReplyModal = (row: CarrierInquiry) => {
    setReplyTarget(row)
    setReplyForm({
      quotedCost: row.quoted_cost ?? '',
      currency: row.currency || 'EUR',
      transitDays: row.transit_days !== null && row.transit_days !== undefined ? String(row.transit_days) : '',
      validUntil: toDateInputValue(row.valid_until),
      replyRemarks: row.reply_remarks ?? '',
    })
  }

  const handleReply = async () => {
    if (!replyTarget) return
    if (replyForm.quotedCost === '') {
      onToast(t('carrierInquiry.costRequired'), 'error')
      return
    }
    setReplying(true)
    try {
      const res = await api.put<ApiResponse<CarrierInquiry>>(`/carrier-inquiries/${replyTarget.id}/reply`, {
        quotedCost: replyForm.quotedCost,
        currency: replyForm.currency,
        transitDays: replyForm.transitDays || null,
        validUntil: replyForm.validUntil || null,
        replyRemarks: replyForm.replyRemarks || null,
      })
      if (res.code === 200) {
        onToast(t('carrierInquiry.replySaved'), 'success')
        setReplyTarget(null)
        await fetchRows()
        onChanged?.()
      } else {
        onToast(res.message || t('carrierInquiry.replyFailed'), 'error')
      }
    } catch (err) {
      console.error('回填服务商报价失败:', err)
      onToast(t('carrierInquiry.replyFailedRetry'), 'error')
    } finally {
      setReplying(false)
    }
  }

  // ---------- 选用 / 不报价 / 取消 / 删除 ----------

  const runAction = async (row: CarrierInquiry, action: 'select' | 'decline' | 'cancel' | 'delete') => {
    const confirmText: Record<typeof action, string | null> = {
      select: null,
      decline: t('carrierInquiry.confirmDecline', {
        carrier: row.carrier_name || t('carrierInquiry.thisCarrier'),
      }),
      cancel: t('carrierInquiry.confirmCancel', {
        carrier: row.carrier_name || t('carrierInquiry.thisCarrier'),
      }),
      delete: t('carrierInquiry.confirmDelete', { number: row.carrier_inquiry_number }),
    }
    const text = confirmText[action]
    if (text && !window.confirm(text)) return

    setBusyId(row.id)
    try {
      const res = action === 'delete'
        ? await api.delete<ApiResponse<null>>(`/carrier-inquiries/${row.id}`)
        : await api.post<ApiResponse<CarrierInquiry>>(`/carrier-inquiries/${row.id}/${action}`, {})
      if (res.code === 200) {
        onToast(res.message || t('common.operateSuccess'), 'success')
        await fetchRows()
        onChanged?.()
      } else {
        onToast(res.message || t('common.operateFailed'), 'error')
      }
    } catch (err) {
      console.error('操作服务商询价失败:', err)
      onToast(t('common.operateFailed'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  // ---------- 渲染 ----------

  const alreadyAsked = new Set(
    rows
      .filter((r) => r.status !== CARRIER_INQUIRY_STATUS.CANCELLED && r.status !== CARRIER_INQUIRY_STATUS.DECLINED)
      .map((r) => r.carrier_id)
  )

  const visibleCarriers = carriers.filter((c) => {
    if (!carrierSearch.trim()) return true
    const kw = carrierSearch.trim().toLowerCase()
    return c.company_name.toLowerCase().includes(kw) || (c.carrier_code || '').toLowerCase().includes(kw)
  })

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Truck className="w-4 h-4 text-slate-400" />
          {t('carrierInquiry.title', { count: rows.length })}
          <span className="text-xs font-normal text-slate-400">{t('carrierInquiry.costVisibilityHint')}</span>
        </h2>
        {canManage && (
          <button
            onClick={openSendModal}
            className="h-9 px-4 bg-slate-900 text-white text-sm rounded-xl hover:bg-slate-800 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
          >
            <Plus className="w-4 h-4" />
            {t('carrierInquiry.start')}
          </button>
        )}
      </div>

      <div className="p-5">
        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-9 bg-slate-100 rounded-lg" />
            <div className="h-9 bg-slate-100 rounded-lg" />
            <div className="h-9 bg-slate-100 rounded-lg" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            {t('carrierInquiry.emptyTitle')}
            {canManage && t('carrierInquiry.emptyHint')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed min-w-[1000px]">
              <colgroup>
                <col className="w-[17%]" />
                <col className="w-[15%]" />
                <col className="w-[10%]" />
                <col className="w-[13%]" />
                <col className="w-[8%]" />
                <col className="w-[11%]" />
                <col className="w-[26%]" />
              </colgroup>
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-100">
                  <th className="text-left px-3 py-2.5 font-medium">{t('carrierInquiry.colCarrier')}</th>
                  <th className="text-left px-3 py-2.5 font-medium">{t('carrierInquiry.colNumber')}</th>
                  <th className="text-center px-3 py-2.5 font-medium">{t('common.status')}</th>
                  <th className="text-right px-3 py-2.5 font-medium">{t('carrierInquiry.colCost')}</th>
                  <th className="text-right px-3 py-2.5 font-medium">{t('carrierInquiry.colTransitDays')}</th>
                  <th className="text-center px-3 py-2.5 font-medium">{t('carrierInquiry.colValidUntil')}</th>
                  <th className="text-center px-3 py-2.5 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50">
                    <td className="text-left px-3 py-2.5">
                      <p className="text-xs font-medium text-slate-900 truncate">{row.carrier_name || '-'}</p>
                      <p className="text-[11px] text-slate-400 truncate">{row.carrier_code || ''}</p>
                    </td>
                    <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">{row.carrier_inquiry_number}</td>
                    <td className="text-center px-3 py-2.5">
                      <span className={`inline-block px-2 py-0.5 text-[11px] rounded-full ${
                        CARRIER_INQUIRY_STATUS_STYLES[row.status] || 'bg-gray-100 text-gray-600'
                      }`}>
                        {t(carrierInquiryStatusLabelKey(row.status), { defaultValue: row.status })}
                      </span>
                    </td>
                    <td className="text-right px-3 py-2.5 text-xs text-slate-900">
                      {formatMoney(row.quoted_cost, row.currency)}
                      {row.id === lowestId && (
                        <span className="ml-1 text-[10px] text-green-600" title={t('carrierInquiry.lowestCostTitle')}>{t('carrierInquiry.lowest')}</span>
                      )}
                    </td>
                    <td className="text-right px-3 py-2.5 text-xs text-slate-600">{row.transit_days ?? '-'}</td>
                    <td className="text-center px-3 py-2.5 text-xs text-slate-500">{formatDate(row.valid_until)}</td>
                    <td className="text-center px-3 py-2.5">
                      {canManage ? (
                        <div className="flex items-center justify-center gap-1.5">
                          {busyId === row.id && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                          {row.status !== CARRIER_INQUIRY_STATUS.CANCELLED && (
                            <button
                              onClick={() => openReplyModal(row)}
                              className="h-7 px-2 text-[11px] text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1 transition-all duration-200 ease-in-out"
                            >
                              <Pencil className="w-3 h-3" />
                              {row.status === CARRIER_INQUIRY_STATUS.PENDING ? t('carrierInquiry.reply') : t('carrierInquiry.editReply')}
                            </button>
                          )}
                          {row.status === CARRIER_INQUIRY_STATUS.QUOTED && (
                            <button
                              onClick={() => runAction(row, 'select')}
                              className="h-7 px-2 text-[11px] text-green-700 border border-green-200 rounded-lg hover:bg-green-50 inline-flex items-center gap-1 transition-all duration-200 ease-in-out"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              {t('carrierInquiry.select')}
                            </button>
                          )}
                          {[CARRIER_INQUIRY_STATUS.PENDING, CARRIER_INQUIRY_STATUS.QUOTED].includes(
                            row.status as 'PENDING' | 'QUOTED'
                          ) && (
                            <button
                              onClick={() => runAction(row, 'decline')}
                              className="h-7 px-2 text-[11px] text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1 transition-all duration-200 ease-in-out"
                            >
                              <Ban className="w-3 h-3" />
                              {t('carrierInquiry.decline')}
                            </button>
                          )}
                          {row.status === CARRIER_INQUIRY_STATUS.PENDING && (
                            <button
                              onClick={() => runAction(row, 'cancel')}
                              className="h-7 px-2 text-[11px] text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1 transition-all duration-200 ease-in-out"
                            >
                              <XCircle className="w-3 h-3" />
                              {t('common.cancel')}
                            </button>
                          )}
                          {[CARRIER_INQUIRY_STATUS.PENDING, CARRIER_INQUIRY_STATUS.CANCELLED].includes(
                            row.status as 'PENDING' | 'CANCELLED'
                          ) && (
                            <button
                              onClick={() => runAction(row, 'delete')}
                              className="h-7 px-2 text-[11px] text-red-600 border border-red-200 rounded-lg hover:bg-red-50 inline-flex items-center gap-1 transition-all duration-200 ease-in-out"
                            >
                              <Trash2 className="w-3 h-3" />
                              {t('common.delete')}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">{t('carrierInquiry.readOnly')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {rows.some((r) => r.reply_remarks || r.request_remarks) && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                {rows.filter((r) => r.reply_remarks || r.request_remarks).map((r) => (
                  <div key={`remark-${r.id}`} className="text-xs text-slate-500">
                    <span className="text-slate-900 font-medium">{r.carrier_name}</span>
                    {r.request_remarks && (
                      <span className="ml-2">{t('carrierInquiry.requestRemarks')}: {r.request_remarks}</span>
                    )}
                    {r.reply_remarks && (
                      <span className="ml-2">{t('carrierInquiry.replyRemarks')}: {r.reply_remarks}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 发起询价 */}
      <Modal
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        title={t('carrierInquiry.start')}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setSendOpen(false)}
              className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all duration-200 ease-in-out"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSend}
              disabled={sending || picked.length === 0}
              className="h-9 px-4 bg-slate-900 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
            >
              {sending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('carrierInquiry.startWithCount', { count: picked.length })}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            {t('carrierInquiry.startModalHint')}
          </p>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={carrierSearch}
              onChange={(e) => setCarrierSearch(e.target.value)}
              placeholder={t('carrierInquiry.searchPlaceholder')}
              className="w-full h-9 pl-9 pr-3 min-w-[260px] border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 transition-all duration-200 ease-in-out"
            />
          </div>

          <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
            {visibleCarriers.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">{t('carrierInquiry.noMatch')}</p>
            ) : (
              visibleCarriers.map((c) => {
                const asked = alreadyAsked.has(c.id)
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors ${
                      asked ? 'opacity-60' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={picked.includes(c.id)}
                      onChange={() => togglePick(c.id)}
                      disabled={asked}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-900 truncate">{c.company_name}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {c.carrier_code}{c.country ? ` · ${c.country}` : ''}
                      </p>
                    </div>
                    {asked && <span className="text-[11px] text-amber-600 flex-shrink-0">{t('carrierInquiry.alreadyAsked')}</span>}
                  </label>
                )
              })
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1.5">{t('carrierInquiry.extraRequirements')}</label>
            <textarea
              value={requestRemarks}
              onChange={(e) => setRequestRemarks(e.target.value)}
              rows={3}
              placeholder={t('carrierInquiry.extraRequirementsPlaceholder')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 resize-none transition-all duration-200 ease-in-out"
            />
          </div>
        </div>
      </Modal>

      {/* 回填报价 */}
      <Modal
        isOpen={replyTarget !== null}
        onClose={() => setReplyTarget(null)}
        title={`${t('carrierInquiry.replyModalTitle')} · ${replyTarget?.carrier_name || ''}`}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setReplyTarget(null)}
              className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all duration-200 ease-in-out"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleReply}
              disabled={replying}
              className="h-9 px-4 bg-slate-900 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
            >
              {replying && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('common.save')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">{t('carrierInquiry.costAmountRequired')}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={replyForm.quotedCost}
                onChange={(e) => setReplyForm({ ...replyForm, quotedCost: e.target.value })}
                placeholder={t('carrierInquiry.costAmountPlaceholder')}
                className="w-full h-9 px-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 transition-all duration-200 ease-in-out"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">{t('common.currency')}</label>
              <select
                value={replyForm.currency}
                onChange={(e) => setReplyForm({ ...replyForm, currency: e.target.value })}
                className="w-full h-9 px-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 transition-all duration-200 ease-in-out"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="CNY">CNY</option>
                <option value="PLN">PLN</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">{t('carrierInquiry.transitDays')}</label>
              <input
                type="number"
                min="0"
                value={replyForm.transitDays}
                onChange={(e) => setReplyForm({ ...replyForm, transitDays: e.target.value })}
                placeholder={t('carrierInquiry.transitDaysPlaceholder')}
                className="w-full h-9 px-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 transition-all duration-200 ease-in-out"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">{t('carrierInquiry.colValidUntil')}</label>
              <input
                type="date"
                value={replyForm.validUntil}
                onChange={(e) => setReplyForm({ ...replyForm, validUntil: e.target.value })}
                className="w-full h-9 px-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 transition-all duration-200 ease-in-out"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">{t('carrierInquiry.replyRemarks')}</label>
            <textarea
              value={replyForm.replyRemarks}
              onChange={(e) => setReplyForm({ ...replyForm, replyRemarks: e.target.value })}
              rows={3}
              placeholder={t('carrierInquiry.replyRemarksPlaceholder')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 resize-none transition-all duration-200 ease-in-out"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
