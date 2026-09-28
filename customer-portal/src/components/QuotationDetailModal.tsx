/**
 * 客户门户 · 报价详情弹窗（开发意见 #21 / #22）
 *
 * 此前「我的报价」只有一个整柜总价：
 * - 本地派送看不到柜里每一票各报了多少（逐票价只在点「接受 / 拒绝」时的确认框里露一下，
 *   报价一旦转成订单或被拒，客户就再也看不到了）；
 * - 三种服务类型都没有地方看完整的报价内容。
 *
 * 这里统一成一个只读弹窗：在列表上点报价单号打开，三种服务类型通用。
 * 本地派送显示逐票明细 + 整柜合计；卡派 / 卡车显示运费、附加费、保险费与合计；
 * 已转订单的，把这张报价生成的【全部】订单列出来（一柜转 N 单时不止第一张）。
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X, ExternalLink } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { formatMoney, formatDate, formatNumber } from '../utils/format'
import { QUOTATION_STATUS_STYLES } from '../constants/inquiryQuotation'
import { BUSINESS_TYPES } from '../constants/businessTypes'

// ==================== 类型定义 ====================

/** 字段名与后端 GET /quotations/:id 返回的 JSON key 一致（snake_case，踩坑 003） */
interface AddressJson {
  country?: string
  city?: string
  zipCode?: string
  companyName?: string
}

interface DeliveryLine {
  id: string
  line_number: number
  customer_sub_ref: string | null
  delivery_address: AddressJson | null
  quantity: number | null
  weight_kg: string | null
  price: string
  currency: string | null
}

interface ConvertedOrder {
  id: string
  order_number: string
  status: string
  cargo_description: string | null
  client_price: string | null
  currency: string | null
}

interface QuotationDetail {
  id: string
  quotation_number: string
  version: number
  business_type: string
  route_from: AddressJson | null
  route_to: AddressJson | null
  base_freight: string | null
  surcharge: string | null
  insurance_fee: string | null
  total_price: string | null
  currency: string
  valid_until: string | null
  status: string
  remarks: string | null
  created_at: string
  inquiry: {
    id: string
    inquiry_number: string
    customer_ref: string | null
    container_no: string | null
    expected_arrival_date: string | null
  } | null
  deliveryLines: DeliveryLine[]
  /** 柜里还没报价的票（开发意见 #23 部分报价） */
  unpricedDeliveryOrders: Omit<DeliveryLine, 'price' | 'currency'>[]
  convertedOrders: ConvertedOrder[]
}

/** 弹窗里的一行：已报价的票带价格，未报价的 price 为 null */
type DropRow = Omit<DeliveryLine, 'price' | 'currency'> & { price: string | null; currency: string | null }

// ==================== 工具 ====================

function placeText(a: AddressJson | null | undefined): string {
  if (!a) return ''
  return [a.country, a.zipCode, a.city].filter(Boolean).join(' ')
}

/** 弹窗顶部的一项「标签 : 值」 */
function InfoItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-xs text-slate-900 truncate" title={value || ''}>{value || '-'}</p>
    </div>
  )
}

// ==================== 组件 ====================

export default function QuotationDetailModal({
  quotationId, onClose,
}: {
  quotationId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [data, setData] = useState<QuotationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await api.get<ApiResponse<QuotationDetail>>(`/quotations/${quotationId}`)
        if (cancelled) return
        if (res.code === 200 && res.data) {
          setData(res.data)
          setError('')
        } else {
          setError(res.message || t('quotations.loadFailed'))
        }
      } catch (err) {
        console.error('加载报价详情失败:', err)
        if (!cancelled) setError(t('quotations.loadFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [quotationId, t])

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isLocalDelivery = data?.business_type === BUSINESS_TYPES.LOCAL_DELIVERY
  const currency = data?.currency || 'EUR'
  // 已报 + 未报合在一起按票号排：客户要看到的是「整柜每一票」，而不是只看到报了的那几票
  const dropRows: DropRow[] = data
    ? [
      ...data.deliveryLines,
      ...(data.unpricedDeliveryOrders || []).map((d) => ({ ...d, price: null, currency: null })),
    ].sort((a, b) => a.line_number - b.line_number)
    : []
  const unpricedCount = data?.unpricedDeliveryOrders?.length || 0

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-xl">
        {/* 标题 */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">{t('quotations.detail.title')}</h3>
            {data && (
              <p className="text-xs text-slate-500 truncate">
                {data.quotation_number}{data.version > 1 ? ` · V${data.version}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {data && (
              <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ${
                QUOTATION_STATUS_STYLES[data.status] || 'bg-gray-100 text-gray-600'
              }`}>
                {t(`quotationStatus.${data.status}`, { defaultValue: data.status })}
              </span>
            )}
            <button
              onClick={onClose}
              title={t('common.close')}
              className="text-slate-400 hover:text-slate-600 transition-all duration-200 ease-in-out"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : error || !data ? (
            <p className="text-sm text-red-600">{error || t('quotations.loadFailed')}</p>
          ) : (
            <>
              {/* 概要 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50 rounded-xl px-4 py-3">
                <InfoItem label={t('quotations.fromInquiry')} value={data.inquiry?.inquiry_number} />
                <InfoItem
                  label={t('quotations.serviceType')}
                  value={t(`businessType.${data.business_type}`, { defaultValue: data.business_type })}
                />
                <InfoItem label={t('inquiry.containerNo')} value={data.inquiry?.container_no} />
                <InfoItem label={t('inquiry.customerRef')} value={data.inquiry?.customer_ref} />
                <InfoItem
                  label={t('common.route')}
                  value={`${placeText(data.route_from) || '-'} → ${placeText(data.route_to) || '-'}`}
                />
                <InfoItem
                  label={t('inquiry.expectedArrivalDate')}
                  value={data.inquiry?.expected_arrival_date ? formatDate(data.inquiry.expected_arrival_date) : null}
                />
                <InfoItem label={t('quotations.validUntil')} value={data.valid_until ? formatDate(data.valid_until) : null} />
                <InfoItem label={t('common.createdAt')} value={formatDate(data.created_at)} />
              </div>

              {/* 金额明细 */}
              {isLocalDelivery ? (
                // 本地派送：逐票报价 + 整柜合计（开发意见 #21）
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <p className="px-4 py-2 text-xs font-medium text-slate-700 bg-gray-50 border-b border-gray-200">
                    {t('quotations.deliveryLines', { count: dropRows.length })}
                    {unpricedCount > 0 && (
                      <span className="ml-2 inline-block px-2 py-0.5 text-[10px] font-normal rounded-full bg-amber-100 text-amber-700">
                        {t('quotations.progressPartial', { priced: dropRows.length - unpricedCount, total: dropRows.length })}
                      </span>
                    )}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed min-w-[560px]">
                      <colgroup>
                        <col className="w-[8%]" />
                        <col className="w-[22%]" />
                        <col className="w-[34%]" />
                        <col className="w-[16%]" />
                        <col className="w-[20%]" />
                      </colgroup>
                      <thead>
                        <tr className="text-[11px] text-slate-500 border-b border-gray-100">
                          <th className="text-center px-3 py-2 font-medium">{t('common.seq')}</th>
                          <th className="text-left px-3 py-2 font-medium">{t('quotations.detail.subRef')}</th>
                          <th className="text-left px-3 py-2 font-medium">{t('quotations.detail.deliverTo')}</th>
                          <th className="text-right px-3 py-2 font-medium">{t('quotations.detail.cargo')}</th>
                          <th className="text-right px-3 py-2 font-medium">{t('quotations.detail.linePrice')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dropRows.map((l) => (
                          <tr key={l.id} className="border-b border-gray-50">
                            <td className="text-center px-3 py-2 text-xs text-slate-400 tabular-nums">{l.line_number}</td>
                            <td className="text-left px-3 py-2 text-xs text-slate-900 truncate" title={l.customer_sub_ref || ''}>
                              {l.customer_sub_ref || '-'}
                            </td>
                            <td
                              className="text-left px-3 py-2 text-xs text-slate-600 truncate"
                              title={[l.delivery_address?.companyName, placeText(l.delivery_address)].filter(Boolean).join(' · ')}
                            >
                              {[l.delivery_address?.companyName, placeText(l.delivery_address)].filter(Boolean).join(' · ') || '-'}
                            </td>
                            <td className="text-right px-3 py-2 text-xs text-slate-600 tabular-nums">
                              {t('quotations.detail.cargoValue', {
                                qty: l.quantity ?? '-',
                                weight: formatNumber(l.weight_kg),
                              })}
                            </td>
                            <td className="text-right px-3 py-2 text-xs font-medium text-slate-900 tabular-nums">
                              {l.price === null
                                ? <span className="font-normal text-amber-600">{t('quotations.unpriced')}</span>
                                : formatMoney(l.price, l.currency || currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50">
                          <td colSpan={4} className="text-right px-3 py-2.5 text-xs font-medium text-slate-700">
                            {/* 部分报价时合计只是已报几票之和，要说清楚，别让客户当成整柜总价 */}
                            {unpricedCount > 0 ? t('quotations.detail.pricedTotal') : t('quotations.detail.containerTotal')}
                          </td>
                          <td className="text-right px-3 py-2.5 text-sm font-semibold text-slate-900 tabular-nums">
                            {formatMoney(data.total_price, currency)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ) : (
                // 卡派 / 卡车：运费 + 附加费 + 保险费 = 合计
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
                  {[
                    { key: 'baseFreight', value: data.base_freight },
                    { key: 'surcharge', value: data.surcharge },
                    { key: 'insuranceFee', value: data.insurance_fee },
                  ].map((row) => (
                    <div key={row.key} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-slate-500">{t(`quotations.detail.${row.key}`)}</span>
                      <span className="text-xs text-slate-900 tabular-nums">{formatMoney(row.value, currency)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 rounded-b-xl">
                    <span className="text-xs font-medium text-slate-700">{t('quotations.detail.total')}</span>
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">
                      {formatMoney(data.total_price, currency)}
                    </span>
                  </div>
                </div>
              )}

              {/* 已生成的订单（开发意见 #22）：一柜转 N 单时全部列出 */}
              {data.convertedOrders.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-700 mb-2">
                    {t('quotations.detail.orders', { count: data.convertedOrders.length })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {data.convertedOrders.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => navigate(`/orders/${o.id}`)}
                        title={t('quotations.viewOrder')}
                        className="flex items-center gap-1.5 h-8 px-3 border border-gray-200 rounded-lg text-xs text-primary-600 hover:bg-primary-50 transition-all duration-200 ease-in-out"
                      >
                        <span className="font-medium">{o.order_number}</span>
                        <span className="text-slate-400">
                          {t(`orderStatus.${o.status}`, { defaultValue: o.status })}
                        </span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {data.remarks && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t('common.remark')}</p>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap">{data.remarks}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
