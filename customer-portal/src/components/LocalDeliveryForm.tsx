/**
 * 本地派送建单表单：柜 → 派送子订单 → 件（开发意见 #7）
 *
 * 和另外两种服务的两层表单结构完全不同，所以独立成一个组件而不是往
 * InquiryList 里堆 if：一个柜下面挂 N 票货，每票有自己的派送地址、收件人
 * 和件明细，硬塞进两层表单只会让两种结构互相牵制。
 *
 * 只负责「填」，提交由父组件统一做（父组件还要管服务类型、报错提示等）。
 */

import { useTranslation } from 'react-i18next'
import { Plus, Trash2, MapPin, Container, PackageOpen } from 'lucide-react'
import CargoItemsTable from './CargoItemsTable'
import {
  type DeliveryOrderForm, type LocalDeliveryFormValue,
  newDeliveryOrder, sumRows, inputClass,
} from './inquiryForm'

export default function LocalDeliveryForm({ value, onChange }: {
  value: LocalDeliveryFormValue
  onChange: (v: LocalDeliveryFormValue) => void
}) {
  const { t } = useTranslation()

  const patch = (p: Partial<LocalDeliveryFormValue>) => onChange({ ...value, ...p })

  const patchOrder = (key: string, p: Partial<DeliveryOrderForm>) => {
    patch({
      deliveryOrders: value.deliveryOrders.map((o) => (o.key === key ? { ...o, ...p } : o)),
    })
  }

  const removeOrder = (key: string) => {
    // 删到只剩一票时给一票空的：整块消失会让人以为页面坏了
    patch({
      deliveryOrders: value.deliveryOrders.length === 1
        ? [newDeliveryOrder()]
        : value.deliveryOrders.filter((o) => o.key !== key),
    })
  }

  // 柜合计 = 各票之和，口径和后端两级汇总一致
  const containerTotals = sumRows(value.deliveryOrders.flatMap((o) => o.rows))

  return (
    <div className="space-y-5">
      {/* ---- 柜信息 ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">
            {t('inquiry.containerNo')} {t('common.required')}
          </label>
          <input
            type="text"
            value={value.containerNo}
            onChange={(e) => patch({ containerNo: e.target.value })}
            placeholder={t('inquiry.phContainerNo')}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">{t('inquiry.customerRef')}</label>
          <input
            type="text"
            value={value.customerRef}
            onChange={(e) => patch({ customerRef: e.target.value })}
            placeholder={t('inquiry.phCustomerRef')}
            className={inputClass}
          />
        </div>
      </div>

      {/* ---- 取件地址（整柜一个） ---- */}
      <div className="border border-gray-200 rounded-xl p-4 bg-white">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-3">
          <MapPin className="w-3.5 h-3.5 text-slate-400" />
          {t('inquiry.pickupSection')}
          <span className="text-red-500">*</span>
          <span className="text-slate-400 font-normal">{t('inquiry.pickupSharedHint')}</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input type="text" value={value.pickupAddress.country} onChange={(e) => patch({ pickupAddress: { ...value.pickupAddress, country: e.target.value } })} placeholder={t('inquiry.phCountry')} className={inputClass} />
          <input type="text" value={value.pickupAddress.zipCode} onChange={(e) => patch({ pickupAddress: { ...value.pickupAddress, zipCode: e.target.value } })} placeholder={t('inquiry.phZip')} className={inputClass} />
          <input type="text" value={value.pickupAddress.city} onChange={(e) => patch({ pickupAddress: { ...value.pickupAddress, city: e.target.value } })} placeholder={t('inquiry.phCity')} className={inputClass} />
          <input type="text" value={value.pickupAddress.address} onChange={(e) => patch({ pickupAddress: { ...value.pickupAddress, address: e.target.value } })} placeholder={t('inquiry.phAddress')} className={inputClass} />
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <input type="text" value={value.pickupContact.name} onChange={(e) => patch({ pickupContact: { ...value.pickupContact, name: e.target.value } })} placeholder={t('inquiry.phContactName')} className={inputClass} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input type="tel" value={value.pickupContact.phone} onChange={(e) => patch({ pickupContact: { ...value.pickupContact, phone: e.target.value } })} placeholder={t('inquiry.phContactPhone')} className={inputClass} />
            <input type="email" value={value.pickupContact.email} onChange={(e) => patch({ pickupContact: { ...value.pickupContact, email: e.target.value } })} placeholder={t('inquiry.phContactEmail')} className={inputClass} />
          </div>
        </div>
      </div>

      {/* ---- 派送子订单 ---- */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <PackageOpen className="w-3.5 h-3.5 text-slate-400" />
            {t('inquiry.deliveryOrders')}
            <span className="text-slate-400 font-normal">
              {t('inquiry.deliveryOrderCount', { count: value.deliveryOrders.length })}
            </span>
          </p>
          <button
            type="button"
            onClick={() => patch({ deliveryOrders: [...value.deliveryOrders, newDeliveryOrder()] })}
            className="h-8 px-3 text-xs text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 flex items-center gap-1 transition-all duration-200 ease-in-out"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('inquiry.addDeliveryOrder')}
          </button>
        </div>

        <div className="space-y-4">
          {value.deliveryOrders.map((order, index) => {
            const totals = sumRows(order.rows)
            return (
              <div key={order.key} className="border border-gray-200 rounded-xl bg-gray-50/50">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
                  <span className="text-xs font-medium text-slate-700">
                    {t('inquiry.deliveryOrderNo', { index: index + 1 })}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeOrder(order.key)}
                    title={t('inquiry.removeDeliveryOrder')}
                    className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 ease-in-out"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-4 space-y-3 bg-white rounded-b-xl">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input type="text" value={order.customerSubRef} onChange={(e) => patchOrder(order.key, { customerSubRef: e.target.value })} placeholder={t('inquiry.phSubRef')} className={inputClass} />
                    <input type="text" value={order.companyName} onChange={(e) => patchOrder(order.key, { companyName: e.target.value })} placeholder={t('inquiry.phCompanyName')} className={inputClass} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input type="text" value={order.address.country} onChange={(e) => patchOrder(order.key, { address: { ...order.address, country: e.target.value } })} placeholder={t('inquiry.phCountry')} className={inputClass} />
                    <input type="text" value={order.address.zipCode} onChange={(e) => patchOrder(order.key, { address: { ...order.address, zipCode: e.target.value } })} placeholder={t('inquiry.phZip')} className={inputClass} />
                    <input type="text" value={order.address.city} onChange={(e) => patchOrder(order.key, { address: { ...order.address, city: e.target.value } })} placeholder={t('inquiry.phCity')} className={inputClass} />
                    <input type="text" value={order.address.address} onChange={(e) => patchOrder(order.key, { address: { ...order.address, address: e.target.value } })} placeholder={t('inquiry.phAddress')} className={inputClass} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input type="text" value={order.contact.name} onChange={(e) => patchOrder(order.key, { contact: { ...order.contact, name: e.target.value } })} placeholder={t('inquiry.phReceiverName')} className={inputClass} />
                    <input type="tel" value={order.contact.phone} onChange={(e) => patchOrder(order.key, { contact: { ...order.contact, phone: e.target.value } })} placeholder={t('inquiry.phContactPhone')} className={inputClass} />
                    <input type="email" value={order.contact.email} onChange={(e) => patchOrder(order.key, { contact: { ...order.contact, email: e.target.value } })} placeholder={t('inquiry.phContactEmail')} className={inputClass} />
                  </div>

                  <input type="text" value={order.remarks} onChange={(e) => patchOrder(order.key, { remarks: e.target.value })} placeholder={t('inquiry.phDeliveryRemarks')} className={inputClass} />

                  <div className="pt-2">
                    <CargoItemsTable
                      rows={order.rows}
                      onChange={(rows) => patchOrder(order.key, { rows })}
                      title={t('inquiry.itemsOfThisDrop')}
                      compact
                    />
                  </div>

                  {/* 这一票的小计，和柜合计分开显示，免得客户分不清哪个是哪个 */}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                    <span>{t('inquiry.dropSubtotal')}</span>
                    <span>{totals.quantity} {t('inquiry.piecesUnit')}</span>
                    <span>{totals.weight.toFixed(2)} kg</span>
                    <span>LDM {totals.ldm.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ---- 整柜合计 ---- */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-primary-50/60 border border-primary-100 rounded-xl text-xs text-slate-600">
        <span className="flex items-center gap-1.5 font-medium text-slate-700">
          <Container className="w-3.5 h-3.5 text-primary-500" />
          {t('inquiry.containerTotals')}
        </span>
        <span>{t('inquiry.dropCount')} <b className="text-slate-900">{value.deliveryOrders.length}</b></span>
        <span>{t('inquiry.totalQty')} <b className="text-slate-900">{containerTotals.quantity}</b></span>
        <span>{t('inquiry.totalWeight')} <b className="text-slate-900">{containerTotals.weight.toFixed(2)}</b> kg</span>
        <span>{t('inquiry.totalVolume')} <b className="text-slate-900">{containerTotals.volume.toFixed(3)}</b> m³</span>
        <span>LDM <b className="text-slate-900">{containerTotals.ldm.toFixed(2)}</b></span>
      </div>
    </div>
  )
}
