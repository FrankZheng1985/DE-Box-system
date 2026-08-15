/**
 * 本地派送的逐票报价（开发意见 #7 第 2 步）
 *
 * 一个柜下面有多票派送，运营给每一票单独填价，整柜合计 = 各票之和。
 * 合计是**算出来的**，不给编辑：让人既能改总额又能改分项，两边迟早对不上。
 *
 * 只负责这一块的填写与展示，提交由页面统一做。
 */

import { useTranslation } from 'react-i18next'
import { PackageOpen } from 'lucide-react'

/** 询价里的一票派送（来自 GET /inquiries/:id 的 deliveryOrders） */
export interface DeliveryOrderRef {
  id: string
  line_number: number
  customer_sub_ref: string | null
  delivery_address: {
    companyName?: string; country?: string; zipCode?: string; city?: string; address?: string
    contactName?: string; contactPhone?: string
  } | null
  quantity: number | null
  weight_kg: string | null
  ldm: string | null
}

/** key = delivery_order_id，value = 这一票的报价（字符串，避免受控 number 清空跳 0） */
export type DeliveryPriceMap = Record<string, string>

interface Props {
  orders: DeliveryOrderRef[]
  prices: DeliveryPriceMap
  onChange: (prices: DeliveryPriceMap) => void
  currency: string
  /** 只读模式：报价详情页展示用 */
  readOnly?: boolean
}

const inputClass =
  'w-full h-9 px-3 border border-slate-200 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ease-in-out'

export function sumDeliveryPrices(prices: DeliveryPriceMap): number {
  return Object.values(prices).reduce((sum, v) => {
    const n = Number(v)
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
}

export default function QuotationDeliveryLines({
  orders, prices, onChange, currency, readOnly = false,
}: Props) {
  const { t } = useTranslation()
  const total = sumDeliveryPrices(prices)

  const addressText = (o: DeliveryOrderRef) => {
    const a = o.delivery_address || {}
    return [a.companyName, a.zipCode, a.city, a.address].filter(Boolean).join(' · ') || '-'
  }

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <PackageOpen className="w-4 h-4 text-slate-400" />
          {t('quotationDeliveryLines.title', { count: orders.length })}
        </h2>
        <span className="text-xs text-slate-400">{t('quotationDeliveryLines.hint')}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed min-w-[720px]">
          <colgroup>
            <col className="w-[6%]" />
            <col className="w-[16%]" />
            <col className="w-[34%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[22%]" />
          </colgroup>
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-100">
              <th className="text-left px-3 py-2.5 font-medium">#</th>
              <th className="text-left px-3 py-2.5 font-medium">{t('quotationDeliveryLines.colSubRef')}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t('quotationDeliveryLines.colDropTo')}</th>
              <th className="text-right px-3 py-2.5 font-medium">{t('cargo.colPieces')}</th>
              <th className="text-right px-3 py-2.5 font-medium">{t('field.weightKg')}</th>
              <th className="text-right px-3 py-2.5 font-medium">
                {t('quotationDeliveryLines.colPrice')} ({currency})
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-slate-50">
                <td className="text-left px-3 py-2.5 text-xs text-slate-500">{o.line_number}</td>
                <td className="text-left px-3 py-2.5 text-xs text-slate-900 truncate">
                  {o.customer_sub_ref || '-'}
                </td>
                <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate" title={addressText(o)}>
                  {addressText(o)}
                </td>
                <td className="text-right px-3 py-2.5 text-xs text-slate-600">{o.quantity ?? '-'}</td>
                <td className="text-right px-3 py-2.5 text-xs text-slate-600">
                  {o.weight_kg !== null && o.weight_kg !== undefined ? Number(o.weight_kg).toFixed(2) : '-'}
                </td>
                <td className="px-3 py-2">
                  {readOnly ? (
                    <p className="text-sm text-slate-900 text-right font-medium">
                      {Number(prices[o.id] || 0).toFixed(2)}
                    </p>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={prices[o.id] ?? ''}
                      onChange={(e) => onChange({ ...prices, [o.id]: e.target.value })}
                      placeholder="0.00"
                      className={inputClass}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-3 px-5 py-3.5 bg-slate-50 border-t border-slate-100">
        <span className="text-xs text-slate-500">{t('quotationDeliveryLines.total')}</span>
        <span className="text-lg font-bold text-blue-600">
          {total.toFixed(2)} {currency}
        </span>
      </div>
    </div>
  )
}
