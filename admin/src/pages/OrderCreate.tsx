/**
 * 新建订单页面
 * 支持三种业务类型：卡车派送 LTL / 卡车运输 FTL / 本地派送
 * 左侧表单 (70%) + 右侧订单摘要 (30%)
 * 本地派送复用卡车表单（隐藏运输类型子字段），FTL 用集装箱表单
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
  CheckCircle,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import { useTranslation } from 'react-i18next'
import { useMasterDataOptions } from '../hooks/useMasterDataOptions'
import {
  BUSINESS_TYPES,
  type BusinessType,
  businessTypeLabelKey,
  businessTypeDescKey,
} from '../constants/businessTypes'

// ==================== 类型定义 ====================

type TransportType = 'FTL' | 'LTL'
type ReleaseMethod = 'TELEX' | 'ORIGINAL'

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

// 卡车运输表单（LTL 和本地派送共用；本地派送不用 transportType）
interface TruckForm {
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
  specialRequirements: string
  remarks: string
  clientPrice: string
  currency: string
}

// 集装箱物流表单
interface ContainerForm {
  clientId: string
  transportType: TransportType
  shippingLine: string
  blNumber: string
  eta: string
  cnee: string
  containerNo: string
  containerType: string
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
  currency: string
}

// ==================== 初始值 ====================

const initialTruckForm: TruckForm = {
  clientId: '',
  transportType: 'LTL',
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
  // 迁移 120 起存的是 code，不再是中文名
  specialRequirements: 'NONE',
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
  const { t } = useTranslation()

  // 基础数据选项（从数据库加载）
  const { options: countryOptions } = useMasterDataOptions('countries')
  const { options: shippingLineOptions } = useMasterDataOptions('shipping-lines')
  const { options: containerTypeOptions } = useMasterDataOptions('container-types')
  const { options: specialReqOptions } = useMasterDataOptions('special-requirements')
  const { options: currencyOptions } = useMasterDataOptions('currencies')

  // 业务类型
  const [businessType, setBusinessType] = useState<BusinessType>(BUSINESS_TYPES.TRUCK_LTL)

  // 表单状态
  const [truckForm, setTruckForm] = useState<TruckForm>(initialTruckForm)
  const [containerForm, setContainerForm] = useState<ContainerForm>(initialContainerForm)

  // 客户列表
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)

  // 提交状态
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [success, setSuccess] = useState(false)

  // 生成预估订单号（前端展示用）
  const estimatedOrderNo = useMemo(() => {
    const prefixMap: Record<BusinessType, string> = {
      TRUCK_LTL: 'CS', TRUCK_FTL: 'CT', LOCAL_DELIVERY: 'LD',
    }
    const date = new Date()
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
    return `${prefixMap[businessType]}-${dateStr}-XXXX`
  }, [businessType])

  // 当前选中的客户名称
  const selectedClientName = useMemo(() => {
    const clientId = businessType === BUSINESS_TYPES.TRUCK_FTL ? containerForm.clientId : truckForm.clientId
    const found = clients.find((c) => c.id === clientId)
    return found ? found.company_name : ''
  }, [businessType, truckForm.clientId, containerForm.clientId, clients])

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

  function updateTruck<K extends keyof TruckForm>(key: K, value: TruckForm[K]) {
    setTruckForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateContainer<K extends keyof ContainerForm>(key: K, value: ContainerForm[K]) {
    setContainerForm((prev) => ({ ...prev, [key]: value }))
  }

  // ==================== 表单验证 ====================

  function validateTruck(): string[] {
    const errs: string[] = []
    if (!truckForm.clientId) errs.push(t('placeholder.selectClient'))
    if (!truckForm.cargoDescription.trim()) errs.push(t('orderForm.errCargoDescRequired'))
    if (!truckForm.cargoWeightKg || Number(truckForm.cargoWeightKg) <= 0) errs.push(t('orderForm.errWeightInvalid'))
    if (!truckForm.cargoQuantity || Number(truckForm.cargoQuantity) <= 0) errs.push(t('orderForm.errQuantityInvalid'))
    if (!truckForm.pickupCountry) errs.push(t('orderForm.errPickupCountryRequired'))
    if (!truckForm.pickupCity.trim()) errs.push(t('orderForm.errPickupCityRequired'))
    if (!truckForm.pickupZipCode.trim()) errs.push(t('orderForm.errPickupZipRequired'))
    if (!truckForm.pickupAddress.trim()) errs.push(t('orderForm.errPickupAddressRequired'))
    if (!truckForm.pickupDate) errs.push(t('orderForm.errPickupDateRequired'))
    if (!truckForm.deliveryCountry) errs.push(t('orderForm.errDeliveryCountryRequired'))
    if (!truckForm.deliveryCity.trim()) errs.push(t('orderForm.errDeliveryCityRequired'))
    if (!truckForm.deliveryZipCode.trim()) errs.push(t('orderForm.errDeliveryZipRequired'))
    if (!truckForm.deliveryAddress.trim()) errs.push(t('orderForm.errDeliveryAddressRequired'))
    if (!truckForm.deliveryDate) errs.push(t('orderForm.errDeliveryDateRequired'))
    return errs
  }

  function validateContainer(): string[] {
    const errs: string[] = []
    if (!containerForm.clientId) errs.push(t('placeholder.selectClient'))
    if (!containerForm.shippingLine) errs.push(t('placeholder.selectShippingLine'))
    if (!containerForm.blNumber.trim()) errs.push(t('orderForm.errBlNumberRequired'))
    if (!containerForm.eta) errs.push(t('orderForm.errEtaRequired'))
    if (!containerForm.cnee.trim()) errs.push(t('orderForm.errCneeRequired'))
    if (!containerForm.containerNo.trim()) errs.push(t('orderForm.errContainerNoRequired'))
    if (!containerForm.containerType) errs.push(t('placeholder.selectContainerType'))
    if (!containerForm.pod.trim()) errs.push(t('orderForm.errPodRequired'))
    if (!containerForm.finalDestination.trim()) errs.push(t('orderForm.errFinalDestRequired'))
    if (!containerForm.finalDestAddress.trim()) errs.push(t('orderForm.errFinalDestAddressRequired'))
    if (!containerForm.expectedDeliveryDate) errs.push(t('orderForm.errExpectedDeliveryRequired'))
    return errs
  }

  // ==================== 提交 ====================

  async function handleSubmit() {
    setErrors([])
    const validationErrors = businessType === BUSINESS_TYPES.TRUCK_FTL ? validateContainer() : validateTruck()
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      // 滚动到错误区域
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setSubmitting(true)
    try {
      let payload: Record<string, unknown>

      if (businessType !== BUSINESS_TYPES.TRUCK_FTL) {
        // 卡车派送 LTL 和本地派送共用一套表单；本地派送没有运输类型子字段
        const f = truckForm
        payload = {
          clientId: f.clientId,
          businessType,
          transportType: businessType === BUSINESS_TYPES.LOCAL_DELIVERY ? null : f.transportType,
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
          businessType: BUSINESS_TYPES.TRUCK_FTL,
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
        setSuccess(true)
        setTimeout(() => navigate('/orders'), 1500)
      } else {
        setErrors([res.message || t('orderForm.createFailed')])
      }
    } catch (err: any) {
      console.error('创建订单失败:', err)
      setErrors([err.message || t('orderForm.networkError')])
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
        <h1 className="text-xl font-semibold text-slate-900">{t('order.create')}</h1>
      </div>

      {/* 业务类型选择 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {([
          { key: BUSINESS_TYPES.TRUCK_LTL, icon: Truck },
          { key: BUSINESS_TYPES.TRUCK_FTL, icon: Container },
          { key: BUSINESS_TYPES.LOCAL_DELIVERY, icon: MapPin },
        ] as { key: BusinessType; icon: React.ElementType }[]).map(({ key, icon: Icon }) => {
          const isActive = businessType === key
          return (
            <button
              key={key}
              onClick={() => setBusinessType(key)}
              className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-200
                ${isActive
                  ? 'border-blue-500 bg-blue-50/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'
                  : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]'
                }`}
            >
              <div className={`p-3 rounded-xl ${isActive ? 'bg-blue-100' : 'bg-slate-100'}`}>
                <Icon className={`w-6 h-6 ${isActive ? 'text-blue-600' : 'text-slate-500'}`} />
              </div>
              <div className="text-left">
                <div className={`font-semibold ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>
                  {t(businessTypeLabelKey(key))}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{t(businessTypeDescKey(key))}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* 成功提示 */}
      {success && (
        <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
            <p className="text-sm font-medium text-green-700">{t('orderForm.createSuccess')}</p>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {errors.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700 mb-1">{t('orderForm.fixIssues')}</p>
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
          {businessType === BUSINESS_TYPES.TRUCK_FTL ? (
            <ContainerFormSection
              form={containerForm}
              onUpdate={updateContainer}
              clientOptions={clientOptions}
              clientsLoading={clientsLoading}
            />
          ) : (
            <TruckFormSection
              form={truckForm}
              onUpdate={updateTruck}
              clientOptions={clientOptions}
              clientsLoading={clientsLoading}
              isLocalDelivery={businessType === BUSINESS_TYPES.LOCAL_DELIVERY}
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
              truckForm={truckForm}
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
          {t('common.cancel')}
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
              {t('common.submitting')}
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              {t('orderForm.submitOrder')}
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ==================== 卡车运输表单（LTL 和本地派送共用） ====================

function TruckFormSection({
  form,
  onUpdate,
  clientOptions,
  clientsLoading,
  isLocalDelivery,
}: {
  form: TruckForm
  onUpdate: <K extends keyof TruckForm>(key: K, value: TruckForm[K]) => void
  clientOptions: { value: string; label: string }[]
  clientsLoading: boolean
  isLocalDelivery?: boolean
}) {
  const { t } = useTranslation()
  const { options: countryOpts } = useMasterDataOptions('countries')
  const { options: specialReqOpts } = useMasterDataOptions('special-requirements')
  const { options: currencyOpts } = useMasterDataOptions('currencies')
  const countryOptions = countryOpts.map(o => ({ value: o.value, label: o.value }))

  return (
    <>
      {/* 基本信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={Package}>{t('section.basicInfo')}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>{t('common.client')}</Label>
            <SelectInput
              value={form.clientId}
              onChange={(v) => onUpdate('clientId', v)}
              options={clientOptions}
              placeholder={clientsLoading ? t('common.loading') : t('placeholder.selectClient')}
            />
          </div>
          {/* 本地派送没有 FTL/LTL 之分 */}
          {!isLocalDelivery && (
            <div>
              <Label required>{t('field.transportType')}</Label>
              <SelectInput
                value={form.transportType}
                onChange={(v) => onUpdate('transportType', v as TransportType)}
                options={[
                  { value: 'FTL', label: t('transportType.FTL') },
                  { value: 'LTL', label: t('transportType.LTL') },
                ]}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <Label required>{t('field.cargoDescription')}</Label>
            <TextInput
              value={form.cargoDescription}
              onChange={(v) => onUpdate('cargoDescription', v)}
              placeholder={t('placeholder.cargoDescriptionEg')}
            />
          </div>
          <div>
            <Label required>{t('field.cargoWeightKg')}</Label>
            <TextInput
              value={form.cargoWeightKg}
              onChange={(v) => onUpdate('cargoWeightKg', v)}
              type="number"
              placeholder={t('placeholder.weightEg')}
            />
          </div>
          <div>
            <Label>{t('field.cargoVolumeM3')}</Label>
            <TextInput
              value={form.cargoVolumeM3}
              onChange={(v) => onUpdate('cargoVolumeM3', v)}
              type="number"
              placeholder={t('placeholder.volumeEg')}
            />
          </div>
          <div>
            <Label required>{t('field.cargoQuantity')}</Label>
            <TextInput
              value={form.cargoQuantity}
              onChange={(v) => onUpdate('cargoQuantity', v)}
              type="number"
              placeholder={t('placeholder.quantityEg')}
            />
          </div>
        </div>
      </div>

      {/* 装货信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={MapPin}>{t('section.pickupInfo')}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>{t('common.country')}</Label>
            <SelectInput
              value={form.pickupCountry}
              onChange={(v) => onUpdate('pickupCountry', v)}
              options={countryOptions}
              placeholder={t('placeholder.selectCountry')}
            />
          </div>
          <div>
            <Label required>{t('common.city')}</Label>
            <TextInput
              value={form.pickupCity}
              onChange={(v) => onUpdate('pickupCity', v)}
              placeholder={t('placeholder.cityMunich')}
            />
          </div>
          <div>
            <Label required>{t('field.zipCode')}</Label>
            <TextInput
              value={form.pickupZipCode}
              onChange={(v) => onUpdate('pickupZipCode', v)}
              placeholder={t('placeholder.zipMunich')}
            />
          </div>
          <div>
            <Label required>{t('field.pickupDate')}</Label>
            <TextInput
              value={form.pickupDate}
              onChange={(v) => onUpdate('pickupDate', v)}
              type="date"
            />
          </div>
          <div className="sm:col-span-2">
            <Label required>{t('field.addressDetail')}</Label>
            <TextInput
              value={form.pickupAddress}
              onChange={(v) => onUpdate('pickupAddress', v)}
              placeholder={t('placeholder.streetAndNumber')}
            />
          </div>
          <div>
            <Label>{t('field.contact')}</Label>
            <TextInput
              value={form.pickupContact}
              onChange={(v) => onUpdate('pickupContact', v)}
              placeholder={t('placeholder.pickupContact')}
            />
          </div>
          <div>
            <Label>{t('field.phone')}</Label>
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
        <SectionTitle icon={MapPin}>{t('section.deliveryInfo')}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>{t('common.country')}</Label>
            <SelectInput
              value={form.deliveryCountry}
              onChange={(v) => onUpdate('deliveryCountry', v)}
              options={countryOptions}
              placeholder={t('placeholder.selectCountry')}
            />
          </div>
          <div>
            <Label required>{t('common.city')}</Label>
            <TextInput
              value={form.deliveryCity}
              onChange={(v) => onUpdate('deliveryCity', v)}
              placeholder={t('placeholder.cityWarsaw')}
            />
          </div>
          <div>
            <Label required>{t('field.zipCode')}</Label>
            <TextInput
              value={form.deliveryZipCode}
              onChange={(v) => onUpdate('deliveryZipCode', v)}
              placeholder={t('placeholder.zipWarsaw')}
            />
          </div>
          <div>
            <Label required>{t('field.deliveryDate')}</Label>
            <TextInput
              value={form.deliveryDate}
              onChange={(v) => onUpdate('deliveryDate', v)}
              type="date"
            />
          </div>
          <div className="sm:col-span-2">
            <Label required>{t('field.addressDetail')}</Label>
            <TextInput
              value={form.deliveryAddress}
              onChange={(v) => onUpdate('deliveryAddress', v)}
              placeholder={t('placeholder.streetAndNumber')}
            />
          </div>
          <div>
            <Label>{t('field.contact')}</Label>
            <TextInput
              value={form.deliveryContact}
              onChange={(v) => onUpdate('deliveryContact', v)}
              placeholder={t('placeholder.deliveryContact')}
            />
          </div>
          <div>
            <Label>{t('field.phone')}</Label>
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
        <SectionTitle icon={ClipboardList}>{t('field.specialRequirements')}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{t('field.specialRequirements')}</Label>
            <SelectInput
              value={form.specialRequirements}
              onChange={(v) => onUpdate('specialRequirements', v)}
              options={specialReqOpts.map((o) => ({
                value: o.value,
                label: t(`specialRequirement.${o.value}`, { defaultValue: o.label }),
              }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>{t('common.remark')}</Label>
            <TextArea
              value={form.remarks}
              onChange={(v) => onUpdate('remarks', v)}
              placeholder={t('placeholder.otherNotes')}
            />
          </div>
        </div>
      </div>

      {/* 报价信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={Euro}>{t('section.pricingInfo')}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{t('field.clientPrice')}</Label>
            <TextInput
              value={form.clientPrice}
              onChange={(v) => onUpdate('clientPrice', v)}
              type="number"
              placeholder={t('placeholder.priceEg')}
            />
          </div>
          <div>
            <Label>{t('common.currency')}</Label>
            <SelectInput
              value={form.currency}
              onChange={(v) => onUpdate('currency', v)}
              options={currencyOpts.map(o => ({ value: o.value, label: o.label }))}
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
  const { t } = useTranslation()
  const { options: shippingLineOpts } = useMasterDataOptions('shipping-lines')
  const { options: containerTypeOpts } = useMasterDataOptions('container-types')
  const { options: currencyOpts } = useMasterDataOptions('currencies')

  return (
    <>
      {/* 基本信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={Package}>{t('section.basicInfo')}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>{t('common.client')}</Label>
            <SelectInput
              value={form.clientId}
              onChange={(v) => onUpdate('clientId', v)}
              options={clientOptions}
              placeholder={clientsLoading ? t('common.loading') : t('placeholder.selectClient')}
            />
          </div>
          <div>
            <Label required>{t('field.transportType')}</Label>
            <SelectInput
              value={form.transportType}
              onChange={(v) => onUpdate('transportType', v as TransportType)}
              options={[
                { value: 'FTL', label: t('transportType.FTL') },
                { value: 'LTL', label: t('transportType.LTL') },
              ]}
            />
          </div>
        </div>
      </div>

      {/* 航运信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={Ship}>{t('section.shippingInfo')}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>{t('field.shippingLine')}</Label>
            <SelectInput
              value={form.shippingLine}
              onChange={(v) => onUpdate('shippingLine', v)}
              options={shippingLineOpts.map(o => ({ value: o.value, label: o.label }))}
              placeholder={t('placeholder.selectShippingLine')}
            />
          </div>
          <div>
            <Label required>{t('field.blNumber')}</Label>
            <TextInput
              value={form.blNumber}
              onChange={(v) => onUpdate('blNumber', v)}
              placeholder={t('placeholder.blNumberEg')}
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
            <Label required>{t('field.cnee')}</Label>
            <TextInput
              value={form.cnee}
              onChange={(v) => onUpdate('cnee', v)}
              placeholder={t('placeholder.cneeEg')}
            />
          </div>
        </div>
      </div>

      {/* 集装箱信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={Box}>{t('section.containerInfo')}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>{t('field.containerNo')}</Label>
            <TextInput
              value={form.containerNo}
              onChange={(v) => onUpdate('containerNo', v)}
              placeholder={t('placeholder.blNumberEg')}
            />
          </div>
          <div>
            <Label required>{t('field.containerType')}</Label>
            <SelectInput
              value={form.containerType}
              onChange={(v) => onUpdate('containerType', v)}
              options={containerTypeOpts.map(o => ({ value: o.value, label: o.label }))}
              placeholder={t('placeholder.selectContainerType')}
            />
          </div>
          <div>
            <Label>{t('field.sealNo')}</Label>
            <TextInput
              value={form.sealNo}
              onChange={(v) => onUpdate('sealNo', v)}
              placeholder={t('placeholder.sealNoEg')}
            />
          </div>
        </div>
      </div>

      {/* 港口与配送信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={MapPin}>{t('section.portDeliveryInfo')}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>{t('field.pod')}</Label>
            <TextInput
              value={form.pod}
              onChange={(v) => onUpdate('pod', v)}
              placeholder={t('placeholder.cityHamburg')}
            />
          </div>
          <div>
            <Label required>{t('field.finalDestination')}</Label>
            <TextInput
              value={form.finalDestination}
              onChange={(v) => onUpdate('finalDestination', v)}
              placeholder={t('placeholder.cityMunich')}
            />
          </div>
          <div className="sm:col-span-2">
            <Label required>{t('field.finalDestAddress')}</Label>
            <TextInput
              value={form.finalDestAddress}
              onChange={(v) => onUpdate('finalDestAddress', v)}
              placeholder={t('placeholder.finalDestAddressEg')}
            />
          </div>
          <div>
            <Label required>{t('field.expectedDeliveryDate')}</Label>
            <TextInput
              value={form.expectedDeliveryDate}
              onChange={(v) => onUpdate('expectedDeliveryDate', v)}
              type="date"
            />
          </div>
          <div>
            <Label>{t('field.contact')}</Label>
            <TextInput
              value={form.deliveryContact}
              onChange={(v) => onUpdate('deliveryContact', v)}
              placeholder={t('placeholder.consigneeContact')}
            />
          </div>
          <div>
            <Label>{t('field.phone')}</Label>
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
        <SectionTitle icon={FileText}>{t('section.releaseInfo')}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{t('field.releaseMethod')}</Label>
            <SelectInput
              value={form.releaseMethod}
              onChange={(v) => onUpdate('releaseMethod', v as ReleaseMethod)}
              options={[
                { value: 'TELEX', label: t('releaseMethod.TELEX') },
                { value: 'ORIGINAL', label: t('releaseMethod.ORIGINAL') },
              ]}
            />
          </div>
          <div>
            <Label>{t('field.needsClearance')}</Label>
            <SelectInput
              value={form.needsClearance ? 'YES' : 'NO'}
              onChange={(v) => onUpdate('needsClearance', v === 'YES')}
              options={[
                { value: 'YES', label: t('common.yes') },
                { value: 'NO', label: t('common.no') },
              ]}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>{t('common.remark')}</Label>
            <TextArea
              value={form.remarks}
              onChange={(v) => onUpdate('remarks', v)}
              placeholder={t('placeholder.otherNotes')}
            />
          </div>
        </div>
      </div>

      {/* 报价信息 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <SectionTitle icon={Euro}>{t('section.pricingInfo')}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{t('field.clientPrice')}</Label>
            <TextInput
              value={form.clientPrice}
              onChange={(v) => onUpdate('clientPrice', v)}
              type="number"
              placeholder={t('placeholder.priceEg')}
            />
          </div>
          <div>
            <Label>{t('common.currency')}</Label>
            <SelectInput
              value={form.currency}
              onChange={(v) => onUpdate('currency', v)}
              options={currencyOpts.map(o => ({ value: o.value, label: o.label }))}
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
  truckForm,
  containerForm,
}: {
  businessType: BusinessType
  estimatedOrderNo: string
  clientName: string
  truckForm: TruckForm
  containerForm: ContainerForm
}) {
  const { t } = useTranslation()
  // 根据业务类型展示不同摘要（FTL 走集装箱表单，其余走卡车表单）
  const isContainer = businessType === BUSINESS_TYPES.TRUCK_FTL
  const isLocal = businessType === BUSINESS_TYPES.LOCAL_DELIVERY

  // 路线信息
  let routeFrom = ''
  let routeTo = ''
  if (isContainer) {
    routeFrom = containerForm.pod || ''
    routeTo = containerForm.finalDestination || ''
  } else {
    routeFrom = [truckForm.pickupCity, truckForm.pickupCountry].filter(Boolean).join(', ')
    routeTo = [truckForm.deliveryCity, truckForm.deliveryCountry].filter(Boolean).join(', ')
  }

  // 价格
  const price = isContainer ? containerForm.clientPrice : truckForm.clientPrice
  const currency = isContainer ? containerForm.currency : truckForm.currency

  return (
    <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">{t('orderForm.summary')}</h3>

      <div className="space-y-4">
        {/* 预估订单号 */}
        <SummaryItem label={t('orderForm.estimatedOrderNo')} value={estimatedOrderNo} />

        {/* 业务类型 */}
        <SummaryItem
          label={t('field.businessType')}
          value={
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium
              ${isContainer ? 'bg-purple-100 text-purple-700' : isLocal ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}
            >
              {isContainer ? (
                <><Container className="w-3 h-3" /> {t(businessTypeLabelKey(BUSINESS_TYPES.TRUCK_FTL))}</>
              ) : isLocal ? (
                <><MapPin className="w-3 h-3" /> {t(businessTypeLabelKey(BUSINESS_TYPES.LOCAL_DELIVERY))}</>
              ) : (
                <><Truck className="w-3 h-3" /> {t(businessTypeLabelKey(BUSINESS_TYPES.TRUCK_LTL))}</>
              )}
            </span>
          }
        />

        {/* 客户 */}
        <SummaryItem
          label={t('common.client')}
          value={clientName || <span className="text-slate-400 italic">{t('common.notSelected')}</span>}
        />

        {/* 运输类型（本地派送没有此项） */}
        {!isLocal && (
          <SummaryItem
            label={t('field.transportType')}
            value={
              (isContainer ? containerForm.transportType : truckForm.transportType) === 'FTL'
                ? t('transportType.FTL')
                : t('transportType.LTL')
            }
          />
        )}

        {/* 分隔线 */}
        <div className="border-t border-slate-100" />

        {/* 路线 */}
        <div>
          <span className="text-xs text-slate-500">{t('common.route')}</span>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span className="text-slate-800 font-medium">{routeFrom || '—'}</span>
            <span className="text-slate-400">→</span>
            <span className="text-slate-800 font-medium">{routeTo || '—'}</span>
          </div>
        </div>

        {/* 卡车/本地派送特有信息 */}
        {!isContainer && (
          <>
            <SummaryItem
              label={t('field.weight')}
              value={truckForm.cargoWeightKg ? `${truckForm.cargoWeightKg} kg` : '—'}
            />
            <SummaryItem
              label={t('field.volume')}
              value={truckForm.cargoVolumeM3 ? `${truckForm.cargoVolumeM3} m³` : '—'}
            />
          </>
        )}

        {/* 集装箱特有信息 */}
        {isContainer && (
          <>
            <SummaryItem label={t('field.shippingLine')} value={containerForm.shippingLine || '—'} />
            <SummaryItem label={t('field.containerType')} value={containerForm.containerType || '—'} />
            <SummaryItem label={t('field.containerNo')} value={containerForm.containerNo || '—'} />
          </>
        )}

        {/* 分隔线 */}
        <div className="border-t border-slate-100" />

        {/* 报价 */}
        <div>
          <span className="text-xs text-slate-500">{t('field.clientPrice')}</span>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {price ? (
              <>{currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : 'zł'} {Number(price).toLocaleString()}</>
            ) : (
              <span className="text-slate-400 text-sm font-normal">{t('common.notFilled')}</span>
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
