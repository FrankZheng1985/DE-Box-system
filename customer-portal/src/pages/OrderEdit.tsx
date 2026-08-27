/**
 * 客户门户 · 修改订单基本信息（开发意见 #12）
 *
 * 只有「待审核」的订单能改 —— 也就是我司还没受理这张单的时候（Frank 2026-08-27 拍板）。
 * 一旦确认/派车，改了会和已经报给承运商的信息脱节，只能联系我司。
 *
 * 本地派送订单没有「待审核」这个状态（它的初始态是待报价，而且单子是运营从报价
 * 一柜转 N 单建出来的，不是客户建的），所以客户改不了 —— 要改请改上游那张询价单。
 *
 * 后端 PUT /orders/:id/basic-info 有同样的状态守卫和字段白名单，
 * 尤其**金额不在白名单里**：这个页面不放金额输入框，后端也不接收。
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MapPin, Package, Ship, Save } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import AddressCard from '../components/AddressCard'
import {
  type AddressForm, type ContactForm, EMPTY_ADDRESS, EMPTY_CONTACT, inputClass,
} from '../components/inquiryForm'
import { DetailHeader, Section, DetailSkeleton, DetailNotFound } from '../components/DetailPanels'
import { BUSINESS_TYPES } from '../constants/businessTypes'

// ==================== 类型 ====================
//
// ⚠️ 逐字对齐后端白名单返回的字段名（server/modules/order/portal-view.js），踩坑 066。

interface ServerAddress {
  country?: string | null
  zipCode?: string | null
  city?: string | null
  address?: string | null
  contactName?: string | null
  contactPhone?: string | null
  reference?: string | null
}

interface ServerOrder {
  id: string
  order_number: string
  customer_ref: string | null
  business_type: string
  status: string
  pickup_address: ServerAddress | null
  delivery_address: ServerAddress | null
  cargo_description: string | null
  cargo_weight_kg: string | null
  cargo_volume_m3: string | null
  cargo_quantity: number | null
  special_requirements: string | null
  remarks: string | null
  pickup_date: string | null
  delivery_date: string | null
  shipping_line: string | null
  container_no: string | null
  bl_number: string | null
  eta: string | null
  cnee: string | null
}

/** null → 空串；受控 input 拿到 null 会从受控变非受控，React 会报警告 */
function str(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

/** DATE / TIMESTAMP 回来是 ISO 串，<input type="date"> 只认 YYYY-MM-DD */
function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function toAddressForm(addr: ServerAddress | null | undefined): AddressForm {
  if (!addr) return { ...EMPTY_ADDRESS }
  return {
    country: str(addr.country),
    zipCode: str(addr.zipCode),
    city: str(addr.city),
    address: str(addr.address),
  }
}

function toContact(addr: ServerAddress | null | undefined): ContactForm {
  if (!addr) return { ...EMPTY_CONTACT }
  // 订单地址里没有邮箱这一格，留空（AddressCard 传 showEmail={false} 也不会渲染它）
  return { name: str(addr.contactName), phone: str(addr.contactPhone), email: '' }
}

/**
 * 表单值拼回地址 JSONB
 *
 * 保留原对象里我们不动的键（如集装箱单的 reference 提柜参考号）——
 * 整个覆盖会把它们悄悄抹掉。
 */
function buildAddress(base: ServerAddress | null, form: AddressForm, contact: ContactForm): ServerAddress {
  const out: ServerAddress = { ...(base || {}) }
  out.country = form.country.trim() || null
  out.zipCode = form.zipCode.trim() || null
  out.city = form.city.trim() || null
  out.address = form.address.trim() || null
  out.contactName = contact.name.trim() || null
  out.contactPhone = contact.phone.trim() || null
  return out
}

// ==================== 主组件 ====================

export default function OrderEdit() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [order, setOrder] = useState<ServerOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')

  const [customerRef, setCustomerRef] = useState('')
  const [pickup, setPickup] = useState<AddressForm>({ ...EMPTY_ADDRESS })
  const [pickupContact, setPickupContact] = useState<ContactForm>({ ...EMPTY_CONTACT })
  const [delivery, setDelivery] = useState<AddressForm>({ ...EMPTY_ADDRESS })
  const [deliveryContact, setDeliveryContact] = useState<ContactForm>({ ...EMPTY_CONTACT })
  const [cargoDescription, setCargoDescription] = useState('')
  const [cargoQuantity, setCargoQuantity] = useState('')
  const [cargoWeightKg, setCargoWeightKg] = useState('')
  const [cargoVolumeM3, setCargoVolumeM3] = useState('')
  const [specialRequirements, setSpecialRequirements] = useState('')
  const [remarks, setRemarks] = useState('')
  const [pickupDate, setPickupDate] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [shippingLine, setShippingLine] = useState('')
  const [containerNo, setContainerNo] = useState('')
  const [blNumber, setBlNumber] = useState('')
  const [eta, setEta] = useState('')
  const [cnee, setCnee] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const res = await api.get<ApiResponse<{ order: ServerOrder }>>(`/orders/${id}`)
        if (cancelled) return
        if (res.code === 200 && res.data?.order) {
          const o = res.data.order
          setOrder(o)
          setCustomerRef(str(o.customer_ref))
          setPickup(toAddressForm(o.pickup_address))
          setPickupContact(toContact(o.pickup_address))
          setDelivery(toAddressForm(o.delivery_address))
          setDeliveryContact(toContact(o.delivery_address))
          setCargoDescription(str(o.cargo_description))
          setCargoQuantity(str(o.cargo_quantity))
          setCargoWeightKg(str(o.cargo_weight_kg))
          setCargoVolumeM3(str(o.cargo_volume_m3))
          setSpecialRequirements(str(o.special_requirements))
          setRemarks(str(o.remarks))
          setPickupDate(toDateInput(o.pickup_date))
          setDeliveryDate(toDateInput(o.delivery_date))
          setShippingLine(str(o.shipping_line))
          setContainerNo(str(o.container_no))
          setBlNumber(str(o.bl_number))
          setEta(toDateInput(o.eta))
          setCnee(str(o.cnee))
        } else {
          setOrder(null)
          setLoadError(res.message || t('orderDetail.loadFailed'))
        }
      } catch (err) {
        if (cancelled) return
        console.error('加载订单详情失败:', err)
        setOrder(null)
        setLoadError(err instanceof Error ? err.message : t('orderDetail.loadFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [id, t])

  const handleSave = async () => {
    if (!order) return
    setError('')

    if (!pickup.country.trim() && !pickup.city.trim()) {
      setError(t('createOrder.errorPickup')); return
    }
    if (!delivery.country.trim() && !delivery.city.trim()) {
      setError(t('createOrder.errorDelivery')); return
    }

    const isContainer = order.business_type === BUSINESS_TYPES.TRUCK_FTL
    const num = (v: string) => (v.trim() === '' ? null : Number(v))

    const payload: Record<string, unknown> = {
      customerRef: customerRef.trim() || null,
      pickupAddress: buildAddress(order.pickup_address, pickup, pickupContact),
      deliveryAddress: buildAddress(order.delivery_address, delivery, deliveryContact),
      cargoDescription: cargoDescription.trim() || null,
      cargoQuantity: num(cargoQuantity),
      cargoWeightKg: num(cargoWeightKg),
      cargoVolumeM3: num(cargoVolumeM3),
      specialRequirements: specialRequirements.trim() || null,
      remarks: remarks.trim() || null,
      // 空串必须转成空串交给后端 normalizeDateFields 处理成 null，
      // 直接把空串塞进 date 列会让整条 UPDATE 失败（踩坑 059）
      pickupDate,
      deliveryDate,
    }
    if (isContainer) {
      Object.assign(payload, {
        shippingLine: shippingLine.trim() || null,
        containerNo: containerNo.trim() || null,
        blNumber: blNumber.trim() || null,
        eta,
        cnee: cnee.trim() || null,
      })
    }

    setSaving(true)
    try {
      const res = await api.put<ApiResponse<null>>(`/orders/${order.id}/basic-info`, payload)
      if (res.code === 200) {
        navigate(`/orders/${order.id}`)
      } else {
        // 必须显示后端 message，否则失败会被伪装成成功（踩坑 011）
        setError(res.message || t('orderEdit.saveFailed'))
      }
    } catch (err) {
      console.error('保存订单失败:', err)
      setError(err instanceof Error ? err.message : t('orderEdit.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <DetailSkeleton />

  if (!order) {
    return (
      <DetailNotFound
        message={loadError || t('orderDetail.notFound')}
        backTo="/orders"
        backLabel={t('createOrder.backToList')}
      />
    )
  }

  // 状态守卫：后端同样会拦，这里提前告知，别让客户填完一整页才被拒
  if (order.status !== 'PENDING_REVIEW') {
    return (
      <div className="space-y-4">
        <DetailHeader backTo={`/orders/${order.id}`} title={order.order_number} />
        <DetailNotFound
          message={t('orderEdit.notEditable')}
          backTo={`/orders/${order.id}`}
          backLabel={t('orderEdit.backToDetail')}
        />
      </div>
    )
  }

  const isContainer = order.business_type === BUSINESS_TYPES.TRUCK_FTL

  return (
    <div className="space-y-4">
      <DetailHeader
        backTo={`/orders/${order.id}`}
        title={t('orderEdit.title')}
        subtitle={order.order_number}
      />

      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
          {error}
        </div>
      )}

      <Section icon={Package} title={t('createOrder.sectionBasic')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('createOrder.serviceType')}</label>
            {/* 服务类型不给改：换类型等于换业务线，要换请新建一张 */}
            <p className="h-8 flex items-center text-sm text-slate-900">
              {t(`businessType.${order.business_type}`, { defaultValue: order.business_type })}
            </p>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('createOrder.customerRef')}</label>
            <input
              type="text"
              value={customerRef}
              onChange={(e) => setCustomerRef(e.target.value)}
              placeholder={t('createOrder.phCustomerRef')}
              className={inputClass}
            />
          </div>
        </div>
      </Section>

      <Section icon={MapPin} title={t('orderDetail.addressSection')}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AddressCard
            title={isContainer ? t('createOrder.sectionPickupFtl') : t('createOrder.pickupAddress')}
            required={!isContainer}
            icon={MapPin}
            address={pickup}
            onAddressChange={setPickup}
            contact={pickupContact}
            onContactChange={setPickupContact}
            showEmail={false}
          />
          <AddressCard
            title={t('createOrder.deliveryAddress')}
            required
            icon={MapPin}
            address={delivery}
            onAddressChange={setDelivery}
            contact={deliveryContact}
            onContactChange={setDeliveryContact}
            showEmail={false}
          />
        </div>
      </Section>

      <Section icon={Package} title={t('createOrder.sectionCargo')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs text-slate-500 mb-1">{t('createOrder.cargoDescription')}</label>
            <input type="text" value={cargoDescription} onChange={(e) => setCargoDescription(e.target.value)} placeholder={t('createOrder.phCargo')} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('createOrder.quantity')}</label>
            <input type="number" min="0" value={cargoQuantity} onChange={(e) => setCargoQuantity(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('createOrder.weightKg')}</label>
            <input type="number" min="0" step="0.01" value={cargoWeightKg} onChange={(e) => setCargoWeightKg(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('createOrder.volumeM3')}</label>
            <input type="number" min="0" step="0.01" value={cargoVolumeM3} onChange={(e) => setCargoVolumeM3(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs text-slate-500 mb-1">{t('createOrder.specialRequirements')}</label>
            <input type="text" value={specialRequirements} onChange={(e) => setSpecialRequirements(e.target.value)} placeholder={t('createOrder.phSpecial')} className={inputClass} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs text-slate-500 mb-1">{t('common.remark')}</label>
            <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputClass} />
          </div>
        </div>
      </Section>

      {isContainer && (
        <Section icon={Ship} title={t('createOrder.sectionShipping')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('createOrder.shippingLine')}</label>
              <input type="text" value={shippingLine} onChange={(e) => setShippingLine(e.target.value)} placeholder={t('createOrder.phShippingLine')} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('createOrder.containerNo')}</label>
              <input type="text" value={containerNo} onChange={(e) => setContainerNo(e.target.value)} placeholder={t('createOrder.phContainerNo')} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('createOrder.blNumber')}</label>
              <input type="text" value={blNumber} onChange={(e) => setBlNumber(e.target.value)} placeholder={t('createOrder.phBlNumber')} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('createOrder.eta')}</label>
              <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('createOrder.cnee')}</label>
              <input type="text" value={cnee} onChange={(e) => setCnee(e.target.value)} placeholder={t('createOrder.phCnee')} className={inputClass} />
            </div>
          </div>
        </Section>
      )}

      <Section icon={Package} title={t('createOrder.sectionSchedule')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('createOrder.pickupDate')}</label>
            <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('createOrder.deliveryDate')}</label>
            <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inputClass} />
          </div>
        </div>
      </Section>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => navigate(`/orders/${order.id}`)}
          className="h-8 px-3 text-xs text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-200 ease-in-out"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-8 px-4 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-all duration-200 ease-in-out flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  )
}
