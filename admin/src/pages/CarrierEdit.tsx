/**
 * 承运商编辑页面
 * 获取现有承运商数据 -> 填充表单 -> 提交修改
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  Truck,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import { toDateInputValue } from '../utils/format'
import { useMasterDataOptions } from '../hooks/useMasterDataOptions'

// ==================== 类型定义 ====================

interface CarrierFormData {
  companyName: string
  vatNumber: string
  country: string
  transportLicense: string
  licenseExpiry: string
  insuranceNumber: string
  insuranceExpiry: string
  contactName: string
  contactEmail: string
  contactPhone: string
  /** 询价邮箱，逗号分隔的多个地址（提交时拆成数组） */
  inquiryEmails: string
  address: string
  /** 服务国家，逗号分隔（提交时拆成数组）。原来编辑页没有，新增时填了就再也改不了 */
  serviceCountries: string
  /** 车型代号数组（迁移 126 起存代号）。同上，原来编辑页缺这个字段 */
  vehicleTypes: string[]
  carrierCategory: string
  carrierType: string
  remarks: string
}

const INITIAL_FORM: CarrierFormData = {
  companyName: '',
  vatNumber: '',
  country: '',
  transportLicense: '',
  licenseExpiry: '',
  insuranceNumber: '',
  insuranceExpiry: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  inquiryEmails: '',
  address: '',
  serviceCountries: '',
  vehicleTypes: [],
  carrierCategory: 'EXTERNAL',
  carrierType: '',
  remarks: '',
}

// ==================== 骨架屏 ====================

function FormSkeleton() {
  return (
    <div className="p-4 lg:p-6 animate-pulse">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-10 h-10 bg-slate-200 rounded-xl" />
        <div className="h-7 w-40 bg-slate-200 rounded-lg" />
      </div>
      <div className="bg-white/80 rounded-2xl p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-slate-100 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

export default function CarrierEdit() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [form, setForm] = useState<CarrierFormData>({ ...INITIAL_FORM })
  // 车型选项来自基础数据：value 是代号，label 是当前语言的名称
  const { options: vehicleTypeOptions } = useMasterDataOptions('vehicle-types')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // 获取承运商数据
  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function fetchCarrier() {
      setLoading(true)
      try {
        const res = await api.get<ApiResponse<any>>(`/carriers/${id}`)
        if (cancelled) return
        if (res.code === 200 && res.data) {
          const d = res.data
          setForm({
            companyName: d.company_name || d.companyName || '',
            vatNumber: d.vat_number || d.vatNumber || '',
            country: d.country || '',
            transportLicense: d.transport_license || d.transportLicense || '',
            // date 列回填必须走 toDateInputValue（踩坑 039）：后端返回的是 UTC ISO 串，
            // 直接塞给 <input type="date"> 是非法值，框子会显示空白——
            // 用户以为本来就没填，一保存就把库里的日期清掉了
            licenseExpiry: toDateInputValue(d.license_expiry || d.licenseExpiry),
            insuranceNumber: d.insurance_number || d.insuranceNumber || '',
            insuranceExpiry: toDateInputValue(d.insurance_expiry || d.insuranceExpiry),
            contactName: d.contact_name || d.contactName || '',
            contactEmail: d.contact_email || d.contactEmail || '',
            contactPhone: d.contact_phone || d.contactPhone || '',
            inquiryEmails: Array.isArray(d.inquiry_emails) ? d.inquiry_emails.join(', ') : '',
            address: d.address || '',
            // 两个数组字段：后端存 jsonb 数组，回填时一个拼成逗号串给输入框、
            // 一个原样给勾选框。**必须用 Array.isArray 兜底**——字段可能是
            // null 或 '{}'，直接 .join 会崩（踩坑 037：回填读错字段会改坏数据）
            serviceCountries: Array.isArray(d.service_countries) ? d.service_countries.join(', ') : '',
            vehicleTypes: Array.isArray(d.vehicle_types) ? d.vehicle_types : [],
            carrierCategory: d.carrier_category || d.carrierCategory || 'EXTERNAL',
            // 类型允许为空（未分类），下拉里对应"暂不确定"
            carrierType: d.carrier_type || d.carrierType || '',
            remarks: d.remarks || '',
          })
        } else {
          setError(res.message || t('carrierEdit.loadFailed'))
        }
      } catch (err: any) {
        if (cancelled) return
        console.error('[CarrierEdit] 获取承运商失败:', err)
        setError(err.message || t('apiError.requestFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchCarrier()
    return () => { cancelled = true }
  }, [id])

  // 更新表单字段
  function updateField(field: keyof CarrierFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // 车型勾选：存的是代号，勾一次加、再勾一次去
  function toggleVehicleType(code: string) {
    setForm((prev) => ({
      ...prev,
      vehicleTypes: prev.vehicleTypes.includes(code)
        ? prev.vehicleTypes.filter((c) => c !== code)
        : [...prev.vehicleTypes, code],
    }))
  }

  // 提交
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.companyName.trim()) {
      setError(t('master.errCompanyNameEmpty'))
      return
    }

    setSubmitting(true)
    setError('')
    try {
      // 询价邮箱和服务国家在表单里都是逗号分隔的字符串，后端要数组。
      // vehicleTypes 本来就是数组，跟着 ...form 原样带过去即可。
      const splitList = (s: string) =>
        s.split(/[,;，；]/).map((x) => x.trim()).filter(Boolean)

      const payload = {
        ...form,
        inquiryEmails: splitList(form.inquiryEmails),
        serviceCountries: splitList(form.serviceCountries),
      }
      const res = await api.put<ApiResponse<any>>(`/carriers/${id}`, payload)
      if (res.code === 200) {
        setSuccessMsg(t('carrierEdit.updated'))
        setTimeout(() => navigate(`/carriers/${id}`), 1200)
      } else {
        setError(res.message || t('orderForm.updateFailed'))
      }
    } catch (err: any) {
      console.error('[CarrierEdit] 提交失败:', err)
      setError(err.message || t('master.submitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200'

  if (loading) return <FormSkeleton />

  return (
    <div className="p-4 lg:p-6">
      {/* 成功提示 */}
      {successMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-green-50 border border-green-200 text-green-700 px-5 py-3 rounded-xl shadow-lg">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-sm font-medium">{successMsg}</span>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-5 py-3 rounded-xl shadow-lg">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {/* 头部 */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100 transition-all duration-200">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-600" />
          <h1 className="text-xl font-semibold text-slate-900">{t('carrierEdit.pageTitle')}</h1>
        </div>
      </div>

      {/* 表单 */}
      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
        {/* 公司信息 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('master.companyInfo')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('master.companyName')} <span className="text-red-500">*</span>
              </label>
              <input type="text" value={form.companyName} onChange={(e) => updateField('companyName', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('master.vatNumber')}</label>
              <input type="text" value={form.vatNumber} onChange={(e) => updateField('vatNumber', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('common.country')}</label>
              <input type="text" value={form.country} onChange={(e) => updateField('country', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('master.address')}</label>
              <input type="text" value={form.address} onChange={(e) => updateField('address', e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        {/* 分类与备注（P7 需求 7） */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('carrier.categoryAndRemarks')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('carrier.category')}</label>
              <select value={form.carrierCategory} onChange={(e) => updateField('carrierCategory', e.target.value)} className={inputClass}>
                <option value="EXTERNAL">{t('carrierCategory.EXTERNAL')}</option>
                <option value="OWN_FLEET">{t('carrierCategory.OWN_FLEET')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('common.type')}</label>
              <select value={form.carrierType} onChange={(e) => updateField('carrierType', e.target.value)} className={inputClass}>
                <option value="">{t('carrier.typeUnknown')}</option>
                <option value="PLATFORM">{t('carrierType.PLATFORM_LONG')}</option>
                <option value="FLEET">{t('carrierType.FLEET')}</option>
                <option value="INDIVIDUAL">{t('carrierType.INDIVIDUAL')}</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('carrier.remarksLabel')}</label>
              <textarea
                value={form.remarks}
                onChange={(e) => updateField('remarks', e.target.value)}
                rows={3}
                placeholder={t('carrier.remarksPlaceholder')}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        </div>

        {/* 资质信息 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('carrier.qualifications')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('carrier.transportLicense')}</label>
              <input type="text" value={form.transportLicense} onChange={(e) => updateField('transportLicense', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('carrier.licenseExpiry')}</label>
              <input type="date" value={form.licenseExpiry} onChange={(e) => updateField('licenseExpiry', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('carrier.insuranceNumber')}</label>
              <input type="text" value={form.insuranceNumber} onChange={(e) => updateField('insuranceNumber', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('carrier.insuranceExpiry')}</label>
              <input type="date" value={form.insuranceExpiry} onChange={(e) => updateField('insuranceExpiry', e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        {/* 运力信息：车型 + 服务国家。
            这两个字段原来只在「新增承运商」弹窗里有、编辑页没有，
            于是建完就再也改不了（SGF / Eurosped 就是这么一直空着的）。 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('carrier.capacitySection')}</h2>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('carrier.vehicleTypes')}</label>
            <div className="flex flex-wrap gap-4">
              {vehicleTypeOptions.length === 0 ? (
                <span className="text-sm text-slate-400">{t('carrier.vehicleTypesEmpty')}</span>
              ) : (
                vehicleTypeOptions.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      // 存的是代号，显示的是本地化名称（迁移 126 起）
                      checked={form.vehicleTypes.includes(opt.value)}
                      onChange={() => toggleVehicleType(opt.value)}
                    />
                    <span className="text-sm text-slate-700">{opt.label}</span>
                  </label>
                ))
              )}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">{t('carrier.vehicleTypesHint')}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('carrier.serviceCountries')}</label>
            <input
              type="text"
              value={form.serviceCountries}
              onChange={(e) => updateField('serviceCountries', e.target.value)}
              placeholder={t('placeholder.serviceCountries')}
              className={inputClass}
            />
          </div>
        </div>

        {/* 联系人信息 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('master.contactSection')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('field.contact')}</label>
              <input type="text" value={form.contactName} onChange={(e) => updateField('contactName', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('master.contactEmail')}</label>
              <input type="email" value={form.contactEmail} onChange={(e) => updateField('contactEmail', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('field.phone')}</label>
              <input type="text" value={form.contactPhone} onChange={(e) => updateField('contactPhone', e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('master.inquiryEmails')}</label>
              <input
                type="text"
                value={form.inquiryEmails}
                onChange={(e) => updateField('inquiryEmails', e.target.value)}
                placeholder={t('master.inquiryEmailsPlaceholder')}
                className={inputClass}
              />
              <p className="text-xs text-slate-400 mt-1.5">{t('master.inquiryEmailsHint')}</p>
            </div>
          </div>
        </div>

        {/* 提交按钮 */}
        <div className="flex items-center gap-3 pb-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-6 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-all duration-200"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('orderForm.saveChanges')}
          </button>
        </div>
      </form>
    </div>
  )
}
