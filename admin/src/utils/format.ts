/**
 * 日期 / 金额 / 数字格式化（P9）
 *
 * 全部走 Intl，跟着当前界面语言走，不再散落 toLocaleString('zh-CN') 之类的硬编码。
 * 注意后端 NUMERIC / BIGINT 返回的是字符串（踩坑 002），这里统一先转数字再格式化。
 */

import i18n from '../i18n'

/** 界面语言 → Intl locale。英文用 en-GB，因为业务在欧洲（日期 31/12/2026、公制单位） */
const LOCALE_MAP: Record<string, string> = {
  zh: 'zh-CN',
  en: 'en-GB',
  de: 'de-DE',
}

function currentLocale(): string {
  return LOCALE_MAP[i18n.language] || LOCALE_MAP.zh
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = typeof value === 'number' ? value : parseFloat(value)
  return Number.isNaN(num) ? null : num
}

/** 金额，默认欧元。空值返回 "-" */
export function formatMoney(
  value: number | string | null | undefined,
  currency = 'EUR'
): string {
  const num = toNumber(value)
  if (num === null) return '-'
  return new Intl.NumberFormat(currentLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/** 普通数字（千分位） */
export function formatNumber(value: number | string | null | undefined): string {
  const num = toNumber(value)
  if (num === null) return '-'
  return new Intl.NumberFormat(currentLocale()).format(num)
}

/** 日期（年月日）。解析不了就原样返回，免得把有用信息吞成 "-" */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(currentLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * 把后端返回的日期转成 <input type="date"> 用的 YYYY-MM-DD。
 *
 * 不能直接 slice(0,10) / split('T')[0]：库里 date 列的值经 pg 驱动会变成
 * 本地时区零点的 Date，序列化成 UTC 后日期会回退一天
 * （2026-08-10 在 UTC+8 下序列化为 "2026-08-09T16:00:00.000Z"）。
 * 截字符串就把 10 号读成 9 号，用户不改任何东西点保存都会把日期改错。
 * 这里按本地时区取年月日，与 formatDate 的显示口径一致。
 */
export function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 日期 + 时分 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(currentLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
