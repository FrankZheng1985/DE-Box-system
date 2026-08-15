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
  ArrowLeft, Copy, Tag, Package, PackageOpen, MapPin, User, FileText,
  Loader2, Pencil, Trash2,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import Toast from '../components/Toast'
import CarrierInquiryPanel from '../components/CarrierInquiryPanel'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '../utils/format'
import { businessTypeLabelKey } from '../constants/businessTypes'
import { CARRIER_INQUIRY_PERMISSIONS } from '../constants/carrierInquiry'
import {
  INQUIRY_STATUS, inquiryStatusLabelKey, INQUIRY_STATUS_STYLES,
} from '../constants/inquiryQuotation'

// ==================== 类型定义 ====================

/** 一票派送（本地派送专用，开发意见 #7） */
interface DeliveryOrder {
  id: string
  line_number: number
  customer_sub_ref: string | null
  delivery_address: {
    companyName?: string; country?: string; zipCode?: string; city?: string; address?: string
    contactName?: string; contactPhone?: string; contactEmail?: string
  } | null
  quantity: number | null
  weight_kg: string | null
  volume_m3: string | null
  ldm: string | null
  remarks: string | null
  cargoItems: CargoItem[]
}

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
  /** 车型（车长）代号，只有专车才有值 */
  vehicle_length_code: string | null
  /** 柜号，只有本地派送有 */
  container_no: string | null
  /** 取件地址的 JSONB 里还带着发货联系人（contactName / contactPhone / contactEmail） */
  route_from: {
    country?: string; city?: string; zipCode?: string; address?: string
    contactName?: string; contactPhone?: string; contactEmail?: string
  } | null
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
  /** 本地派送的派送子订单（柜 → 票 → 件）；其余服务是空数组 */
  deliveryOrders: DeliveryOrder[]
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

/** 取件地址里带的发货联系人，一个都没填就返回空数组（整块不显示） */
function senderContactLines(addr: InquiryDetailData['route_from']): string[] {
  if (!addr) return []
  return [addr.contactName, addr.contactPhone, addr.contactEmail].filter(Boolean) as string[]
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

// ==================== 主组件 ====================

export default function InquiryDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  // 服务商成本对普通运营岗不可见（需求 5.3 的信息隔离），后端同样拦一道
  const canSeeCarrierInquiry = hasPermission(CARRIER_INQUIRY_PERMISSIONS.VIEW)
  const [data, setData] = useState<InquiryDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [summaryText, setSummaryText] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // useCallback 包一层：这个函数会作为 prop 传给 CarrierInquiryPanel，
  // 每次渲染都换新引用会让子组件的 useEffect 反复触发（拉列表打成死循环）
  const showToast = useCallback(
    (message: string, type: 'success' | 'error') => setToast({ message, type }),
    []
  )

  const fetchDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<InquiryDetailData>>(`/inquiries/${id}`)
      if (res.code === 200 && res.data) {
        setData(res.data)
      } else {
        showToast(res.message || t('inquiryDetail.loadFailed'), 'error')
      }
    } catch (err) {
      console.error('获取询价详情失败:', err)
      showToast(t('inquiryDetail.loadFailed'), 'error')
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
        showToast(res.message || t('inquiry.summaryFailed'), 'error')
        return
      }
      try {
        await navigator.clipboard.writeText(res.data.text)
        showToast(t('inquiryDetail.summaryCopied'), 'success')
      } catch {
        // 剪贴板不可用时把文本显示出来让用户手动复制，而不是静默失败
        setSummaryText(res.data.text)
        showToast(t('inquiryDetail.copyBlocked'), 'error')
      }
    } catch (err) {
      console.error('生成摘要失败:', err)
      showToast(t('inquiry.summaryFailed'), 'error')
    }
  }

  const handleDelete = async () => {
    if (!id || !data) return
    if (!window.confirm(t('inquiryDetail.deleteConfirm', { number: data.inquiry_number }))) return
    setDeleting(true)
    try {
      const res = await api.delete<ApiResponse<null>>(`/inquiries/${id}`)
      if (res.code === 200) {
        showToast(t('inquiryDetail.deleted'), 'success')
        setTimeout(() => navigate('/inquiries'), 800)
      } else {
        showToast(res.message || t('orderFiles.deleteFailed'), 'error')
      }
    } catch (err) {
      console.error('删除询价失败:', err)
      showToast(t('orderFiles.deleteFailed'), 'error')
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
          <ArrowLeft className="w-4 h-4" /> {t('inquiryDetail.backToList')}
        </button>
        <div className="bg-white rounded-2xl p-12 text-center text-sm text-slate-400">{t('inquiryDetail.notFound')}</div>
      </div>
    )
  }

  const canQuote = data.status === INQUIRY_STATUS.PENDING_QUOTE
  const canEdit = data.status === INQUIRY_STATUS.PENDING_QUOTE
  /**
   * 有派送子订单就按三层渲染（开发意见 #7）
   * 认数据而不认 business_type：万一有单类型是本地派送却还没录子订单，
   * 按两层渲染至少还能看见东西，反过来会渲染出一片空
   */
  const isLocalDelivery = (data.deliveryOrders?.length ?? 0) > 0

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* 页头 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <button onClick={() => navigate('/inquiries')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-2 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t('inquiryDetail.backToList')}
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">{data.inquiry_number}</h1>
            <span className={`inline-block px-2.5 py-1 text-xs rounded-full ${
              INQUIRY_STATUS_STYLES[data.status] || 'bg-gray-100 text-gray-600'
            }`}>
              {t(inquiryStatusLabelKey(data.status), { defaultValue: data.status })}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopySummary}
            className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
          >
            <Copy className="w-4 h-4" />
            {t('inquiry.copySummary')}
          </button>
          {/* 编辑页目前只会两层结构：拿它打开一张有派送子订单的单，保存时后端会拒
              （拒是对的，否则子订单会被洗成空壳）。与其让运营填半天再看到报错，
              不如这里就禁掉并说明原因 —— 三层编辑排在下一批 */}
          {canEdit && (
            <button
              onClick={() => navigate(`/inquiries/${data.id}/edit`)}
              disabled={isLocalDelivery}
              title={isLocalDelivery ? t('inquiryDetail.editLocalDeliveryUnsupported') : undefined}
              className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-all duration-200 ease-in-out"
            >
              <Pencil className="w-4 h-4" />
              {t('common.edit')}
            </button>
          )}
          {canEdit && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="h-9 px-4 text-sm text-red-600 border border-red-200 rounded-xl hover:bg-red-50 flex items-center gap-1.5 disabled:opacity-50 transition-all duration-200 ease-in-out"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {t('common.delete')}
            </button>
          )}
          {canQuote && (
            <button
              onClick={() => navigate(`/quotes/create?inquiryId=${data.id}`)}
              className="h-9 px-4 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
            >
              <Tag className="w-4 h-4" />
              {t('inquiry.quoteFromThis')}
            </button>
          )}
        </div>
      </div>

      {/* 剪贴板不可用时的兜底文本框 */}
      {summaryText && (
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">{t('inquiryDetail.summaryManualCopy')}</h3>
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
        <Section title={t('section.basicInfo')} icon={FileText}>
          <InfoRow label={t('common.client')} value={data.client_name} />
          <InfoRow label={t('inquiry.customerRef')} value={data.customer_ref} />
          <InfoRow
            label={t('field.businessType')}
            value={t(businessTypeLabelKey(data.business_type), { defaultValue: data.business_type })}
          />
          <InfoRow label={t('field.transportType')} value={data.transport_type} />
          {/* 车型只有专车才有值，没有就不占一行 */}
          {data.vehicle_length_code && (
            <InfoRow
              label={t('field.vehicleLength')}
              value={t(`vehicleLength.${data.vehicle_length_code}`, { defaultValue: data.vehicle_length_code })}
            />
          )}
          {/* 柜号只有本地派送有，运营按它跟码头和仓库对单（开发意见 #7） */}
          {data.container_no && (
            <InfoRow label={t('field.containerNo')} value={data.container_no} />
          )}
          <InfoRow label={t('common.createdAt')} value={formatDateTime(data.created_at)} />
        </Section>

        {/* 本地派送的收货联系人在每一票上，表头这三个字段永远是空的，
            显示出来只会是三行「-」，让人以为客户漏填（开发意见 #7） */}
        {!isLocalDelivery && (
          <Section title={t('section.receiverContact')} icon={User}>
            <InfoRow label={t('field.name')} value={data.contact_name} />
            <InfoRow label={t('field.phone')} value={data.contact_phone} />
            <InfoRow label={t('field.email')} value={data.contact_email} />
          </Section>
        )}
      </div>

      {/* 路线 */}
      <Section title={t('common.route')} icon={MapPin}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-slate-400 mb-1">{t('field.origin')}</p>
            <p className="text-sm text-slate-700 break-words">{addressLines(data.route_from)}</p>
            {/* 发货联系人存在取件地址的 JSONB 里（开发意见 #8），
                不显示的话客户填了运营也看不见，等于白填 */}
            {senderContactLines(data.route_from).length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <p className="text-xs text-slate-400 mb-1">{t('section.senderContact')}</p>
                {senderContactLines(data.route_from).map((line) => (
                  <p key={line} className="text-sm text-slate-700 break-words">{line}</p>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">{t('field.destination')}</p>
            {/* 一个柜派往多个地址，没有单一目的地——指到下面的派送明细，别显示一个「-」 */}
            <p className="text-sm text-slate-700 break-words">
              {isLocalDelivery
                ? t('inquiryDetail.destinationSeeDrops', { count: data.deliveryOrders.length })
                : addressLines(data.route_to)}
            </p>
          </div>
        </div>
      </Section>

      {/* 本地派送：柜下的每一票派送各成一块，票内再列自己的件明细（开发意见 #7）。
          客户填的派送地址和收件人全在这里，不展示等于白填 */}
      {data.deliveryOrders?.length > 0 && (
        <Section
          title={t('inquiryDetail.deliveryOrdersTitle', { count: data.deliveryOrders.length })}
          icon={PackageOpen}
          action={
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>{t('cargo.totalPieces')} <b className="text-slate-900">{data.cargo_quantity ?? '-'}</b></span>
              <span>{t('cargo.totalWeight')} <b className="text-slate-900">{fmt(data.cargo_weight_kg)}</b> kg</span>
              <span>LDM <b className="text-slate-900">{fmt(data.ldm)}</b></span>
            </div>
          }
        >
          <div className="space-y-3">
            {data.deliveryOrders.map((order) => {
              const addr = order.delivery_address || {}
              const contact = [addr.contactName, addr.contactPhone, addr.contactEmail].filter(Boolean)
              return (
                <div key={order.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-slate-50 border-b border-slate-200">
                    <span className="text-xs font-medium text-slate-900">
                      {t('inquiryDetail.dropNo', { index: order.line_number })}
                    </span>
                    {order.customer_sub_ref && (
                      <span className="text-[11px] text-slate-500">{order.customer_sub_ref}</span>
                    )}
                    <span className="ml-auto text-[11px] text-slate-500">
                      {order.quantity ?? 0} {t('cargo.piecesUnit')} · {fmt(order.weight_kg)} kg · LDM {fmt(order.ldm)}
                    </span>
                  </div>

                  <div className="px-3 py-2 space-y-1 border-b border-slate-100">
                    <p className="text-xs text-slate-700">
                      {[addr.companyName, addr.country, addr.zipCode, addr.city, addr.address]
                        .filter(Boolean).join(' · ') || '-'}
                    </p>
                    {contact.length > 0 && (
                      <p className="text-[11px] text-slate-500">{contact.join(' · ')}</p>
                    )}
                    {order.remarks && (
                      <p className="text-[11px] text-amber-700">{order.remarks}</p>
                    )}
                  </div>

                  {order.cargoItems.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full table-fixed min-w-[640px]">
                        <colgroup>
                          <col className="w-[16%]" />
                          <col className="w-[24%]" />
                          <col className="w-[10%]" />
                          <col className="w-[20%]" />
                          <col className="w-[15%]" />
                          <col className="w-[15%]" />
                        </colgroup>
                        <thead>
                          <tr className="text-[11px] text-slate-500 border-b border-slate-100">
                            <th className="text-left px-3 py-2 font-medium">{t('cargo.colItemNo')}</th>
                            <th className="text-left px-3 py-2 font-medium">{t('field.cargoDescription')}</th>
                            <th className="text-right px-3 py-2 font-medium">{t('cargo.colPieces')}</th>
                            <th className="text-center px-3 py-2 font-medium">{t('cargo.colDimensions')}</th>
                            <th className="text-right px-3 py-2 font-medium">{t('cargo.colUnitWeightKg')}</th>
                            <th className="text-right px-3 py-2 font-medium">LDM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.cargoItems.map((it) => (
                            <tr key={it.id} className="border-b border-slate-50 last:border-0">
                              <td className="text-left px-3 py-2 text-xs text-slate-900 truncate">{it.reference_no || '-'}</td>
                              <td className="text-left px-3 py-2 text-xs text-slate-600 truncate">{it.description || '-'}</td>
                              <td className="text-right px-3 py-2 text-xs text-slate-600">{it.quantity}</td>
                              <td className="text-center px-3 py-2 text-xs text-slate-600">
                                {[it.length_cm, it.width_cm, it.height_cm].map((v) => (v ? Number(v) : '?')).join('×')}
                              </td>
                              <td className="text-right px-3 py-2 text-xs text-slate-600">{fmt(it.unit_weight_kg)}</td>
                              <td className="text-right px-3 py-2 text-xs text-slate-600">{fmt(it.ldm)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* 按件货物明细（两层结构；本地派送的件明细在上面各票里，这块不显示） */}
      {data.deliveryOrders?.length === 0 && (
      <Section
        title={t('cargo.itemsTitleWithCount', { count: data.cargoItems.length })}
        icon={Package}
        action={
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>{t('cargo.totalPieces')} <b className="text-slate-900">{data.cargo_quantity ?? '-'}</b></span>
            <span>{t('cargo.totalWeight')} <b className="text-slate-900">{fmt(data.cargo_weight_kg)}</b> kg</span>
            <span>{t('cargo.totalVolume')} <b className="text-slate-900">{fmt(data.cargo_volume_m3)}</b> m³</span>
            <span>LDM <b className="text-slate-900">{fmt(data.ldm)}</b></span>
          </div>
        }
      >
        {data.cargoItems.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            {t('inquiryDetail.noCargoItems')}
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
                  <th className="text-left px-3 py-2.5 font-medium">{t('cargo.colLineNo')}</th>
                  <th className="text-left px-3 py-2.5 font-medium">{t('cargo.colItemNo')}</th>
                  <th className="text-left px-3 py-2.5 font-medium">{t('field.cargoDescription')}</th>
                  <th className="text-right px-3 py-2.5 font-medium">{t('cargo.colPieces')}</th>
                  <th className="text-center px-3 py-2.5 font-medium">{t('cargo.colDimensions')}</th>
                  <th className="text-right px-3 py-2.5 font-medium">{t('cargo.colUnitWeightKg')}</th>
                  <th className="text-right px-3 py-2.5 font-medium">{t('cargo.colUnitVolumeM3')}</th>
                  <th className="text-right px-3 py-2.5 font-medium">LDM</th>
                  <th className="text-center px-3 py-2.5 font-medium">{t('cargo.colStackable')}</th>
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
                      {it.ldm_manual && <span className="ml-1 text-[10px] text-amber-600" title={t('cargo.manualAdjustedTitle')}>{t('cargo.manualAdjusted')}</span>}
                    </td>
                    <td className="text-center px-3 py-2.5 text-xs text-slate-600">{it.stackable ? t('common.yes') : t('common.no')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(data.cargo_description || data.special_requirements || data.remarks) && (
          <div className="mt-5 pt-4 border-t border-slate-100 space-y-1">
            {data.cargo_description && <InfoRow label={t('field.cargoDescription')} value={data.cargo_description} />}
            {data.special_requirements && <InfoRow label={t('field.specialRequirements')} value={data.special_requirements} />}
            {data.remarks && <InfoRow label={t('common.remark')} value={data.remarks} />}
          </div>
        )}
      </Section>
      )}

      {/* 服务商询价（需求 5.3，仅服务商管理岗可见） */}
      {canSeeCarrierInquiry && (
        <CarrierInquiryPanel inquiryId={data.id} onToast={showToast} />
      )}

      {/* 关联报价 */}
      <Section title={t('inquiryDetail.relatedQuotations', { count: data.quotations.length })} icon={Tag}>
        {data.quotations.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            {t('inquiryDetail.noQuotations')}
            {canQuote && t('inquiryDetail.noQuotationsHint')}
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
                  <th className="text-left px-3 py-2.5 font-medium">{t('quotation.colNumber')}</th>
                  <th className="text-right px-3 py-2.5 font-medium">{t('quotation.colVersion')}</th>
                  <th className="text-right px-3 py-2.5 font-medium">{t('common.amount')}</th>
                  <th className="text-center px-3 py-2.5 font-medium">{t('common.status')}</th>
                  <th className="text-center px-3 py-2.5 font-medium">{t('quotation.colValidUntil')}</th>
                  <th className="text-center px-3 py-2.5 font-medium">{t('common.createdAt')}</th>
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
