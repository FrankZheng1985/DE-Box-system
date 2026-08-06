/**
 * 订单编辑页面
 * 加载已有订单数据，根据业务类型展示对应表单
 * 卡车运输：PENDING_REVIEW / CONFIRMED 可编辑
 * 本地派送：PENDING_QUOTE / PENDING_DISPATCH 可编辑
 */

import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMasterDataOptions } from '../hooks/useMasterDataOptions'
import { toDateInputValue } from '../utils/format'
import {
  ArrowLeft,
  Save,
  Loader2,
  MapPin,
  Package,
  FileText,
  Ship,
  AlertCircle,
  Lock,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import { Label, TextInput, SelectInput, SectionTitle } from '../components/form'
import { BUSINESS_TYPES, businessTypeLabelKey, getStatusLabel } from '../constants/businessTypes'

// ==================== 类型定义 ====================

interface Address {
  country: string
  city: string
  zipCode: string
  address: string
  contact?: string
  phone?: string
}

interface OrderData {
  id: string
  order_number: string
  business_type: string
  status: string
  transport_type: string
  cargo_description: string
  cargo_weight_kg: number
  cargo_volume_m3: number
  cargo_quantity: number
  pickup_address: Address | string
  delivery_address: Address | string
  pickup_date: string
  delivery_date: string
  special_requirements: string
  remarks: string
  client_name: string
  client_id: string
  client_price: number
  currency: string
  // 集装箱字段
  shipping_line: string
  container_no: string
  bl_number: string
  cnee: string
  eta: string
  pod: string
  final_destination: string
  release_method: string
  needs_clearance: boolean
  seal_no: string
  container_type: string
  expected_delivery_date: string
  delivery_contact: string
  delivery_phone: string
  pickup_contact: string
  pickup_phone: string
}

// ==================== 常量 ====================

// 与后端 editOrder 的规则保持一致
function getEditableStatuses(businessType: string): string[] {
  return businessType === BUSINESS_TYPES.LOCAL_DELIVERY
    ? ['PENDING_QUOTE', 'PENDING_DISPATCH']
    : ['PENDING_REVIEW', 'CONFIRMED']
}

// ==================== 地址解析 ====================

function parseAddress(addr: Address | string | null): Address {
  const empty: Address = { country: '', city: '', zipCode: '', address: '', contact: '', phone: '' }
  if (!addr) return empty
  if (typeof addr === 'string') {
    try { return JSON.parse(addr) } catch { return empty }
  }
  return addr
}

// ==================== 主组件 ====================

export default function OrderEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  // 基础数据选项
  const { options: countryOpts } = useMasterDataOptions('countries')
  // 特殊要求从基础数据接口取，不再在页面里硬编码一份中文值
  // （迁移 120 起库里存的是 code，硬编码的中文值会存进错的东西）
  const { options: specialReqOpts } = useMasterDataOptions('special-requirements')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [order, setOrder] = useState<OrderData | null>(null)
  const [isEditable, setIsEditable] = useState(false)

  // 卡车/本地派送表单字段
  const [cargoDescription, setCargoDescription] = useState('')
  const [cargoWeightKg, setCargoWeightKg] = useState('')
  const [cargoVolumeM3, setCargoVolumeM3] = useState('')
  const [cargoQuantity, setCargoQuantity] = useState('')
  const [pickupCountry, setPickupCountry] = useState('')
  const [pickupCity, setPickupCity] = useState('')
  const [pickupZipCode, setPickupZipCode] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [pickupDate, setPickupDate] = useState('')
  const [pickupContact, setPickupContact] = useState('')
  const [pickupPhone, setPickupPhone] = useState('')
  const [deliveryCountry, setDeliveryCountry] = useState('')
  const [deliveryCity, setDeliveryCity] = useState('')
  const [deliveryZipCode, setDeliveryZipCode] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryContact, setDeliveryContact] = useState('')
  const [deliveryPhone, setDeliveryPhone] = useState('')
  const [specialRequirements, setSpecialRequirements] = useState('')
  const [remarks, setRemarks] = useState('')
  const [clientPrice, setClientPrice] = useState('')
  const [currency, setCurrency] = useState('EUR')

  // 集装箱表单字段
  const [blNumber, setBlNumber] = useState('')
  const [containerNo, setContainerNo] = useState('')
  const [containerType, setContainerType] = useState('')
  const [sealNo, setSealNo] = useState('')
  const [eta, setEta] = useState('')
  const [cnee, setCnee] = useState('')
  const [pod, setPod] = useState('')
  const [finalDestination, setFinalDestination] = useState('')
  const [finalDestAddress, setFinalDestAddress] = useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  const [releaseMethod, setReleaseMethod] = useState('TELEX')
  const [needsClearance, setNeedsClearance] = useState(false)

  // ==================== 加载订单数据 ====================

  useEffect(() => {
    if (!id) return
    loadOrder()
  }, [id])

  async function loadOrder() {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<{ order: OrderData }>>(`/orders/${id}`)
      if (res.code === 200 && res.data?.order) {
        const o = res.data.order
        setOrder(o)
        setIsEditable(getEditableStatuses(o.business_type).includes(o.status?.toUpperCase()))
        fillForm(o)
      } else {
        setErrors([t('orderForm.loadFailed')])
      }
    } catch (err: any) {
      console.error('加载订单失败:', err)
      setErrors([err.message || t('orderForm.loadFailedShort')])
    } finally {
      setLoading(false)
    }
  }

  function fillForm(o: OrderData) {
    // 通用字段
    setCargoDescription(o.cargo_description || '')
    setCargoWeightKg(o.cargo_weight_kg?.toString() || '')
    setCargoVolumeM3(o.cargo_volume_m3?.toString() || '')
    setCargoQuantity(o.cargo_quantity?.toString() || '')
    setSpecialRequirements(o.special_requirements || '')
    setRemarks(o.remarks || '')
    setClientPrice(o.client_price?.toString() || '')
    setCurrency(o.currency || 'EUR')

    // FTL（原集装箱）走船运字段，LTL / 本地派送走地址字段
    if (o.business_type !== BUSINESS_TYPES.TRUCK_FTL) {
      const pickup = parseAddress(o.pickup_address)
      const delivery = parseAddress(o.delivery_address)
      setPickupCountry(pickup.country || '')
      setPickupCity(pickup.city || '')
      setPickupZipCode(pickup.zipCode || '')
      setPickupAddress(pickup.address || '')
      setPickupDate(toDateInputValue(o.pickup_date))
      setPickupContact(pickup.contact || o.pickup_contact || '')
      setPickupPhone(pickup.phone || o.pickup_phone || '')
      setDeliveryCountry(delivery.country || '')
      setDeliveryCity(delivery.city || '')
      setDeliveryZipCode(delivery.zipCode || '')
      setDeliveryAddress(delivery.address || '')
      setDeliveryDate(toDateInputValue(o.delivery_date))
      setDeliveryContact(delivery.contact || o.delivery_contact || '')
      setDeliveryPhone(delivery.phone || o.delivery_phone || '')
    } else {
      // 集装箱
      setBlNumber(o.bl_number || '')
      setContainerNo(o.container_no || '')
      setContainerType(o.container_type || '')
      setSealNo(o.seal_no || '')
      setEta(toDateInputValue(o.eta))
      setCnee(o.cnee || '')
      setPod(o.pod || '')
      setFinalDestination(o.final_destination || '')
      const delivery = parseAddress(o.delivery_address)
      setFinalDestAddress(delivery.address || '')
      setExpectedDeliveryDate(toDateInputValue(o.expected_delivery_date) || toDateInputValue(o.delivery_date))
      setDeliveryContact(o.delivery_contact || delivery.contact || '')
      setDeliveryPhone(o.delivery_phone || delivery.phone || '')
      setReleaseMethod(o.release_method || 'TELEX')
      setNeedsClearance(o.needs_clearance || false)
    }
  }

  // ==================== 提交 ====================

  async function handleSubmit() {
    if (!order || !isEditable) return
    setErrors([])

    // 基本验证
    const errs: string[] = []
    if (!cargoDescription.trim()) errs.push(t('orderForm.errCargoDescRequired'))

    if (order.business_type === BUSINESS_TYPES.TRUCK_FTL) {
      if (!blNumber.trim()) errs.push(t('orderForm.errBlNumberRequired'))
      if (!containerNo.trim()) errs.push(t('orderForm.errContainerNoRequired'))
    } else {
      if (!pickupCity.trim()) errs.push(t('orderForm.errPickupCityRequired'))
      if (!deliveryCity.trim()) errs.push(t('orderForm.errDeliveryCityRequired'))
    }

    if (errs.length > 0) {
      setErrors(errs)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setSubmitting(true)
    try {
      let payload: Record<string, unknown>

      if (order.business_type !== BUSINESS_TYPES.TRUCK_FTL) {
        payload = {
          cargoDescription,
          cargoWeightKg: cargoWeightKg ? Number(cargoWeightKg) : null,
          cargoVolumeM3: cargoVolumeM3 ? Number(cargoVolumeM3) : null,
          cargoQuantity: cargoQuantity ? Number(cargoQuantity) : null,
          pickupAddress: { country: pickupCountry, city: pickupCity, zipCode: pickupZipCode, address: pickupAddress },
          deliveryAddress: { country: deliveryCountry, city: deliveryCity, zipCode: deliveryZipCode, address: deliveryAddress },
          pickupDate: pickupDate || null,
          deliveryDate: deliveryDate || null,
          pickupContact: pickupContact || null,
          pickupPhone: pickupPhone || null,
          deliveryContact: deliveryContact || null,
          deliveryPhone: deliveryPhone || null,
          specialRequirements,
          remarks: remarks || null,
          clientPrice: clientPrice ? Number(clientPrice) : null,
          currency,
        }
      } else {
        payload = {
          cargoDescription,
          blNumber,
          containerNo,
          containerType,
          sealNo: sealNo || null,
          eta: eta || null,
          cnee,
          pod,
          finalDestination,
          finalDestAddress,
          expectedDeliveryDate: expectedDeliveryDate || null,
          deliveryContact: deliveryContact || null,
          deliveryPhone: deliveryPhone || null,
          releaseMethod,
          needsClearance,
          remarks: remarks || null,
          clientPrice: clientPrice ? Number(clientPrice) : null,
          currency,
        }
      }

      const res = await api.put<ApiResponse>(`/orders/${id}`, payload)
      if (res.code === 200) {
        navigate(`/orders/${id}`)
      } else {
        setErrors([res.message || t('orderForm.updateFailed')])
      }
    } catch (err: any) {
      console.error('更新订单失败:', err)
      setErrors([err.message || t('orderForm.networkError')])
    } finally {
      setSubmitting(false)
    }
  }

  // ==================== 加载中 ====================

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="ml-2 text-slate-500 text-sm">{t('orderForm.loadingOrder')}</span>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-slate-600">{t('orderForm.notFoundOrFailed')}</p>
        <button onClick={() => navigate('/orders')} className="mt-4 text-blue-600 hover:underline text-sm">
          {t('orderAssign.backToList')}
        </button>
      </div>
    )
  }

  const isContainer = order.business_type === BUSINESS_TYPES.TRUCK_FTL
  const countryOptions = countryOpts.map(o => ({ value: o.value, label: o.value }))

  // ==================== 不可编辑提示 ====================

  if (!isEditable) {
    return (
      <div className="p-4 lg:p-6 min-h-screen bg-slate-50/50">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(`/orders/${id}`)}
            className="p-2 rounded-xl hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-200">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-xl font-semibold text-slate-900">{t('orderForm.editTitle')}</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-8 text-center">
          <Lock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-700 mb-2">{t('orderForm.notEditable')}</h2>
          <p className="text-sm text-slate-500 mb-1">
            {t('common.orderNo')}: {order.order_number}
          </p>
          <p className="text-sm text-slate-500 mb-6">
            {t('orderForm.currentStatusIs')}{' '}
            <span className="font-medium text-slate-700">
              {getStatusLabel(t, order.business_type, order.status)}
            </span>{' '}
            {order.business_type === BUSINESS_TYPES.LOCAL_DELIVERY
              ? t('orderForm.editableHintLocal')
              : t('orderForm.editableHintTruck')}
          </p>
          <button onClick={() => navigate(`/orders/${id}`)}
            className="px-6 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 transition-colors">
            {t('orderForm.viewDetail')}
          </button>
        </div>
      </div>
    )
  }

  // ==================== 渲染表单 ====================

  return (
    <div className="p-4 lg:p-6 min-h-screen bg-slate-50/50">
      {/* 顶部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/orders/${id}`)}
            className="p-2 rounded-xl hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-200">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{t('orderForm.editTitle')}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {order.order_number} · {t(businessTypeLabelKey(order.business_type), { defaultValue: order.business_type })}
            </p>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl
            hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {submitting ? t('common.saving') : t('orderForm.saveChanges')}
        </button>
      </div>

      {/* 错误提示 */}
      {errors.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              {errors.map((e, i) => (
                <p key={i} className="text-sm text-red-600">{e}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 表单区域 */}
      <div className="space-y-6">
        {/* 货物信息 */}
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
          <SectionTitle icon={Package}>{t('section.cargoInfo')}</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <Label required>{t('field.cargoDescription')}</Label>
              <TextInput value={cargoDescription} onChange={setCargoDescription} placeholder={t('placeholder.cargoDescription')} />
            </div>
            <div>
              <Label required>{t('field.weightKg')}</Label>
              <TextInput value={cargoWeightKg} onChange={setCargoWeightKg} type="number" placeholder="0" />
            </div>
            <div>
              <Label>{t('field.volumeM3')}</Label>
              <TextInput value={cargoVolumeM3} onChange={setCargoVolumeM3} type="number" placeholder="0" />
            </div>
            <div>
              <Label>{t('field.quantity')}</Label>
              <TextInput value={cargoQuantity} onChange={setCargoQuantity} type="number" placeholder="0" />
            </div>
          </div>
        </div>

        {/* 卡车/本地派送：路线信息 */}
        {!isContainer && (
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
            <SectionTitle icon={MapPin}>{t('section.pickupAddress')}</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div>
                <Label required>{t('common.country')}</Label>
                <SelectInput value={pickupCountry} onChange={setPickupCountry} options={countryOptions} placeholder={t('placeholder.selectCountry')} />
              </div>
              <div>
                <Label required>{t('common.city')}</Label>
                <TextInput value={pickupCity} onChange={setPickupCity} placeholder={t('common.city')} />
              </div>
              <div>
                <Label required>{t('field.zipCode')}</Label>
                <TextInput value={pickupZipCode} onChange={setPickupZipCode} placeholder={t('field.zipCode')} />
              </div>
              <div>
                <Label required>{t('field.pickupDate')}</Label>
                <TextInput value={pickupDate} onChange={setPickupDate} type="date" />
              </div>
              <div className="sm:col-span-2">
                <Label required>{t('field.addressDetail')}</Label>
                <TextInput value={pickupAddress} onChange={setPickupAddress} placeholder={t('placeholder.streetAndNumber')} />
              </div>
              <div>
                <Label>{t('field.contact')}</Label>
                <TextInput value={pickupContact} onChange={setPickupContact} placeholder={t('placeholder.contactName')} />
              </div>
              <div>
                <Label>{t('field.phone')}</Label>
                <TextInput value={pickupPhone} onChange={setPickupPhone} placeholder={t('field.phone')} />
              </div>
            </div>

            <SectionTitle icon={MapPin}>{t('section.deliveryAddress')}</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label required>{t('common.country')}</Label>
                <SelectInput value={deliveryCountry} onChange={setDeliveryCountry} options={countryOptions} placeholder={t('placeholder.selectCountry')} />
              </div>
              <div>
                <Label required>{t('common.city')}</Label>
                <TextInput value={deliveryCity} onChange={setDeliveryCity} placeholder={t('common.city')} />
              </div>
              <div>
                <Label required>{t('field.zipCode')}</Label>
                <TextInput value={deliveryZipCode} onChange={setDeliveryZipCode} placeholder={t('field.zipCode')} />
              </div>
              <div>
                <Label required>{t('field.deliveryDate')}</Label>
                <TextInput value={deliveryDate} onChange={setDeliveryDate} type="date" />
              </div>
              <div className="sm:col-span-2">
                <Label required>{t('field.addressDetail')}</Label>
                <TextInput value={deliveryAddress} onChange={setDeliveryAddress} placeholder={t('placeholder.streetAndNumber')} />
              </div>
              <div>
                <Label>{t('field.contact')}</Label>
                <TextInput value={deliveryContact} onChange={setDeliveryContact} placeholder={t('placeholder.contactName')} />
              </div>
              <div>
                <Label>{t('field.phone')}</Label>
                <TextInput value={deliveryPhone} onChange={setDeliveryPhone} placeholder={t('field.phone')} />
              </div>
            </div>
          </div>
        )}

        {/* FTL（集装箱）：船运信息 */}
        {isContainer && (
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
            <SectionTitle icon={Ship}>{t('section.shippingContainerInfo')}</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div>
                <Label>{t('field.shippingLine')}</Label>
                <TextInput value={order.shipping_line || ''} onChange={() => {}} disabled />
              </div>
              <div>
                <Label required>{t('field.blNumber')}</Label>
                <TextInput value={blNumber} onChange={setBlNumber} placeholder="BL Number" />
              </div>
              <div>
                <Label>ETA</Label>
                <TextInput value={eta} onChange={setEta} type="date" />
              </div>
              <div>
                <Label>{t('field.cnee')}</Label>
                <TextInput value={cnee} onChange={setCnee} placeholder="CNEE" />
              </div>
              <div>
                <Label required>{t('field.containerNo')}</Label>
                <TextInput value={containerNo} onChange={setContainerNo} placeholder="XXXX1234567" />
              </div>
              <div>
                <Label>{t('field.containerType')}</Label>
                <SelectInput value={containerType} onChange={setContainerType}
                  options={['20GP','40GP','40HQ','45HQ'].map(v => ({ value: v, label: v }))} placeholder={t('placeholder.selectContainerType')} />
              </div>
              <div>
                <Label>{t('field.sealNo')}</Label>
                <TextInput value={sealNo} onChange={setSealNo} placeholder={t('field.sealNo')} />
              </div>
              <div>
                <Label>{t('field.releaseMethod')}</Label>
                <SelectInput value={releaseMethod} onChange={setReleaseMethod}
                  options={[{ value: 'TELEX', label: t('releaseMethod.TELEX') }, { value: 'ORIGINAL', label: t('releaseMethod.ORIGINAL') }]} />
              </div>
            </div>

            <SectionTitle icon={MapPin}>{t('section.destinationInfo')}</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label>{t('field.pod')}</Label>
                <TextInput value={pod} onChange={setPod} placeholder="Hamburg" />
              </div>
              <div>
                <Label>{t('field.finalDestination')}</Label>
                <TextInput value={finalDestination} onChange={setFinalDestination} placeholder={t('placeholder.finalCity')} />
              </div>
              <div className="sm:col-span-2">
                <Label>{t('field.finalDestAddress')}</Label>
                <TextInput value={finalDestAddress} onChange={setFinalDestAddress} placeholder={t('field.addressDetail')} />
              </div>
              <div>
                <Label>{t('field.expectedDeliveryDate')}</Label>
                <TextInput value={expectedDeliveryDate} onChange={setExpectedDeliveryDate} type="date" />
              </div>
              <div>
                <Label>{t('field.contact')}</Label>
                <TextInput value={deliveryContact} onChange={setDeliveryContact} placeholder={t('field.contact')} />
              </div>
              <div>
                <Label>{t('field.phone')}</Label>
                <TextInput value={deliveryPhone} onChange={setDeliveryPhone} placeholder={t('field.phone')} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input type="checkbox" checked={needsClearance} onChange={(e) => setNeedsClearance(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-slate-700">{t('field.needsClearance')}</span>
              </div>
            </div>
          </div>
        )}

        {/* 其他信息 */}
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
          <SectionTitle icon={FileText}>{t('section.otherInfo')}</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {!isContainer && (
              <div>
                <Label>{t('field.specialRequirements')}</Label>
                <SelectInput value={specialRequirements} onChange={setSpecialRequirements}
                  options={specialReqOpts.map((o) => ({
                    value: o.value,
                    label: t(`specialRequirement.${o.value}`, { defaultValue: o.label }),
                  }))} />
              </div>
            )}
            <div>
              <Label>{t('field.clientPrice')}</Label>
              <TextInput value={clientPrice} onChange={setClientPrice} type="number" placeholder="0.00" />
            </div>
            <div>
              <Label>{t('common.currency')}</Label>
              <SelectInput value={currency} onChange={setCurrency}
                options={[
                  { value: 'EUR', label: t('currencyName.EUR') },
                  { value: 'GBP', label: t('currencyName.GBP') },
                  { value: 'PLN', label: t('currencyName.PLN') },
                ]} />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Label>{t('common.remark')}</Label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={t('placeholder.orderRemarks')}
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900
                  placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
                  transition-all duration-200 resize-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
