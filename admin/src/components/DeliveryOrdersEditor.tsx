/**
 * 本地派送的派送子订单编辑（运营端，开发意见 #7 第 1 步的收尾）
 *
 * 一个柜下面挂 N 票派送，每票有自己的派送地址、收件人和件明细。
 * 运营要能改客户填错的地址、补漏掉的件 —— 在这之前运营端只能看不能改，
 * 详情页的编辑按钮是禁用的。
 *
 * 只负责「填」，提交由页面统一做。
 */

import { useTranslation } from 'react-i18next'
import { Plus, Trash2, PackageOpen, Container } from 'lucide-react'
import CargoItemsEditor from './CargoItemsEditor'
import {
  type CargoItemForm, newCargoRow, sumCargoRows,
} from './cargoItemForm'

/** 一票派送（对应后端 inquiry_delivery_orders 一行） */
export interface DeliveryOrderForm {
  key: string
  customerSubRef: string
  companyName: string
  country: string
  zipCode: string
  city: string
  address: string
  contactName: string
  contactPhone: string
  contactEmail: string
  remarks: string
  items: CargoItemForm[]
}

let dropSeq = 0
export function newDeliveryOrderRow(): DeliveryOrderForm {
  dropSeq += 1
  return {
    key: `drop-${dropSeq}`,
    customerSubRef: '', companyName: '',
    country: '', zipCode: '', city: '', address: '',
    contactName: '', contactPhone: '', contactEmail: '',
    remarks: '', items: [newCargoRow()],
  }
}

/** 后端回来的一票 → 表单行 */
export function deliveryOrderFromApi(o: any, items: CargoItemForm[]): DeliveryOrderForm {
  dropSeq += 1
  const addr = o.delivery_address || {}
  return {
    key: `drop-${dropSeq}`,
    customerSubRef: o.customer_sub_ref || '',
    companyName: addr.companyName || '',
    country: addr.country || '',
    zipCode: addr.zipCode || '',
    city: addr.city || '',
    address: addr.address || '',
    contactName: addr.contactName || '',
    contactPhone: addr.contactPhone || '',
    contactEmail: addr.contactEmail || '',
    remarks: o.remarks || '',
    items: items.length > 0 ? items : [newCargoRow()],
  }
}

const inputClass =
  'w-full h-9 px-3 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ease-in-out'

export default function DeliveryOrdersEditor({ containerNo, onContainerNoChange, orders, onChange }: {
  containerNo: string
  onContainerNoChange: (v: string) => void
  orders: DeliveryOrderForm[]
  onChange: (orders: DeliveryOrderForm[]) => void
}) {
  const { t } = useTranslation()

  const patchOrder = (key: string, patch: Partial<DeliveryOrderForm>) => {
    onChange(orders.map((o) => (o.key === key ? { ...o, ...patch } : o)))
  }

  const removeOrder = (key: string) => {
    // 删到只剩一票时补一票空的：整块消失会让人以为页面坏了
    onChange(orders.length === 1 ? [newDeliveryOrderRow()] : orders.filter((o) => o.key !== key))
  }

  // 柜合计 = 各票之和，口径和后端两级汇总一致
  const containerTotals = sumCargoRows(orders.flatMap((o) => o.items))

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <PackageOpen className="w-4 h-4 text-slate-400" />
            {t('inquiryDetail.deliveryOrdersTitle', { count: orders.length })}
          </h2>
          <button
            type="button"
            onClick={() => onChange([...orders, newDeliveryOrderRow()])}
            className="h-8 px-3 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center gap-1 transition-all duration-200 ease-in-out"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('deliveryOrdersEditor.addDrop')}
          </button>
        </div>

        <div className="max-w-md">
          <label className="block text-xs text-slate-500 mb-1">{t('field.containerNo')}</label>
          <input
            type="text"
            value={containerNo}
            onChange={(e) => onContainerNoChange(e.target.value)}
            placeholder={t('deliveryOrdersEditor.phContainerNo')}
            className={inputClass}
          />
        </div>
      </div>

      {orders.map((o, index) => (
        <div key={o.key} className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
            <span className="text-sm font-medium text-slate-700">
              {t('inquiryDetail.dropNo', { index: index + 1 })}
            </span>
            <button
              type="button"
              onClick={() => removeOrder(o.key)}
              title={t('deliveryOrdersEditor.removeDrop')}
              className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 ease-in-out"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('deliveryOrdersEditor.subRef')}</label>
                <input type="text" value={o.customerSubRef} onChange={(e) => patchOrder(o.key, { customerSubRef: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('field.receiverCompany')}</label>
                <input type="text" value={o.companyName} onChange={(e) => patchOrder(o.key, { companyName: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('common.country')}</label>
                <input type="text" value={o.country} onChange={(e) => patchOrder(o.key, { country: e.target.value })} placeholder={t('placeholder.countryCodeEg')} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('field.zipCode')}</label>
                <input type="text" value={o.zipCode} onChange={(e) => patchOrder(o.key, { zipCode: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('common.city')}</label>
                <input type="text" value={o.city} onChange={(e) => patchOrder(o.key, { city: e.target.value })} className={inputClass} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs text-slate-500 mb-1">{t('field.addressDetail')}</label>
                <input type="text" value={o.address} onChange={(e) => patchOrder(o.key, { address: e.target.value })} className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('field.receiverName')}</label>
                <input type="text" value={o.contactName} onChange={(e) => patchOrder(o.key, { contactName: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('field.phone')}</label>
                <input type="tel" value={o.contactPhone} onChange={(e) => patchOrder(o.key, { contactPhone: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('field.email')}</label>
                <input type="email" value={o.contactEmail} onChange={(e) => patchOrder(o.key, { contactEmail: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('common.remark')}</label>
                <input type="text" value={o.remarks} onChange={(e) => patchOrder(o.key, { remarks: e.target.value })} className={inputClass} />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <CargoItemsEditor
                rows={o.items}
                onChange={(items) => patchOrder(o.key, { items })}
                compact
              />
            </div>
          </div>
        </div>
      ))}

      {/* 整柜合计 */}
      <div className="flex flex-wrap items-center gap-6 px-5 py-4 bg-blue-50/60 border border-blue-100 rounded-2xl text-xs text-slate-600">
        <span className="flex items-center gap-1.5 font-medium text-slate-700">
          <Container className="w-4 h-4 text-blue-500" />
          {t('deliveryOrdersEditor.containerTotals')}
        </span>
        <span>{t('deliveryOrdersEditor.dropCount')} <b className="text-slate-900 text-sm">{orders.length}</b></span>
        <span>{t('cargo.totalPieces')} <b className="text-slate-900 text-sm">{containerTotals.quantity}</b></span>
        <span>{t('cargo.totalWeight')} <b className="text-slate-900 text-sm">{containerTotals.weight.toFixed(2)}</b> kg</span>
        <span>{t('cargo.totalVolume')} <b className="text-slate-900 text-sm">{containerTotals.volume.toFixed(3)}</b> m³</span>
        <span>LDM <b className="text-slate-900 text-sm">{containerTotals.ldm.toFixed(2)}</b></span>
      </div>
    </div>
  )
}
