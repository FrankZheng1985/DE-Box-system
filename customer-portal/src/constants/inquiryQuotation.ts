/**
 * 询价 / 报价的状态与换算 —— 客户门户版
 *
 * ⚠️ 客户门户是独立子系统，不跨端 import admin 的常量，这里维护自己的一份。
 *    值必须与后端完全一致且全大写（踩坑 004：旧版 InquiryList 用的是小写键，
 *    库里存的是大写，状态徽章永远走兜底显示英文原文）。
 */

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

export const QUOTATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  SENT: '待确认',
  PENDING_DECISION: '已标记待定',
  ACCEPTED: '已接受',
  CONVERTED: '已下单',
  REJECTED: '已拒绝',
  EXPIRED: '已过期',
  CANCELLED: '已作废',
}

export const QUOTATION_STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SENT: 'bg-amber-100 text-amber-700',
  PENDING_DECISION: 'bg-orange-100 text-orange-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  CONVERTED: 'bg-purple-100 text-purple-700',
  REJECTED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-gray-100 text-gray-500',
  CANCELLED: 'bg-gray-100 text-gray-600',
}

/** 客户还能做决策的状态 */
export const CLIENT_DECIDABLE: string[] = [
  QUOTATION_STATUS.SENT,
  QUOTATION_STATUS.PENDING_DECISION,
]

/** 欧洲标准车厢内宽（米），LDM 换算分母，与后端 inquiry/service.js 一致 */
export const TRUCK_INNER_WIDTH_M = 2.4

/** 单件体积（m³）= 长 × 宽 × 高 ÷ 1,000,000（长宽高单位 cm） */
export function calcUnitVolumeM3(
  lengthCm: number | null,
  widthCm: number | null,
  heightCm: number | null
): number | null {
  if (lengthCm === null || widthCm === null || heightCm === null) return null
  return Math.round((lengthCm * widthCm * heightCm) / 1_000_000 * 10000) / 10000
}

/** 行级 LDM = 长m × 宽m ÷ 2.4 × 件数 */
export function calcLineLdm(
  lengthCm: number | null,
  widthCm: number | null,
  quantity: number
): number | null {
  if (lengthCm === null || widthCm === null) return null
  return Math.round((lengthCm / 100) * (widthCm / 100) / TRUCK_INNER_WIDTH_M * quantity * 100) / 100
}
