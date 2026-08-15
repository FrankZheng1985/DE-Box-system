/**
 * 询价创建 / 编辑页（需求 5.1 第二个来源：运营代客户建询价）
 *
 * 核心是按件货物明细表格：录入长宽高和件数后，
 * 单件体积和行级 LDM 自动算出来，也允许手工覆盖 LDM（特殊摆放方式）。
 * 计算公式必须和后端 server/modules/inquiry/service.js 完全一致。
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Save, Plus, Trash2, Loader2,
  Package, MapPin, User, FileText,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import Toast from '../components/Toast'
import {
  BUSINESS_TYPES, BUSINESS_TYPE_LIST, businessTypeLabelKey, type BusinessType,
} from '../constants/businessTypes'
import { calcUnitVolumeM3, calcLineLdm } from '../constants/inquiryQuotation'

// ==================== 类型定义 ====================

interface ClientOption {
  id: string
  company_name: string
}

interface AddressForm {
  country: string
  zipCode: string
  city: string
  address: string
}

/** 一侧的联系人（发货侧存进 route_from 的 JSONB，收货侧走 contact_* 列） */
interface ContactForm {
  name: string
  phone: string
  email: string
}

/** 表格里每行都用字符串存，避免受控 number input 在清空时跳成 0 */
interface CargoItemForm {
  key: string
  referenceNo: string
  description: string
  quantity: string
  lengthCm: string
  widthCm: string
  heightCm: string
  unitWeightKg: string
  ldm: string
  ldmManual: boolean
  stackable: boolean
  remarks: string
}

interface InquiryForm {
  clientId: string
  customerRef: string
  businessType: BusinessType | ''
  transportType: string
  /** 车型（车长），只有专车（FTL）才有值 */
  vehicleLengthCode: string
  routeFrom: AddressForm
  routeTo: AddressForm
  senderContact: ContactForm
  contactName: string
  contactPhone: string
  contactEmail: string
  cargoDescription: string
  specialRequirements: string
  remarks: string
}

const EMPTY_ADDRESS: AddressForm = { country: '', zipCode: '', city: '', address: '' }
const EMPTY_CONTACT: ContactForm = { name: '', phone: '', email: '' }

const INITIAL_FORM: InquiryForm = {
  clientId: '',
  customerRef: '',
  businessType: '',
  transportType: '',
  vehicleLengthCode: '',
  routeFrom: { ...EMPTY_ADDRESS },
  routeTo: { ...EMPTY_ADDRESS },
  senderContact: { ...EMPTY_CONTACT },
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  cargoDescription: '',
  specialRequirements: '',
  remarks: '',
}

const TRANSPORT_TYPES = [
  { value: '', labelKey: 'common.unspecified' },
  { value: 'FTL', labelKey: 'transportTypeLong.FTL' },
  { value: 'LTL', labelKey: 'transportTypeLong.LTL' },
]

/**
 * 车型（车长）代号，顺序由短到长
 * 必须和后端 server/modules/inquiry/constants.js 一致，显示名走语言包 vehicleLength.*
 */
const VEHICLE_LENGTH_CODES = [
  'TRUCK_4M', 'TRUCK_6_2M', 'TRUCK_7_2M', 'TRUCK_7_8M', 'TRUCK_9M', 'TRUCK_12M', 'TRUCK_13_6M',
]

/** 只挑地址那四个字段，把 JSONB 里混着的联系人挡在外面 */
function pickAddress(raw: any): AddressForm {
  return {
    country: raw?.country || '',
    zipCode: raw?.zipCode || '',
    city: raw?.city || '',
    address: raw?.address || '',
  }
}

/** 联系人并进地址对象；三个都没填就原样返回，不造出一堆空串键 */
function mergeContact(address: AddressForm, contact: ContactForm) {
  const name = contact.name.trim()
  const phone = contact.phone.trim()
  const email = contact.email.trim()
  if (!name && !phone && !email) return address
  return {
    ...address,
    ...(name ? { contactName: name } : {}),
    ...(phone ? { contactPhone: phone } : {}),
    ...(email ? { contactEmail: email } : {}),
  }
}

let rowSeq = 0
function newRow(): CargoItemForm {
  rowSeq += 1
  return {
    key: `row-${rowSeq}`,
    referenceNo: '', description: '', quantity: '1',
    lengthCm: '', widthCm: '', heightCm: '', unitWeightKg: '',
    ldm: '', ldmManual: false, stackable: true, remarks: '',
  }
}

/** 空字符串转 null，其余转数字；非法输入也返回 null */
function toNum(value: string): number | null {
  if (value === null || value === undefined || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// ==================== 小组件 ====================

function Field({ label, required, children, hint }: {
  label: string
  required?: boolean
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

const inputClass =
  'w-full h-9 px-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ease-in-out'

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

function AddressFields({ value, onChange }: { value: AddressForm; onChange: (v: AddressForm) => void }) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label={t('common.country')}>
        <input
          type="text"
          value={value.country}
          onChange={(e) => onChange({ ...value, country: e.target.value })}
          placeholder={t('placeholder.countryCodeEg')}
          className={inputClass}
        />
      </Field>
      <Field label={t('field.zipCode')}>
        <input
          type="text"
          value={value.zipCode}
          onChange={(e) => onChange({ ...value, zipCode: e.target.value })}
          placeholder={t('placeholder.zipMunich')}
          className={inputClass}
        />
      </Field>
      <Field label={t('common.city')}>
        <input
          type="text"
          value={value.city}
          onChange={(e) => onChange({ ...value, city: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label={t('field.addressDetail')}>
        <input
          type="text"
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          className={inputClass}
        />
      </Field>
    </div>
  )
}

// ==================== 主组件 ====================

export default function InquiryEdit() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [form, setForm] = useState<InquiryForm>(INITIAL_FORM)
  const [items, setItems] = useState<CargoItemForm[]>([newRow()])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error') => setToast({ message, type })

  // 客户下拉
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<ApiResponse<ClientOption[]>>('/clients?pageSize=500')
        if (res.code === 200) setClients(res.data || [])
      } catch (err) {
        console.error('获取客户列表失败:', err)
      }
    })()
  }, [])

  // 编辑模式回填
  const loadDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<any>>(`/inquiries/${id}`)
      if (res.code === 200 && res.data) {
        const d = res.data
        setForm({
          clientId: d.client_id || '',
          customerRef: d.customer_ref || '',
          businessType: d.business_type || '',
          transportType: d.transport_type || '',
          vehicleLengthCode: d.vehicle_length_code || '',
          // 地址只取四个地址字段：route_from 的 JSONB 里还混着发货联系人，
          // 整个展开进来会让联系人跟着地址走两遍，保存时互相覆盖（踩坑 037）
          routeFrom: pickAddress(d.route_from),
          routeTo: pickAddress(d.route_to),
          senderContact: {
            name: d.route_from?.contactName || '',
            phone: d.route_from?.contactPhone || '',
            email: d.route_from?.contactEmail || '',
          },
          contactName: d.contact_name || '',
          contactPhone: d.contact_phone || '',
          contactEmail: d.contact_email || '',
          cargoDescription: d.cargo_description || '',
          specialRequirements: d.special_requirements || '',
          remarks: d.remarks || '',
        })
        const rows: CargoItemForm[] = (d.cargoItems || []).map((it: any) => {
          rowSeq += 1
          return {
            key: `row-${rowSeq}`,
            referenceNo: it.reference_no || '',
            description: it.description || '',
            quantity: String(it.quantity ?? 1),
            lengthCm: it.length_cm !== null ? String(Number(it.length_cm)) : '',
            widthCm: it.width_cm !== null ? String(Number(it.width_cm)) : '',
            heightCm: it.height_cm !== null ? String(Number(it.height_cm)) : '',
            unitWeightKg: it.unit_weight_kg !== null ? String(Number(it.unit_weight_kg)) : '',
            ldm: it.ldm !== null ? String(Number(it.ldm)) : '',
            ldmManual: Boolean(it.ldm_manual),
            stackable: it.stackable !== false,
            remarks: it.remarks || '',
          }
        })
        setItems(rows.length > 0 ? rows : [newRow()])
      } else {
        showToast(res.message || t('inquiryEdit.loadFailed'), 'error')
      }
    } catch (err) {
      console.error('获取询价失败:', err)
      showToast(t('inquiryEdit.loadFailed'), 'error')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { if (isEdit) loadDetail() }, [isEdit, loadDetail])

  const isLocalDelivery = form.businessType === BUSINESS_TYPES.LOCAL_DELIVERY

  const updateItem = (key: string, patch: Partial<CargoItemForm>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }

  /** 一行的派生值（体积 / 自动 LDM），显示用 */
  const derive = (it: CargoItemForm) => {
    const qty = toNum(it.quantity) ?? 1
    const l = toNum(it.lengthCm)
    const w = toNum(it.widthCm)
    const h = toNum(it.heightCm)
    const unitVolume = calcUnitVolumeM3(l, w, h)
    const autoLdm = calcLineLdm(l, w, qty)
    const effectiveLdm = it.ldmManual ? toNum(it.ldm) : autoLdm
    return { qty, unitVolume, autoLdm, effectiveLdm }
  }

  /** 表头合计，和后端 recalcInquiryTotals 同口径 */
  const totals = useMemo(() => {
    let quantity = 0
    let weight = 0
    let volume = 0
    let ldm = 0
    for (const it of items) {
      const { qty, unitVolume, effectiveLdm } = derive(it)
      const unitWeight = toNum(it.unitWeightKg)
      quantity += qty
      if (unitWeight !== null) weight += unitWeight * qty
      if (unitVolume !== null) volume += unitVolume * qty
      if (effectiveLdm !== null) ldm += effectiveLdm
    }
    return {
      quantity,
      weight: Math.round(weight * 100) / 100,
      volume: Math.round(volume * 10000) / 10000,
      ldm: Math.round(ldm * 100) / 100,
    }
  }, [items])

  /** 只把填了内容的行提交上去，空行直接丢弃 */
  const buildCargoItems = () =>
    items
      .filter((it) => it.referenceNo.trim() || it.description.trim() || toNum(it.lengthCm) !== null || toNum(it.unitWeightKg) !== null)
      .map((it) => ({
        referenceNo: it.referenceNo.trim() || null,
        description: it.description.trim() || null,
        quantity: toNum(it.quantity) ?? 1,
        lengthCm: toNum(it.lengthCm),
        widthCm: toNum(it.widthCm),
        heightCm: toNum(it.heightCm),
        unitWeightKg: toNum(it.unitWeightKg),
        ldm: it.ldmManual ? toNum(it.ldm) : null,
        ldmManual: it.ldmManual,
        stackable: it.stackable,
        remarks: it.remarks.trim() || null,
      }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.clientId) { showToast(t('placeholder.selectClient'), 'error'); return }
    if (!form.businessType) { showToast(t('inquiryEdit.errBusinessTypeRequired'), 'error'); return }

    setSaving(true)
    try {
      const payload = {
        clientId: form.clientId,
        customerRef: form.customerRef.trim() || null,
        businessType: form.businessType,
        // 本地派送没有整车/零担之分，明确传 null 而不是留空字符串
        transportType: isLocalDelivery ? null : (form.transportType || null),
        // 车型只有专车才有意义；改成拼车时明确传 null 把旧值清掉
        vehicleLengthCode: !isLocalDelivery && form.transportType === 'FTL'
          ? (form.vehicleLengthCode || null) : null,
        // 发货联系人并进取件地址 JSONB（表里没有这几列，当顶层字段传会被静默丢掉 —— 踩坑 047）
        routeFrom: mergeContact(form.routeFrom, form.senderContact),
        routeTo: form.routeTo,
        contactName: form.contactName.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        cargoDescription: form.cargoDescription.trim() || null,
        specialRequirements: form.specialRequirements.trim() || null,
        remarks: form.remarks.trim() || null,
        cargoItems: buildCargoItems(),
      }

      const res = isEdit
        ? await api.put<ApiResponse<any>>(`/inquiries/${id}`, payload)
        : await api.post<ApiResponse<any>>('/inquiries', payload)

      if (res.code === 200) {
        showToast(isEdit ? t('inquiryEdit.updated') : t('inquiryEdit.created'), 'success')
        const targetId = isEdit ? id : res.data?.id
        setTimeout(() => navigate(targetId ? `/inquiries/${targetId}` : '/inquiries'), 700)
      } else {
        // 必须有 else 分支把后端 message 显示出来，否则失败会被伪装成成功（踩坑 011）
        showToast(res.message || t('common.saveFailed'), 'error')
      }
    } catch (err) {
      console.error('保存询价失败:', err)
      showToast(err instanceof Error ? err.message : t('common.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-200 rounded-lg" />
        <div className="h-64 bg-white rounded-2xl" />
        <div className="h-64 bg-white rounded-2xl" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 lg:p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* 页头 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/inquiries/${id}` : '/inquiries')}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {t('common.back')}
          </button>
          <h1 className="text-xl font-semibold text-slate-900">{isEdit ? t('inquiryEdit.editTitle') : t('inquiry.createForClient')}</h1>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="h-9 px-5 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 flex items-center gap-1.5 disabled:opacity-50 transition-all duration-200 ease-in-out"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? t('common.saving') : t('inquiryEdit.save')}
        </button>
      </div>

      {/* 基本信息 */}
      <Section title={t('section.basicInfo')} icon={FileText}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label={t('common.client')} required>
            <select
              value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
              disabled={isEdit}
              className={`${inputClass} bg-white disabled:bg-slate-50 disabled:text-slate-400`}
            >
              <option value="">{t('placeholder.selectClient')}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </Field>
          <Field label={t('inquiry.customerRef')} hint={t('inquiryEdit.customerRefHint')}>
            <input
              type="text"
              value={form.customerRef}
              onChange={(e) => setForm((f) => ({ ...f, customerRef: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label={t('field.businessType')} required>
            <select
              value={form.businessType}
              onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value as BusinessType }))}
              className={`${inputClass} bg-white`}
            >
              <option value="">{t('placeholder.pleaseSelect')}</option>
              {BUSINESS_TYPE_LIST.map((bt) => (
                <option key={bt} value={bt}>{t(businessTypeLabelKey(bt))}</option>
              ))}
            </select>
          </Field>
          {!isLocalDelivery && (
            <Field label={t('field.transportType')}>
              <select
                value={form.transportType}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  transportType: e.target.value,
                  // 不是专车了就把车型清掉，不留看不见却会被提交的值
                  vehicleLengthCode: e.target.value === 'FTL' ? f.vehicleLengthCode : '',
                }))}
                className={`${inputClass} bg-white`}
              >
                {TRANSPORT_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                ))}
              </select>
            </Field>
          )}
          {/* 车型只有专车才用得上（开发意见 #10） */}
          {!isLocalDelivery && form.transportType === 'FTL' && (
            <Field label={t('field.vehicleLength')}>
              <select
                value={form.vehicleLengthCode}
                onChange={(e) => setForm((f) => ({ ...f, vehicleLengthCode: e.target.value }))}
                className={`${inputClass} bg-white`}
              >
                <option value="">{t('common.unspecified')}</option>
                {VEHICLE_LENGTH_CODES.map((code) => (
                  <option key={code} value={code}>{t(`vehicleLength.${code}`)}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Section>

      {/* 路线 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title={t('field.origin')} icon={MapPin}>
          <AddressFields value={form.routeFrom} onChange={(v) => setForm((f) => ({ ...f, routeFrom: v }))} />
          {/* 发货联系人（开发意见 #8）：跟着取件地址放，和下面的收货联系人分开 */}
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label={t('field.senderContactName')}>
              <input type="text" value={form.senderContact.name} onChange={(e) => setForm((f) => ({ ...f, senderContact: { ...f.senderContact, name: e.target.value } }))} className={inputClass} />
            </Field>
            <Field label={t('field.phone')}>
              <input type="tel" value={form.senderContact.phone} onChange={(e) => setForm((f) => ({ ...f, senderContact: { ...f.senderContact, phone: e.target.value } }))} className={inputClass} />
            </Field>
            <Field label={t('field.email')}>
              <input type="email" value={form.senderContact.email} onChange={(e) => setForm((f) => ({ ...f, senderContact: { ...f.senderContact, email: e.target.value } }))} className={inputClass} />
            </Field>
          </div>
        </Section>
        <Section title={t('field.destination')} icon={MapPin}>
          <AddressFields value={form.routeTo} onChange={(v) => setForm((f) => ({ ...f, routeTo: v }))} />
        </Section>
      </div>

      {/* 收货联系人：有了发货侧之后，这一组必须点明是收货侧，否则两组分不清 */}
      <Section title={t('section.receiverContact')} icon={User}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label={t('field.name')}>
            <input type="text" value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} className={inputClass} />
          </Field>
          <Field label={t('field.phone')}>
            <input type="tel" value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} className={inputClass} />
          </Field>
          <Field label={t('field.email')} hint={t('inquiryEdit.emailHint')}>
            <input type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} className={inputClass} />
          </Field>
        </div>
      </Section>

      {/* 按件货物明细 */}
      <Section
        title={t('cargo.itemsTitle')}
        icon={Package}
        action={
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, newRow()])}
            className="h-8 px-3 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center gap-1 transition-all duration-200 ease-in-out"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('cargo.addRow')}
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[1150px]">
            <colgroup>
              <col className="w-[11%]" />
              <col className="w-[14%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[13%]" />
              <col className="w-[7%]" />
              <col className="w-[4%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-100">
                <th className="text-left px-2 py-2.5 font-medium">{t('cargo.colItemNo')}</th>
                <th className="text-left px-2 py-2.5 font-medium">{t('field.cargoDescription')}</th>
                <th className="text-right px-2 py-2.5 font-medium">{t('cargo.colPieces')}</th>
                <th className="text-right px-2 py-2.5 font-medium">{t('cargo.colLengthCm')}</th>
                <th className="text-right px-2 py-2.5 font-medium">{t('cargo.colWidthCm')}</th>
                <th className="text-right px-2 py-2.5 font-medium">{t('cargo.colHeightCm')}</th>
                <th className="text-right px-2 py-2.5 font-medium">{t('cargo.colUnitWeightKg')}</th>
                <th className="text-right px-2 py-2.5 font-medium">{t('cargo.colUnitVolumeM3')}</th>
                <th className="text-right px-2 py-2.5 font-medium">LDM</th>
                <th className="text-center px-2 py-2.5 font-medium">{t('cargo.colStackable')}</th>
                <th className="text-center px-2 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const { unitVolume, autoLdm } = derive(it)
                return (
                  <tr key={it.key} className="border-b border-slate-50">
                    <td className="px-2 py-2">
                      <input type="text" value={it.referenceNo} onChange={(e) => updateItem(it.key, { referenceNo: e.target.value })} className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="text" value={it.description} onChange={(e) => updateItem(it.key, { description: e.target.value })} className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="1" value={it.quantity} onChange={(e) => updateItem(it.key, { quantity: e.target.value })} className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs text-right outline-none focus:ring-2 focus:ring-blue-500" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="0" step="0.1" value={it.lengthCm} onChange={(e) => updateItem(it.key, { lengthCm: e.target.value })} className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs text-right outline-none focus:ring-2 focus:ring-blue-500" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="0" step="0.1" value={it.widthCm} onChange={(e) => updateItem(it.key, { widthCm: e.target.value })} className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs text-right outline-none focus:ring-2 focus:ring-blue-500" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="0" step="0.1" value={it.heightCm} onChange={(e) => updateItem(it.key, { heightCm: e.target.value })} className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs text-right outline-none focus:ring-2 focus:ring-blue-500" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="0" step="0.01" value={it.unitWeightKg} onChange={(e) => updateItem(it.key, { unitWeightKg: e.target.value })} className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs text-right outline-none focus:ring-2 focus:ring-blue-500" />
                    </td>
                    {/* 体积纯自动，不给编辑入口 */}
                    <td className="px-2 py-2 text-right text-xs text-slate-500">
                      {unitVolume !== null ? unitVolume.toFixed(3) : '-'}
                    </td>
                    {/* LDM 自动算，勾「手改」后才可编辑 */}
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={it.ldmManual ? it.ldm : (autoLdm !== null ? String(autoLdm) : '')}
                          disabled={!it.ldmManual}
                          onChange={(e) => updateItem(it.key, { ldm: e.target.value })}
                          className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs text-right outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                        />
                        <label className="flex items-center gap-0.5 text-[10px] text-slate-400 whitespace-nowrap cursor-pointer" title={t('cargo.manualLdmTitle')}>
                          <input
                            type="checkbox"
                            checked={it.ldmManual}
                            onChange={(e) => updateItem(it.key, {
                              ldmManual: e.target.checked,
                              // 勾上时把当前自动值填进去当起点，取消时清掉
                              ldm: e.target.checked ? (autoLdm !== null ? String(autoLdm) : '') : '',
                            })}
                            className="rounded border-slate-300"
                          />
                          {t('cargo.manualAdjusted')}
                        </label>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={it.stackable} onChange={(e) => updateItem(it.key, { stackable: e.target.checked })} className="rounded border-slate-300" />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => setItems((prev) => (prev.length === 1 ? [newRow()] : prev.filter((r) => r.key !== it.key)))}
                        title={t('cargo.deleteRow')}
                        className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 ease-in-out"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 实时合计，和保存后后端算出来的表头值一致 */}
        <div className="flex flex-wrap items-center gap-6 mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
          <span>{t('cargo.totalPieces')} <b className="text-slate-900 text-sm">{totals.quantity}</b></span>
          <span>{t('cargo.totalWeight')} <b className="text-slate-900 text-sm">{totals.weight.toFixed(2)}</b> kg</span>
          <span>{t('cargo.totalVolume')} <b className="text-slate-900 text-sm">{totals.volume.toFixed(3)}</b> m³</span>
          <span>LDM <b className="text-slate-900 text-sm">{totals.ldm.toFixed(2)}</b></span>
          <span className="text-slate-400">{t('cargo.ldmFormula')}</span>
        </div>
      </Section>

      {/* 补充说明 */}
      <Section title={t('section.additionalNotes')} icon={FileText}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Field label={t('field.cargoDescription')}>
            <textarea
              value={form.cargoDescription}
              onChange={(e) => setForm((f) => ({ ...f, cargoDescription: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all duration-200 ease-in-out"
            />
          </Field>
          <Field label={t('field.specialRequirements')}>
            <textarea
              value={form.specialRequirements}
              onChange={(e) => setForm((f) => ({ ...f, specialRequirements: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all duration-200 ease-in-out"
            />
          </Field>
          <Field label={t('common.remark')}>
            <textarea
              value={form.remarks}
              onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all duration-200 ease-in-out"
            />
          </Field>
        </div>
      </Section>
    </form>
  )
}
