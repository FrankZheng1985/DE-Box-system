/**
 * 创建报价页面
 * 左右布局：左侧报价表单 + 右侧报价摘要（sticky）
 */

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  FileText,
  Save,
  Send,
  AlertCircle,
  CheckCircle,
  Loader2,
  MapPin,
  User,
  Calendar,
  Banknote,
  Package,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'

// ==================== 类型定义 ====================

interface Client {
  id: string
  company_name: string
  contact_person: string
}

interface QuotationFormData {
  clientId: string
  businessType: string
  transportType: string
  validUntil: string
  originCountry: string
  originCity: string
  destCountry: string
  destCity: string
  baseFreight: number
  surcharge: number
  insuranceFee: number
  currency: string
  remarks: string
}

// ==================== 常量 ====================

const BUSINESS_TYPES = [
  { value: 'CURTAIN_SIDE', label: '篷布车运输' },
  { value: 'CONTAINER', label: '集装箱物流' },
]

const TRANSPORT_TYPES = [
  { value: 'FTL', label: '整车运输 (FTL)' },
  { value: 'LTL', label: '零担运输 (LTL)' },
]

const CURRENCIES = [
  { value: 'EUR', label: 'EUR - 欧元', symbol: '€' },
  { value: 'GBP', label: 'GBP - 英镑', symbol: '£' },
  { value: 'PLN', label: 'PLN - 兹罗提', symbol: 'zł' },
]

const INITIAL_FORM: QuotationFormData = {
  clientId: '',
  businessType: '',
  transportType: '',
  validUntil: '',
  originCountry: '',
  originCity: '',
  destCountry: '',
  destCity: '',
  baseFreight: 0,
  surcharge: 0,
  insuranceFee: 0,
  currency: 'EUR',
  remarks: '',
}

// ==================== 骨架屏组件 ====================

function FormSkeleton() {
  return (
    <div className="p-4 lg:p-6 animate-pulse">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-10 h-10 bg-slate-200 rounded-xl" />
        <div className="h-7 w-32 bg-slate-200 rounded-lg" />
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 lg:w-[70%] space-y-6">
          <div className="bg-white/80 rounded-2xl p-6 h-64" />
          <div className="bg-white/80 rounded-2xl p-6 h-40" />
          <div className="bg-white/80 rounded-2xl p-6 h-48" />
        </div>
        <div className="lg:w-[30%]">
          <div className="bg-white/80 rounded-2xl p-6 h-64" />
        </div>
      </div>
    </div>
  )
}

// ==================== 表单字段子组件 ====================

interface FieldProps {
  label: string
  required?: boolean
  children: React.ReactNode
  error?: string
}

function FormField({ label, required, children, error }: FieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  )
}

// ==================== 主组件 ====================

export default function QuotationCreate() {
  const navigate = useNavigate()

  // 状态
  const [form, setForm] = useState<QuotationFormData>({ ...INITIAL_FORM })
  const [clients, setClients] = useState<Client[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitType, setSubmitType] = useState<'draft' | 'send' | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [globalError, setGlobalError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // 获取客户列表
  useEffect(() => {
    let cancelled = false

    async function fetchClients() {
      setLoadingClients(true)
      try {
        const res = await api.get<ApiResponse<any>>('/clients?pageSize=100')
        if (cancelled) return

        if (res.code === 200 && res.data) {
          // 兼容 items 数组或直接数组
          const list = Array.isArray(res.data) ? res.data : (res.data.items || [])
          setClients(list)
        }
      } catch (err: any) {
        if (cancelled) return
        console.error('[QuotationCreate] 获取客户列表失败:', err)
      } finally {
        if (!cancelled) setLoadingClients(false)
      }
    }

    fetchClients()
    return () => { cancelled = true }
  }, [])

  // 计算总价
  const totalPrice = useMemo(() => {
    return (form.baseFreight || 0) + (form.surcharge || 0) + (form.insuranceFee || 0)
  }, [form.baseFreight, form.surcharge, form.insuranceFee])

  // 获取币种符号
  const currencySymbol = useMemo(() => {
    return CURRENCIES.find((c) => c.value === form.currency)?.symbol || '€'
  }, [form.currency])

  // 获取选中的客户名称
  const selectedClientName = useMemo(() => {
    const client = clients.find((c) => c.id === form.clientId)
    return client?.company_name || ''
  }, [clients, form.clientId])

  // 获取业务类型标签
  const businessTypeLabel = useMemo(() => {
    return BUSINESS_TYPES.find((t) => t.value === form.businessType)?.label || ''
  }, [form.businessType])

  // 更新表单字段
  function updateField(field: keyof QuotationFormData, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }))
    // 清除该字段的错误
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  // 表单验证
  function validate(): boolean {
    const newErrors: Record<string, string> = {}

    if (!form.clientId) newErrors.clientId = '请选择客户'
    if (!form.businessType) newErrors.businessType = '请选择业务类型'
    if (!form.transportType) newErrors.transportType = '请选择运输类型'
    if (!form.validUntil) newErrors.validUntil = '请选择有效期'
    if (!form.baseFreight || form.baseFreight <= 0) newErrors.baseFreight = '请输入基础运费'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // 提交报价
  async function handleSubmit(type: 'draft' | 'send') {
    if (!validate()) return

    setSubmitting(true)
    setSubmitType(type)
    setGlobalError('')

    const payload = {
      clientId: form.clientId,
      businessType: form.businessType,
      transportType: form.transportType,
      routeFrom: { country: form.originCountry, city: form.originCity },
      routeTo: { country: form.destCountry, city: form.destCity },
      baseFreight: form.baseFreight,
      surcharge: form.surcharge,
      insuranceFee: form.insuranceFee,
      totalPrice,
      currency: form.currency,
      validUntil: form.validUntil,
      remarks: form.remarks,
    }

    try {
      // 先创建报价
      const createRes = await api.post<ApiResponse<{ id: string }>>('/quotations', payload)

      if (createRes.code !== 200 && createRes.code !== 201) {
        setGlobalError(createRes.message || '创建报价失败')
        return
      }

      // 如果是发送，再调用发送接口
      if (type === 'send' && createRes.data?.id) {
        const sendRes = await api.post<ApiResponse<any>>(`/quotations/${createRes.data.id}/send`)
        if (sendRes.code !== 200) {
          setGlobalError(sendRes.message || '报价已保存但发送失败')
          return
        }
      }

      const msg = type === 'draft' ? '报价已保存为草稿' : '报价已成功发送'
      setSuccessMsg(msg)
      setTimeout(() => {
        navigate('/quotes')
      }, 1500)
    } catch (err: any) {
      console.error('[QuotationCreate] 提交失败:', err)
      setGlobalError(err.message || '提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
      setSubmitType(null)
    }
  }

  // 通用输入框样式
  const inputClass =
    'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200'
  const inputErrorClass =
    'w-full px-3 py-2.5 text-sm border border-red-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200'

  if (loadingClients) return <FormSkeleton />

  return (
    <div className="p-4 lg:p-6">
      {/* ==================== 成功提示 ==================== */}
      {successMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-green-50 border border-green-200 text-green-700 px-5 py-3 rounded-xl shadow-lg">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-sm font-medium">{successMsg}</span>
        </div>
      )}

      {/* ==================== 错误提示 ==================== */}
      {globalError && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-5 py-3 rounded-xl shadow-lg">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-sm font-medium">{globalError}</span>
          <button onClick={() => setGlobalError('')} className="text-red-400 hover:text-red-600 ml-2">
            &times;
          </button>
        </div>
      )}

      {/* ==================== 头部 ==================== */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-slate-100 transition-all duration-200"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          <h1 className="text-xl font-semibold text-slate-900">创建报价</h1>
        </div>
      </div>

      {/* ==================== 主体：左侧表单 + 右侧摘要 ==================== */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ========== 左侧表单 (70%) ========== */}
        <div className="flex-1 lg:w-[70%] space-y-6">

          {/* ---------- 基本信息 ---------- */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              基本信息
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 客户 */}
              <FormField label="客户" required error={errors.clientId}>
                <select
                  value={form.clientId}
                  onChange={(e) => updateField('clientId', e.target.value)}
                  className={errors.clientId ? inputErrorClass : inputClass}
                >
                  <option value="">请选择客户</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name}
                    </option>
                  ))}
                </select>
              </FormField>

              {/* 业务类型 */}
              <FormField label="业务类型" required error={errors.businessType}>
                <select
                  value={form.businessType}
                  onChange={(e) => updateField('businessType', e.target.value)}
                  className={errors.businessType ? inputErrorClass : inputClass}
                >
                  <option value="">请选择业务类型</option>
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </FormField>

              {/* 运输类型 */}
              <FormField label="运输类型" required error={errors.transportType}>
                <select
                  value={form.transportType}
                  onChange={(e) => updateField('transportType', e.target.value)}
                  className={errors.transportType ? inputErrorClass : inputClass}
                >
                  <option value="">请选择运输类型</option>
                  {TRANSPORT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </FormField>

              {/* 有效期 */}
              <FormField label="有效期" required error={errors.validUntil}>
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => updateField('validUntil', e.target.value)}
                  className={errors.validUntil ? inputErrorClass : inputClass}
                />
              </FormField>
            </div>
          </div>

          {/* ---------- 路线信息 ---------- */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              路线信息
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="起点国家">
                <input
                  type="text"
                  value={form.originCountry}
                  onChange={(e) => updateField('originCountry', e.target.value)}
                  placeholder="例如: Germany"
                  className={inputClass}
                />
              </FormField>

              <FormField label="起点城市">
                <input
                  type="text"
                  value={form.originCity}
                  onChange={(e) => updateField('originCity', e.target.value)}
                  placeholder="例如: Munich"
                  className={inputClass}
                />
              </FormField>

              <FormField label="终点国家">
                <input
                  type="text"
                  value={form.destCountry}
                  onChange={(e) => updateField('destCountry', e.target.value)}
                  placeholder="例如: Poland"
                  className={inputClass}
                />
              </FormField>

              <FormField label="终点城市">
                <input
                  type="text"
                  value={form.destCity}
                  onChange={(e) => updateField('destCity', e.target.value)}
                  placeholder="例如: Warsaw"
                  className={inputClass}
                />
              </FormField>
            </div>
          </div>

          {/* ---------- 价格明细 ---------- */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Banknote className="w-5 h-5 text-blue-600" />
              价格明细
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 基础运费 */}
              <FormField label="基础运费" required error={errors.baseFreight}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={form.baseFreight || ''}
                    onChange={(e) => updateField('baseFreight', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className={`${errors.baseFreight ? inputErrorClass : inputClass} pl-8`}
                  />
                </div>
              </FormField>

              {/* 附加费 */}
              <FormField label="附加费">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={form.surcharge || ''}
                    onChange={(e) => updateField('surcharge', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className={`${inputClass} pl-8`}
                  />
                </div>
              </FormField>

              {/* 保险费 */}
              <FormField label="保险费">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={form.insuranceFee || ''}
                    onChange={(e) => updateField('insuranceFee', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className={`${inputClass} pl-8`}
                  />
                </div>
              </FormField>

              {/* 币种 */}
              <FormField label="币种">
                <select
                  value={form.currency}
                  onChange={(e) => updateField('currency', e.target.value)}
                  className={inputClass}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            {/* 报价合计 */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">报价合计</span>
                <span className="text-2xl font-bold text-blue-600">
                  {currencySymbol} {totalPrice.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* ---------- 备注说明 ---------- */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              备注说明
            </h2>
            <textarea
              value={form.remarks}
              onChange={(e) => updateField('remarks', e.target.value)}
              placeholder="请输入报价相关的备注信息..."
              rows={4}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* ---------- 底部按钮 ---------- */}
          <div className="flex items-center gap-3 pb-6">
            <button
              onClick={() => handleSubmit('draft')}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-all duration-200 disabled:opacity-50"
            >
              {submitting && submitType === 'draft' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              保存草稿
            </button>
            <button
              onClick={() => handleSubmit('send')}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200 disabled:opacity-50"
            >
              {submitting && submitType === 'send' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              发送报价
            </button>
          </div>
        </div>

        {/* ========== 右侧摘要 (30%) ========== */}
        <div className="lg:w-[30%]">
          <div className="lg:sticky lg:top-6 space-y-6">
            {/* 报价摘要卡片 */}
            <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                报价摘要
              </h2>

              <div className="space-y-4">
                {/* 客户 */}
                <div>
                  <p className="text-xs text-slate-400 font-medium">客户</p>
                  <p className="text-sm text-slate-900 mt-1 font-medium">
                    {selectedClientName || '-'}
                  </p>
                </div>

                {/* 业务类型 */}
                <div>
                  <p className="text-xs text-slate-400 font-medium">业务类型</p>
                  <p className="text-sm text-slate-900 mt-1">
                    {businessTypeLabel || '-'}
                  </p>
                </div>

                {/* 路线 */}
                <div>
                  <p className="text-xs text-slate-400 font-medium">运输路线</p>
                  <div className="flex items-center gap-2 mt-1">
                    {form.originCity || form.originCountry ? (
                      <>
                        <MapPin className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                        <span className="text-sm text-slate-700">
                          {form.originCity || form.originCountry}
                        </span>
                        <span className="text-slate-300">&rarr;</span>
                        <MapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        <span className="text-sm text-slate-700">
                          {form.destCity || form.destCountry || '-'}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-slate-400">-</span>
                    )}
                  </div>
                </div>

                {/* 总价 */}
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-400 font-medium">报价总价</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">
                    {currencySymbol} {totalPrice.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>

                {/* 有效期 */}
                <div>
                  <p className="text-xs text-slate-400 font-medium">有效期至</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-sm text-slate-700">
                      {form.validUntil || '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 费用明细卡片 */}
            <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
              <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-blue-600" />
                费用明细
              </h2>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">基础运费</span>
                  <span className="text-sm text-slate-700">
                    {currencySymbol} {(form.baseFreight || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">附加费</span>
                  <span className="text-sm text-slate-700">
                    {currencySymbol} {(form.surcharge || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">保险费</span>
                  <span className="text-sm text-slate-700">
                    {currencySymbol} {(form.insuranceFee || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">合计</span>
                  <span className="text-sm font-bold text-blue-600">
                    {currencySymbol} {totalPrice.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
