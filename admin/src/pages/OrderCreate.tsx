/**
 * 新建订单页面
 * 支持两种业务类型：篷布车运输 / 集装箱物流
 * 左侧表单 (70%) + 右侧订单摘要 (30%)
 */

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Truck,
  Container,
  Send,
  Loader2,
  MapPin,
  Package,
  FileText,
  Euro,
  Ship,
  Box,
  ClipboardList,
  User,
  Phone,
  AlertCircle,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'

// ==================== 类型定义 ====================

type BusinessType = 'CURTAIN_SIDE' | 'CONTAINER'
type TransportType = 'FTL' | 'LTL'
type Currency = 'EUR' | 'GBP' | 'PLN'
type SpecialRequirement = '无' | '温控运输' | '危险品 ADR' | '超宽超重' | '需要尾板'
type ContainerType = '20GP' | '40GP' | '40HQ' | '45HQ'
type ReleaseMethod = 'TELEX' | 'ORIGINAL'
type ShippingLine = 'MSC' | 'Maersk' | 'CMA CGM' | 'Hapag-Lloyd' | 'COSCO' | 'Evergreen' | 'ONE'

// 客户数据
interface Client {
  id: string
  company_name: string
  client_code: string
}

// 地址
interface Address {
  country: string
  city: string
  zipCode: string
  address: string
}

// 篷布车运输表单
interface CurtainSideForm {
  clientId: string
  transportType: TransportType
  cargoDescription: string
  cargoWeightKg: string
  cargoVolumeM3: string
  cargoQuantity: string
  pickupCountry: string
  pickupCity: string
  pickupZipCode: string
  pickupAddress: string
  pickupDate: string
  pickupContact: string
  pickupPhone: string
  deliveryCountry: string
  deliveryCity: string
  deliveryZipCode: string
  deliveryAddress: string
  deliveryDate: string
  deliveryContact: string
  deliveryPhone: string
  specialRequirements: SpecialRequirement
  remarks: string
  clientPrice: string
  currency: Currency
}

// 集装箱物流表单
interface ContainerForm {
  clientId: string
  transportType: TransportType
  shippingLine: ShippingLine | ''
  blNumber: string
  eta: string
  cnee: string
  containerNo: string
  containerType: ContainerType | ''
  sealNo: string
  pod: string
  finalDestination: string
  finalDestAddress: string
  expectedDeliveryDate: string
  deliveryContact: string
  deliveryPhone: string
  releaseMethod: ReleaseMethod
  needsClearance: boolean
  remarks: string
  clientPrice: string
  currency: Currency
}

// ==================== 初始值 ====================

const initialCurtainSideForm: CurtainSideForm = {
  clientId: '',
  transportType: 'FTL',
  cargoDescription: '',
  cargoWeightKg: '',
  cargoVolumeM3: '',
  cargoQuantity: '',
  pickupCountry: 'Germany',
  pickupCity: '',
  pickupZipCode: '',
  pickupAddress: '',
  pickupDate: '',
  pickupContact: '',
  pickupPhone: '',
  deliveryCountry: '',
  deliveryCity: '',
  deliveryZipCode: '',
  deliveryAddress: '',
  deliveryDate: '',
  deliveryContact: '',
  deliveryPhone: '',
  specialRequirements: '无',
  remarks: '',
  clientPrice: '',
  currency: 'EUR',
}

const initialContainerForm: ContainerForm = {
  clientId: '',
  transportType: 'FTL',
  shippingLine: '',
  blNumber: '',
  eta: '',
  cnee: '',
  containerNo: '',
  containerType: '',
  sealNo: '',
  pod: '',
  finalDestination: '',
  finalDestAddress: '',
  expectedDeliveryDate: '',
  deliveryContact: '',
  deliveryPhone: '',
  releaseMethod: 'TELEX',
  needsClearance: false,
  remarks: '',
  clientPrice: '',
  currency: 'EUR',
}

// ==================== 常量选项 ====================

const EUROPEAN_COUNTRIES = [
  'Germany', 'France', 'Poland', 'Italy', 'Spain',
  'Netherlands', 'Belgium', 'Czech Republic', 'Austria', 'Hungary',
]

const SHIPPING_LINES: ShippingLine[] = [
  'MSC', 'Maersk', 'CMA CGM', 'Hapag-Lloyd', 'COSCO', 'Evergreen', 'ONE',
]

const CONTAINER_TYPES: ContainerType[] = ['20GP', '40GP', '40HQ', '45HQ']

const SPECIAL_REQUIREMENTS: SpecialRequirement[] = [
  '无', '温控运输', '危险品 ADR', '超宽超重', '需要尾板',
]

const CURRENCY_OPTIONS: { value: Currency; label: string }[] = [
  { value: 'EUR', label: 'EUR (欧元)' },
  { value: 'GBP', label: 'GBP (英镑)' },
  { value: 'PLN', label: 'PLN (兹罗提)' },
]

// ==================== 通用输入组件 ====================

// 表单标签
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-slate-700 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

// 文本输入
function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900
        placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
        transition-all duration-200 disabled:bg-slate-50 disabled:text-slate-400"
    />
  )
}

// 下拉选择
function SelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900
        focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
        transition-all duration-200"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

// 多行文本
function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900
        placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
        transition-all duration-200 resize-none"
    />
  )
}

// 分组标题
function SectionTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
      <Icon className="w-4 h-4 text-blue-500" />
      <h3 className="text-sm font-semibold text-slate-800">{children}</h3>
    </div>
  )
}

// ==================== 主组件 ====================

export default function OrderCreate() {
  const navigate = useNavigate()

  // 业务类型
  const [businessType, setBusinessType] = useState<BusinessType>('CURTAIN_SIDE')

  // 表单状态
  const [curtainForm, setCurtainForm] = useState<CurtainSideForm>(initialCurtainSideForm)
  const [containerForm, setContainerForm] = useState<ContainerForm>(initialContainerForm)

  // 客户列表
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)

  // 提交状态
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  // 生成预估订单号（前端展示用）
  const estimatedOrderNo = useMemo(() => {
    const prefix = businessType === 'CURTAIN_SIDE' ? 'CS' : 'CT'
    const date = new Date()
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
    return `${prefix}-${dateStr}-XXXX`
  }, [businessType])

  // 当前选中的客户名称
  const selectedClientName = useMemo(() => {
    const clientId = businessType === 'CURTAIN_SIDE' ? curtainForm.clientId : containerForm.clientId
    const found = clients.find((c) => c.id === clientId)
    return found ? found.company_name : ''
  }, [businessType, curtainForm.clientId, containerForm.clientId, clients])

  // ==================== 数据加载 ====================

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    setClientsLoading(true)
    try {
      const res = await api.get<ApiResponse<Client[]>>('/clients?pageSize=100')
      if (res.code === 200 && Array.isArray(res.data)) {
        setClients(res.data)
      }
    } catch (err) {
      console.error('加载客户列表失败:', err)
    } finally {
      setClientsLoading(false)
    }
  }

  // ==================== 表单更新辅助 ====================

  function updateCurtain<K extends keyof CurtainSideForm>(key: K, value: CurtainSideForm[K]) {
    setCurtainForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateContainer<K extends keyof ContainerForm>(key: K, value: ContainerForm[K]) {
    setContainerForm((prev) => ({ ...prev, [key]: value }))
  }

  // ==================== 表单验证 ====================

  function validateCurtainSide(): string[] {
    const errs: string[] = []
    if (!curtainForm.clientId) errs.push('请选择客户')
    if (!curtainForm.cargoDescription.trim()) errs.push('请填写货物描述')
    if (!curtainForm.cargoWeightKg || Number(curtainForm.cargoWeightKg) <= 0) errs.push('请填写有效的货物重量')
    if (!curtainForm.cargoQuantity || Number(curtainForm.cargoQuantity) <= 0) errs.push('请填写有效的货物数量')
    if (!curtainForm.pickupCountry) errs.push('请选择装货国家')
    if (!curtainForm.pickupCity.trim()) errs.push('请填写装货城市')
    if (!curtainForm.pickupZipCode.trim()) errs.push('请填写装货邮编')
    if (!curtainForm.pickupAddress.trim()) errs.push('请填写装货详细地址')
    if (!curtainForm.pickupDate) errs.push('请选择装货日期')
    if (!curtainForm.deliveryCountry) errs.push('请选择卸货国家')
    if (!curtainForm.deliveryCity.trim()) errs.push('请填写卸货城市')
    if (!curtainForm.deliveryZipCode.trim()) errs.push('请填写卸货邮编')
    if (!curtainForm.deliveryAddress.trim()) errs.push('请填写卸货详细地址')
    if (!curtainForm.deliveryDate) errs.push('请选择到达日期')
    return errs
  }

  function validateContainer(): string[] {
    const errs: string[] = []
    if (!containerForm.clientId) errs.push('请选择客户')
    if (!containerForm.shippingLine) errs.push('请选择船司')
    if (!containerForm.blNumber.trim()) errs.push('请填写提单号')
    if (!containerForm.eta) errs.push('请选择 ETA')
    if (!containerForm.cnee.trim()) errs.push('请填写收货人 (CNEE)')
    if (!containerForm.containerNo.trim()) errs.push('请填写柜号')
    if (!containerForm.containerType) errs.push('请选择柜型')
    if (!containerForm.pod.trim()) errs.push('请填写卸港')
    if (!containerForm.finalDestination.trim()) errs.push('请填写最终目的地')
    if (!containerForm.finalDestAddress.trim()) errs.push('请填写最终目的地详细地址')
    if (!containerForm.expectedDeliveryDate) errs.push('请选择期望送仓时间')
    return errs
  }

  // ==================== 提交 ====================

  async function handleSubmit() {
    setErrors([])
    const validationErrors = businessType === 'CURTAIN_SIDE' ? validateCurtainSide() : validateContainer()
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      // 滚动到错误区域
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setSubmitting(true)
    try {
      let payload: Record<string, unknown>

      if (businessType === 'CURTAIN_SIDE') {
        const f = curtainForm
        payload = {
          clientId: f.clientId,
          businessType: 'CURTAIN_SIDE',
          transportType: f.transportType,
          cargoDescription: f.cargoDescription,
          cargoWeightKg: Number(f.cargoWeightKg),
          cargoVolumeM3: f.cargoVolumeM3 ? Number(f.cargoVolumeM3) : null,
          cargoQuantity: Number(f.cargoQuantity),
          pickupAddress: {
            country: f.pickupCountry,
            city: f.pickupCity,
            zipCode: f.pickupZipCode,
            address: f.pickupAddress,
          } as Address,
          deliveryAddress: {
            country: f.deliveryCountry,
            city: f.deliveryCity,
            zipCode: f.deliveryZipCode,
            address: f.deliveryAddress,
          } as Address,
          pickupDate: f.pickupDate,
          deliveryDate: f.deliveryDate,
          pickupContact: f.pickupContact || null,
          pickupPhone: f.pickupPhone || null,
          deliveryContact: f.deliveryContact || null,
          deliveryPhone: f.deliveryPhone || null,
          specialRequirements: f.specialRequirements,
          remarks: f.remarks || null,
          clientPrice: f.clientPrice ? Number(f.clientPrice) : null,
          currency: f.currency,
        }
      } else {
        const f = containerForm
        payload = {
          clientId: f.clientId,
          businessType: 'CONTAINER',
          transportType: f.transportType,
          shippingLine: f.shippingLine,
          blNumber: f.blNumber,
          eta: f.eta,
          cnee: f.cnee,
          containerNo: f.containerNo,
          containerType: f.containerType,
          sealNo: f.sealNo || null,
          pod: f.pod,
          finalDestination: f.finalDestination,
          finalDestAddress: f.finalDestAddress,
          expectedDeliveryDate: f.expectedDeliveryDate,
          deliveryContact: f.deliveryContact || null,
          deliveryPhone: f.deliveryPhone || null,
          releaseMethod: f.releaseMethod,
          needsClearance: f.needsClearance,
          remarks: f.remarks || null,
          clientPrice: f.clientPrice ? Number(f.clientPrice) : null,
          currency: f.currency,
        }
      }

      const res = await api.post<ApiResponse>('/orders', payload)
      if (res.code === 200 || res.code === 201) {
        alert('订单创建成功！')
        navigate('/orders')
      } else {
        setErrors([res.message || '创建失败，请重试'])
      }
    } catch (err: any) {
      console.error('创建订单失败:', err)
      setErrors([err.message || '网络错误，请检查连接后重试'])
    } finally {
      setSubmitting(false)
    }
  }

  // ==================== 客户选项列表 ====================

  const clientOptions = clients.map((c) => ({
    value: c.id,
    label: `${c.company_name} (${c.client_code})`,
  }))

  // ==================== 渲染 ====================

  return (
    <div className="p-4 lg:p-6 min-h-screen bg-slate-50/50">
      {/* 顶部：返回 + 标题 */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/orders')}
          className="p-2 rounded-xl hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-200"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h1 className="text-xl font-semibold text-slate-900">新建订单</h1>
      </div>

      {/* 业务类型选择 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <button
          onClick={() => setBusinessType('CURTAIN_SIDE')}
          className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-200
            ${businessType === 'CURTAIN_SIDE'
              ? 'border-blue-500 bg-blue-50/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'
              : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]'
            }`}
        >
          <div className={`p-3 rounded-xl ${businessType === 'CURTAIN_SIDE' ? 'bg-blue-100' : 'bg-slate-100'}`}>
            <Truck className={`w-6 h-6 ${businessType === 'CURTAIN_SIDE' ? 'text-blue-600' : 'text-slate-500'}`} />
          </div>
          <div className="text-left">
            <div className={`font-semibold ${businessType === 'CURTAIN_SIDE' ? 'text-blue-700' : 'text-slate-800'}`}>
              篷布车运输
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Curtain Side Transport</div>
          </div>
        </button>

        <button
          onClick={() => setBusinessType('CONTAINER')}
          className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-200
            ${businessType === 'CONTAINER'
              ? 'border-blue-500 bg-blue-50/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'
              : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]'
            }`}
        >
          <div className={`p-3 rounded-xl ${businessType === 'CONTAINER' ? 'bg-blue-100' : 'bg-slate-100'}`}>
            <Container className={`w-6 h-6 ${businessType === 'CONTAINER' ? 'text-blue-600' : 'text-slate-500'}`} />
          </div>
          <div className="text-left">
            <div className={`font-semibold ${businessType === 'CONTAINER' ? 'text-blue-700' : 'text-slate-800'}`}>
              集装箱物流
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Container Logistics</div>
          </div>
        </button>
      </div>

      {/* 错误提示 */}
      {errors.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700 mb-1">请修正以下问题：</p>
              <ul className="text-sm text-red-600 space-y-0.5">
                {errors.map((e, i) => (
                  <li key={i}>- {e}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 主内容：左侧表单 + 右侧摘要 */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* 左侧表单 */}
        <div className="flex-1 lg:w-[70%] space-y-6">
          {businessType === 'CURTAIN_SIDE' ? (
            <CurtainSideFormSection
              form={curtainForm}
              onUpdate={updateCurtain}
              clientOptions={clientOptions}
              clientsLoading={clientsLoading}
            />
          ) : (
            <ContainerFormSection
              form={containerForm}
              onUpdate={updateContainer}
              clientOptions={clientOptions}
              clientsLoading={clientsLoading}
            />
          )}
        </div>

        {/* 右侧摘要 */}
        <div className="lg:w-[30%]">
          <div className="sticky top-6">
            <OrderSummary
              businessType={businessType}
              estimatedOrderNo={estimatedOrderNo}
              clientName={selectedClientName}
              curtainForm={curtainForm}
              containerForm={containerForm}
            />
          </div>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="flex items-center justify-end gap-4 mt-8 pt-6 border-t border-slate-200">
        <button
          onClick={() => navigate('/orders')}
          disabled={submitting}
          className="px-6 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600
            hover:bg-slate-50 transition-all duration-200 disabled:opacity-50"
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium
            hover:bg-blue-700 shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              提交中...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              提交订单
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ==================== 篷布车运输表单 ====================

function CurtainSideFormSection({
  form,
  onUpdate,
  clientOptions,
  clientsLoading,
}: {
  form: CurtainSideForm
  onUpdate: <K extends keyof CurtainSideForm>(key: K, value: CurtainSideForm[K]) => void
  clientOptions: { value: string; label: string }[]
  clientsLoading: boolean
}) {
  const countryOptions = EUROPEAN_COUNTRIES.map((c) => ({ value: c, label: c }))

  return (
    <>
      {/* 基本信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={Package}>基本信息</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>客户</Label>
            <SelectInput
              value={form.clientId}
              onChange={(v) => onUpdate('clientId', v)}
              options={clientOptions}
              placeholder={clientsLoading ? '加载中...' : '请选择客户'}
            />
          </div>
          <div>
            <Label required>运输类型</Label>
            <SelectInput
              value={form.transportType}
              onChange={(v) => onUpdate('transportType', v as TransportType)}
              options={[
                { value: 'FTL', label: 'FTL 整车' },
                { value: 'LTL', label: 'LTL 拼车' },
              ]}
            />
          </div>
          <div className="sm:col-span-2">
            <Label required>货物描述</Label>
            <TextInput
              value={form.cargoDescription}
              onChange={(v) => onUpdate('cargoDescription', v)}
              placeholder="例如：机械零件、电子产品等"
            />
          </div>
          <div>
            <Label required>货物重量 (kg)</Label>
            <TextInput
              value={form.cargoWeightKg}
              onChange={(v) => onUpdate('cargoWeightKg', v)}
              type="number"
              placeholder="例如：12000"
            />
          </div>
          <div>
            <Label>货物体积 (m³)</Label>
            <TextInput
              value={form.cargoVolumeM3}
              onChange={(v) => onUpdate('cargoVolumeM3', v)}
              type="number"
              placeholder="例如：35"
            />
          </div>
          <div>
            <Label required>货物数量</Label>
            <TextInput
              value={form.cargoQuantity}
              onChange={(v) => onUpdate('cargoQuantity', v)}
              type="number"
              placeholder="例如：24"
            />
          </div>
        </div>
      </div>

      {/* 装货信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={MapPin}>装货信息</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>国家</Label>
            <SelectInput
              value={form.pickupCountry}
              onChange={(v) => onUpdate('pickupCountry', v)}
              options={countryOptions}
              placeholder="请选择国家"
            />
          </div>
          <div>
            <Label required>城市</Label>
            <TextInput
              value={form.pickupCity}
              onChange={(v) => onUpdate('pickupCity', v)}
              placeholder="例如：Munich"
            />
          </div>
          <div>
            <Label required>邮编</Label>
            <TextInput
              value={form.pickupZipCode}
              onChange={(v) => onUpdate('pickupZipCode', v)}
              placeholder="例如：80331"
            />
          </div>
          <div>
            <Label required>装货日期</Label>
            <TextInput
              value={form.pickupDate}
              onChange={(v) => onUpdate('pickupDate', v)}
              type="date"
            />
          </div>
          <div className="sm:col-span-2">
            <Label required>详细地址</Label>
            <TextInput
              value={form.pickupAddress}
              onChange={(v) => onUpdate('pickupAddress', v)}
              placeholder="街道、门牌号等"
            />
          </div>
          <div>
            <Label>联系人</Label>
            <TextInput
              value={form.pickupContact}
              onChange={(v) => onUpdate('pickupContact', v)}
              placeholder="装货联系人"
            />
          </div>
          <div>
            <Label>联系电话</Label>
            <TextInput
              value={form.pickupPhone}
              onChange={(v) => onUpdate('pickupPhone', v)}
              placeholder="+49 xxx xxx"
            />
          </div>
        </div>
      </div>

      {/* 卸货信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={MapPin}>卸货信息</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>国家</Label>
            <SelectInput
              value={form.deliveryCountry}
              onChange={(v) => onUpdate('deliveryCountry', v)}
              options={countryOptions}
              placeholder="请选择国家"
            />
          </div>
          <div>
            <Label required>城市</Label>
            <TextInput
              value={form.deliveryCity}
              onChange={(v) => onUpdate('deliveryCity', v)}
              placeholder="例如：Warsaw"
            />
          </div>
          <div>
            <Label required>邮编</Label>
            <TextInput
              value={form.deliveryZipCode}
              onChange={(v) => onUpdate('deliveryZipCode', v)}
              placeholder="例如：00-001"
            />
          </div>
          <div>
            <Label required>到达日期</Label>
            <TextInput
              value={form.deliveryDate}
              onChange={(v) => onUpdate('deliveryDate', v)}
              type="date"
            />
          </div>
          <div className="sm:col-span-2">
            <Label required>详细地址</Label>
            <TextInput
              value={form.deliveryAddress}
              onChange={(v) => onUpdate('deliveryAddress', v)}
              placeholder="街道、门牌号等"
            />
          </div>
          <div>
            <Label>联系人</Label>
            <TextInput
              value={form.deliveryContact}
              onChange={(v) => onUpdate('deliveryContact', v)}
              placeholder="卸货联系人"
            />
          </div>
          <div>
            <Label>联系电话</Label>
            <TextInput
              value={form.deliveryPhone}
              onChange={(v) => onUpdate('deliveryPhone', v)}
              placeholder="+48 xxx xxx"
            />
          </div>
        </div>
      </div>

      {/* 特殊要求 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={ClipboardList}>特殊要求</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>特殊要求</Label>
            <SelectInput
              value={form.specialRequirements}
              onChange={(v) => onUpdate('specialRequirements', v as SpecialRequirement)}
              options={SPECIAL_REQUIREMENTS.map((r) => ({ value: r, label: r }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>备注</Label>
            <TextArea
              value={form.remarks}
              onChange={(v) => onUpdate('remarks', v)}
              placeholder="其他特殊说明..."
            />
          </div>
        </div>
      </div>

      {/* 报价信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={Euro}>报价信息</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>客户报价</Label>
            <TextInput
              value={form.clientPrice}
              onChange={(v) => onUpdate('clientPrice', v)}
              type="number"
              placeholder="例如：3500"
            />
          </div>
          <div>
            <Label>币种</Label>
            <SelectInput
              value={form.currency}
              onChange={(v) => onUpdate('currency', v as Currency)}
              options={CURRENCY_OPTIONS}
            />
          </div>
        </div>
      </div>
    </>
  )
}

// ==================== 集装箱物流表单 ====================

function ContainerFormSection({
  form,
  onUpdate,
  clientOptions,
  clientsLoading,
}: {
  form: ContainerForm
  onUpdate: <K extends keyof ContainerForm>(key: K, value: ContainerForm[K]) => void
  clientOptions: { value: string; label: string }[]
  clientsLoading: boolean
}) {
  return (
    <>
      {/* 基本信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={Package}>基本信息</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>客户</Label>
            <SelectInput
              value={form.clientId}
              onChange={(v) => onUpdate('clientId', v)}
              options={clientOptions}
              placeholder={clientsLoading ? '加载中...' : '请选择客户'}
            />
          </div>
          <div>
            <Label required>运输类型</Label>
            <SelectInput
              value={form.transportType}
              onChange={(v) => onUpdate('transportType', v as TransportType)}
              options={[
                { value: 'FTL', label: 'FTL 整车' },
                { value: 'LTL', label: 'LTL 拼车' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* 航运信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={Ship}>航运信息</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>船司</Label>
            <SelectInput
              value={form.shippingLine}
              onChange={(v) => onUpdate('shippingLine', v as ShippingLine)}
              options={SHIPPING_LINES.map((s) => ({ value: s, label: s }))}
              placeholder="请选择船司"
            />
          </div>
          <div>
            <Label required>提单号</Label>
            <TextInput
              value={form.blNumber}
              onChange={(v) => onUpdate('blNumber', v)}
              placeholder="例如：MSCU1234567"
            />
          </div>
          <div>
            <Label required>ETA</Label>
            <TextInput
              value={form.eta}
              onChange={(v) => onUpdate('eta', v)}
              type="datetime-local"
            />
          </div>
          <div>
            <Label required>CNEE (收货人)</Label>
            <TextInput
              value={form.cnee}
              onChange={(v) => onUpdate('cnee', v)}
              placeholder="例如：BMW AG"
            />
          </div>
        </div>
      </div>

      {/* 集装箱信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={Box}>集装箱信息</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>柜号</Label>
            <TextInput
              value={form.containerNo}
              onChange={(v) => onUpdate('containerNo', v)}
              placeholder="例如：MSCU1234567"
            />
          </div>
          <div>
            <Label required>柜型</Label>
            <SelectInput
              value={form.containerType}
              onChange={(v) => onUpdate('containerType', v as ContainerType)}
              options={CONTAINER_TYPES.map((t) => ({ value: t, label: t }))}
              placeholder="请选择柜型"
            />
          </div>
          <div>
            <Label>封号</Label>
            <TextInput
              value={form.sealNo}
              onChange={(v) => onUpdate('sealNo', v)}
              placeholder="例如：SL123"
            />
          </div>
        </div>
      </div>

      {/* 港口与配送信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={MapPin}>港口与配送信息</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>卸港</Label>
            <TextInput
              value={form.pod}
              onChange={(v) => onUpdate('pod', v)}
              placeholder="例如：Hamburg"
            />
          </div>
          <div>
            <Label required>最终目的地</Label>
            <TextInput
              value={form.finalDestination}
              onChange={(v) => onUpdate('finalDestination', v)}
              placeholder="例如：Munich"
            />
          </div>
          <div className="sm:col-span-2">
            <Label required>最终目的地详细地址</Label>
            <TextInput
              value={form.finalDestAddress}
              onChange={(v) => onUpdate('finalDestAddress', v)}
              placeholder="例如：BMW Werk 1, Munich"
            />
          </div>
          <div>
            <Label required>期望送仓时间</Label>
            <TextInput
              value={form.expectedDeliveryDate}
              onChange={(v) => onUpdate('expectedDeliveryDate', v)}
              type="date"
            />
          </div>
          <div>
            <Label>联系人</Label>
            <TextInput
              value={form.deliveryContact}
              onChange={(v) => onUpdate('deliveryContact', v)}
              placeholder="收货联系人"
            />
          </div>
          <div>
            <Label>联系电话</Label>
            <TextInput
              value={form.deliveryPhone}
              onChange={(v) => onUpdate('deliveryPhone', v)}
              placeholder="+49 xxx xxx"
            />
          </div>
        </div>
      </div>

      {/* 放单信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={FileText}>放单信息</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>放单方式</Label>
            <SelectInput
              value={form.releaseMethod}
              onChange={(v) => onUpdate('releaseMethod', v as ReleaseMethod)}
              options={[
                { value: 'TELEX', label: '电放 Telex Release' },
                { value: 'ORIGINAL', label: '正本提单 Original B/L' },
              ]}
            />
          </div>
          <div>
            <Label>是否需要清关</Label>
            <SelectInput
              value={form.needsClearance ? '是' : '否'}
              onChange={(v) => onUpdate('needsClearance', v === '是')}
              options={[
                { value: '是', label: '是' },
                { value: '否', label: '否' },
              ]}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>备注</Label>
            <TextArea
              value={form.remarks}
              onChange={(v) => onUpdate('remarks', v)}
              placeholder="其他特殊说明..."
            />
          </div>
        </div>
      </div>

      {/* 报价信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={Euro}>报价信息</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>客户报价</Label>
            <TextInput
              value={form.clientPrice}
              onChange={(v) => onUpdate('clientPrice', v)}
              type="number"
              placeholder="例如：3500"
            />
          </div>
          <div>
            <Label>币种</Label>
            <SelectInput
              value={form.currency}
              onChange={(v) => onUpdate('currency', v as Currency)}
              options={CURRENCY_OPTIONS}
            />
          </div>
        </div>
      </div>
    </>
  )
}

// ==================== 右侧订单摘要 ====================

function OrderSummary({
  businessType,
  estimatedOrderNo,
  clientName,
  curtainForm,
  containerForm,
}: {
  businessType: BusinessType
  estimatedOrderNo: string
  clientName: string
  curtainForm: CurtainSideForm
  containerForm: ContainerForm
}) {
  // 根据业务类型展示不同摘要
  const isCurtain = businessType === 'CURTAIN_SIDE'

  // 路线信息
  let routeFrom = ''
  let routeTo = ''
  if (isCurtain) {
    routeFrom = [curtainForm.pickupCity, curtainForm.pickupCountry].filter(Boolean).join(', ')
    routeTo = [curtainForm.deliveryCity, curtainForm.deliveryCountry].filter(Boolean).join(', ')
  } else {
    routeFrom = containerForm.pod || ''
    routeTo = containerForm.finalDestination || ''
  }

  // 价格
  const price = isCurtain ? curtainForm.clientPrice : containerForm.clientPrice
  const currency = isCurtain ? curtainForm.currency : containerForm.currency

  return (
    <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">订单摘要</h3>

      <div className="space-y-4">
        {/* 预估订单号 */}
        <SummaryItem label="预估订单号" value={estimatedOrderNo} />

        {/* 业务类型 */}
        <SummaryItem
          label="业务类型"
          value={
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium
              ${isCurtain ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}
            >
              {isCurtain ? (
                <><Truck className="w-3 h-3" /> 篷布车运输</>
              ) : (
                <><Container className="w-3 h-3" /> 集装箱物流</>
              )}
            </span>
          }
        />

        {/* 客户 */}
        <SummaryItem
          label="客户"
          value={clientName || <span className="text-slate-400 italic">未选择</span>}
        />

        {/* 运输类型 */}
        <SummaryItem
          label="运输类型"
          value={
            (isCurtain ? curtainForm.transportType : containerForm.transportType) === 'FTL'
              ? 'FTL 整车'
              : 'LTL 拼车'
          }
        />

        {/* 分隔线 */}
        <div className="border-t border-slate-100" />

        {/* 路线 */}
        <div>
          <span className="text-xs text-slate-500">路线</span>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span className="text-slate-800 font-medium">{routeFrom || '—'}</span>
            <span className="text-slate-400">→</span>
            <span className="text-slate-800 font-medium">{routeTo || '—'}</span>
          </div>
        </div>

        {/* 篷布车特有信息 */}
        {isCurtain && (
          <>
            <SummaryItem
              label="重量"
              value={curtainForm.cargoWeightKg ? `${curtainForm.cargoWeightKg} kg` : '—'}
            />
            <SummaryItem
              label="体积"
              value={curtainForm.cargoVolumeM3 ? `${curtainForm.cargoVolumeM3} m³` : '—'}
            />
          </>
        )}

        {/* 集装箱特有信息 */}
        {!isCurtain && (
          <>
            <SummaryItem label="船司" value={containerForm.shippingLine || '—'} />
            <SummaryItem label="柜型" value={containerForm.containerType || '—'} />
            <SummaryItem label="柜号" value={containerForm.containerNo || '—'} />
          </>
        )}

        {/* 分隔线 */}
        <div className="border-t border-slate-100" />

        {/* 报价 */}
        <div>
          <span className="text-xs text-slate-500">客户报价</span>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {price ? (
              <>{currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : 'zł'} {Number(price).toLocaleString()}</>
            ) : (
              <span className="text-slate-400 text-sm font-normal">未填写</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// 摘要中的单行信息
function SummaryItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-xs text-slate-500">{label}</span>
      <div className="mt-0.5 text-sm text-slate-800">{value}</div>
    </div>
  )
}
