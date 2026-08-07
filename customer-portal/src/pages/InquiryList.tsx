/**
 * 客户门户 · 询价（需求 5.1 第一个来源 + 5.4）
 *
 * 旧版只有 5 个字段的简易表单，且状态 map 用的是小写键（踩坑 004 原案发地）。
 * 现在升级为：结构化地址 + 联系人 + 按件货物明细（LDM 自动算）。
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, RefreshCw, Send, X, Trash2, Package, Upload, Timer, Gauge, Hourglass, Clock } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import InquiryImportModal from '../components/InquiryImportModal'
import { BUSINESS_TYPES, BUSINESS_TYPE_VALUES, type BusinessType } from '../constants/businessTypes'
import {
  INQUIRY_STATUS_STYLES,
  calcUnitVolumeM3, calcLineLdm,
} from '../constants/inquiryQuotation'

// ==================== 类型定义 ====================

interface Inquiry {
  id: string
  inquiry_number: string
  customer_ref: string | null
  business_type: string
  route_from: { country?: string; city?: string; zipCode?: string; address?: string } | null
  route_to: { country?: string; city?: string; zipCode?: string; address?: string } | null
  cargo_description: string | null
  cargo_quantity: number | null
  cargo_weight_kg: string | null
  ldm: string | null
  status: string
  quotation_count: number
  created_at: string
  /** 第一次收到报价的时间，没报价过是 null */
  first_quoted_at: string | null
  /** 建单 → 首次报价的天数（1 位小数），未报价是 null */
  quote_response_days: number | null
  /** 还没报价的单已经等了几天，只有仍在等报价的单才有值 */
  quote_waiting_days: number | null
}

/** 报价时效统计（GET /inquiries/quote-sla），天数为 1 位小数或 null */
interface QuoteSlaStats {
  total: number
  quoted_count: number
  pending_count: number
  avg_days: number | null
  fastest_days: number | null
  slowest_days: number | null
  pending_max_wait_days: number | null
}

interface AddressForm {
  country: string
  zipCode: string
  city: string
  address: string
}

/** 行内一律用字符串存，避免受控 number input 清空时跳成 0 */
interface CargoRow {
  key: string
  referenceNo: string
  description: string
  quantity: string
  lengthCm: string
  widthCm: string
  heightCm: string
  unitWeightKg: string
}

const EMPTY_ADDRESS: AddressForm = { country: '', zipCode: '', city: '', address: '' }

let rowSeq = 0
function newRow(): CargoRow {
  rowSeq += 1
  return {
    key: `row-${rowSeq}`,
    referenceNo: '', description: '', quantity: '1',
    lengthCm: '', widthCm: '', heightCm: '', unitWeightKg: '',
  }
}

const INITIAL_FORM = {
  businessType: BUSINESS_TYPES.TRUCK_LTL as BusinessType,
  customerRef: '',
  routeFrom: { ...EMPTY_ADDRESS },
  routeTo: { ...EMPTY_ADDRESS },
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  cargoDescription: '',
  remarks: '',
}

/** 空字符串转 null，其余转数字 */
function toNum(value: string): number | null {
  if (!value || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** NUMERIC 回来是字符串，显示前转数字（踩坑 002） */
function fmt(value: string | number | null, digits = 2): string {
  if (value === null || value === undefined || value === '') return '-'
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(digits) : '-'
}

function routeText(addr: Inquiry['route_from']): string {
  if (!addr) return '-'
  return [addr.country, addr.city].filter(Boolean).join(' ') || '-'
}

const inputClass =
  'w-full h-8 px-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary-500 transition-all duration-200 ease-in-out'

// ==================== 地址子表单 ====================

function AddressFields({ label, value, onChange }: {
  label: string
  value: AddressForm
  onChange: (v: AddressForm) => void
}) {
  const { t } = useTranslation()
  return (
    <div>
      <p className="text-xs font-medium text-slate-700 mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <input type="text" value={value.country} onChange={(e) => onChange({ ...value, country: e.target.value })} placeholder={t('inquiry.phCountry')} className={inputClass} />
        <input type="text" value={value.zipCode} onChange={(e) => onChange({ ...value, zipCode: e.target.value })} placeholder={t('inquiry.phZip')} className={inputClass} />
        <input type="text" value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} placeholder={t('inquiry.phCity')} className={inputClass} />
        <input type="text" value={value.address} onChange={(e) => onChange({ ...value, address: e.target.value })} placeholder={t('inquiry.phAddress')} className={inputClass} />
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

export default function InquiryList() {
  const { t } = useTranslation()
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [sla, setSla] = useState<QuoteSlaStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState(INITIAL_FORM)
  const [rows, setRows] = useState<CargoRow[]>([newRow()])
  /** 正在确认删除的那张单，null=没有弹确认框 */
  const [deleteTarget, setDeleteTarget] = useState<Inquiry | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { loadInquiries() }, [])

  const loadInquiries = async () => {
    setLoading(true)
    try {
      // 时效统计是整个公司全量算的，不能拿当前这一页的行去平均（列表默认只有 20 条）
      const [listRes, slaRes] = await Promise.all([
        api.get<ApiResponse<Inquiry[]>>('/inquiries'),
        // 统计接口挂了只是少一排卡片，不能连累列表整页报错
        // （前端先于后端上线时这里会 404，必须自己吞掉）
        api.get<ApiResponse<QuoteSlaStats>>('/inquiries/quote-sla').catch((err) => {
          console.warn('加载报价时效统计失败:', err)
          return null
        }),
      ])

      if (listRes.code === 200) {
        setInquiries(listRes.data || [])
      } else {
        setError(listRes.message || t('inquiry.loadFailed'))
      }
      setSla(slaRes && slaRes.code === 200 ? slaRes.data : null)
    } catch (err) {
      console.error('加载询价列表失败:', err)
      setError(t('inquiry.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  const updateRow = (key: string, patch: Partial<CargoRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  /** 一行的派生值 */
  const derive = (r: CargoRow) => {
    const qty = toNum(r.quantity) ?? 1
    const l = toNum(r.lengthCm)
    const w = toNum(r.widthCm)
    const h = toNum(r.heightCm)
    return {
      qty,
      unitVolume: calcUnitVolumeM3(l, w, h),
      ldm: calcLineLdm(l, w, qty),
    }
  }

  /** 合计（口径和后端 recalcInquiryTotals 一致） */
  const totals = rows.reduce(
    (acc, r) => {
      const { qty, unitVolume, ldm } = derive(r)
      const unitWeight = toNum(r.unitWeightKg)
      acc.quantity += qty
      if (unitWeight !== null) acc.weight += unitWeight * qty
      if (unitVolume !== null) acc.volume += unitVolume * qty
      if (ldm !== null) acc.ldm += ldm
      return acc
    },
    { quantity: 0, weight: 0, volume: 0, ldm: 0 }
  )

  /** 天数 → "1.5 天"；没有值（没报价 / 没数据）显示 "暂无" */
  const daysText = (value: number | null | undefined) => {
    if (value === null || value === undefined) return t('inquiry.slaNoData')
    return t('inquiry.slaDaysUnit', { days: fmt(value, 1) })
  }

  const slaCards = [
    {
      key: 'avg', label: t('inquiry.slaAvg'), value: sla?.avg_days ?? null,
      icon: Gauge, color: 'bg-blue-100 text-blue-700',
      hint: t('inquiry.slaQuotedCount', { quoted: sla?.quoted_count ?? 0, total: sla?.total ?? 0 }),
    },
    {
      key: 'fastest', label: t('inquiry.slaFastest'), value: sla?.fastest_days ?? null,
      icon: Timer, color: 'bg-green-100 text-green-700',
      hint: t('inquiry.slaFastestHint'),
    },
    {
      key: 'slowest', label: t('inquiry.slaSlowest'), value: sla?.slowest_days ?? null,
      icon: Clock, color: 'bg-amber-100 text-amber-700',
      hint: t('inquiry.slaSlowestHint'),
    },
    {
      key: 'pending', label: t('inquiry.slaPendingWait'), value: sla?.pending_max_wait_days ?? null,
      icon: Hourglass, color: 'bg-gray-100 text-gray-600',
      hint: t('inquiry.slaPendingCount', { count: sla?.pending_count ?? 0 }),
    },
  ]

  const resetForm = () => {
    setForm(INITIAL_FORM)
    setRows([newRow()])
    setError('')
  }

  /**
   * 能不能删这张单
   *
   * 只是前端的提前收窄，真正的守卫在后端（状态 + 有没有报价/服务商询价）。
   * 前端拿不到"有没有草稿报价"，所以按钮显示了也可能被后端拒——那种情况按
   * 后端 message 提示，不做静默失败。
   */
  const canDelete = (item: Inquiry) =>
    item.status === 'PENDING_QUOTE' && (item.quotation_count ?? 0) === 0

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setError('')
    try {
      const res = await api.delete<ApiResponse<null>>(`/inquiries/${deleteTarget.id}`)
      if (res.code === 200) {
        setDeleteTarget(null)
        setNotice(t('inquiry.deleteSuccess', { no: deleteTarget.inquiry_number }))
        loadInquiries()
      } else {
        // 必须显示后端 message，否则失败会被伪装成成功（踩坑 011）
        setError(res.message || t('inquiry.deleteFailed'))
        setDeleteTarget(null)
      }
    } catch (err) {
      console.error('删除询价失败:', err)
      setError(err instanceof Error ? err.message : t('inquiry.deleteFailed'))
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.routeFrom.city && !form.routeFrom.country) {
      setError(t('inquiry.errorFrom'))
      return
    }
    if (!form.routeTo.city && !form.routeTo.country) {
      setError(t('inquiry.errorTo'))
      return
    }

    setSubmitting(true)
    try {
      // 只提交填了内容的行
      const cargoItems = rows
        .filter((r) => r.referenceNo.trim() || r.description.trim() || toNum(r.lengthCm) !== null || toNum(r.unitWeightKg) !== null)
        .map((r) => ({
          referenceNo: r.referenceNo.trim() || null,
          description: r.description.trim() || null,
          quantity: toNum(r.quantity) ?? 1,
          lengthCm: toNum(r.lengthCm),
          widthCm: toNum(r.widthCm),
          heightCm: toNum(r.heightCm),
          unitWeightKg: toNum(r.unitWeightKg),
        }))

      const res = await api.post<ApiResponse<any>>('/inquiries', {
        // clientId 后端按登录身份强制取，前端不用也不该传（踩坑 016）
        businessType: form.businessType,
        transportType: form.businessType === BUSINESS_TYPES.LOCAL_DELIVERY ? null : 'LTL',
        customerRef: form.customerRef.trim() || null,
        routeFrom: form.routeFrom,
        routeTo: form.routeTo,
        contactName: form.contactName.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        cargoDescription: form.cargoDescription.trim() || null,
        remarks: form.remarks.trim() || null,
        cargoItems,
      })

      if (res.code === 200 || res.code === 201) {
        setShowCreate(false)
        resetForm()
        loadInquiries()
      } else {
        // 必须有 else 分支显示后端 message，否则失败会被伪装成成功（踩坑 011）
        setError(res.message || t('inquiry.submitFailed'))
      }
    } catch (err) {
      console.error('创建询价失败:', err)
      setError(err instanceof Error ? err.message : t('inquiry.submitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <button onClick={loadInquiries} className="h-8 px-2 text-slate-500 hover:bg-gray-100 rounded-lg transition-all duration-200 ease-in-out">
          <RefreshCw className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setNotice(''); setShowImport(true) }}
            className="h-8 px-3 text-xs text-slate-700 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-all duration-200 ease-in-out flex items-center gap-1"
          >
            <Upload className="w-4 h-4" />
            {t('inquiryImport.entry')}
          </button>
          <button
            onClick={() => { resetForm(); setShowCreate(true) }}
            className="h-8 px-3 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 transition-all duration-200 ease-in-out flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            {t('inquiry.create')}
          </button>
        </div>
      </div>

      {error && !showCreate && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">{error}</div>
      )}

      {notice && (
        <div className="px-4 py-3 bg-green-50 border border-green-200 text-green-700 text-xs rounded-xl">{notice}</div>
      )}

      {showImport && (
        <InquiryImportModal
          onClose={() => setShowImport(false)}
          onImported={(count) => {
            setShowImport(false)
            setNotice(t('inquiryImport.successNotice', { count }))
            loadInquiries()
          }}
        />
      )}

      {/* 删除确认：删除不可撤销，必须二次确认，且把单号写出来避免删错行 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-slate-900">{t('inquiry.deleteTitle')}</h3>
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-2">
              <p className="text-sm text-slate-700">
                {t('inquiry.deleteConfirm', { no: deleteTarget.inquiry_number })}
              </p>
              {deleteTarget.customer_ref && (
                <p className="text-xs text-slate-500">
                  {t('inquiry.customerRef')}: {deleteTarget.customer_ref}
                </p>
              )}
              <p className="text-xs text-amber-600">{t('inquiry.deleteIrreversible')}</p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="h-8 px-3 text-xs text-slate-700 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all duration-200 ease-in-out"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="h-8 px-3 text-xs text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-all duration-200 ease-in-out"
              >
                {deleting ? t('inquiry.deleting') : t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新建询价弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-slate-900">{t('inquiry.create')}</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {error && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">{error}</div>
              )}

              {/* 基本信息 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t('inquiry.serviceType')} {t('common.required')}</label>
                  <select
                    value={form.businessType}
                    onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value as BusinessType }))}
                    className={`${inputClass} bg-white`}
                  >
                    {BUSINESS_TYPE_VALUES.map((bt) => (
                      <option key={bt} value={bt}>{t(`businessType.${bt}`)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t('inquiry.customerRef')}</label>
                  <input
                    type="text"
                    value={form.customerRef}
                    onChange={(e) => setForm((f) => ({ ...f, customerRef: e.target.value }))}
                    placeholder={t('inquiry.phCustomerRef')}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* 地址 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AddressFields label={`${t('inquiry.routeFrom')} *`} value={form.routeFrom} onChange={(v) => setForm((f) => ({ ...f, routeFrom: v }))} />
                <AddressFields label={`${t('inquiry.routeTo')} *`} value={form.routeTo} onChange={(v) => setForm((f) => ({ ...f, routeTo: v }))} />
              </div>

              {/* 联系人 */}
              <div>
                <p className="text-xs font-medium text-slate-700 mb-2">{t('inquiry.contact')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input type="text" value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} placeholder={t('inquiry.phContactName')} className={inputClass} />
                  <input type="tel" value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} placeholder={t('inquiry.phContactPhone')} className={inputClass} />
                  <input type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} placeholder={t('inquiry.phContactEmail')} className={inputClass} />
                </div>
              </div>

              {/* 按件货物明细 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                    {t('inquiry.cargoItems')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRows((prev) => [...prev, newRow()])}
                    className="h-7 px-2 text-[11px] text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 flex items-center gap-1 transition-all duration-200 ease-in-out"
                  >
                    <Plus className="w-3 h-3" />
                    {t('inquiry.addRow')}
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full table-fixed min-w-[820px]">
                    <colgroup>
                      <col className="w-[13%]" />
                      <col className="w-[16%]" />
                      <col className="w-[8%]" />
                      <col className="w-[9%]" />
                      <col className="w-[9%]" />
                      <col className="w-[9%]" />
                      <col className="w-[12%]" />
                      <col className="w-[11%]" />
                      <col className="w-[8%]" />
                      <col className="w-[5%]" />
                    </colgroup>
                    <thead>
                      <tr className="text-[11px] text-slate-500 border-b border-gray-100">
                        <th className="text-left px-1.5 py-2 font-medium">{t('inquiry.colRef')}</th>
                        <th className="text-left px-1.5 py-2 font-medium">{t('inquiry.colDesc')}</th>
                        <th className="text-right px-1.5 py-2 font-medium">{t('inquiry.colQty')}</th>
                        <th className="text-right px-1.5 py-2 font-medium">{t('inquiry.colLength')}</th>
                        <th className="text-right px-1.5 py-2 font-medium">{t('inquiry.colWidth')}</th>
                        <th className="text-right px-1.5 py-2 font-medium">{t('inquiry.colHeight')}</th>
                        <th className="text-right px-1.5 py-2 font-medium">{t('inquiry.colUnitWeight')}</th>
                        <th className="text-right px-1.5 py-2 font-medium">{t('inquiry.colVolume')}</th>
                        <th className="text-right px-1.5 py-2 font-medium">LDM</th>
                        <th className="text-center px-1.5 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const { unitVolume, ldm } = derive(r)
                        return (
                          <tr key={r.key} className="border-b border-gray-50">
                            <td className="px-1.5 py-1.5"><input type="text" value={r.referenceNo} onChange={(e) => updateRow(r.key, { referenceNo: e.target.value })} className={inputClass} /></td>
                            <td className="px-1.5 py-1.5"><input type="text" value={r.description} onChange={(e) => updateRow(r.key, { description: e.target.value })} className={inputClass} /></td>
                            <td className="px-1.5 py-1.5"><input type="number" min="1" value={r.quantity} onChange={(e) => updateRow(r.key, { quantity: e.target.value })} className={`${inputClass} text-right`} /></td>
                            <td className="px-1.5 py-1.5"><input type="number" min="0" step="0.1" value={r.lengthCm} onChange={(e) => updateRow(r.key, { lengthCm: e.target.value })} className={`${inputClass} text-right`} /></td>
                            <td className="px-1.5 py-1.5"><input type="number" min="0" step="0.1" value={r.widthCm} onChange={(e) => updateRow(r.key, { widthCm: e.target.value })} className={`${inputClass} text-right`} /></td>
                            <td className="px-1.5 py-1.5"><input type="number" min="0" step="0.1" value={r.heightCm} onChange={(e) => updateRow(r.key, { heightCm: e.target.value })} className={`${inputClass} text-right`} /></td>
                            <td className="px-1.5 py-1.5"><input type="number" min="0" step="0.01" value={r.unitWeightKg} onChange={(e) => updateRow(r.key, { unitWeightKg: e.target.value })} className={`${inputClass} text-right`} /></td>
                            {/* 体积和 LDM 由系统自动算，客户不用填 */}
                            <td className="px-1.5 py-1.5 text-right text-[11px] text-slate-500">{unitVolume !== null ? unitVolume.toFixed(3) : '-'}</td>
                            <td className="px-1.5 py-1.5 text-right text-[11px] text-slate-500">{ldm !== null ? ldm.toFixed(2) : '-'}</td>
                            <td className="px-1.5 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => setRows((prev) => (prev.length === 1 ? [newRow()] : prev.filter((x) => x.key !== r.key)))}
                                className="h-6 w-6 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all duration-200 ease-in-out"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-[11px] text-slate-500">
                  <span>{t('inquiry.totalQty')} <b className="text-slate-900">{totals.quantity}</b></span>
                  <span>{t('inquiry.totalWeight')} <b className="text-slate-900">{totals.weight.toFixed(2)}</b> kg</span>
                  <span>{t('inquiry.totalVolume')} <b className="text-slate-900">{totals.volume.toFixed(3)}</b> m³</span>
                  <span>LDM <b className="text-slate-900">{totals.ldm.toFixed(2)}</b></span>
                  <span className="text-slate-400">{t('inquiry.ldmHint')}</span>
                </div>
              </div>

              {/* 补充说明 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t('inquiry.cargoDescription')}</label>
                  <textarea
                    value={form.cargoDescription}
                    onChange={(e) => setForm((f) => ({ ...f, cargoDescription: e.target.value }))}
                    rows={2}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary-500 resize-none transition-all duration-200 ease-in-out"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t('common.remark')}</label>
                  <textarea
                    value={form.remarks}
                    onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                    rows={2}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary-500 resize-none transition-all duration-200 ease-in-out"
                  />
                </div>
              </div>
            </form>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button type="button" onClick={() => setShowCreate(false)} className="h-8 px-3 text-xs text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-200 ease-in-out">
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="h-8 px-3 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 flex items-center gap-1 disabled:opacity-50 transition-all duration-200 ease-in-out"
              >
                <Send className="w-3.5 h-3.5" />
                {submitting ? t('inquiry.submitting') : t('inquiry.submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 报价时效统计（口径：询价提交 → 第一次收到报价） */}
      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="text-sm font-semibold text-slate-900">{t('inquiry.slaTitle')}</h2>
          <span className="text-[11px] text-slate-400">{t('inquiry.slaHint')}</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="h-3 bg-gray-100 rounded w-20 mb-3 animate-pulse" />
                <div className="h-7 bg-gray-100 rounded w-16 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {slaCards.map((card) => (
              <div key={card.key} className="bg-white rounded-xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-500">{card.label}</span>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.color}`}>
                    <card.icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">{daysText(card.value)}</div>
                <p className="text-[11px] text-slate-400 mt-1">{card.hint}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          {/* 客户单号是客户自己对账的抓手，独占一列排在询价单号右边（开发意见 #1）；
              原先挤在询价单号下面当 10px 灰色小字，客户反馈看不见 */}
          {/* 列宽按内容实测排的：询价编号 17 字符、报价时效要放下「已等待 0.0 天」、
              表头「实重(kg)」和「操作」都不能被压成两行 */}
          <table className="w-full table-fixed min-w-[1080px]">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[11%]" />
              <col className="w-[9%]" />
              <col className="w-[14%]" />
              <col className="w-[5%]" />
              <col className="w-[8%]" />
              <col className="w-[5%]" />
              <col className="w-[8%]" />
              <col className="w-[11%]" />
              <col className="w-[8%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-slate-500 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 font-medium">{t('inquiry.inquiryNo')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('inquiry.customerRef')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('inquiry.serviceType')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('common.route')}</th>
                <th className="text-right px-3 py-2.5 font-medium">{t('inquiry.colQty')}</th>
                <th className="text-right px-3 py-2.5 font-medium">{t('inquiry.weightKg')}</th>
                <th className="text-right px-3 py-2.5 font-medium">LDM</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.status')}</th>
                <th className="text-right px-3 py-2.5 font-medium">{t('inquiry.colSla')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.createdAt')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : inquiries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-8 text-sm text-slate-400">{t('inquiry.empty')}</td>
                </tr>
              ) : (
                inquiries.map((item) => (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="text-left px-3 py-2.5">
                      <span className="text-xs font-medium text-slate-900 block truncate">{item.inquiry_number || '-'}</span>
                    </td>
                    <td className="text-left px-3 py-2.5">
                      <span className="text-xs font-medium text-slate-900 block truncate" title={item.customer_ref || ''}>
                        {item.customer_ref || '-'}
                      </span>
                    </td>
                    <td className="text-left px-3 py-2.5 text-xs text-slate-600">
                      {t(`businessType.${item.business_type}`, { defaultValue: item.business_type })}
                    </td>
                    <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">
                      {routeText(item.route_from)} → {routeText(item.route_to)}
                    </td>
                    <td className="text-right px-3 py-2.5 text-xs text-slate-600">{item.cargo_quantity ?? '-'}</td>
                    <td className="text-right px-3 py-2.5 text-xs text-slate-600">{fmt(item.cargo_weight_kg)}</td>
                    <td className="text-right px-3 py-2.5 text-xs text-slate-600">{fmt(item.ldm)}</td>
                    <td className="text-center px-3 py-2.5">
                      {/* 状态值库里存的是大写，直接按大写取（旧版先 toLowerCase 再查小写 map，永远走兜底） */}
                      <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ${
                        INQUIRY_STATUS_STYLES[item.status] || 'bg-gray-100 text-gray-600'
                      }`}>
                        {t(`inquiryStatus.${item.status}`, { defaultValue: item.status })}
                      </span>
                    </td>
                    {/* 报价时效：已报价的显示用了几天，还没报价的显示已经等了几天 */}
                    <td className="text-right px-3 py-2.5 text-xs">
                      {item.quote_response_days !== null && item.quote_response_days !== undefined ? (
                        <span className="font-medium text-slate-900">
                          {t('inquiry.slaDaysUnit', { days: fmt(item.quote_response_days, 1) })}
                        </span>
                      ) : item.quote_waiting_days !== null && item.quote_waiting_days !== undefined ? (
                        <span className="text-amber-600">
                          {t('inquiry.slaWaiting', { days: fmt(item.quote_waiting_days, 1) })}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString('de-DE') : '-'}
                    </td>
                    {/* 只有还没进入报价流程的单能删（开发意见 #2），其余显示占位符
                        —— 按钮直接消失会让客户以为是页面坏了 */}
                    <td className="text-center px-3 py-2.5">
                      {canDelete(item) ? (
                        <button
                          onClick={() => { setError(''); setNotice(''); setDeleteTarget(item) }}
                          title={t('inquiry.deleteTitle')}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 ease-in-out"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
