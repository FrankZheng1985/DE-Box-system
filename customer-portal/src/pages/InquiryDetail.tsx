/**
 * 客户门户 · 询价详情（开发意见 #11）
 *
 * 在此之前客户端只有询价列表，看不到地址、联系人和按件明细，
 * 运营和客户核对信息只能互相截图。
 *
 * 取数走后端真正的详情接口 GET /inquiries/:id ——
 * **不要**改成拉列表再 find，那条路会随数据量增长而必然失效（踩坑 067）。
 * 租户隔离和草稿报价过滤都在后端做，前端不做任何"藏起来"的处理（踩坑 054）。
 */

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, MapPin, Package, Tag, Truck } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../utils/format'
import {
  DetailHeader, Section, Field, FieldGrid, AddressBlock,
  DetailSkeleton, DetailNotFound, type AddressJson,
} from '../components/DetailPanels'
import { BUSINESS_TYPES } from '../constants/businessTypes'
import { INQUIRY_STATUS_STYLES, QUOTATION_STATUS_STYLES } from '../constants/inquiryQuotation'

// ==================== 类型定义 ====================
//
// ⚠️ 字段名逐字对齐后端返回（snake_case），自造名字读到的是 undefined 而且不报错（踩坑 066）。
// NUMERIC 列回来是字符串（踩坑 002），所以数值一律声明成 string | null，显示前用 format* 转。

/** inquiry_cargo_items 的一行 */
interface CargoItem {
  id: string
  line_number: number
  reference_no: string | null
  description: string | null
  quantity: number
  length_cm: string | null
  width_cm: string | null
  height_cm: string | null
  unit_weight_kg: string | null
  unit_volume_m3: string | null
  ldm: string | null
  remarks: string | null
}

/** inquiry_delivery_orders 的一行（本地派送三层结构的中间层：一票派送） */
interface DeliveryOrder {
  id: string
  line_number: number
  customer_sub_ref: string | null
  delivery_address: AddressJson | null
  quantity: number | null
  weight_kg: string | null
  volume_m3: string | null
  ldm: string | null
  remarks: string | null
  cargoItems: CargoItem[]
}

/** 详情接口带回来的报价（后端已过滤掉草稿） */
interface QuotationBrief {
  id: string
  quotation_number: string
  version: number
  total_price: string | null
  currency: string | null
  status: string
  valid_until: string | null
  created_at: string
}

interface InquiryDetailData {
  id: string
  inquiry_number: string
  customer_ref: string | null
  business_type: string
  transport_type: string | null
  vehicle_length_code: string | null
  container_no: string | null
  container_type: string | null
  pod: string | null
  route_from: AddressJson | null
  route_to: AddressJson | null
  /** 收货侧联系人在 inquiries 表自己的列上，不在 route_to 里 */
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  cargo_description: string | null
  cargo_quantity: number | null
  cargo_weight_kg: string | null
  cargo_volume_m3: string | null
  ldm: string | null
  special_requirements: string | null
  remarks: string | null
  status: string
  created_at: string
  updated_at: string | null
  cargoItems: CargoItem[]
  deliveryOrders: DeliveryOrder[]
  quotations: QuotationBrief[]
}

// ==================== 按件明细表 ====================

/**
 * 按件货物明细
 *
 * 表格规范：table-fixed + colgroup 定列宽，th 和 td 同列对齐方式一致，
 * 数字右对齐、编号和描述左对齐。
 */
function CargoItemsTable({ items }: { items: CargoItem[] }) {
  const { t } = useTranslation()
  if (items.length === 0) {
    return <p className="text-sm text-slate-400 py-4 text-center">{t('inquiryDetail.noCargoItems')}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed min-w-[720px]">
        <colgroup>
          <col className="w-[6%]" />
          <col className="w-[14%]" />
          <col className="w-[20%]" />
          <col className="w-[8%]" />
          <col className="w-[9%]" />
          <col className="w-[9%]" />
          <col className="w-[9%]" />
          <col className="w-[11%]" />
          <col className="w-[8%]" />
          <col className="w-[6%]" />
        </colgroup>
        <thead>
          <tr className="text-xs text-slate-500 border-b border-gray-100">
            <th className="text-right px-2 py-2 font-medium">#</th>
            <th className="text-left px-2 py-2 font-medium">{t('inquiry.colRef')}</th>
            <th className="text-left px-2 py-2 font-medium">{t('inquiry.colDesc')}</th>
            <th className="text-right px-2 py-2 font-medium">{t('inquiry.colQty')}</th>
            <th className="text-right px-2 py-2 font-medium">{t('inquiry.colLength')}</th>
            <th className="text-right px-2 py-2 font-medium">{t('inquiry.colWidth')}</th>
            <th className="text-right px-2 py-2 font-medium">{t('inquiry.colHeight')}</th>
            <th className="text-right px-2 py-2 font-medium">{t('inquiry.colUnitWeight')}</th>
            <th className="text-right px-2 py-2 font-medium">{t('inquiry.colVolume')}</th>
            <th className="text-right px-2 py-2 font-medium">LDM</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-gray-50">
              <td className="text-right px-2 py-2 text-xs text-slate-400">{item.line_number}</td>
              <td className="text-left px-2 py-2 text-xs text-slate-600 truncate" title={item.reference_no || undefined}>
                {item.reference_no || '-'}
              </td>
              <td className="text-left px-2 py-2 text-xs text-slate-600 truncate" title={item.description || undefined}>
                {item.description || '-'}
              </td>
              <td className="text-right px-2 py-2 text-xs text-slate-600">{item.quantity ?? '-'}</td>
              <td className="text-right px-2 py-2 text-xs text-slate-600">{formatNumber(item.length_cm)}</td>
              <td className="text-right px-2 py-2 text-xs text-slate-600">{formatNumber(item.width_cm)}</td>
              <td className="text-right px-2 py-2 text-xs text-slate-600">{formatNumber(item.height_cm)}</td>
              <td className="text-right px-2 py-2 text-xs text-slate-600">{formatNumber(item.unit_weight_kg)}</td>
              <td className="text-right px-2 py-2 text-xs text-slate-600">{formatNumber(item.unit_volume_m3)}</td>
              <td className="text-right px-2 py-2 text-xs text-slate-600">{formatNumber(item.ldm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ==================== 主组件 ====================

export default function InquiryDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [inquiry, setInquiry] = useState<InquiryDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await api.get<ApiResponse<InquiryDetailData>>(`/inquiries/${id}`)
        if (cancelled) return
        if (res.code === 200 && res.data) {
          setInquiry(res.data)
        } else {
          // 必须显示后端 message，别把失败伪装成"没有数据"（踩坑 011）
          setInquiry(null)
          setError(res.message || t('inquiryDetail.loadFailed'))
        }
      } catch (err) {
        if (cancelled) return
        console.error('加载询价详情失败:', err)
        setInquiry(null)
        setError(err instanceof Error ? err.message : t('inquiryDetail.loadFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [id, t])

  if (loading) return <DetailSkeleton />

  if (!inquiry) {
    return (
      <DetailNotFound
        message={error || t('inquiryDetail.notFound')}
        backTo="/inquiry"
        backLabel={t('inquiryDetail.backToList')}
      />
    )
  }

  const isLocalDelivery = inquiry.business_type === BUSINESS_TYPES.LOCAL_DELIVERY
  const isContainer = inquiry.business_type === BUSINESS_TYPES.TRUCK_FTL
  // 三层结构的单，件明细挂在各票子订单下，顶层 cargoItems 后端会回空数组
  const hasDeliveryOrders = inquiry.deliveryOrders && inquiry.deliveryOrders.length > 0

  return (
    <div className="space-y-4">
      <DetailHeader
        backTo="/inquiry"
        title={inquiry.inquiry_number}
        subtitle={inquiry.customer_ref ? `${t('inquiry.customerRef')}: ${inquiry.customer_ref}` : undefined}
        right={
          <span className={`inline-block px-2.5 py-1 text-xs rounded-full ${
            INQUIRY_STATUS_STYLES[inquiry.status] || 'bg-gray-100 text-gray-600'
          }`}>
            {t(`inquiryStatus.${inquiry.status}`, { defaultValue: inquiry.status })}
          </span>
        }
      />

      {/* ===== 基本信息 ===== */}
      <Section icon={FileText} title={t('inquiryDetail.basicInfo')}>
        <FieldGrid>
          <Field label={t('inquiry.inquiryNo')} value={inquiry.inquiry_number} />
          <Field label={t('inquiry.customerRef')} value={inquiry.customer_ref} />
          <Field
            label={t('inquiry.serviceType')}
            value={t(`businessType.${inquiry.business_type}`, { defaultValue: inquiry.business_type })}
          />
          {!isLocalDelivery && (
            <Field
              label={t('inquiry.transportType')}
              value={inquiry.transport_type
                ? t(`transportType.${inquiry.transport_type}`, { defaultValue: inquiry.transport_type })
                : null}
            />
          )}
          {inquiry.vehicle_length_code && (
            <Field
              label={t('inquiry.vehicleLength')}
              value={t(`vehicleLength.${inquiry.vehicle_length_code}`, { defaultValue: inquiry.vehicle_length_code })}
            />
          )}
          {(isLocalDelivery || isContainer) && (
            <Field label={t('inquiry.containerNo')} value={inquiry.container_no} />
          )}
          {isContainer && <Field label={t('createOrder.containerType')} value={inquiry.container_type} />}
          {isContainer && <Field label={t('createOrder.pod')} value={inquiry.pod} />}
          <Field label={t('common.createdAt')} value={formatDateTime(inquiry.created_at)} />
          <Field label={t('common.updatedAt')} value={formatDateTime(inquiry.updated_at)} />
        </FieldGrid>
      </Section>

      {/* ===== 地址与联系人 ===== */}
      <Section icon={MapPin} title={t('inquiryDetail.addressSection')}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AddressBlock title={t('inquiry.pickupSection')} value={inquiry.route_from} />
          {/* 本地派送的收货地址在每一票子订单上，顶层 route_to 是空的，
              这里显示整柜级的收货信息没有意义，所以只在两层结构下渲染 */}
          {!hasDeliveryOrders && (
            <AddressBlock
              title={t('inquiry.deliverySection')}
              value={{
                ...(inquiry.route_to || {}),
                // 收货侧联系人存在 inquiries 表自己的列上，拼进来一起显示
                contactName: inquiry.contact_name,
                contactPhone: inquiry.contact_phone,
                contactEmail: inquiry.contact_email,
              }}
            />
          )}
        </div>
      </Section>

      {/* ===== 货物信息 ===== */}
      <Section
        icon={Package}
        title={t('inquiryDetail.cargoSection')}
        extra={
          <span className="text-xs text-slate-500">
            {t('inquiry.totalQty')} {inquiry.cargo_quantity ?? '-'} · {t('inquiry.totalWeight')} {formatNumber(inquiry.cargo_weight_kg)} kg
          </span>
        }
      >
        <FieldGrid>
          <Field label={t('inquiry.cargoDescription')} value={inquiry.cargo_description} />
          <Field label={t('inquiry.totalQty')} value={inquiry.cargo_quantity} />
          <Field label={t('inquiry.weightKg')} value={formatNumber(inquiry.cargo_weight_kg)} />
          <Field label={t('inquiry.totalVolume')} value={formatNumber(inquiry.cargo_volume_m3)} />
          <Field label="LDM" value={formatNumber(inquiry.ldm)} />
          <Field
            label={t('createOrder.specialRequirements')}
            value={inquiry.special_requirements
              ? t(`specialRequirement.${inquiry.special_requirements}`, { defaultValue: inquiry.special_requirements })
              : null}
          />
        </FieldGrid>
        {inquiry.remarks && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Field label={t('common.remark')} value={inquiry.remarks} />
          </div>
        )}

        {/* 两层结构：件明细直接挂在询价单下 */}
        {!hasDeliveryOrders && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-medium text-slate-700 mb-2">{t('inquiry.cargoItems')}</p>
            <CargoItemsTable items={inquiry.cargoItems || []} />
          </div>
        )}
      </Section>

      {/* ===== 本地派送：一柜 N 票 ===== */}
      {hasDeliveryOrders && (
        <Section
          icon={Truck}
          title={t('inquiry.deliveryOrders')}
          extra={
            <span className="text-xs text-slate-500">
              {t('inquiry.deliveryOrderCount', { count: inquiry.deliveryOrders.length })}
            </span>
          }
        >
          <div className="space-y-4">
            {inquiry.deliveryOrders.map((drop) => (
              <div key={drop.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <p className="text-sm font-medium text-slate-900">
                    {t('inquiry.deliveryOrderNo', { index: drop.line_number })}
                    {drop.customer_sub_ref && (
                      <span className="ml-2 text-xs text-slate-500">{drop.customer_sub_ref}</span>
                    )}
                  </p>
                  <span className="text-xs text-slate-500">
                    {t('inquiry.dropSubtotal')}: {drop.quantity ?? '-'} {t('inquiry.piecesUnit')} ·
                    {' '}{formatNumber(drop.weight_kg)} kg · LDM {formatNumber(drop.ldm)}
                  </span>
                </div>

                <AddressBlock title={t('inquiry.deliverySection')} value={drop.delivery_address} />

                {drop.remarks && (
                  <p className="mt-2 text-xs text-slate-500">{t('common.remark')}: {drop.remarks}</p>
                )}

                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-700 mb-2">{t('inquiry.itemsOfThisDrop')}</p>
                  <CargoItemsTable items={drop.cargoItems || []} />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ===== 已收到的报价 ===== */}
      <Section icon={Tag} title={t('inquiryDetail.quotationSection')}>
        {(inquiry.quotations || []).length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">{t('inquiryDetail.noQuotations')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed min-w-[620px]">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[10%]" />
                <col className="w-[18%]" />
                <col className="w-[16%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
              </colgroup>
              <thead>
                <tr className="text-xs text-slate-500 border-b border-gray-100">
                  <th className="text-left px-3 py-2 font-medium">{t('quotations.quotationNo')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('inquiryDetail.version')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('quotations.amount')}</th>
                  <th className="text-center px-3 py-2 font-medium">{t('common.status')}</th>
                  <th className="text-center px-3 py-2 font-medium">{t('quotations.validUntil')}</th>
                  <th className="text-center px-3 py-2 font-medium">{t('common.createdAt')}</th>
                </tr>
              </thead>
              <tbody>
                {inquiry.quotations.map((q) => (
                  <tr key={q.id} className="border-b border-gray-50">
                    <td className="text-left px-3 py-2.5 text-xs font-medium text-slate-900 truncate">
                      {q.quotation_number}
                    </td>
                    <td className="text-right px-3 py-2.5 text-xs text-slate-600">v{q.version}</td>
                    <td className="text-right px-3 py-2.5 text-xs text-slate-900">
                      {formatMoney(q.total_price, q.currency || 'EUR')}
                    </td>
                    <td className="text-center px-3 py-2.5">
                      <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ${
                        QUOTATION_STATUS_STYLES[q.status] || 'bg-gray-100 text-gray-600'
                      }`}>
                        {t(`quotationStatus.${q.status}`, { defaultValue: q.status })}
                      </span>
                    </td>
                    <td className="text-center px-3 py-2.5 text-xs text-slate-500">{formatDate(q.valid_until)}</td>
                    <td className="text-center px-3 py-2.5 text-xs text-slate-500">{formatDate(q.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
