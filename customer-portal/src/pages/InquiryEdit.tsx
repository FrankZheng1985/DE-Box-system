/**
 * 客户门户 · 修改询价单（开发意见 #12）
 *
 * 客户建完询价才发现尺寸重量／地址填错了，以前只能删掉重建（已报价的连删都删不了）。
 *
 * 两道业务规则，都在后端有对应守卫，前端只是提前告知：
 *   1. 只有「待报价」的单能直接改（PUT /inquiries/:id 后端也会再拦一次）
 *   2. 「已报价」的单要先退回待报价、并作废在途报价（POST /inquiries/:id/reopen）——
 *      不这么做就会出现「报价对应的货物和询价单里对不上」，客户按老价接受就是我们亏
 *
 * 服务类型（卡派 LTL / 卡车 FTL / 本地派送）**故意不给改**：
 * 换服务类型等于换业务线和计价基础，两层结构和三层结构的表单也整个不一样，
 * 要换请新建一张单。
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MapPin, Truck, Package, Save, AlertTriangle } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import AddressCard from '../components/AddressCard'
import CargoItemsTable from '../components/CargoItemsTable'
import LocalDeliveryForm from '../components/LocalDeliveryForm'
import {
  type AddressForm, type ContactForm, type CargoRow, type LocalDeliveryFormValue,
  type DeliveryOrderForm,
  EMPTY_ADDRESS, EMPTY_CONTACT, newCargoRow, newLocalDeliveryValue,
  buildCargoItems, mergeContact, inputClass,
} from '../components/inquiryForm'
import { DetailHeader, Section, DetailSkeleton, DetailNotFound } from '../components/DetailPanels'
import { BUSINESS_TYPES } from '../constants/businessTypes'
import {
  TRANSPORT_TYPES, TRANSPORT_TYPE_VALUES, VEHICLE_LENGTH_CODES, type TransportType,
} from '../constants/inquiryQuotation'

// ==================== 类型 ====================
//
// ⚠️ 字段名逐字对齐后端返回（snake_case），自造名字读到 undefined 且不报错（踩坑 066）。

interface ServerCargoItem {
  id: string
  line_number: number
  reference_no: string | null
  description: string | null
  quantity: number | null
  length_cm: string | null
  width_cm: string | null
  height_cm: string | null
  unit_weight_kg: string | null
}

interface ServerAddress {
  country?: string | null
  zipCode?: string | null
  city?: string | null
  address?: string | null
  companyName?: string | null
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
}

interface ServerDeliveryOrder {
  id: string
  line_number: number
  customer_sub_ref: string | null
  delivery_address: ServerAddress | null
  remarks: string | null
  cargoItems: ServerCargoItem[]
}

interface ServerInquiry {
  id: string
  inquiry_number: string
  business_type: string
  transport_type: string | null
  vehicle_length_code: string | null
  container_no: string | null
  customer_ref: string | null
  route_from: ServerAddress | null
  route_to: ServerAddress | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  cargo_description: string | null
  remarks: string | null
  status: string
  cargoItems: ServerCargoItem[]
  deliveryOrders: ServerDeliveryOrder[]
}

// ==================== 服务端数据 → 表单状态 ====================

/** NUMERIC 回来是字符串，受控 input 要的也是字符串；null 转成空串而不是 "null" */
function str(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
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

/** 地址 JSONB 里内嵌的联系人（发货侧、以及三层结构里每票的收货侧走这条） */
function toContactFromAddress(addr: ServerAddress | null | undefined): ContactForm {
  if (!addr) return { ...EMPTY_CONTACT }
  return {
    name: str(addr.contactName),
    phone: str(addr.contactPhone),
    email: str(addr.contactEmail),
  }
}

let seq = 0
function toCargoRows(items: ServerCargoItem[] | undefined): CargoRow[] {
  const rows = (items || []).map((it) => {
    seq += 1
    return {
      key: `edit-row-${seq}`,
      referenceNo: str(it.reference_no),
      description: str(it.description),
      quantity: str(it.quantity ?? 1),
      lengthCm: str(it.length_cm),
      widthCm: str(it.width_cm),
      heightCm: str(it.height_cm),
      unitWeightKg: str(it.unit_weight_kg),
    }
  })
  // 一行都没有时给一行空的，空表格会让人以为页面坏了（口径同 CargoItemsTable 的删空处理）
  return rows.length > 0 ? rows : [newCargoRow()]
}

/** 三层结构：整张单 → LocalDeliveryForm 认识的那套值 */
function toLocalDeliveryValue(data: ServerInquiry): LocalDeliveryFormValue {
  const base = newLocalDeliveryValue()
  const orders: DeliveryOrderForm[] = (data.deliveryOrders || []).map((o) => {
    seq += 1
    return {
      key: `edit-drop-${seq}`,
      customerSubRef: str(o.customer_sub_ref),
      companyName: str(o.delivery_address?.companyName),
      address: toAddressForm(o.delivery_address),
      contact: toContactFromAddress(o.delivery_address),
      remarks: str(o.remarks),
      rows: toCargoRows(o.cargoItems),
    }
  })
  return {
    containerNo: str(data.container_no),
    customerRef: str(data.customer_ref),
    pickupAddress: toAddressForm(data.route_from),
    pickupContact: toContactFromAddress(data.route_from),
    deliveryOrders: orders.length > 0 ? orders : base.deliveryOrders,
  }
}

// ==================== 主组件 ====================

export default function InquiryEdit() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [inquiry, setInquiry] = useState<ServerInquiry | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')

  // 两层结构的表单状态
  const [transportType, setTransportType] = useState<TransportType>(TRANSPORT_TYPES.LTL)
  const [vehicleLengthCode, setVehicleLengthCode] = useState('')
  const [customerRef, setCustomerRef] = useState('')
  const [routeFrom, setRouteFrom] = useState<AddressForm>({ ...EMPTY_ADDRESS })
  const [routeTo, setRouteTo] = useState<AddressForm>({ ...EMPTY_ADDRESS })
  const [senderContact, setSenderContact] = useState<ContactForm>({ ...EMPTY_CONTACT })
  const [receiverContact, setReceiverContact] = useState<ContactForm>({ ...EMPTY_CONTACT })
  const [cargoDescription, setCargoDescription] = useState('')
  const [remarks, setRemarks] = useState('')
  const [rows, setRows] = useState<CargoRow[]>([newCargoRow()])

  /** 三层结构（本地派送）自成一套状态，和上面那套互不干扰 */
  const [ld, setLd] = useState<LocalDeliveryFormValue>(newLocalDeliveryValue())

  /** 把服务端数据灌进表单。退回待报价之后也要重灌一次（状态变了） */
  const fillForm = (data: ServerInquiry) => {
    setInquiry(data)
    if (data.business_type === BUSINESS_TYPES.LOCAL_DELIVERY) {
      setLd(toLocalDeliveryValue(data))
      return
    }
    setTransportType((data.transport_type as TransportType) || TRANSPORT_TYPES.LTL)
    setVehicleLengthCode(str(data.vehicle_length_code))
    setCustomerRef(str(data.customer_ref))
    setRouteFrom(toAddressForm(data.route_from))
    setRouteTo(toAddressForm(data.route_to))
    setSenderContact(toContactFromAddress(data.route_from))
    // 收货侧联系人在 inquiries 表自己的列上，不在 route_to 的 JSONB 里
    setReceiverContact({
      name: str(data.contact_name),
      phone: str(data.contact_phone),
      email: str(data.contact_email),
    })
    setCargoDescription(str(data.cargo_description))
    setRemarks(str(data.remarks))
    setRows(toCargoRows(data.cargoItems))
  }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const res = await api.get<ApiResponse<ServerInquiry>>(`/inquiries/${id}`)
        if (cancelled) return
        if (res.code === 200 && res.data) {
          fillForm(res.data)
        } else {
          setInquiry(null)
          setLoadError(res.message || t('inquiryDetail.loadFailed'))
        }
      } catch (err) {
        if (cancelled) return
        console.error('加载询价详情失败:', err)
        setInquiry(null)
        setLoadError(err instanceof Error ? err.message : t('inquiryDetail.loadFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
    // fillForm 只用到 setState，不需要进依赖；id 变了才重新取数
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /** 已报价 → 作废在途报价并退回待报价，成功后表单解锁 */
  const handleReopen = async () => {
    if (!inquiry) return
    setReopening(true)
    setError('')
    try {
      const res = await api.post<ApiResponse<{ voidedCount: number }>>(
        `/inquiries/${inquiry.id}/reopen`, {}
      )
      if (res.code === 200) {
        // 重新取一次而不是本地改状态：作废了几张报价、状态到底成了什么，以服务端为准
        const fresh = await api.get<ApiResponse<ServerInquiry>>(`/inquiries/${inquiry.id}`)
        if (fresh.code === 200 && fresh.data) fillForm(fresh.data)
      } else {
        // 必须显示后端 message，否则失败会被伪装成成功（踩坑 011）
        setError(res.message || t('inquiryEdit.reopenFailed'))
      }
    } catch (err) {
      console.error('询价退回待报价失败:', err)
      setError(err instanceof Error ? err.message : t('inquiryEdit.reopenFailed'))
    } finally {
      setReopening(false)
    }
  }

  const handleSave = async () => {
    if (!inquiry) return
    setError('')

    const isLocal = inquiry.business_type === BUSINESS_TYPES.LOCAL_DELIVERY

    let payload: Record<string, unknown>
    if (isLocal) {
      if (!ld.containerNo.trim()) { setError(t('inquiry.errorContainerNo')); return }
      if (!ld.pickupAddress.city && !ld.pickupAddress.country) { setError(t('inquiry.errorFrom')); return }
      for (let i = 0; i < ld.deliveryOrders.length; i++) {
        const o = ld.deliveryOrders[i]
        if (!o.address.city && !o.address.country) {
          setError(t('inquiry.errorDropAddress', { index: i + 1 })); return
        }
        if (buildCargoItems(o.rows).length === 0) {
          setError(t('inquiry.errorDropCargo', { index: i + 1 })); return
        }
      }
      payload = {
        containerNo: ld.containerNo.trim(),
        customerRef: ld.customerRef.trim() || null,
        routeFrom: mergeContact(ld.pickupAddress, ld.pickupContact),
        routeTo: {},
        deliveryOrders: ld.deliveryOrders.map((o) => ({
          customerSubRef: o.customerSubRef.trim() || null,
          deliveryAddress: {
            ...mergeContact(o.address, o.contact),
            ...(o.companyName.trim() ? { companyName: o.companyName.trim() } : {}),
          },
          remarks: o.remarks.trim() || null,
          cargoItems: buildCargoItems(o.rows),
        })),
      }
    } else {
      if (!routeFrom.city && !routeFrom.country) { setError(t('inquiry.errorFrom')); return }
      if (!routeTo.city && !routeTo.country) { setError(t('inquiry.errorTo')); return }
      // 卡车运输 FTL 本身就是整车，运输方式固定专车，不受下拉框影响
      const finalTransport = inquiry.business_type === BUSINESS_TYPES.TRUCK_FTL
        ? TRANSPORT_TYPES.FTL
        : transportType
      payload = {
        transportType: finalTransport,
        // 车型只有专车才有意义；改回拼车时必须显式传 null，
        // 否则库里会留下「拼车 + 13.6m 专车」这种自相矛盾的数据
        vehicleLengthCode: finalTransport === TRANSPORT_TYPES.FTL ? (vehicleLengthCode || null) : null,
        customerRef: customerRef.trim() || null,
        routeFrom: mergeContact(routeFrom, senderContact),
        routeTo,
        contactName: receiverContact.name.trim() || null,
        contactPhone: receiverContact.phone.trim() || null,
        contactEmail: receiverContact.email.trim() || null,
        cargoDescription: cargoDescription.trim() || null,
        remarks: remarks.trim() || null,
        cargoItems: buildCargoItems(rows),
      }
    }

    setSaving(true)
    try {
      const res = await api.put<ApiResponse<null>>(`/inquiries/${inquiry.id}`, payload)
      if (res.code === 200) {
        navigate(`/inquiry/${inquiry.id}`)
      } else {
        setError(res.message || t('inquiryEdit.saveFailed'))
      }
    } catch (err) {
      console.error('保存询价失败:', err)
      setError(err instanceof Error ? err.message : t('inquiryEdit.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <DetailSkeleton />

  if (!inquiry) {
    return (
      <DetailNotFound
        message={loadError || t('inquiryDetail.notFound')}
        backTo="/inquiry"
        backLabel={t('inquiryDetail.backToList')}
      />
    )
  }

  const isLocal = inquiry.business_type === BUSINESS_TYPES.LOCAL_DELIVERY
  const isContainer = inquiry.business_type === BUSINESS_TYPES.TRUCK_FTL
  const editable = inquiry.status === 'PENDING_QUOTE'
  const needsReopen = inquiry.status === 'QUOTED'

  // 已接受 / 已拒绝 / 已取消：终结状态，改不了也退不回，只能新建
  if (!editable && !needsReopen) {
    return (
      <div className="space-y-4">
        <DetailHeader backTo={`/inquiry/${inquiry.id}`} title={inquiry.inquiry_number} />
        <DetailNotFound
          message={t('inquiryEdit.notEditable', {
            status: t(`inquiryStatus.${inquiry.status}`, { defaultValue: inquiry.status }),
          })}
          backTo={`/inquiry/${inquiry.id}`}
          backLabel={t('inquiryEdit.backToDetail')}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <DetailHeader
        backTo={`/inquiry/${inquiry.id}`}
        title={t('inquiryEdit.title')}
        subtitle={inquiry.inquiry_number}
      />

      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
          {error}
        </div>
      )}

      {/* ===== 已报价：先退回待报价才能改 ===== */}
      {needsReopen && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <AlertTriangle className="w-4 h-4" />
            {t('inquiryEdit.quotedTitle')}
          </p>
          <p className="mt-1.5 text-xs text-amber-700 leading-relaxed">
            {t('inquiryEdit.quotedHint')}
          </p>
          <button
            type="button"
            onClick={handleReopen}
            disabled={reopening}
            className="mt-3 h-8 px-3 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-all duration-200 ease-in-out"
          >
            {reopening ? t('inquiryEdit.reopening') : t('inquiryEdit.reopenAction')}
          </button>
        </div>
      )}

      {/* 未退回之前整个表单不给动：能填却存不进去，比直接不给填更让人恼火 */}
      {editable && (
        <>
          {isLocal ? (
            <Section icon={Truck} title={t('inquiryEdit.title')}>
              <LocalDeliveryForm value={ld} onChange={setLd} />
            </Section>
          ) : (
            <>
              <Section icon={Truck} title={t('inquiryDetail.basicInfo')}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('inquiry.serviceType')}</label>
                    {/* 服务类型不给改：换类型等于换业务线，要换请新建一张 */}
                    <p className="h-8 flex items-center text-sm text-slate-900">
                      {t(`businessType.${inquiry.business_type}`, { defaultValue: inquiry.business_type })}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      {t('inquiry.transportType')}
                      {isContainer && (
                        <span className="ml-1 text-slate-400">{t('inquiry.transportTypeFixedHint')}</span>
                      )}
                    </label>
                    {isContainer ? (
                      <p className="h-8 flex items-center text-sm text-slate-900">
                        {t(`transportType.${TRANSPORT_TYPES.FTL}`)}
                      </p>
                    ) : (
                      <select
                        value={transportType}
                        onChange={(e) => setTransportType(e.target.value as TransportType)}
                        className={inputClass}
                      >
                        {TRANSPORT_TYPE_VALUES.map((v) => (
                          <option key={v} value={v}>{t(`transportType.${v}`)}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* 车型只有专车才用得上 */}
                  {(isContainer || transportType === TRANSPORT_TYPES.FTL) && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">{t('inquiry.vehicleLength')}</label>
                      <select
                        value={vehicleLengthCode}
                        onChange={(e) => setVehicleLengthCode(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">{t('inquiry.vehicleLengthAny')}</option>
                        {VEHICLE_LENGTH_CODES.map((code) => (
                          <option key={code} value={code}>{t(`vehicleLength.${code}`)}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('inquiry.customerRef')}</label>
                    <input
                      type="text"
                      value={customerRef}
                      onChange={(e) => setCustomerRef(e.target.value)}
                      placeholder={t('inquiry.phCustomerRef')}
                      className={inputClass}
                    />
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-xs text-slate-500 mb-1">{t('inquiry.cargoDescription')}</label>
                    <input
                      type="text"
                      value={cargoDescription}
                      onChange={(e) => setCargoDescription(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-xs text-slate-500 mb-1">{t('common.remark')}</label>
                    <input
                      type="text"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </Section>

              <Section icon={MapPin} title={t('inquiryDetail.addressSection')}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <AddressCard
                    title={t('inquiry.pickupSection')}
                    required
                    icon={MapPin}
                    address={routeFrom}
                    onAddressChange={setRouteFrom}
                    contact={senderContact}
                    onContactChange={setSenderContact}
                  />
                  <AddressCard
                    title={t('inquiry.deliverySection')}
                    required
                    icon={MapPin}
                    address={routeTo}
                    onAddressChange={setRouteTo}
                    contact={receiverContact}
                    onContactChange={setReceiverContact}
                  />
                </div>
              </Section>

              {/* Section 的标题用「货物信息」，不能也用「按件货物明细」——
                  CargoItemsTable 自己会渲染一行「按件货物明细」标题，两层同名会显示两遍 */}
              <Section icon={Package} title={t('inquiryDetail.cargoSection')}>
                <CargoItemsTable rows={rows} onChange={setRows} />
              </Section>
            </>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => navigate(`/inquiry/${inquiry.id}`)}
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
        </>
      )}
    </div>
  )
}
