/**
 * 详情页的公共展示件（询价详情 / 订单详情共用）
 *
 * 两个详情页的骨架完全一样：返回条 + 若干分区卡片 + 「标签 : 值」两列。
 * 抽在这里免得同一套排版和空值处理写两遍，改一处忘一处。
 * 这些组件只负责展示，不取数、不判权限。
 */

import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** 地址 JSONB 的形状：询价的 route_from/route_to、订单的 pickup_address/delivery_address
 *  以及本地派送子订单的 delivery_address 都是这一套键（companyName 只有子订单有） */
export interface AddressJson {
  country?: string | null
  zipCode?: string | null
  city?: string | null
  address?: string | null
  companyName?: string | null
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  /** 集装箱单的提柜参考号 */
  reference?: string | null
}

/** 详情页顶部：返回按钮 + 单号 + 右侧插槽（放状态徽章） */
export function DetailHeader({ backTo, title, subtitle, right }: {
  backTo: string
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-gray-100 transition-all duration-200 ease-in-out"
          title={t('common.back')}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900 truncate">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  )
}

/** 一个分区卡片 */
export function Section({ icon: Icon, title, extra, children }: {
  icon: LucideIcon
  title: string
  extra?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4 lg:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Icon className="w-4 h-4 text-slate-400" />
          {title}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  )
}

/**
 * 「标签 : 值」一项
 *
 * 空值统一显示 "-"，不显示成空白 —— 空白会让人分不清「没填」和「页面坏了」。
 */
export function Field({ label, value, className = '' }: {
  label: string
  value: ReactNode
  className?: string
}) {
  const isEmpty = value === null || value === undefined || value === ''
  return (
    <div className={className}>
      <dt className="text-xs text-slate-500 mb-0.5">{label}</dt>
      <dd className="text-sm text-slate-900 break-words">{isEmpty ? '-' : value}</dd>
    </div>
  )
}

/** 字段网格：移动端 1 列，平板 2 列，桌面 3 列 */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</dl>
}

/**
 * 一块地址（含这一侧的联系人）
 *
 * ⚠️ 键名必须和后端存进 JSONB 的完全一致（country / zipCode / city / address /
 *    contactName / contactPhone / contactEmail / companyName），
 *    自造字段名会读到 undefined 而且不报错（踩坑 066）。
 */
export function AddressBlock({ title, value }: { title: string; value?: AddressJson | null }) {
  const { t } = useTranslation()
  const addr = value || {}
  const line = [addr.country, addr.zipCode, addr.city].filter(Boolean).join(' ')
  const hasContact = Boolean(addr.contactName || addr.contactPhone || addr.contactEmail)

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <p className="text-xs font-medium text-slate-700 mb-2">{title}</p>
      {addr.companyName && (
        <p className="text-sm font-medium text-slate-900">{addr.companyName}</p>
      )}
      <p className="text-sm text-slate-900">{line || '-'}</p>
      {addr.address && <p className="text-sm text-slate-600 mt-0.5">{addr.address}</p>}
      {addr.reference && (
        <p className="text-xs text-slate-500 mt-1">{t('createOrder.pickupRef')}: {addr.reference}</p>
      )}
      {hasContact && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-0.5">
          {addr.contactName && <p className="text-xs text-slate-600">{addr.contactName}</p>}
          {addr.contactPhone && <p className="text-xs text-slate-600">{addr.contactPhone}</p>}
          {addr.contactEmail && <p className="text-xs text-slate-600">{addr.contactEmail}</p>}
        </div>
      )}
    </div>
  )
}

/** 加载骨架（禁止用 "Loading..." 文字） */
export function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-gray-100 rounded-lg animate-pulse" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4 lg:p-6 space-y-3">
          <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((j) => (
              <div key={j} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** 取不到记录时的占位（后端已把「不属于你的单」也回成 404，这里不区分两者） */
export function DetailNotFound({ message, backTo, backLabel }: {
  message: string
  backTo: string
  backLabel: string
}) {
  const navigate = useNavigate()
  return (
    <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] py-12 text-center">
      <p className="text-sm text-slate-500">{message}</p>
      <button
        type="button"
        onClick={() => navigate(backTo)}
        className="mt-4 h-8 px-3 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 transition-all duration-200 ease-in-out"
      >
        {backLabel}
      </button>
    </div>
  )
}
