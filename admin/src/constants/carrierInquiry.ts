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

export const CARRIER_INQUIRY_STATUS_LABELS: Record<string, string> = {
  PENDING: '待回价',
  QUOTED: '已回价',
  SELECTED: '已选用',
  DECLINED: '不报价',
  CANCELLED: '已取消',
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
}
