/**
 * 服务商询价常量（P6 · 需求 5.3）
 *
 * 状态值全大写，和库里存的一致（踩坑 004）。
 * 后端 `server/modules/carrier-inquiry/service.js` 是同一套值，改一边要改两边。
 */

export const CARRIER_INQUIRY_STATUS = {
  PENDING: 'PENDING',
  QUOTED: 'QUOTED',
  SELECTED: 'SELECTED',
  DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED',
} as const

/** 服务商询价状态文案的语言包 key（文案在 src/i18n/locales/） */
export function carrierInquiryStatusLabelKey(status: string): string {
  return `carrierInquiryStatus.${status}`
}

/** 状态色（全局规范的状态配色表） */
export const CARRIER_INQUIRY_STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  QUOTED: 'bg-blue-100 text-blue-700',
  SELECTED: 'bg-green-100 text-green-700',
  DECLINED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-gray-100 text-gray-600',
}

/** 服务商询价权限码（成本敏感，op_staff 没有） */
export const CARRIER_INQUIRY_PERMISSIONS = {
  VIEW: 'carrier_inquiry:view',
  MANAGE: 'carrier_inquiry:manage',
} as const

/** 询价邮件发送状态文案的语言包 key（值来自 notifications.email_status） */
export function carrierInquiryEmailStatusKey(status: string): string {
  return `carrierInquiryEmailStatus.${status}`
}

/** 询价邮件发送状态配色（全局规范的状态配色表） */
export const CARRIER_INQUIRY_EMAIL_STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  SENDING: 'bg-blue-100 text-blue-700',
  SENT: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
}

/** 一条服务商询价（字段名和后端返回的 snake_case 保持一致） */
export interface CarrierInquiry {
  id: string
  carrier_inquiry_number: string
  inquiry_id: string
  carrier_id: string
  carrier_name: string | null
  carrier_code: string | null
  carrier_contact_name: string | null
  carrier_contact_phone: string | null
  carrier_contact_email: string | null
  status: string
  request_remarks: string | null
  sent_at: string | null
  quoted_cost: string | null
  currency: string
  transit_days: number | null
  valid_until: string | null
  reply_remarks: string | null
  replied_at: string | null
  selected_at: string | null
  created_by_name: string | null
  created_at: string
  /** 服务商登记的询价邮箱（carriers.inquiry_emails） */
  carrier_inquiry_emails: string[] | null
  /** 最近一次询价邮件的收件人，空数组/null = 没发过 */
  email_recipients: string[] | null
  /** 邮件发送状态（PENDING/SENDING/SENT/FAILED），null = 没发过 */
  email_status: string | null
  email_sent_at: string | null
  email_error: string | null
}
