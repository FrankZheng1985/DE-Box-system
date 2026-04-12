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
import api, { type ApiResponse } from '../utils/api'

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
  address: string
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
  address: '',
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
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [form, setForm] = useState<CarrierFormData>({ ...INITIAL_FORM })
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
            licenseExpiry: d.license_expiry || d.licenseExpiry || '',
            insuranceNumber: d.insurance_number || d.insuranceNumber || '',
            insuranceExpiry: d.insurance_expiry || d.insuranceExpiry || '',
            contactName: d.contact_name || d.contactName || '',
            contactEmail: d.contact_email || d.contactEmail || '',
            contactPhone: d.contact_phone || d.contactPhone || '',
            address: d.address || '',
          })
        } else {
          setError(res.message || '获取承运商信息失败')
        }
      } catch (err: any) {
        if (cancelled) return
        console.error('[CarrierEdit] 获取承运商失败:', err)
        setError(err.message || '请求失败')
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

  // 提交
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.companyName.trim()) {
      setError('公司名称不能为空')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const res = await api.put<ApiResponse<any>>(`/carriers/${id}`, form)
      if (res.code === 200) {
        setSuccessMsg('承运商信息已更新')
        setTimeout(() => navigate(`/carriers/${id}`), 1200)
      } else {
        setError(res.message || '更新失败')
      }
    } catch (err: any) {
      console.error('[CarrierEdit] 提交失败:', err)
      setError(err.message || '提交失败')
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
          <h1 className="text-xl font-semibold text-slate-900">编辑承运商</h1>
        </div>
      </div>

      {/* 表单 */}
      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
        {/* 公司信息 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">公司信息</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                公司名称 <span className="text-red-500">*</span>
              </label>
              <input type="text" value={form.companyName} onChange={(e) => updateField('companyName', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">VAT 税号</label>
              <input type="text" value={form.vatNumber} onChange={(e) => updateField('vatNumber', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">国家</label>
              <input type="text" value={form.country} onChange={(e) => updateField('country', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">地址</label>
              <input type="text" value={form.address} onChange={(e) => updateField('address', e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        {/* 资质信息 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">资质信息</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">运输许可证号</label>
              <input type="text" value={form.transportLicense} onChange={(e) => updateField('transportLicense', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">许可证到期日</label>
              <input type="date" value={form.licenseExpiry} onChange={(e) => updateField('licenseExpiry', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">保险单号</label>
              <input type="text" value={form.insuranceNumber} onChange={(e) => updateField('insuranceNumber', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">保险到期日</label>
              <input type="date" value={form.insuranceExpiry} onChange={(e) => updateField('insuranceExpiry', e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        {/* 联系人信息 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">联系人信息</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">联系人</label>
              <input type="text" value={form.contactName} onChange={(e) => updateField('contactName', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">联系邮箱</label>
              <input type="email" value={form.contactEmail} onChange={(e) => updateField('contactEmail', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">联系电话</label>
              <input type="text" value={form.contactPhone} onChange={(e) => updateField('contactPhone', e.target.value)} className={inputClass} />
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
            取消
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存修改
          </button>
        </div>
      </form>
    </div>
  )
}
