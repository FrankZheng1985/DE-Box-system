/**
 * 服务类型（需求 1 三分类）
 *
 * ⚠️ 这里是前端唯一的服务类型来源，页面不要再自己定义一套。
 *    值必须与后端 server/modules/order/service.js 的 BUSINESS_TYPES 完全一致（全大写），
 *    否则筛选查不到数据（踩坑 004）、偏好匹配不上（踩坑 011）。
 *
 * P9 三语化后这里只留「值」和「语言包 key」，文案统一放 src/i18n/locales/。
 */

import type { TFunction } from 'i18next'

export const BUSINESS_TYPES = {
  TRUCK_LTL: 'TRUCK_LTL',
  TRUCK_FTL: 'TRUCK_FTL',
  LOCAL_DELIVERY: 'LOCAL_DELIVERY',
} as const

export type BusinessType = (typeof BUSINESS_TYPES)[keyof typeof BUSINESS_TYPES]

/** 三个服务类型的固定顺序（下拉框、选择卡片按这个顺序渲染） */
export const BUSINESS_TYPE_LIST: BusinessType[] = [
  BUSINESS_TYPES.TRUCK_LTL,
  BUSINESS_TYPES.TRUCK_FTL,
  BUSINESS_TYPES.LOCAL_DELIVERY,
]

/** 服务类型名称的语言包 key */
export function businessTypeLabelKey(type: string): string {
  return `businessType.${type}`
}

/** 服务类型简介的语言包 key（建单页选择卡片用） */
export function businessTypeDescKey(type: string): string {
  return `businessTypeDesc.${type}`
}

/** 取服务类型名称；语言包里没有就原样显示后端值，别吞成空白 */
export function getBusinessTypeLabel(t: TFunction, type: string | undefined | null): string {
  if (!type) return ''
  return t(businessTypeLabelKey(type), { defaultValue: type })
}

/**
 * 各服务类型的状态筛选 Tab
 *
 * 卡车 LTL / FTL 共用主状态机；本地派送走简化流。
 * 本地派送刻意复用了 IN_TRANSIT / COMPLETED 两个值（后端同理），
 * 只是显示成"派送中""已签收"——这样统计和自动开票都不用加分支。
 */
export const TRUCK_STATUS_TABS = [
  { key: '', labelKey: 'common.all' },
  { key: 'PENDING_REVIEW', labelKey: 'truckStatus.PENDING_REVIEW' },
  { key: 'CONFIRMED', labelKey: 'truckStatus.CONFIRMED' },
  { key: 'PENDING_ASSIGN', labelKey: 'truckStatus.PENDING_ASSIGN' },
  { key: 'ASSIGNED', labelKey: 'truckStatus.ASSIGNED' },
  { key: 'IN_TRANSIT', labelKey: 'truckStatus.IN_TRANSIT' },
  { key: 'DELIVERED', labelKey: 'truckStatus.DELIVERED' },
  { key: 'COMPLETED', labelKey: 'truckStatus.COMPLETED' },
  { key: 'EXCEPTION', labelKey: 'truckStatus.EXCEPTION' },
]

export const LOCAL_DELIVERY_STATUS_TABS = [
  { key: '', labelKey: 'common.all' },
  { key: 'PENDING_QUOTE', labelKey: 'localDeliveryStatus.PENDING_QUOTE' },
  { key: 'PENDING_DISPATCH', labelKey: 'localDeliveryStatus.PENDING_DISPATCH' },
  { key: 'IN_TRANSIT', labelKey: 'localDeliveryStatus.IN_TRANSIT' },
  { key: 'COMPLETED', labelKey: 'localDeliveryStatus.COMPLETED' },
  { key: 'EXCEPTION', labelKey: 'localDeliveryStatus.EXCEPTION' },
]

/** 集装箱派送子状态（仅 TRUCK_FTL 用，走 orders.delivery_status） */
export const CONTAINER_DELIVERY_STATUS_TABS = [
  { key: '', labelKey: 'common.all' },
  { key: 'WAITING_ARRANGE', labelKey: 'containerDeliveryStatus.WAITING_ARRANGE' },
  { key: 'FLEET_CONFIRMED', labelKey: 'containerDeliveryStatus.FLEET_CONFIRMED' },
  { key: 'IN_TRANSIT', labelKey: 'containerDeliveryStatus.IN_TRANSIT' },
  { key: 'TRANSPORT_DONE', labelKey: 'containerDeliveryStatus.TRANSPORT_DONE' },
  { key: 'EXCEPTION', labelKey: 'containerDeliveryStatus.EXCEPTION' },
]

/**
 * 取状态名（同一个状态值在不同业务类型下叫法不同）
 *
 * @param t react-i18next 的翻译函数，由调用方传进来——这样切语言时组件会重新渲染
 * @param businessType 业务类型
 * @param status 状态值
 */
export function getStatusLabel(
  t: TFunction,
  businessType: string | undefined,
  status: string
): string {
  const ns = businessType === BUSINESS_TYPES.LOCAL_DELIVERY ? 'localDeliveryStatus' : 'truckStatus'
  return t(`${ns}.${status}`, { defaultValue: status })
}

/** 取该业务类型对应的状态 Tab 配置 */
export function getStatusTabs(businessType: string) {
  return businessType === BUSINESS_TYPES.LOCAL_DELIVERY
    ? LOCAL_DELIVERY_STATUS_TABS
    : TRUCK_STATUS_TABS
}
