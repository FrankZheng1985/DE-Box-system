/**
 * 客户门户 · 订单详情（开发意见 #11）
 *
 * 取数走 GET /orders/:id 和 GET /orders/:id/timeline。
 *
 * ⚠️ 这两个接口是三端共用的，后端已按登录身份做了字段白名单
 *    （server/modules/order/portal-view.js）：客户拿不到 carrier_cost 等内部字段，
 *    状态时间线也去掉了内部员工姓名。所以这里能读到的都是可以给客户看的，
 *    但**不要**因此在前端"自己藏一下就行" —— 藏在前端等于没藏（踩坑 054）。
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, MapPin, Package, Ship, History, Pencil } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../utils/format'
import {
  DetailHeader, Section, Field, FieldGrid, AddressBlock,
  DetailSkeleton, DetailNotFound, type AddressJson,
} from '../components/DetailPanels'
import { BUSINESS_TYPES, getStatusLabel, getStatusStyle } from '../constants/businessTypes'
import OrderMessagePanel from '../components/OrderMessagePanel'

// ==================== 类型定义 ====================
//
// ⚠️ 逐字对齐后端白名单里的字段名（server/modules/order/portal-view.js 的 CLIENT_FIELDS）。
//    白名单里没有的字段在这里声明也读不到，自造名字读到 undefined 且不报错（踩坑 066）。
//    NUMERIC 列回来是字符串（踩坑 002）。

interface OrderDetailData {
  id: string
  order_number: string
  customer_ref: string | null
  business_type: string
  transport_type: string | null
  service_channel: string | null
  status: string
  pickup_address: AddressJson | null
  delivery_address: AddressJson | null
  pod: string | null
  final_destination: string | null
  final_dest_address: string | null
  cnee: string | null
  cargo_description: string | null
  cargo_weight_kg: string | null
  cargo_volume_m3: string | null
  cargo_quantity: number | null
  special_requirements: string | null
  container_no: string | null
  container_type: string | null
  seal_no: string | null
  bl_number: string | null
  shipping_line: string | null
  eta: string | null
  pickup_date: string | null
  delivery_date: string | null
  expected_delivery_date: string | null
  created_at: string
  updated_at: string | null
  needs_clearance: boolean | null
  release_method: string | null
  release_status: string | null
  clearance_status: string | null
  tracking_number: string | null
  client_price: string | null
  currency: string | null
  carrier_name: string | null
  remarks: string | null
}

/** 详情接口的外层：{ order, documentFlow, statusLogs }，门户拿不到 documentFlow */
interface OrderDetailResponse {
  order: OrderDetailData
}

/** 状态时间线的一条（门户版只有这三个字段，后端已去掉操作人和内部备注） */
interface TimelineEntry {
  from_status: string | null
  to_status: string
  created_at: string
}

// ==================== 主组件 ====================

export default function OrderDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [order, setOrder] = useState<OrderDetailData | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        // 时间线挂了只是少一块卡片，不能连累整页报错
        const [detailRes, timelineRes] = await Promise.all([
          api.get<ApiResponse<OrderDetailResponse>>(`/orders/${id}`),
          api.get<ApiResponse<TimelineEntry[]>>(`/orders/${id}/timeline`).catch((err) => {
            console.warn('加载订单时间线失败:', err)
            return null
          }),
        ])
        if (cancelled) return

        if (detailRes.code === 200 && detailRes.data?.order) {
          setOrder(detailRes.data.order)
        } else {
          // 必须显示后端 message，别把失败伪装成"没有数据"（踩坑 011）
          setOrder(null)
          setError(detailRes.message || t('orderDetail.loadFailed'))
        }
        setTimeline(timelineRes && timelineRes.code === 200 ? (timelineRes.data || []) : [])
      } catch (err) {
        if (cancelled) return
        console.error('加载订单详情失败:', err)
        setOrder(null)
        setError(err instanceof Error ? err.message : t('orderDetail.loadFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [id, t])

  if (loading) return <DetailSkeleton />

  if (!order) {
    return (
      <DetailNotFound
        message={error || t('orderDetail.notFound')}
        backTo="/orders"
        backLabel={t('createOrder.backToList')}
      />
    )
  }

  const isContainer = order.business_type === BUSINESS_TYPES.TRUCK_FTL
  const isLocalDelivery = order.business_type === BUSINESS_TYPES.LOCAL_DELIVERY
  const yesNo = (v: boolean | null) => (v === null || v === undefined ? null : v ? t('common.yes') : t('common.no'))

  return (
    <div className="space-y-4">
      <DetailHeader
        backTo="/orders"
        title={order.order_number}
        subtitle={order.customer_ref ? `${t('orders.customerRef')}: ${order.customer_ref}` : undefined}
        right={
          <>
            {/* 只有「待审核」（我司尚未受理）才给改，且账号要有改单权限（开发意见 #12）。
                本地派送订单没有这个状态，自然也就没有这个按钮 */}
            {order.status === 'PENDING_REVIEW' && hasPermission('portal:order_edit') && (
              <button
                type="button"
                onClick={() => navigate(`/orders/${order.id}/edit`)}
                className="h-8 px-3 text-xs text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-200 ease-in-out flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                {t('orderEdit.entry')}
              </button>
            )}
            <span className={`inline-block px-2.5 py-1 text-xs rounded-full ${getStatusStyle(order.status)}`}>
              {getStatusLabel(t, order.business_type, order.status)}
            </span>
          </>
        }
      />

      {/* ===== 基本信息 ===== */}
      <Section icon={FileText} title={t('createOrder.sectionBasic')}>
        <FieldGrid>
          <Field label={t('common.orderNo')} value={order.order_number} />
          <Field label={t('orders.customerRef')} value={order.customer_ref} />
          <Field
            label={t('createOrder.serviceType')}
            value={t(`businessType.${order.business_type}`, { defaultValue: order.business_type })}
          />
          {!isLocalDelivery && (
            <Field
              label={t('createOrder.transportType')}
              value={order.transport_type
                ? t(`transportType.${order.transport_type}`, { defaultValue: order.transport_type })
                : null}
            />
          )}
          {/* 服务渠道只在本地派送用得上（这一票由自有车队还是 DPD/DHL 派送） */}
          {isLocalDelivery && (
            <Field label={t('orderDetail.serviceChannel')} value={order.service_channel} />
          )}
          <Field label={t('orders.trackingNo')} value={order.tracking_number} />
          <Field label={t('orders.price')} value={formatMoney(order.client_price, order.currency || 'EUR')} />
          <Field label={t('orderDetail.carrier')} value={order.carrier_name} />
          <Field label={t('common.createdAt')} value={formatDateTime(order.created_at)} />
          <Field label={t('common.updatedAt')} value={formatDateTime(order.updated_at)} />
        </FieldGrid>
      </Section>

      {/* ===== 地址 ===== */}
      <Section icon={MapPin} title={t('orderDetail.addressSection')}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AddressBlock
            title={isContainer ? t('createOrder.sectionPickupFtl') : t('createOrder.pickupAddress')}
            value={order.pickup_address}
          />
          <AddressBlock title={t('createOrder.deliveryAddress')} value={order.delivery_address} />
        </div>
        {isContainer && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <FieldGrid>
              <Field label={t('createOrder.pod')} value={order.pod} />
              <Field label={t('createOrder.finalDestination')} value={order.final_destination} />
              <Field label={t('createOrder.finalDestAddress')} value={order.final_dest_address} />
            </FieldGrid>
          </div>
        )}
      </Section>

      {/* ===== 货物信息 ===== */}
      <Section icon={Package} title={t('createOrder.sectionCargo')}>
        <FieldGrid>
          <Field label={t('createOrder.cargoDescription')} value={order.cargo_description} />
          <Field label={t('createOrder.quantity')} value={order.cargo_quantity} />
          <Field label={t('createOrder.weightKg')} value={formatNumber(order.cargo_weight_kg)} />
          <Field label={t('createOrder.volumeM3')} value={formatNumber(order.cargo_volume_m3)} />
          <Field
            label={t('createOrder.specialRequirements')}
            value={order.special_requirements
              ? t(`specialRequirement.${order.special_requirements}`, { defaultValue: order.special_requirements })
              : null}
          />
        </FieldGrid>
        {order.remarks && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Field label={t('common.remark')} value={order.remarks} />
          </div>
        )}
      </Section>

      {/* ===== 集装箱 / 航运（只有整柜单才有） ===== */}
      {isContainer && (
        <Section icon={Ship} title={t('createOrder.sectionContainer')}>
          <FieldGrid>
            <Field label={t('createOrder.containerNo')} value={order.container_no} />
            <Field label={t('createOrder.containerType')} value={order.container_type} />
            <Field label={t('createOrder.sealNo')} value={order.seal_no} />
            <Field label={t('createOrder.blNumber')} value={order.bl_number} />
            <Field label={t('createOrder.shippingLine')} value={order.shipping_line} />
            <Field label={t('createOrder.eta')} value={formatDateTime(order.eta)} />
            <Field label={t('createOrder.cnee')} value={order.cnee} />
            <Field
              label={t('createOrder.releaseMethod')}
              value={order.release_method
                ? t(`releaseMethod.${order.release_method}`, { defaultValue: order.release_method })
                : null}
            />
            <Field label={t('createOrder.needsClearance')} value={yesNo(order.needs_clearance)} />
            <Field
              label={t('orderDetail.releaseStatus')}
              value={order.release_status
                ? t(`releaseStatus.${order.release_status}`, { defaultValue: order.release_status })
                : null}
            />
            <Field
              label={t('orderDetail.clearanceStatus')}
              value={order.clearance_status
                ? t(`clearanceStatus.${order.clearance_status}`, { defaultValue: order.clearance_status })
                : null}
            />
          </FieldGrid>
        </Section>
      )}

      {/* ===== 时间安排 ===== */}
      <Section icon={History} title={t('createOrder.sectionSchedule')}>
        <FieldGrid>
          <Field label={t('createOrder.pickupDate')} value={formatDate(order.pickup_date)} />
          <Field label={t('createOrder.deliveryDate')} value={formatDate(order.delivery_date)} />
          <Field label={t('createOrder.expectedDeliveryDate')} value={formatDate(order.expected_delivery_date)} />
        </FieldGrid>

        {/* 状态时间线：没有记录时明确说"暂无"，不要留一片空白 */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-slate-700 mb-3">{t('orderDetail.timeline')}</p>
          {timeline.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">{t('orderDetail.noTimeline')}</p>
          ) : (
            <ol className="space-y-3">
              {timeline.map((entry, i) => (
                <li key={`${entry.created_at}-${i}`} className="flex items-start gap-3">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-primary-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900">
                      {entry.from_status && (
                        <>
                          <span className="text-slate-500">
                            {getStatusLabel(t, order.business_type, entry.from_status)}
                          </span>
                          <span className="mx-1.5 text-slate-400">→</span>
                        </>
                      )}
                      {getStatusLabel(t, order.business_type, entry.to_status)}
                    </p>
                    <p className="text-xs text-slate-400">{formatDateTime(entry.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Section>

      {/* ===== 订单日志：我司发布的履约信息 + 已读/回复（意见 #14） ===== */}
      <OrderMessagePanel orderId={order.id} />
    </div>
  )
}
