import clsx from 'clsx'

interface StatusBadgeProps {
  status: string
  type?: 'order' | 'delivery' | 'release' | 'payment' | 'cmr' | 'clearance' | 'quotation'
  /** 覆盖默认文案（同一状态值在不同业务类型下叫法不同，如本地派送 IN_TRANSIT → 派送中） */
  label?: string
}

// 状态 -> 颜色分组
type ColorGroup = 'green' | 'blue' | 'yellow' | 'orange' | 'purple' | 'red' | 'gray'

const statusColorMap: Record<string, ColorGroup> = {
  // 绿色：完成/已付/放单/清关/已接受/运输完成
  COMPLETED: 'green',
  PAID: 'green',
  RELEASED: 'green',
  CLEARED: 'green',
  ACCEPTED: 'green',
  TRANSPORT_DONE: 'green',
  DELIVERED: 'green',
  completed: 'green',
  delivered: 'green',
  arrived: 'green',
  released: 'green',
  transport_completed: 'green',
  // 蓝色：已确认/在途/车队确认/已发送/进行中
  CONFIRMED: 'blue',
  IN_TRANSIT: 'blue',
  FLEET_CONFIRMED: 'blue',
  SENT: 'blue',
  QUOTED: 'blue',
  IN_PROGRESS: 'blue',
  confirmed: 'blue',
  in_transit: 'blue',
  fleet_confirmed: 'blue',
  mailed: 'blue',
  // 黄色：待审核/等待安排/待报价/未付/部分/原件待寄
  PENDING_REVIEW: 'yellow',
  WAITING_ARRANGE: 'yellow',
  PENDING_QUOTE: 'yellow',
  UNPAID: 'yellow',
  PARTIAL: 'yellow',
  ORIGINAL_PENDING: 'yellow',
  pending_review: 'yellow',
  pending_mail: 'yellow',
  waiting: 'yellow',
  // 橙色：待分配/待派送/原件已寄/逾期
  PENDING_ASSIGN: 'orange',
  PENDING_DISPATCH: 'orange',
  PENDING_DECISION: 'orange',   // 客户待定（需求 2）
  ORIGINAL_SENT: 'orange',
  OVERDUE: 'orange',
  pending_assign: 'orange',
  pending_dispatch: 'orange',
  pending_release: 'orange',
  // 紫色：已分配/待放单/已下单
  ASSIGNED: 'purple',
  PENDING_RELEASE: 'purple',
  CONVERTED: 'purple',
  assigned: 'purple',
  // 红色：异常/取消/驳回/冻结/作废
  EXCEPTION: 'red',
  CANCELLED: 'red',
  REJECTED: 'red',
  BLOCKED: 'red',
  VOID: 'red',
  exception: 'red',
  abnormal: 'red',
  // 灰色：无需/草稿/过期/取消
  NOT_REQUIRED: 'gray',
  DRAFT: 'gray',
  EXPIRED: 'gray',
  draft: 'gray',
  cancelled: 'gray',
  not_required: 'gray',
}

// 颜色分组对应的 Tailwind 样式
const colorStyles: Record<ColorGroup, string> = {
  green: 'bg-green-100 text-green-700',
  blue: 'bg-blue-100 text-blue-700',
  yellow: 'bg-amber-100 text-amber-700',
  orange: 'bg-orange-100 text-orange-700',
  purple: 'bg-purple-100 text-purple-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-600',
}

// 状态中文标签映射
const statusLabelMap: Record<string, string> = {
  // 大写枚举值
  COMPLETED: '已完成',
  PAID: '已付款',
  RELEASED: '已放单',
  CLEARED: '已清关',
  ACCEPTED: '已接受',
  TRANSPORT_DONE: '运输完成',
  CONFIRMED: '已确认',
  IN_TRANSIT: '在途中',
  DELIVERED: '已送达',
  PENDING_DISPATCH: '待派送',
  FLEET_CONFIRMED: '车队确认',
  SENT: '已发送',
  IN_PROGRESS: '进行中',
  PENDING_REVIEW: '待审核',
  WAITING_ARRANGE: '等待安排',
  PENDING_QUOTE: '待报价',
  UNPAID: '未付款',
  PARTIAL: '部分完成',
  ORIGINAL_PENDING: '原件待寄',
  PENDING_ASSIGN: '待分配',
  ORIGINAL_SENT: '原件已寄',
  OVERDUE: '已逾期',
  ASSIGNED: '已分配',
  PENDING_RELEASE: '待放单',
  EXCEPTION: '异常',
  CANCELLED: '已取消',
  REJECTED: '已驳回',
  BLOCKED: '已冻结',
  VOID: '已作废',
  NOT_REQUIRED: '无需处理',
  DRAFT: '草稿',
  EXPIRED: '已过期',
  PENDING_DECISION: '客户待定',
  CONVERTED: '已下单',
  QUOTED: '已报价',
  // 小写兼容值（保留原有映射）
  pending_review: '待审核',
  confirmed: '已确认',
  pending_dispatch: '待派单',
  pending_assign: '待派单',
  assigned: '已派单',
  in_transit: '运输中',
  delivered: '已到达',
  arrived: '已到达',
  completed: '已完成',
  cancelled: '已取消',
  exception: '异常',
  abnormal: '异常',
  draft: '草稿',
  waiting: '等待安排',
  fleet_confirmed: '车队已确认',
  transport_completed: '运输完成',
  not_required: '无需放单',
  pending_release: '待放单',
  released: '已放单',
  pending_mail: '正本待邮寄',
  mailed: '正本已邮寄',
}

export default function StatusBadge({ status, type: _type, label: labelOverride }: StatusBadgeProps) {
  const colorGroup = statusColorMap[status] || 'gray'
  const label = labelOverride || statusLabelMap[status] || status

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium',
        'transition-all duration-200 ease-in-out',
        colorStyles[colorGroup]
      )}
    >
      {label}
    </span>
  )
}
