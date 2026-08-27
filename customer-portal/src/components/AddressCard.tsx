/**
 * 取件方 / 派送方地址卡片（开发意见 #9）
 *
 * 一侧一张带边框的卡片，地址在上、这一侧的联系人在下，两张卡片结构完全对称。
 * 改造前两侧地址是并排的两组裸输入框、中间没有分隔，客户反馈"边界感不强"，
 * 经常把派送地址填进取件那一栏。
 *
 * 原先内联在 InquiryList 里，开发意见 #12 加了询价编辑页之后两处都要用，
 * 抽到这里共用 —— 不是为了拆而拆，是为了两边永远长得一样。
 *
 * 联系人和地址分开传：发货侧联系人最终并进 route_from 的 JSONB，
 * 收货侧走 inquiries 表自己的 contact_* 列，落点不一样（见各自的 handleSubmit）。
 */

import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import { type AddressForm, type ContactForm, inputClass } from './inquiryForm'

export default function AddressCard({
  title, required, icon: Icon, address, onAddressChange, contact, onContactChange,
  showEmail = true,
}: {
  title: string
  required?: boolean
  icon: LucideIcon
  address: AddressForm
  onAddressChange: (v: AddressForm) => void
  contact: ContactForm
  onContactChange: (v: ContactForm) => void
  /** 订单的地址 JSONB 只存 contactName / contactPhone，没有邮箱这一格 ——
   *  给了输入框客户会填，但填了没人看得到，等于骗他 */
  showEmail?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-3">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
        {title}
        {required && <span className="text-red-500">*</span>}
      </p>

      {/* 小屏必须单列：两列时德语的「Straße und Hausnummer」放不下会被截掉一半，
          提示词不允许显示不全（Frank 2026-06-01 定的规范） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input type="text" value={address.country} onChange={(e) => onAddressChange({ ...address, country: e.target.value })} placeholder={t('inquiry.phCountry')} className={inputClass} />
        <input type="text" value={address.zipCode} onChange={(e) => onAddressChange({ ...address, zipCode: e.target.value })} placeholder={t('inquiry.phZip')} className={inputClass} />
        <input type="text" value={address.city} onChange={(e) => onAddressChange({ ...address, city: e.target.value })} placeholder={t('inquiry.phCity')} className={inputClass} />
        <input type="text" value={address.address} onChange={(e) => onAddressChange({ ...address, address: e.target.value })} placeholder={t('inquiry.phAddress')} className={inputClass} />
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
        <input type="text" value={contact.name} onChange={(e) => onContactChange({ ...contact, name: e.target.value })} placeholder={t('inquiry.phContactName')} className={inputClass} />
        <div className={showEmail ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : ''}>
          <input type="tel" value={contact.phone} onChange={(e) => onContactChange({ ...contact, phone: e.target.value })} placeholder={t('inquiry.phContactPhone')} className={inputClass} />
          {showEmail && (
            <input type="email" value={contact.email} onChange={(e) => onContactChange({ ...contact, email: e.target.value })} placeholder={t('inquiry.phContactEmail')} className={inputClass} />
          )}
        </div>
      </div>
    </div>
  )
}
