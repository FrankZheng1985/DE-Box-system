/**
 * 服务类型（需求 1 三分类）
 *
 * ⚠️ 这里是前端唯一的服务类型来源，页面不要再自己定义一套。
 *    值必须与后端 server/modules/order/service.js 的 BUSINESS_TYPES 完全一致（全大写），
 *    否则筛选查不到数据（踩坑 004）、偏好匹配不上（踩坑 011）。
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

/** 服务类型简介（建单页选择卡片用） */
export const BUSINESS_TYPE_DESCRIPTIONS: Record<BusinessType, string> = {
  TRUCK_LTL: '零担拼车，按件/按方计费',
  TRUCK_FTL: '整车运输，含集装箱陆运配送',
  LOCAL_DELIVERY: '本地短途派送，流程简化',
}

/**
 * 各服务类型的状态筛选 Tab
 *
 * 卡车 LTL / FTL 共用主状态机；本地派送走简化流。
 * 本地派送刻意复用了 IN_TRANSIT / COMPLETED 两个值（后端同理），
 * 只是显示成"派送中""已签收"——这样统计和自动开票都不用加分支。
 */
export const TRUCK_STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'PENDING_REVIEW', label: '待审核' },
  { key: 'CONFIRMED', label: '已确认' },
  { key: 'PENDING_ASSIGN', label: '待派单' },
  { key: 'ASSIGNED', label: '已派单' },
  { key: 'IN_TRANSIT', label: '运输中' },
  { key: 'DELIVERED', label: '已送达' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'EXCEPTION', label: '异常' },
]

export const LOCAL_DELIVERY_STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'PENDING_QUOTE', label: '待报价' },
  { key: 'PENDING_DISPATCH', label: '待派送' },
  { key: 'IN_TRANSIT', label: '派送中' },
  { key: 'COMPLETED', label: '已签收' },
  { key: 'EXCEPTION', label: '异常' },
]

/** 集装箱派送子状态（仅 TRUCK_FTL 用，走 orders.delivery_status） */
export const CONTAINER_DELIVERY_STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'WAITING_ARRANGE', label: '待安排' },
  { key: 'FLEET_CONFIRMED', label: '车队已确认' },
  { key: 'IN_TRANSIT', label: '运输中' },
  { key: 'TRANSPORT_DONE', label: '运输完成' },
  { key: 'EXCEPTION', label: '异常' },
]

const TRUCK_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: '待审核', CONFIRMED: '已确认', PENDING_ASSIGN: '待派单',
  ASSIGNED: '已派单', IN_TRANSIT: '运输中', DELIVERED: '已送达',
  COMPLETED: '已完成', CANCELLED: '已取消', EXCEPTION: '异常',
}

const LOCAL_DELIVERY_STATUS_LABELS: Record<string, string> = {
  PENDING_QUOTE: '待报价', PENDING_DISPATCH: '待派送',
  IN_TRANSIT: '派送中', COMPLETED: '已签收',
  CANCELLED: '已取消', EXCEPTION: '异常',
}

/**
 * 取状态中文名（同一个状态值在不同业务类型下叫法不同）
 * @param businessType 业务类型
 * @param status 状态值
 */
export function getStatusLabel(businessType: string | undefined, status: string): string {
  const labels = businessType === BUSINESS_TYPES.LOCAL_DELIVERY
    ? LOCAL_DELIVERY_STATUS_LABELS
    : TRUCK_STATUS_LABELS
  return labels[status] || status
}

/** 取该业务类型对应的状态 Tab 配置 */
export function getStatusTabs(businessType: string) {
  return businessType === BUSINESS_TYPES.LOCAL_DELIVERY
    ? LOCAL_DELIVERY_STATUS_TABS
    : TRUCK_STATUS_TABS
}
