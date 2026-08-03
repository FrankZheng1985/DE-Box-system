import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

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
  // 主数据启停用（carriers.status / clients.status）
  ACTIVE: 'green',
  INACTIVE: 'gray',
  // CMR 签署进度（cmr_documents.sign_status）
  UNSIGNED: 'gray',
  SENDER_SIGNED: 'yellow',
  RECEIVER_SIGNED: 'blue',
  // 清关起始状态
  PENDING: 'yellow',
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

/**
 * 同一个状态码在不同业务里叫法不同，按 type 指向不同的语言包 key。
 * 例如 CMR 的 COMPLETED 要显示「签署完成」而不是「已完成」。
 */
const typeLabelKeyOverrides: Record<string, Record<string, string>> = {
  cmr: { COMPLETED: 'statusByType.cmr.COMPLETED' },
  payment: { PARTIAL: 'statusByType.payment.PARTIAL' },
}

/**
 * 历史遗留的小写状态值里，有 6 个大写化之后在语言包里找不到同名 key，
 * 单独做个别名映射。其余 15 个（pending_review、confirmed 等）
 * 大写化后就能直接命中，不用列在这里。
 */
const LEGACY_ALIASES: Record<string, string> = {
  ARRIVED: 'DELIVERED',
  ABNORMAL: 'EXCEPTION',
  WAITING: 'WAITING_ARRANGE',
  TRANSPORT_COMPLETED: 'TRANSPORT_DONE',
  PENDING_MAIL: 'ORIGINAL_PENDING',
  MAILED: 'ORIGINAL_SENT',
}

export default function StatusBadge({ status, type, label: labelOverride }: StatusBadgeProps) {
  const { t } = useTranslation()

  // 库里存的是大写（踩坑 004），但历史数据和少数接口还会回小写，统一大写化后再查
  const raw = status || ''
  const upper = raw.toUpperCase()
  const key = LEGACY_ALIASES[upper] || upper

  const colorGroup = statusColorMap[raw] || statusColorMap[key] || 'gray'
  const typeKey = type ? typeLabelKeyOverrides[type]?.[key] : undefined

  // 语言包里没有的状态就原样显示后端值，别吞成空白
  const label =
    labelOverride ||
    (typeKey ? t(typeKey, { defaultValue: t(`status.${key}`, { defaultValue: raw }) })
             : t(`status.${key}`, { defaultValue: raw }))

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
