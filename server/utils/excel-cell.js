/**
 * Excel 单元格解析小工具
 *
 * 从询价导入（modules/inquiry/import-service.js）里沉淀出来的三个纯函数，
 * 订单批量导入复用同一套 —— 两处对「德语逗号小数点」「富文本单元格」的处理
 * 必须一致，否则同一份表在两个入口导出来的数字会不一样。
 *
 * ⚠️ 这里只放不依赖任何业务的纯函数，别往里加业务规则。
 */

/**
 * 规整成比对用的键：去掉大小写、空格、括号、单位符号等一切非字母数字汉字
 * 「长(cm)」「Length (cm)」「Länge (cm)」都能稳定命中
 */
export function normalizeKey(text) {
  return String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * 单元格值转文本
 *
 * ExcelJS 的 cell.value 可能是数字/日期/富文本/公式对象，
 * 直接 String() 会得到 "[object Object]"，然后整列静默变成垃圾数据。
 */
export function cellToString(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return toDateString(value)
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('').trim()
    if (value.text !== undefined) return String(value.text).trim()
    if (value.result !== undefined) return cellToString(value.result)
    if (value.hyperlink !== undefined) return String(value.hyperlink).trim()
  }
  return String(value).trim()
}

/**
 * Date → 'YYYY-MM-DD'
 *
 * ⚠️ 必须走 UTC 取值。ExcelJS 把日期单元格解析成 UTC 午夜的 Date，
 *    用 getFullYear() 这类本地时间方法在东八区会拿到前一天（踩坑 039 同款）。
 */
export function toDateString(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 文本转数字
 *
 * 德语区习惯用逗号当小数点（"1,5"），千分位又常用点或空格，
 * 所以不能直接 Number()——那样 "1,5" 会变 NaN，"1.500" 会变 1.5。
 */
export function parseNumber(text) {
  let s = String(text).trim().replace(/\s/g, '')
  if (s === '') return null

  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    // 两种符号都有：最后出现的那个是小数点，另一个是千分位
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '')
  } else if (hasComma) {
    // 只有逗号：出现多次或后面不是 3 位数就是小数点（"1,5" / "1,25"），否则是千分位（"1,500"）
    const parts = s.split(',')
    s = parts.length > 2 || parts[1].length !== 3 ? s.replace(',', '.') : s.replace(/,/g, '')
  }

  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * 文本转日期，返回 'YYYY-MM-DD'，认不出来返回 null
 *
 * 认三种写法：2026-08-16 / 16.08.2026（德语区习惯）/ 2026/8/16。
 * 一律返回字符串而不是 Date 对象 —— date 列传 Date 进去会被 pg 驱动
 * 按本地时区转一次，日期整体少一天（踩坑 039）。
 */
export function parseDateString(text) {
  const s = String(text || '').trim()
  if (!s) return null

  // 已经是 ISO 日期（可能带时间，取前 10 位）
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (iso) return padDate(iso[1], iso[2], iso[3])

  // 德语区写法 16.08.2026 或 16/08/2026
  const eu = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (eu) return padDate(eu[3], eu[2], eu[1])

  return null
}

function padDate(year, month, day) {
  const m = Number(month)
  const d = Number(day)
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
