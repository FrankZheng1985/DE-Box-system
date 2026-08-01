/**
 * 询价 / 报价的状态枚举与文案
 *
 * ⚠️ 这里是前端唯一来源，页面不要再手抄 { XXX: '中文' } 的 map（踩坑 013 防护规则 1）。
 *    值必须与后端完全一致且全大写：
 *      询价 —— server/modules/inquiry/routes.js 的 INQUIRY_STATUS
 *      报价 —— server/modules/quotation/routes.js 的 QUOTATION_STATUS
 *    大小写写错会导致筛选永远查不到数据（踩坑 004）。
 */

// ==================== 询价单 ====================

export const INQUIRY_STATUS = {
  PENDING_QUOTE: 'PENDING_QUOTE',
  QUOTED: 'QUOTED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const

export type InquiryStatus = (typeof INQUIRY_STATUS)[keyof typeof INQUIRY_STATUS]

export const INQUIRY_STATUS_LABELS: Record<string, string> = {
  PENDING_QUOTE: '待报价',
  QUOTED: '已报价',
  ACCEPTED: '已接受',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
}

export const INQUIRY_STATUS_STYLES: Record<string, string> = {
  PENDING_QUOTE: 'bg-amber-100 text-amber-700',
  QUOTED: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
}

export const INQUIRY_STATUS_TABS = [
  { key: '', label: '全部' },
  { key: INQUIRY_STATUS.PENDING_QUOTE, label: '待报价' },
  { key: INQUIRY_STATUS.QUOTED, label: '已报价' },
  { key: INQUIRY_STATUS.ACCEPTED, label: '已接受' },
  { key: INQUIRY_STATUS.REJECTED, label: '已拒绝' },
]

// ==================== 报价单 ====================

export const QUOTATION_STATUS = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PENDING_DECISION: 'PENDING_DECISION',
  ACCEPTED: 'ACCEPTED',
  CONVERTED: 'CONVERTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const

export type QuotationStatus = (typeof QUOTATION_STATUS)[keyof typeof QUOTATION_STATUS]

export const QUOTATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  SENT: '已发送',
  PENDING_DECISION: '客户待定',
  ACCEPTED: '已接受',
  CONVERTED: '已下单',
  REJECTED: '已拒绝',
  EXPIRED: '已过期',
  CANCELLED: '已作废',
}

export const QUOTATION_STATUS_TABS = [
  { key: '', label: '全部' },
  { key: QUOTATION_STATUS.DRAFT, label: '草稿' },
  { key: QUOTATION_STATUS.SENT, label: '已发送' },
  { key: QUOTATION_STATUS.PENDING_DECISION, label: '客户待定' },
  { key: QUOTATION_STATUS.CONVERTED, label: '已下单' },
  { key: QUOTATION_STATUS.REJECTED, label: '已拒绝' },
  { key: QUOTATION_STATUS.EXPIRED, label: '已过期' },
]

/** 货物明细单位换算的车厢内宽，和后端 inquiry/service.js 保持一致 */
export const TRUCK_INNER_WIDTH_M = 2.4

/**
 * 单件体积（m³）= 长 × 宽 × 高 ÷ 1,000,000（长宽高单位 cm）
 * 任一边缺失返回 null
 */
export function calcUnitVolumeM3(
  lengthCm: number | null,
  widthCm: number | null,
  heightCm: number | null
): number | null {
  if (lengthCm === null || widthCm === null || heightCm === null) return null
  return Math.round((lengthCm * widthCm * heightCm) / 1_000_000 * 10000) / 10000
}

/**
 * 行级 LDM（装载米）= 长m × 宽m ÷ 2.4 × 件数
 * 长宽任一缺失返回 null
 */
export function calcLineLdm(
  lengthCm: number | null,
  widthCm: number | null,
  quantity: number
): number | null {
  if (lengthCm === null || widthCm === null) return null
  return Math.round((lengthCm / 100) * (widthCm / 100) / TRUCK_INNER_WIDTH_M * quantity * 100) / 100
}
