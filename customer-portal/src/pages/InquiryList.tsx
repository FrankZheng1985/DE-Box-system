/**
 * 客户门户 · 询价（需求 5.1 第一个来源 + 5.4）
 *
 * 旧版只有 5 个字段的简易表单，且状态 map 用的是小写键（踩坑 004 原案发地）。
 * 现在升级为：结构化地址 + 联系人 + 按件货物明细（LDM 自动算）。
 */

import { useState, useEffect } from 'react'
import { Plus, RefreshCw, Send, X, Trash2, Package } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS, type BusinessType } from '../constants/businessTypes'
import {
  INQUIRY_STATUS_LABELS, INQUIRY_STATUS_STYLES,
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
  return (
    <div>
      <p className="text-xs font-medium text-slate-700 mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <input type="text" value={value.country} onChange={(e) => onChange({ ...value, country: e.target.value })} placeholder="国家（如 DE）" className={inputClass} />
        <input type="text" value={value.zipCode} onChange={(e) => onChange({ ...value, zipCode: e.target.value })} placeholder="邮编" className={inputClass} />
        <input type="text" value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} placeholder="城市" className={inputClass} />
        <input type="text" value={value.address} onChange={(e) => onChange({ ...value, address: e.target.value })} placeholder="详细地址" className={inputClass} />
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

export default function InquiryList() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(INITIAL_FORM)
  const [rows, setRows] = useState<CargoRow[]>([newRow()])

  useEffect(() => { loadInquiries() }, [])

  const loadInquiries = async () => {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<Inquiry[]>>('/inquiries')
      if (res.code === 200) {
        setInquiries(res.data || [])
      } else {
        setError(res.message || '加载询价列表失败')
      }
    } catch (err) {
      console.error('加载询价列表失败:', err)
      setError('加载询价列表失败')
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

  const resetForm = () => {
    setForm(INITIAL_FORM)
    setRows([newRow()])
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.routeFrom.city && !form.routeFrom.country) {
      setError('请至少填写起运地的国家或城市')
      return
    }
    if (!form.routeTo.city && !form.routeTo.country) {
      setError('请至少填写目的地的国家或城市')
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
        setError(res.message || '提交询价失败')
      }
    } catch (err) {
      console.error('创建询价失败:', err)
      setError(err instanceof Error ? err.message : '提交询价失败')
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
        <button
          onClick={() => { resetForm(); setShowCreate(true) }}
          className="h-8 px-3 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 transition-all duration-200 ease-in-out flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          新建询价
        </button>
      </div>

      {error && !showCreate && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">{error}</div>
      )}

      {/* 新建询价弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-slate-900">新建询价</h3>
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
                  <label className="block text-xs text-slate-500 mb-1">服务类型 *</label>
                  <select
                    value={form.businessType}
                    onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value as BusinessType }))}
                    className={`${inputClass} bg-white`}
                  >
                    {(Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[]).map((t) => (
                      <option key={t} value={t}>{BUSINESS_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">贵司单号</label>
                  <input
                    type="text"
                    value={form.customerRef}
                    onChange={(e) => setForm((f) => ({ ...f, customerRef: e.target.value }))}
                    placeholder="便于双方对账的参考号"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* 地址 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AddressFields label="起运地 *" value={form.routeFrom} onChange={(v) => setForm((f) => ({ ...f, routeFrom: v }))} />
                <AddressFields label="目的地 *" value={form.routeTo} onChange={(v) => setForm((f) => ({ ...f, routeTo: v }))} />
              </div>

              {/* 联系人 */}
              <div>
                <p className="text-xs font-medium text-slate-700 mb-2">联系人</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input type="text" value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} placeholder="姓名" className={inputClass} />
                  <input type="tel" value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} placeholder="电话" className={inputClass} />
                  <input type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} placeholder="邮箱（接收报价通知）" className={inputClass} />
                </div>
              </div>

              {/* 按件货物明细 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                    按件货物明细
                  </p>
                  <button
                    type="button"
                    onClick={() => setRows((prev) => [...prev, newRow()])}
                    className="h-7 px-2 text-[11px] text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 flex items-center gap-1 transition-all duration-200 ease-in-out"
                  >
                    <Plus className="w-3 h-3" />
                    添加一行
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
                        <th className="text-left px-1.5 py-2 font-medium">件号</th>
                        <th className="text-left px-1.5 py-2 font-medium">货物描述</th>
                        <th className="text-right px-1.5 py-2 font-medium">件数</th>
                        <th className="text-right px-1.5 py-2 font-medium">长(cm)</th>
                        <th className="text-right px-1.5 py-2 font-medium">宽(cm)</th>
                        <th className="text-right px-1.5 py-2 font-medium">高(cm)</th>
                        <th className="text-right px-1.5 py-2 font-medium">单件重(kg)</th>
                        <th className="text-right px-1.5 py-2 font-medium">体积(m³)</th>
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
                  <span>合计 <b className="text-slate-900">{totals.quantity}</b> 件</span>
                  <span>实重 <b className="text-slate-900">{totals.weight.toFixed(2)}</b> kg</span>
                  <span>体积 <b className="text-slate-900">{totals.volume.toFixed(3)}</b> m³</span>
                  <span>LDM <b className="text-slate-900">{totals.ldm.toFixed(2)}</b></span>
                  <span className="text-slate-400">LDM 按 长m × 宽m ÷ 2.4 × 件数 自动计算</span>
                </div>
              </div>

              {/* 补充说明 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">货物描述</label>
                  <textarea
                    value={form.cargoDescription}
                    onChange={(e) => setForm((f) => ({ ...f, cargoDescription: e.target.value }))}
                    rows={2}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary-500 resize-none transition-all duration-200 ease-in-out"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">备注</label>
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
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="h-8 px-3 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 flex items-center gap-1 disabled:opacity-50 transition-all duration-200 ease-in-out"
              >
                <Send className="w-3.5 h-3.5" />
                {submitting ? '提交中…' : '提交询价'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 列表 */}
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[820px]">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[13%]" />
              <col className="w-[18%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[13%]" />
              <col className="w-[15%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-slate-500 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 font-medium">询价编号</th>
                <th className="text-left px-3 py-2.5 font-medium">服务类型</th>
                <th className="text-left px-3 py-2.5 font-medium">路线</th>
                <th className="text-right px-3 py-2.5 font-medium">件数</th>
                <th className="text-right px-3 py-2.5 font-medium">实重(kg)</th>
                <th className="text-right px-3 py-2.5 font-medium">LDM</th>
                <th className="text-center px-3 py-2.5 font-medium">状态</th>
                <th className="text-center px-3 py-2.5 font-medium">创建日期</th>
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
              ) : inquiries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-sm text-slate-400">暂无询价记录</td>
                </tr>
              ) : (
                inquiries.map((item) => (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="text-left px-3 py-2.5">
                      <span className="text-xs font-medium text-slate-900 block truncate">{item.inquiry_number || '-'}</span>
                      {item.customer_ref && <span className="text-[10px] text-slate-400">贵司单号 {item.customer_ref}</span>}
                    </td>
                    <td className="text-left px-3 py-2.5 text-xs text-slate-600">
                      {BUSINESS_TYPE_LABELS[item.business_type as BusinessType] || item.business_type}
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
                        {INQUIRY_STATUS_LABELS[item.status] || item.status}
                      </span>
                    </td>
                    <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString('de-DE') : '-'}
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
