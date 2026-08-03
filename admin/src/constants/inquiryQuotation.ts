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

/** 询价状态文案的语言包 key */
export function inquiryStatusLabelKey(status: string): string {
  return `inquiryStatus.${status}`
}

export const INQUIRY_STATUS_STYLES: Record<string, string> = {
  PENDING_QUOTE: 'bg-amber-100 text-amber-700',
  QUOTED: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
}

export const INQUIRY_STATUS_TABS = [
  { key: '', labelKey: 'common.all' },
  { key: INQUIRY_STATUS.PENDING_QUOTE, labelKey: 'inquiryStatus.PENDING_QUOTE' },
  { key: INQUIRY_STATUS.QUOTED, labelKey: 'inquiryStatus.QUOTED' },
  { key: INQUIRY_STATUS.ACCEPTED, labelKey: 'inquiryStatus.ACCEPTED' },
  { key: INQUIRY_STATUS.REJECTED, labelKey: 'inquiryStatus.REJECTED' },
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

/** 报价状态文案的语言包 key */
export function quotationStatusLabelKey(status: string): string {
  return `quotationStatus.${status}`
}

export const QUOTATION_STATUS_TABS = [
  { key: '', labelKey: 'common.all' },
  { key: QUOTATION_STATUS.DRAFT, labelKey: 'quotationStatus.DRAFT' },
  { key: QUOTATION_STATUS.SENT, labelKey: 'quotationStatus.SENT' },
  { key: QUOTATION_STATUS.PENDING_DECISION, labelKey: 'quotationStatus.PENDING_DECISION' },
  { key: QUOTATION_STATUS.CONVERTED, labelKey: 'quotationStatus.CONVERTED' },
  { key: QUOTATION_STATUS.REJECTED, labelKey: 'quotationStatus.REJECTED' },
  { key: QUOTATION_STATUS.EXPIRED, labelKey: 'quotationStatus.EXPIRED' },
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
