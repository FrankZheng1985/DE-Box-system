/**
 * 服务类型（需求 1 三分类）—— 客户门户版
 *
 * ⚠️ 客户门户是独立子系统，不跨端 import admin 的常量，这里维护自己的一份。
 *    值必须与后端 server/modules/order/service.js 的 BUSINESS_TYPES 完全一致（全大写）。
 */

export const BUSINESS_TYPES = {
  TRUCK_LTL: 'TRUCK_LTL',
  TRUCK_FTL: 'TRUCK_FTL',
  LOCAL_DELIVERY: 'LOCAL_DELIVERY',
} as const

export type BusinessType = (typeof BUSINESS_TYPES)[keyof typeof BUSINESS_TYPES]

/** 服务类型中文名 */
export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  TRUCK_LTL: '卡车派送 LTL',
  TRUCK_FTL: '卡车运输 FTL',
  LOCAL_DELIVERY: '本地派送',
}

// 卡车运输的状态中文名（数据库存大写，踩坑 004：不要用小写键）
const TRUCK_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: '待审核', CONFIRMED: '已确认', PENDING_ASSIGN: '待派单',
  ASSIGNED: '已派单', IN_TRANSIT: '运输中', DELIVERED: '已送达',
  COMPLETED: '已完成', CANCELLED: '已取消', EXCEPTION: '异常',
}

// 本地派送复用 IN_TRANSIT / COMPLETED 两个值，但叫法不同
const LOCAL_DELIVERY_STATUS_LABELS: Record<string, string> = {
  PENDING_QUOTE: '待报价', PENDING_DISPATCH: '待派送',
  IN_TRANSIT: '派送中', COMPLETED: '已签收',
  CANCELLED: '已取消', EXCEPTION: '异常',
}

/** 状态徽章颜色（按状态值，大写键） */
const STATUS_STYLES: Record<string, string> = {
  PENDING_REVIEW: 'bg-amber-100 text-amber-700',
  PENDING_QUOTE: 'bg-amber-100 text-amber-700',
  PENDING_DISPATCH: 'bg-orange-100 text-orange-700',
  PENDING_ASSIGN: 'bg-orange-100 text-orange-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  ASSIGNED: 'bg-purple-100 text-purple-700',
  IN_TRANSIT: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  EXCEPTION: 'bg-red-100 text-red-700',
}

/**
 * 取状态中文名（同一个状态值在不同业务类型下叫法不同）
 */
export function getStatusLabel(businessType: string | undefined, status: string): string {
  const key = (status || '').toUpperCase()
  const labels = businessType === BUSINESS_TYPES.LOCAL_DELIVERY
    ? LOCAL_DELIVERY_STATUS_LABELS
    : TRUCK_STATUS_LABELS
  return labels[key] || status
}

/** 取状态徽章颜色 */
export function getStatusStyle(status: string): string {
  return STATUS_STYLES[(status || '').toUpperCase()] || 'bg-gray-100 text-gray-600'
}
