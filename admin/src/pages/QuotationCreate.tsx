/**
 * 创建报价页面
 * 左右布局：左侧报价表单 + 右侧报价摘要（sticky）
 */

import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { useMasterDataOptions } from '../hooks/useMasterDataOptions'
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
  Calculator,
  MessageSquare,
  Truck,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from 'react-i18next'
import { BUSINESS_TYPE_LIST, businessTypeLabelKey } from '../constants/businessTypes'
import QuotationDeliveryLines, {
  type DeliveryOrderRef, type DeliveryPriceMap, sumDeliveryPrices,
} from '../components/QuotationDeliveryLines'
import { formatMoney, toDateInputValue } from '../utils/format'
import {
  CARRIER_INQUIRY_PERMISSIONS, CARRIER_INQUIRY_STATUS, type CarrierInquiry,
} from '../constants/carrierInquiry'

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

// 业务类型下拉选项（三分类，来自共享常量）
const BUSINESS_TYPE_OPTIONS = BUSINESS_TYPE_LIST.map((value) => ({
  value,
  labelKey: businessTypeLabelKey(value),
}))

const TRANSPORT_TYPES = [
  { value: 'FTL', labelKey: 'transportTypeLong.FTL' },
  { value: 'LTL', labelKey: 'transportTypeLong.LTL' },
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
  const { t } = useTranslation()
  const navigate = useNavigate()
  // 从询价列表点「由此报价」跳过来时带的 ?inquiryId=xxx
  // 后端 POST /quotations 一直支持 inquiryId 字段，只是前端此前从没传过
  const [searchParams] = useSearchParams()
  const inquiryId = searchParams.get('inquiryId')
  // 同一组件承担新建与编辑两种模式：带 :id 进来就是编辑（沿用 InquiryEdit 的写法）
  const { id: editId } = useParams<{ id: string }>()
  const isEdit = Boolean(editId)
  const { hasPermission } = useAuth()
  // 服务商成本只对服务商管理岗可见（需求 5.3），后端接口同样拦一道
  const canSeeCarrierCost = hasPermission(CARRIER_INQUIRY_PERMISSIONS.VIEW)

  // 基础数据选项
  const { options: currencyOpts } = useMasterDataOptions('currencies')

  // 状态
  const [form, setForm] = useState<QuotationFormData>({ ...INITIAL_FORM })
  /** 本地派送：来源询价的派送票，以及每票的报价（开发意见 #7 第 2 步） */
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrderRef[]>([])
  const [deliveryPrices, setDeliveryPrices] = useState<DeliveryPriceMap>({})
  const [clients, setClients] = useState<Client[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  // 编辑模式要等详情回填后再渲染表单，否则会先闪一屏空表单
  const [loadingDetail, setLoadingDetail] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [submitType, setSubmitType] = useState<'draft' | 'send' | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [globalError, setGlobalError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [calculatingPrice, setCalculatingPrice] = useState(false)
  // 来源询价（带 inquiryId 进来时加载，用于表单预填 + 顶部提示条）
  const [sourceInquiry, setSourceInquiry] = useState<{
    id: string
    inquiry_number: string
    client_name: string | null
    cargo_description: string | null
    cargo_weight_kg: string | null
    cargo_quantity: number | null
    ldm: string | null
  } | null>(null)

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

  // 由询价发起报价：拉询价详情预填客户、服务类型、路线
  useEffect(() => {
    if (!inquiryId) return
    let cancelled = false

    ;(async () => {
      try {
        const res = await api.get<ApiResponse<any>>(`/inquiries/${inquiryId}`)
        if (cancelled) return
        if (res.code !== 200 || !res.data) {
          setGlobalError(res.message || t('quotationCreate.sourceLoadFailed'))
          return
        }
        const d = res.data
        setSourceInquiry({
          id: d.id,
          inquiry_number: d.inquiry_number,
          client_name: d.client_name,
          cargo_description: d.cargo_description,
          cargo_weight_kg: d.cargo_weight_kg,
          cargo_quantity: d.cargo_quantity,
          ldm: d.ldm,
        })
        // 有派送票就是三层单，逐票报价（合计由各票相加）
        setDeliveryOrders(d.deliveryOrders || [])
        setForm((prev) => ({
          ...prev,
          clientId: d.client_id || prev.clientId,
          businessType: d.business_type || prev.businessType,
          transportType: d.transport_type || prev.transportType,
          originCountry: d.route_from?.country || prev.originCountry,
          originCity: d.route_from?.city || prev.originCity,
          destCountry: d.route_to?.country || prev.destCountry,
          destCity: d.route_to?.city || prev.destCity,
        }))
      } catch (err) {
        if (cancelled) return
        console.error('[QuotationCreate] 获取来源询价失败:', err)
        setGlobalError(t('quotationCreate.sourceLoadFailed'))
      }
    })()

    return () => { cancelled = true }
  }, [inquiryId])

  // 编辑模式：拉报价详情回填表单
  // 路线在库里是 JSONB {country, city}，要拆回表单的四个平铺字段
  useEffect(() => {
    if (!isEdit || !editId) return
    let cancelled = false

    ;(async () => {
      try {
        const res = await api.get<ApiResponse<any>>(`/quotations/${editId}`)
        if (cancelled) return
        if (res.code !== 200 || !res.data) {
          setGlobalError(res.message || t('quotationEdit.loadFailed'))
          return
        }
        const d = res.data
        setForm({
          clientId: d.client_id || '',
          businessType: d.business_type || '',
          transportType: d.transport_type || '',
          validUntil: toDateInputValue(d.valid_until),
          originCountry: d.route_from?.country || '',
          originCity: d.route_from?.city || '',
          destCountry: d.route_to?.country || '',
          destCity: d.route_to?.city || '',
          baseFreight: Number(d.base_freight) || 0,
          surcharge: Number(d.surcharge) || 0,
          insuranceFee: Number(d.insurance_fee) || 0,
          currency: d.currency || 'EUR',
          remarks: d.remarks || '',
        })
      } catch (err) {
        if (cancelled) return
        console.error('[QuotationCreate] 获取报价详情失败:', err)
        setGlobalError(t('quotationEdit.loadFailed'))
      } finally {
        if (!cancelled) setLoadingDetail(false)
      }
    })()

    return () => { cancelled = true }
    // 故意不依赖 t：把 t 放进依赖会让「切换语言」重跑这个 effect，
    // 用 setForm 把用户已经改了一半的表单覆盖回原值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, editId])

  // 该询价选用的服务商成本（P6）：选用了哪家就用哪家，没选用就退回最低回价，
  // 作为报价时的成本参考并随报价存下来（quotations.carrier_cost）
  const [costRef, setCostRef] = useState<CarrierInquiry | null>(null)

  useEffect(() => {
    if (!inquiryId || !canSeeCarrierCost) return
    let cancelled = false

    ;(async () => {
      try {
        const res = await api.get<ApiResponse<CarrierInquiry[]>>(`/carrier-inquiries?inquiryId=${inquiryId}`)
        if (cancelled || res.code !== 200 || !Array.isArray(res.data)) return

        const selected = res.data.find((r) => r.status === CARRIER_INQUIRY_STATUS.SELECTED)
        if (selected) {
          setCostRef(selected)
          return
        }
        // 没选用就取回价里最低的一条（NUMERIC 回来是字符串，比大小前先转数字 —— 踩坑 002）
        const quoted = res.data
          .filter((r) => r.status === CARRIER_INQUIRY_STATUS.QUOTED && r.quoted_cost !== null)
          .sort((a, b) => Number(a.quoted_cost) - Number(b.quoted_cost))
        setCostRef(quoted[0] || null)
      } catch (err) {
        // 成本参考拿不到不影响报价，静默降级即可
        console.warn('[QuotationCreate] 获取服务商成本参考失败:', err)
      }
    })()

    return () => { cancelled = true }
  }, [inquiryId, canSeeCarrierCost])

  // 计算总价
  /** 有派送票就是三层单，这时候的合计只认逐票之和 */
  const isPerDelivery = deliveryOrders.length > 0
  const isLocalDelivery = form.businessType === 'LOCAL_DELIVERY'

  const totalPrice = useMemo(() => {
    if (isPerDelivery) return sumDeliveryPrices(deliveryPrices)
    return (form.baseFreight || 0) + (form.surcharge || 0) + (form.insuranceFee || 0)
  }, [isPerDelivery, deliveryPrices, form.baseFreight, form.surcharge, form.insuranceFee])

  // 获取币种符号
  const currencySymbol = useMemo(() => {
    return currencyOpts.find((c) => c.value === form.currency)?.symbol || '€'
  }, [form.currency])

  // 获取选中的客户名称
  const selectedClientName = useMemo(() => {
    const client = clients.find((c) => c.id === form.clientId)
    return client?.company_name || ''
  }, [clients, form.clientId])

  // 获取业务类型标签
  const businessTypeLabel = useMemo(() => {
    if (!form.businessType) return ''
    return t(businessTypeLabelKey(form.businessType), { defaultValue: form.businessType })
  }, [t, form.businessType])

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

  // 自动定价
  async function handleAutoPrice() {
    if (!form.businessType) {
      setGlobalError(t('quotationCreate.pickBusinessTypeFirst'))
      return
    }
    setCalculatingPrice(true)
    setGlobalError('')
    try {
      // 迁移 105 后 pricing_procedures.procedure_code 与业务类型同名，直接用
      const procedureCode = form.businessType
      const res = await api.post<ApiResponse<{ items: any[]; subtotal: number; total: number }>>(
        '/quotations/calculate-price',
        {
          procedureCode,
          inputData: {
            client_id: form.clientId || undefined,
            route_from: form.originCountry ? { country: form.originCountry, city: form.originCity } : undefined,
            route_to: form.destCountry ? { country: form.destCountry, city: form.destCity } : undefined,
            currency: form.currency,
          },
        }
      )
      if (res.code === 200 && res.data) {
        const data = res.data
        // 从定价结果填充价格字段
        const baseItem = data.items?.find((i: any) => i.typeCode === 'BASE_FREIGHT' || i.stepNumber === 10)
        const surchargeItem = data.items?.find((i: any) => i.typeCode === 'SURCHARGE' || i.stepNumber === 20)
        const insuranceItem = data.items?.find((i: any) => i.typeCode === 'INSURANCE' || i.stepNumber === 30)

        setForm(prev => ({
          ...prev,
          baseFreight: baseItem ? Number(baseItem.amount) : Number(data.subtotal) || Number(data.total) || prev.baseFreight,
          surcharge: surchargeItem ? Number(surchargeItem.amount) : prev.surcharge,
          insuranceFee: insuranceItem ? Number(insuranceItem.amount) : prev.insuranceFee,
        }))
        setSuccessMsg(t('quotationCreate.pricingDone'))
        setTimeout(() => setSuccessMsg(''), 2000)
      } else {
        setGlobalError(res.message || t('quotationCreate.pricingFailed'))
      }
    } catch (err: any) {
      console.error('[QuotationCreate] 自动定价失败:', err)
      setGlobalError(err.message || t('quotationCreate.pricingFailedRetry'))
    } finally {
      setCalculatingPrice(false)
    }
  }

  // 表单验证
  function validate(): boolean {
    const newErrors: Record<string, string> = {}

    if (!form.clientId) newErrors.clientId = t('placeholder.selectClient')
    if (!form.businessType) newErrors.businessType = t('quotationCreate.errBusinessType')
    // 本地派送没有专车/拼车之分（询价侧同口径），别把它当必填 ——
    // 否则三层单的报价永远保存不了，而且页面上看不出是哪里拦住的
    if (!isLocalDelivery && !form.transportType) {
      newErrors.transportType = t('quotationCreate.errTransportType')
    }
    if (!form.validUntil) newErrors.validUntil = t('quotationCreate.errValidUntil')
    if (isPerDelivery) {
      // 三层单没有「基础运费」这一项，改为要求每一票都填了价
      // （0 是合法的：某票免费送；空着才是漏填）
      const missing = deliveryOrders.filter((o) => {
        const v = deliveryPrices[o.id]
        return v === undefined || v === '' || !Number.isFinite(Number(v))
      })
      if (missing.length > 0) {
        newErrors.deliveryLines = t('quotationCreate.errDeliveryPrices', {
          refs: missing.map((o) => o.customer_sub_ref || `#${o.line_number}`).join(', '),
        })
      }
    } else if (!form.baseFreight || form.baseFreight <= 0) {
      newErrors.baseFreight = t('quotationCreate.errBaseFreight')
    }

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
      // 带上来源询价：后端据此关联报价、并把询价状态推进为 QUOTED
      inquiryId: inquiryId || null,
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
      // 成本快照：没权限的人不传，后端也会再拦一次（P6）
      carrierCost: canSeeCarrierCost && costRef?.quoted_cost ? Number(costRef.quoted_cost) : null,
      carrierCostSourceId: canSeeCarrierCost && costRef ? costRef.id : null,
      // 三层单：逐票报价，后端据此回写合计（不传的话后端不动逐票行）
      ...(isPerDelivery ? {
        deliveryLines: deliveryOrders.map((o) => ({
          deliveryOrderId: o.id,
          price: Number(deliveryPrices[o.id] || 0),
        })),
      } : {}),
    }

    try {
      // 编辑模式改现有报价，新建模式创建
      const saveRes = isEdit
        ? await api.put<ApiResponse<{ id: string }>>(`/quotations/${editId}`, payload)
        : await api.post<ApiResponse<{ id: string }>>('/quotations', payload)

      if (saveRes.code !== 200 && saveRes.code !== 201) {
        setGlobalError(saveRes.message || t('quotationCreate.createFailed'))
        return
      }

      // 如果是发送，再调用发送接口（编辑模式用路由上的 id）
      const quotationId = isEdit ? editId : saveRes.data?.id
      if (type === 'send' && quotationId) {
        const sendRes = await api.post<ApiResponse<any>>(`/quotations/${quotationId}/send`)
        if (sendRes.code !== 200) {
          setGlobalError(sendRes.message || t('quotationCreate.savedButSendFailed'))
          return
        }
      }

      const msg = type === 'draft'
        ? (isEdit ? t('quotationEdit.saved') : t('quotationCreate.savedAsDraft'))
        : t('quotationCreate.sentOk')
      setSuccessMsg(msg)
      setTimeout(() => {
        // 编辑完回详情页；从询价来的回询价详情，方便继续看这张单
        if (isEdit) navigate(`/quotes/${editId}`)
        else navigate(inquiryId ? `/inquiries/${inquiryId}` : '/quotes')
      }, 1500)
    } catch (err: any) {
      console.error('[QuotationCreate] 提交失败:', err)
      setGlobalError(err.message || t('quotationCreate.submitFailedRetry'))
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

  if (loadingClients || loadingDetail) return <FormSkeleton />

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
          <h1 className="text-xl font-semibold text-slate-900">
            {isEdit ? t('quotationEdit.pageTitle') : t('quotationCreate.pageTitle')}
          </h1>
        </div>
      </div>

      {/* ==================== 来源询价提示条 ==================== */}
      {sourceInquiry && (
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-slate-700">
              {t('quotationCreate.fromInquiry')}
              <button
                type="button"
                onClick={() => navigate(`/inquiries/${sourceInquiry.id}`)}
                className="mx-1 font-semibold text-blue-700 hover:underline"
              >
                {sourceInquiry.inquiry_number}
              </button>
              {t('quotationCreate.fromInquiryHint')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
            {sourceInquiry.cargo_description && (
              <span>{t('field.cargoDescription')}: {sourceInquiry.cargo_description}</span>
            )}
            {sourceInquiry.cargo_quantity !== null && (
              <span>{t('cargo.colPieces')}: {sourceInquiry.cargo_quantity}</span>
            )}
            {sourceInquiry.cargo_weight_kg !== null && (
              <span>{t('cargo.totalWeight')} {Number(sourceInquiry.cargo_weight_kg).toFixed(2)} kg</span>
            )}
            {sourceInquiry.ldm !== null && <span>LDM：{Number(sourceInquiry.ldm).toFixed(2)}</span>}
          </div>
        </div>
      )}

      {/* ==================== 服务商成本参考（P6，仅服务商管理岗可见） ==================== */}
      {canSeeCarrierCost && costRef && (
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-700">
              {t('quotationCreate.costRefTitle')}
              <b className="mx-1 text-slate-900">{costRef.carrier_name || '-'}</b>
              {costRef.status === CARRIER_INQUIRY_STATUS.SELECTED ? t('quotationCreate.costRefSelected') : t('quotationCreate.costRefLowest')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span>
              {t('carrierInquiry.colCost')}:
              <b className="text-slate-900">
                {formatMoney(costRef.quoted_cost, costRef.currency || 'EUR')}
              </b>
            </span>
            {costRef.transit_days !== null && (
              <span>{t('carrierInquiry.transitDaysValue', { count: costRef.transit_days })}</span>
            )}
            {/* 币种不同不算毛利：乱换算会给出错误的利润数字 */}
            {costRef.currency === form.currency && (
              <span>
                {t('quotationCreate.estimatedProfit')}:
                <b className={totalPrice - Number(costRef.quoted_cost) >= 0 ? 'text-green-700' : 'text-red-600'}>
                  {formatMoney(totalPrice - Number(costRef.quoted_cost), form.currency)}
                </b>
              </span>
            )}
          </div>
        </div>
      )}

      {/* ==================== 主体：左侧表单 + 右侧摘要 ==================== */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ========== 左侧表单 (70%) ========== */}
        <div className="flex-1 lg:w-[70%] space-y-6">

          {/* ---------- 基本信息 ---------- */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              {t('section.basicInfo')}
            </h2>

            {/* 后端 PUT 是白名单更新（只认价格/有效期/路线/备注/成本），
                这几个字段改了也不会生效，编辑模式直接禁用并说明原因 */}
            {isEdit && (
              <p className="text-xs text-slate-400 mb-3">{t('quotationEdit.lockedFieldsHint')}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 客户 */}
              <FormField label={t('common.client')} required error={errors.clientId}>
                <select
                  value={form.clientId}
                  onChange={(e) => updateField('clientId', e.target.value)}
                  disabled={isEdit}
                  className={errors.clientId ? inputErrorClass : inputClass}
                >
                  <option value="">{t('placeholder.selectClient')}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name}
                    </option>
                  ))}
                </select>
              </FormField>

              {/* 业务类型 */}
              <FormField label={t('field.businessType')} required error={errors.businessType}>
                <select
                  value={form.businessType}
                  onChange={(e) => updateField('businessType', e.target.value)}
                  disabled={isEdit}
                  className={errors.businessType ? inputErrorClass : inputClass}
                >
                  <option value="">{t('quotationCreate.errBusinessType')}</option>
                  {BUSINESS_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </option>
                  ))}
                </select>
              </FormField>

              {/* 运输类型 */}
              <FormField label={t('field.transportType')} required={!isLocalDelivery} error={errors.transportType}>
                <select
                  value={form.transportType}
                  onChange={(e) => updateField('transportType', e.target.value)}
                  disabled={isEdit}
                  className={errors.transportType ? inputErrorClass : inputClass}
                >
                  <option value="">{t('quotationCreate.errTransportType')}</option>
                  {TRANSPORT_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </option>
                  ))}
                </select>
              </FormField>

              {/* 有效期 */}
              <FormField label={t('quotation.colValidity')} required error={errors.validUntil}>
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
              {t('quotationDetail.routeInfo')}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label={t('quotationCreate.originCountry')}>
                <input
                  type="text"
                  value={form.originCountry}
                  onChange={(e) => updateField('originCountry', e.target.value)}
                  placeholder={t('placeholder.countryGermany')}
                  className={inputClass}
                />
              </FormField>

              <FormField label={t('quotationCreate.originCity')}>
                <input
                  type="text"
                  value={form.originCity}
                  onChange={(e) => updateField('originCity', e.target.value)}
                  placeholder={t('placeholder.cityMunich')}
                  className={inputClass}
                />
              </FormField>

              <FormField label={t('quotationCreate.destCountry')}>
                <input
                  type="text"
                  value={form.destCountry}
                  onChange={(e) => updateField('destCountry', e.target.value)}
                  placeholder={t('placeholder.countryPoland')}
                  className={inputClass}
                />
              </FormField>

              <FormField label={t('quotationCreate.destCity')}>
                <input
                  type="text"
                  value={form.destCity}
                  onChange={(e) => updateField('destCity', e.target.value)}
                  placeholder={t('placeholder.cityWarsaw')}
                  className={inputClass}
                />
              </FormField>
            </div>
          </div>

          {/* ---------- 逐票报价（本地派送三层单，开发意见 #7 第 2 步） ----------
               有派送票时整块替代下面的「基础运费/附加费/保险费」：
               这类单的价格天然是按票组成的，再让运营填一个基础运费只会两头对不上 */}
          {isPerDelivery && (
            <>
              <QuotationDeliveryLines
                orders={deliveryOrders}
                prices={deliveryPrices}
                onChange={setDeliveryPrices}
                currency={form.currency}
              />
              {errors.deliveryLines && (
                <p className="text-xs text-red-600 px-1">{errors.deliveryLines}</p>
              )}
            </>
          )}

          {/* ---------- 价格明细 ---------- */}
          <div className={`bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6${isPerDelivery ? ' hidden' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Banknote className="w-5 h-5 text-blue-600" />
                {t('quotationDetail.priceBreakdown')}
              </h2>
              <button
                onClick={handleAutoPrice}
                disabled={calculatingPrice}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-all duration-200 disabled:opacity-50"
              >
                {calculatingPrice ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Calculator className="w-3.5 h-3.5" />
                )}
                {t('quotationCreate.autoPricing')}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 基础运费 */}
              <FormField label={t('quotationDetail.baseFreight')} required error={errors.baseFreight}>
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
              <FormField label={t('quotationDetail.surcharge')}>
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
              <FormField label={t('quotationDetail.insuranceFee')}>
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
              <FormField label={t('common.currency')}>
                <select
                  value={form.currency}
                  onChange={(e) => updateField('currency', e.target.value)}
                  disabled={isEdit}
                  className={inputClass}
                >
                  {currencyOpts.map((c) => (
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
                <span className="text-sm font-medium text-slate-700">{t('quotationCreate.totalQuote')}</span>
                <span className="text-2xl font-bold text-blue-600">
                  {formatMoney(totalPrice, form.currency)}
                </span>
              </div>
            </div>
          </div>

          {/* ---------- 备注说明 ---------- */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              {t('quotationCreate.remarksSection')}
            </h2>
            <textarea
              value={form.remarks}
              onChange={(e) => updateField('remarks', e.target.value)}
              placeholder={t('quotationCreate.remarksPlaceholder')}
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
              {t('quotationCreate.saveDraft')}
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
              {t('quotationCreate.sendQuote')}
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
                {t('quotationCreate.summary')}
              </h2>

              <div className="space-y-4">
                {/* 客户 */}
                <div>
                  <p className="text-xs text-slate-400 font-medium">{t('common.client')}</p>
                  <p className="text-sm text-slate-900 mt-1 font-medium">
                    {selectedClientName || '-'}
                  </p>
                </div>

                {/* 业务类型 */}
                <div>
                  <p className="text-xs text-slate-400 font-medium">{t('field.businessType')}</p>
                  <p className="text-sm text-slate-900 mt-1">
                    {businessTypeLabel || '-'}
                  </p>
                </div>

                {/* 路线 */}
                <div>
                  <p className="text-xs text-slate-400 font-medium">{t('orderDetail.route')}</p>
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
                  <p className="text-xs text-slate-400 font-medium">{t('quotationCreate.totalPrice')}</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">
                    {formatMoney(totalPrice, form.currency)}
                  </p>
                </div>

                {/* 有效期 */}
                <div>
                  <p className="text-xs text-slate-400 font-medium">{t('quotation.colValidUntil')}</p>
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
                {t('quotationCreate.costBreakdown')}
              </h2>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">{t('quotationDetail.baseFreight')}</span>
                  <span className="text-sm text-slate-700">
                    {formatMoney(form.baseFreight, form.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">{t('quotationDetail.surcharge')}</span>
                  <span className="text-sm text-slate-700">
                    {formatMoney(form.surcharge, form.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">{t('quotationDetail.insuranceFee')}</span>
                  <span className="text-sm text-slate-700">
                    {formatMoney(form.insuranceFee, form.currency)}
                  </span>
                </div>
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{t('quotationDetail.total')}</span>
                  <span className="text-sm font-bold text-blue-600">
                    {formatMoney(totalPrice, form.currency)}
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
