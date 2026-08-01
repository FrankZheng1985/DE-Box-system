/**
 * 询价详情页（需求 5.1 / 5.4）
 *
 * 上半部分：询价表头（客户、路线、联系人）
 * 中间：按件货物明细（含行级 LDM）
 * 下半部分：由这张询价开出的报价单列表
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Copy, Tag, Package, MapPin, User, FileText,
  CheckCircle, AlertCircle, Loader2, Pencil, Trash2,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import { BUSINESS_TYPE_LABELS } from '../constants/businessTypes'
import {
  INQUIRY_STATUS, INQUIRY_STATUS_LABELS, INQUIRY_STATUS_STYLES,
} from '../constants/inquiryQuotation'

// ==================== 类型定义 ====================

interface CargoItem {
  id: string
  line_number: number
  reference_no: string | null
  description: string | null
  quantity: number
  length_cm: string | null
  width_cm: string | null
  height_cm: string | null
  unit_weight_kg: string | null
  unit_volume_m3: string | null
  ldm: string | null
  ldm_manual: boolean
  stackable: boolean
  remarks: string | null
}

interface QuotationBrief {
  id: string
  quotation_number: string
  version: number
  total_price: string | null
  currency: string
  status: string
  valid_until: string | null
  created_at: string
}

interface InquiryDetailData {
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
  special_requirements: string | null
  remarks: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  status: string
  created_at: string
  cargoItems: CargoItem[]
  quotations: QuotationBrief[]
}

// ==================== 工具 ====================

/** NUMERIC 回来是字符串，显示前先转数字（踩坑 002） */
function fmt(value: string | number | null, digits = 2): string {
  if (value === null || value === undefined || value === '') return '-'
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(digits) : '-'
}

function fmtMoney(value: string | number | null, currency = 'EUR'): string {
  if (value === null || value === undefined || value === '') return '-'
  const n = Number(value)
  if (!Number.isFinite(n)) return '-'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
}

function addressLines(addr: InquiryDetailData['route_from']): string {
  if (!addr) return '-'
  return [addr.country, addr.zipCode, addr.city, addr.address].filter(Boolean).join(' · ') || '-'
}

// ==================== 小组件 ====================

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="text-xs text-slate-400 w-20 flex-shrink-0">{label}</span>
      <span className="text-sm text-slate-700 min-w-0 break-words">{value ?? '-'}</span>
    </div>
  )
}

function Section({ title, icon: Icon, children, action }: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Icon className="w-4 h-4 text-slate-400" />
          {title}
        </h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

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

// ==================== 主组件 ====================

export default function InquiryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<InquiryDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [summaryText, setSummaryText] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error') => setToast({ message, type })

  const fetchDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<InquiryDetailData>>(`/inquiries/${id}`)
      if (res.code === 200 && res.data) {
        setData(res.data)
      } else {
        showToast(res.message || '获取询价详情失败', 'error')
      }
    } catch (err) {
      console.error('获取询价详情失败:', err)
      showToast('获取询价详情失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  const handleCopySummary = async () => {
    if (!id) return
    try {
      const res = await api.get<ApiResponse<{ text: string }>>(`/inquiries/${id}/summary`)
      if (res.code !== 200 || !res.data) {
        showToast(res.message || '生成摘要失败', 'error')
        return
      }
      try {
        await navigator.clipboard.writeText(res.data.text)
        showToast('摘要已复制，可直接粘给服务商', 'success')
      } catch {
        // 剪贴板不可用时把文本显示出来让用户手动复制，而不是静默失败
        setSummaryText(res.data.text)
        showToast('浏览器不允许自动复制，请手动全选复制', 'error')
      }
    } catch (err) {
      console.error('生成摘要失败:', err)
      showToast('生成摘要失败', 'error')
    }
  }

  const handleDelete = async () => {
    if (!id || !data) return
    if (!window.confirm(`确定删除询价单 ${data.inquiry_number} 吗？此操作不可撤销。`)) return
    setDeleting(true)
    try {
      const res = await api.delete<ApiResponse<null>>(`/inquiries/${id}`)
      if (res.code === 200) {
        showToast('询价已删除', 'success')
        setTimeout(() => navigate('/inquiries'), 800)
      } else {
        showToast(res.message || '删除失败', 'error')
      }
    } catch (err) {
      console.error('删除询价失败:', err)
      showToast('删除失败', 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-200 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-56 bg-white rounded-2xl" />
          <div className="h-56 bg-white rounded-2xl" />
        </div>
        <div className="h-64 bg-white rounded-2xl" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-4 lg:p-6">
        <button onClick={() => navigate('/inquiries')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> 返回询价列表
        </button>
        <div className="bg-white rounded-2xl p-12 text-center text-sm text-slate-400">询价单不存在或无权访问</div>
      </div>
    )
  }

  const canQuote = data.status === INQUIRY_STATUS.PENDING_QUOTE
  const canEdit = data.status === INQUIRY_STATUS.PENDING_QUOTE

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* 页头 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <button onClick={() => navigate('/inquiries')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-2 transition-colors">
            <ArrowLeft className="w-4 h-4" /> 返回询价列表
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">{data.inquiry_number}</h1>
            <span className={`inline-block px-2.5 py-1 text-xs rounded-full ${
              INQUIRY_STATUS_STYLES[data.status] || 'bg-gray-100 text-gray-600'
            }`}>
              {INQUIRY_STATUS_LABELS[data.status] || data.status}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopySummary}
            className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
          >
            <Copy className="w-4 h-4" />
            复制摘要
          </button>
          {canEdit && (
            <button
              onClick={() => navigate(`/inquiries/${data.id}/edit`)}
              className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
            >
              <Pencil className="w-4 h-4" />
              编辑
            </button>
          )}
          {canEdit && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="h-9 px-4 text-sm text-red-600 border border-red-200 rounded-xl hover:bg-red-50 flex items-center gap-1.5 disabled:opacity-50 transition-all duration-200 ease-in-out"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              删除
            </button>
          )}
          {canQuote && (
            <button
              onClick={() => navigate(`/quotes/create?inquiryId=${data.id}`)}
              className="h-9 px-4 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
            >
              <Tag className="w-4 h-4" />
              由此报价
            </button>
          )}
        </div>
      </div>

      {/* 剪贴板不可用时的兜底文本框 */}
      {summaryText && (
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">询价摘要（请手动全选复制）</h3>
            <button onClick={() => setSummaryText(null)} className="text-slate-400 hover:text-slate-600 transition-colors">✕</button>
          </div>
          <textarea
            readOnly
            value={summaryText}
            rows={14}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 bg-slate-50 outline-none resize-none"
          />
        </div>
      )}

      {/* 基本信息 + 联系人 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="基本信息" icon={FileText}>
          <InfoRow label="客户" value={data.client_name} />
          <InfoRow label="客户单号" value={data.customer_ref} />
          <InfoRow
            label="服务类型"
            value={BUSINESS_TYPE_LABELS[data.business_type as keyof typeof BUSINESS_TYPE_LABELS] || data.business_type}
          />
          <InfoRow label="运输方式" value={data.transport_type} />
          <InfoRow label="创建时间" value={new Date(data.created_at).toLocaleString('de-DE')} />
        </Section>

        <Section title="联系人" icon={User}>
          <InfoRow label="姓名" value={data.contact_name} />
          <InfoRow label="电话" value={data.contact_phone} />
          <InfoRow label="邮箱" value={data.contact_email} />
        </Section>
      </div>

      {/* 路线 */}
      <Section title="路线" icon={MapPin}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-slate-400 mb-1">起运地</p>
            <p className="text-sm text-slate-700 break-words">{addressLines(data.route_from)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">目的地</p>
            <p className="text-sm text-slate-700 break-words">{addressLines(data.route_to)}</p>
          </div>
        </div>
      </Section>

      {/* 按件货物明细 */}
      <Section
        title={`按件货物明细（${data.cargoItems.length} 行）`}
        icon={Package}
        action={
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>合计 <b className="text-slate-900">{data.cargo_quantity ?? '-'}</b> 件</span>
            <span>实重 <b className="text-slate-900">{fmt(data.cargo_weight_kg)}</b> kg</span>
            <span>体积 <b className="text-slate-900">{fmt(data.cargo_volume_m3)}</b> m³</span>
            <span>LDM <b className="text-slate-900">{fmt(data.ldm)}</b></span>
          </div>
        }
      >
        {data.cargoItems.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            未录入按件明细。表头合计值来自客户填写的总量。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed min-w-[900px]">
              <colgroup>
                <col className="w-[6%]" />
                <col className="w-[13%]" />
                <col className="w-[16%]" />
                <col className="w-[8%]" />
                <col className="w-[15%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-100">
                  <th className="text-left px-3 py-2.5 font-medium">行号</th>
                  <th className="text-left px-3 py-2.5 font-medium">件号</th>
                  <th className="text-left px-3 py-2.5 font-medium">货物描述</th>
                  <th className="text-right px-3 py-2.5 font-medium">件数</th>
                  <th className="text-center px-3 py-2.5 font-medium">长×宽×高 (cm)</th>
                  <th className="text-right px-3 py-2.5 font-medium">单件实重 (kg)</th>
                  <th className="text-right px-3 py-2.5 font-medium">单件体积 (m³)</th>
                  <th className="text-right px-3 py-2.5 font-medium">LDM</th>
                  <th className="text-center px-3 py-2.5 font-medium">可堆叠</th>
                </tr>
              </thead>
              <tbody>
                {data.cargoItems.map((it) => (
                  <tr key={it.id} className="border-b border-slate-50">
                    <td className="text-left px-3 py-2.5 text-xs text-slate-500">{it.line_number}</td>
                    <td className="text-left px-3 py-2.5 text-xs text-slate-900 truncate">{it.reference_no || '-'}</td>
                    <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">{it.description || '-'}</td>
                    <td className="text-right px-3 py-2.5 text-xs text-slate-600">{it.quantity}</td>
                    <td className="text-center px-3 py-2.5 text-xs text-slate-600">
                      {[it.length_cm, it.width_cm, it.height_cm].map((v) => (v ? Number(v) : '?')).join('×')}
                    </td>
                    <td className="text-right px-3 py-2.5 text-xs text-slate-600">{fmt(it.unit_weight_kg)}</td>
                    <td className="text-right px-3 py-2.5 text-xs text-slate-600">{fmt(it.unit_volume_m3, 3)}</td>
                    <td className="text-right px-3 py-2.5 text-xs text-slate-600">
                      {fmt(it.ldm)}
                      {it.ldm_manual && <span className="ml-1 text-[10px] text-amber-600" title="人工调整过">手改</span>}
                    </td>
                    <td className="text-center px-3 py-2.5 text-xs text-slate-600">{it.stackable ? '是' : '否'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(data.cargo_description || data.special_requirements || data.remarks) && (
          <div className="mt-5 pt-4 border-t border-slate-100 space-y-1">
            {data.cargo_description && <InfoRow label="货物描述" value={data.cargo_description} />}
            {data.special_requirements && <InfoRow label="特殊要求" value={data.special_requirements} />}
            {data.remarks && <InfoRow label="备注" value={data.remarks} />}
          </div>
        )}
      </Section>

      {/* 关联报价 */}
      <Section title={`关联报价（${data.quotations.length} 张）`} icon={Tag}>
        {data.quotations.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            还没有为这张询价开出报价。
            {canQuote && '点右上角「由此报价」创建。'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed min-w-[700px]">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[10%]" />
                <col className="w-[18%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-100">
                  <th className="text-left px-3 py-2.5 font-medium">报价编号</th>
                  <th className="text-right px-3 py-2.5 font-medium">版本</th>
                  <th className="text-right px-3 py-2.5 font-medium">金额</th>
                  <th className="text-center px-3 py-2.5 font-medium">状态</th>
                  <th className="text-center px-3 py-2.5 font-medium">有效期至</th>
                  <th className="text-center px-3 py-2.5 font-medium">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {data.quotations.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => navigate(`/quotes/${q.id}`)}
                    className="border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer transition-colors"
                  >
                    <td className="text-left px-3 py-2.5 text-xs font-medium text-slate-900 truncate">{q.quotation_number}</td>
                    <td className="text-right px-3 py-2.5 text-xs text-slate-600">V{q.version}</td>
                    <td className="text-right px-3 py-2.5 text-xs text-slate-900">{fmtMoney(q.total_price, q.currency)}</td>
                    <td className="text-center px-3 py-2.5"><StatusBadge status={q.status} type="quotation" /></td>
                    <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                      {q.valid_until ? new Date(q.valid_until).toLocaleDateString('de-DE') : '-'}
                    </td>
                    <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                      {new Date(q.created_at).toLocaleDateString('de-DE')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
