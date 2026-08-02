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
import api, { type ApiResponse } from '../utils/api'
import Modal from './Modal'
import { useAuth } from '../contexts/AuthContext'
import {
  CARRIER_INQUIRY_STATUS, CARRIER_INQUIRY_STATUS_LABELS,
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
  /** 服务商成本变化时通知父组件（例如刷新"由此报价"的成本提示） */
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
function fmtMoney(value: string | number | null, currency = 'EUR'): string {
  if (value === null || value === undefined || value === '') return '-'
  const n = Number(value)
  if (!Number.isFinite(n)) return '-'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
}

function fmtDate(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('de-DE')
}

// ==================== 组件 ====================

export default function CarrierInquiryPanel({ inquiryId, onChanged, onToast }: Props) {
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
        toastRef.current(res.message || '获取服务商询价失败', 'error')
      }
    } catch (err) {
      console.error('获取服务商询价失败:', err)
      toastRef.current('获取服务商询价失败', 'error')
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
      onToast('获取服务商列表失败', 'error')
    }
  }

  const togglePick = (id: string) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleSend = async () => {
    if (picked.length === 0) {
      onToast('请至少选择一家服务商', 'error')
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
        onToast(res.message || '已发起服务商询价', 'success')
        setSendOpen(false)
        await fetchRows()
        onChanged?.()
      } else {
        onToast(res.message || '发起失败', 'error')
      }
    } catch (err) {
      console.error('发起服务商询价失败:', err)
      onToast('发起服务商询价失败', 'error')
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
      validUntil: row.valid_until ? row.valid_until.slice(0, 10) : '',
      replyRemarks: row.reply_remarks ?? '',
    })
  }

  const handleReply = async () => {
    if (!replyTarget) return
    if (replyForm.quotedCost === '') {
      onToast('请填写服务商报来的成本金额', 'error')
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
        onToast('服务商报价已记录', 'success')
        setReplyTarget(null)
        await fetchRows()
        onChanged?.()
      } else {
        onToast(res.message || '回填失败', 'error')
      }
    } catch (err) {
      console.error('回填服务商报价失败:', err)
      onToast('回填服务商报价失败', 'error')
    } finally {
      setReplying(false)
    }
  }

  // ---------- 选用 / 不报价 / 取消 / 删除 ----------

  const runAction = async (row: CarrierInquiry, action: 'select' | 'decline' | 'cancel' | 'delete') => {
    const confirmText: Record<typeof action, string | null> = {
      select: null,
      decline: `确定把 ${row.carrier_name || '该服务商'} 标记为不报价吗？`,
      cancel: `确定取消对 ${row.carrier_name || '该服务商'} 的询价吗？`,
      delete: `确定删除 ${row.carrier_inquiry_number} 吗？此操作不可撤销。`,
    }
    const text = confirmText[action]
    if (text && !window.confirm(text)) return

    setBusyId(row.id)
    try {
      const res = action === 'delete'
        ? await api.delete<ApiResponse<null>>(`/carrier-inquiries/${row.id}`)
        : await api.post<ApiResponse<CarrierInquiry>>(`/carrier-inquiries/${row.id}/${action}`, {})
      if (res.code === 200) {
        onToast(res.message || '操作成功', 'success')
        await fetchRows()
        onChanged?.()
      } else {
        onToast(res.message || '操作失败', 'error')
      }
    } catch (err) {
      console.error('操作服务商询价失败:', err)
      onToast('操作失败', 'error')
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
          服务商询价（{rows.length} 家）
          <span className="text-xs font-normal text-slate-400">成本信息，仅服务商管理岗可见</span>
        </h2>
        {canManage && (
          <button
            onClick={openSendModal}
            className="h-9 px-4 bg-slate-900 text-white text-sm rounded-xl hover:bg-slate-800 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
          >
            <Plus className="w-4 h-4" />
            发起服务商询价
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
            还没有对这张询价发起服务商询价。
            {canManage && '点右上角发起，回价填进来后可以对比选用。'}
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
                  <th className="text-left px-3 py-2.5 font-medium">服务商</th>
                  <th className="text-left px-3 py-2.5 font-medium">询价单号</th>
                  <th className="text-center px-3 py-2.5 font-medium">状态</th>
                  <th className="text-right px-3 py-2.5 font-medium">成本</th>
                  <th className="text-right px-3 py-2.5 font-medium">时效(天)</th>
                  <th className="text-center px-3 py-2.5 font-medium">报价有效期</th>
                  <th className="text-center px-3 py-2.5 font-medium">操作</th>
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
                        {CARRIER_INQUIRY_STATUS_LABELS[row.status] || row.status}
                      </span>
                    </td>
                    <td className="text-right px-3 py-2.5 text-xs text-slate-900">
                      {fmtMoney(row.quoted_cost, row.currency)}
                      {row.id === lowestId && (
                        <span className="ml-1 text-[10px] text-green-600" title="当前最低成本">最低</span>
                      )}
                    </td>
                    <td className="text-right px-3 py-2.5 text-xs text-slate-600">{row.transit_days ?? '-'}</td>
                    <td className="text-center px-3 py-2.5 text-xs text-slate-500">{fmtDate(row.valid_until)}</td>
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
                              {row.status === CARRIER_INQUIRY_STATUS.PENDING ? '回价' : '改价'}
                            </button>
                          )}
                          {row.status === CARRIER_INQUIRY_STATUS.QUOTED && (
                            <button
                              onClick={() => runAction(row, 'select')}
                              className="h-7 px-2 text-[11px] text-green-700 border border-green-200 rounded-lg hover:bg-green-50 inline-flex items-center gap-1 transition-all duration-200 ease-in-out"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              选用
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
                              不报
                            </button>
                          )}
                          {row.status === CARRIER_INQUIRY_STATUS.PENDING && (
                            <button
                              onClick={() => runAction(row, 'cancel')}
                              className="h-7 px-2 text-[11px] text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1 transition-all duration-200 ease-in-out"
                            >
                              <XCircle className="w-3 h-3" />
                              取消
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
                              删除
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">只读</span>
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
                    {r.request_remarks && <span className="ml-2">询价要求：{r.request_remarks}</span>}
                    {r.reply_remarks && <span className="ml-2">回复备注：{r.reply_remarks}</span>}
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
        title="发起服务商询价"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setSendOpen(false)}
              className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all duration-200 ease-in-out"
            >
              取消
            </button>
            <button
              onClick={handleSend}
              disabled={sending || picked.length === 0}
              className="h-9 px-4 bg-slate-900 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
            >
              {sending && <Loader2 className="w-4 h-4 animate-spin" />}
              发起询价（{picked.length}）
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            这里只在系统内建立询价记录。实际询价内容请用页面上方的「复制摘要」粘给服务商。
          </p>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={carrierSearch}
              onChange={(e) => setCarrierSearch(e.target.value)}
              placeholder="按公司名称或服务商编号搜索"
              className="w-full h-9 pl-9 pr-3 min-w-[260px] border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 transition-all duration-200 ease-in-out"
            />
          </div>

          <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
            {visibleCarriers.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">没有匹配的服务商</p>
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
                    {asked && <span className="text-[11px] text-amber-600 flex-shrink-0">已在询价中</span>}
                  </label>
                )
              })
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1.5">补充要求（可选）</label>
            <textarea
              value={requestRemarks}
              onChange={(e) => setRequestRemarks(e.target.value)}
              rows={3}
              placeholder="例如：需要带尾板、周五前提货"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 resize-none transition-all duration-200 ease-in-out"
            />
          </div>
        </div>
      </Modal>

      {/* 回填报价 */}
      <Modal
        isOpen={replyTarget !== null}
        onClose={() => setReplyTarget(null)}
        title={`回填服务商报价 · ${replyTarget?.carrier_name || ''}`}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setReplyTarget(null)}
              className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all duration-200 ease-in-out"
            >
              取消
            </button>
            <button
              onClick={handleReply}
              disabled={replying}
              className="h-9 px-4 bg-slate-900 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
            >
              {replying && <Loader2 className="w-4 h-4 animate-spin" />}
              保存
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">成本金额 *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={replyForm.quotedCost}
                onChange={(e) => setReplyForm({ ...replyForm, quotedCost: e.target.value })}
                placeholder="服务商报来的价格"
                className="w-full h-9 px-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 transition-all duration-200 ease-in-out"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">币种</label>
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
              <label className="block text-xs text-slate-500 mb-1.5">时效（天）</label>
              <input
                type="number"
                min="0"
                value={replyForm.transitDays}
                onChange={(e) => setReplyForm({ ...replyForm, transitDays: e.target.value })}
                placeholder="例如 3"
                className="w-full h-9 px-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 transition-all duration-200 ease-in-out"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">报价有效期</label>
              <input
                type="date"
                value={replyForm.validUntil}
                onChange={(e) => setReplyForm({ ...replyForm, validUntil: e.target.value })}
                className="w-full h-9 px-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 transition-all duration-200 ease-in-out"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">回复备注</label>
            <textarea
              value={replyForm.replyRemarks}
              onChange={(e) => setReplyForm({ ...replyForm, replyRemarks: e.target.value })}
              rows={3}
              placeholder="服务商的附加说明，例如含税、不含装卸"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 resize-none transition-all duration-200 ease-in-out"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
