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
