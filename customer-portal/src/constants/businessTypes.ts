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

/** 服务类型的可选值（文案走 businessType.* 语言包，P9） */
export const BUSINESS_TYPE_VALUES: BusinessType[] = [
  BUSINESS_TYPES.TRUCK_LTL,
  BUSINESS_TYPES.TRUCK_FTL,
  BUSINESS_TYPES.LOCAL_DELIVERY,
]

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
 * 取状态文案（P9 起走语言包）
 *
 * 同一个状态值在不同业务类型下叫法不同：本地派送复用了 IN_TRANSIT / COMPLETED
 * 两个值，但要显示成「派送中」「已签收」而不是「运输中」「已完成」。
 * 所以本地派送先查 localDeliveryStatus.*，查不到再回退到通用的 orderStatus.*，
 * 再查不到就原样显示后端值（别把信息吞成空白）。
 *
 * @param t 由调用方传入 useTranslation() 的 t，这样语言切换时组件能正常重渲染
 */
export function getStatusLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  businessType: string | undefined,
  status: string
): string {
  const key = (status || '').toUpperCase()
  const generic = t(`orderStatus.${key}`, { defaultValue: status })
  if (businessType === BUSINESS_TYPES.LOCAL_DELIVERY) {
    return t(`localDeliveryStatus.${key}`, { defaultValue: generic })
  }
  return generic
}

/** 取状态徽章颜色 */
export function getStatusStyle(status: string): string {
  return STATUS_STYLES[(status || '').toUpperCase()] || 'bg-gray-100 text-gray-600'
}
