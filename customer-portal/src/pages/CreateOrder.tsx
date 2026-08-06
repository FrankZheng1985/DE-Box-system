/**
 * 客户门户 · 新建订单
 *
 * 先选运输产品，再按产品填字段 —— 三个产品要填的东西差别很大，
 * 以前三个产品共用一张表单，集装箱单的提单号/柜号/港口在门户根本没地方填，
 * 客户只能写进备注里，运营再手工誊一遍。
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Save, Loader2, Truck, Container, MapPin } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { BUSINESS_TYPES, BUSINESS_TYPE_VALUES, type BusinessType } from '../constants/businessTypes'
import {
  GroundOrderFields,
  ContainerOrderFields,
  initialGroundForm,
  initialContainerForm,
  type GroundOrderForm,
  type ContainerOrderForm,
} from '../components/OrderFormFields'

const PRODUCT_ICONS: Record<string, React.ElementType> = {
  [BUSINESS_TYPES.TRUCK_LTL]: Truck,
  [BUSINESS_TYPES.TRUCK_FTL]: Container,
  [BUSINESS_TYPES.LOCAL_DELIVERY]: MapPin,
}

/** 空字符串转 undefined，避免把一堆空串塞进接口 */
function orNull(value: string): string | undefined {
  const text = value.trim()
  return text === '' ? undefined : text
}

/** 数字字段：填了才转数字，没填就不传 */
function orNumber(value: string): number | undefined {
  const text = value.trim()
  return text === '' ? undefined : Number(text)
}

/**
 * 只保留填了值的地址字段
 *
 * 空串写进 JSONB 后，`pickup_address->>'zipCode'` 拿到的是 '' 而不是 NULL，
 * 前端一律显示成空白、后端判空还得多写一层，不如一开始就不写进去（踩坑 047 防护第 3 条）。
 */
function buildAddress(fields: Record<string, string>): Record<string, string> {
  const address: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields)) {
    const text = value.trim()
    if (text !== '') address[key] = text
  }
  return address
}

/** 集装箱单的提柜地点是整组选填，一个字都没填就当作「从卸货港提柜」 */
function hasPickupLocation(f: ContainerOrderForm): boolean {
  return [f.pickupCountry, f.pickupCity, f.pickupZipCode, f.pickupAddress, f.pickupRef]
    .some((v) => v.trim() !== '')
}

export default function CreateOrder() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [businessType, setBusinessType] = useState<BusinessType>(BUSINESS_TYPES.TRUCK_LTL)
  const [groundForm, setGroundForm] = useState<GroundOrderForm>(initialGroundForm)
  const [containerForm, setContainerForm] = useState<ContainerOrderForm>(initialContainerForm)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const isContainer = businessType === BUSINESS_TYPES.TRUCK_FTL

  function updateGround<K extends keyof GroundOrderForm>(key: K, value: GroundOrderForm[K]) {
    setGroundForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateContainer<K extends keyof ContainerOrderForm>(key: K, value: ContainerOrderForm[K]) {
    setContainerForm((prev) => ({ ...prev, [key]: value }))
  }

  /** @returns 错误文案，空字符串表示校验通过 */
  function validate(): string {
    if (isContainer) {
      if (!containerForm.blNumber.trim()) return t('createOrder.errBlNumber')
      if (!containerForm.containerNo.trim()) return t('createOrder.errContainerNo')
      if (!containerForm.pod.trim()) return t('createOrder.errPod')
      if (!containerForm.finalDestination.trim()) return t('createOrder.errFinalDest')
      return ''
    }
    if (!groundForm.pickupCountry.trim() || !groundForm.pickupCity.trim()) return t('createOrder.errorPickup')
    if (!groundForm.deliveryCountry.trim() || !groundForm.deliveryCity.trim()) return t('createOrder.errorDelivery')
    return ''
  }

  function buildPayload(): Record<string, unknown> {
    // clientId 后端会用 JWT 的绑定客户覆盖，这里传只是为了老接口兼容
    const base = {
      clientId: user?.linkedEntityId,
      businessType,
      clientPrice: 0,
      currency: 'EUR',
    }

    if (isContainer) {
      const f = containerForm
      return {
        ...base,
        customerRef: orNull(f.customerRef),
        transportType: 'FTL',
        // 提柜地点：整组都没填就不传，表示按常规从卸货港提柜
        pickupAddress: hasPickupLocation(f)
          ? buildAddress({
              country: f.pickupCountry,
              city: f.pickupCity,
              zipCode: f.pickupZipCode,
              address: f.pickupAddress,
              reference: f.pickupRef,
            })
          : undefined,
        pickupContact: orNull(f.pickupContact),
        pickupPhone: orNull(f.pickupPhone),
        shippingLine: orNull(f.shippingLine),
        blNumber: f.blNumber.trim(),
        eta: orNull(f.eta),
        cnee: orNull(f.cnee),
        containerNo: f.containerNo.trim(),
        containerType: orNull(f.containerType),
        sealNo: orNull(f.sealNo),
        pod: f.pod.trim(),
        finalDestination: f.finalDestination.trim(),
        finalDestAddress: orNull(f.finalDestAddress),
        expectedDeliveryDate: orNull(f.expectedDeliveryDate),
        deliveryContact: orNull(f.deliveryContact),
        deliveryPhone: orNull(f.deliveryPhone),
        releaseMethod: f.releaseMethod,
        needsClearance: f.needsClearance,
        cargoDescription: orNull(f.cargoDescription),
        cargoQuantity: orNumber(f.cargoQuantity),
        cargoWeightKg: orNumber(f.cargoWeightKg),
        cargoVolumeM3: orNumber(f.cargoVolumeM3),
        remarks: orNull(f.remarks),
      }
    }

    const f = groundForm
    return {
      ...base,
      customerRef: orNull(f.customerRef),
      // 本地派送没有 FTL/LTL 之分
      transportType: businessType === BUSINESS_TYPES.LOCAL_DELIVERY ? null : f.transportType,
      // ⚠️ 地址必须是对象：后端 model.js 是 JSON.stringify(data.pickupAddress) 写进 JSONB 列，
      //    传 pickupCountry 这种平铺字段的话整列会落成 NULL
      pickupAddress: buildAddress({
        country: f.pickupCountry,
        city: f.pickupCity,
        zipCode: f.pickupZipCode,
        address: f.pickupAddress,
      }),
      deliveryAddress: buildAddress({
        country: f.deliveryCountry,
        city: f.deliveryCity,
        zipCode: f.deliveryZipCode,
        address: f.deliveryAddress,
      }),
      // 联系人由后端并进地址的 JSONB（orders 表没有联系人列）
      pickupContact: orNull(f.pickupContact),
      pickupPhone: orNull(f.pickupPhone),
      deliveryContact: orNull(f.deliveryContact),
      deliveryPhone: orNull(f.deliveryPhone),
      pickupDate: orNull(f.pickupDate),
      deliveryDate: orNull(f.deliveryDate),
      cargoDescription: orNull(f.cargoDescription),
      cargoQuantity: orNumber(f.cargoQuantity),
      cargoWeightKg: orNumber(f.cargoWeightKg),
      cargoVolumeM3: orNumber(f.cargoVolumeM3),
      specialRequirements: orNull(f.specialRequirements),
      remarks: orNull(f.remarks),
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await api.post<ApiResponse<unknown>>('/orders', buildPayload())
      if (res.code === 200 || res.code === 201) {
        setSuccess(true)
        setTimeout(() => navigate('/orders'), 1500)
      } else {
        setError(res.message || t('createOrder.failed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('createOrder.failed'))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <Save className="w-6 h-6 text-green-600" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">{t('createOrder.success')}</h2>
        <p className="text-sm text-slate-500">{t('createOrder.redirecting')}</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button
        onClick={() => navigate('/orders')}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors duration-200"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('createOrder.backToList')}
      </button>

      {/* 运输产品选择：换产品就换一套字段 */}
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">{t('createOrder.selectProduct')}</h2>
        <p className="text-xs text-slate-500 mb-4">{t('createOrder.selectProductHint')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {BUSINESS_TYPE_VALUES.map((bt) => {
            const Icon = PRODUCT_ICONS[bt]
            const isActive = businessType === bt
            return (
              <button
                key={bt}
                type="button"
                onClick={() => { setBusinessType(bt); setError('') }}
                className={`text-left p-4 rounded-xl border transition-all duration-200 ${
                  isActive
                    ? 'border-primary-500 bg-primary-50/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'
                    : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                }`}
              >
                <Icon className={`w-5 h-5 mb-2 ${isActive ? 'text-primary-600' : 'text-slate-400'}`} />
                <div className={`text-xs font-semibold mb-1 ${isActive ? 'text-primary-700' : 'text-slate-700'}`}>
                  {t(`businessType.${bt}`)}
                </div>
                <div className="text-[11px] leading-relaxed text-slate-500">
                  {t(`businessTypeDesc.${bt}`)}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">
          {t('createOrder.title')} · {t(`businessType.${businessType}`)}
        </h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-xs mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isContainer ? (
            <ContainerOrderFields form={containerForm} onChange={updateContainer} />
          ) : (
            <GroundOrderFields businessType={businessType} form={groundForm} onChange={updateGround} />
          )}

          <div className="flex justify-end gap-2 pt-5 mt-5 border-t border-slate-100">
            <button
              type="button"
              onClick={() => navigate('/orders')}
              className="h-9 px-4 text-xs text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="h-9 px-4 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700
                transition-all duration-200 disabled:opacity-50 flex items-center gap-1"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('createOrder.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
