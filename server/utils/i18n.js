/**
 * 后端多语言小工具（P9）
 *
 * 后端只做两件事，不做完整的 i18n 框架：
 *   1. 判断这次请求该用哪种语言（`resolveLang`）
 *   2. 从基础数据行里挑出对应语言的名称（`pickName`）
 *
 * API 响应的 message 不在这里翻译 —— 那条路走的是「响应里 additive 地带
 * messageCode，前端按码查自己的语言包」，样板见 modules/auth/routes.js 的 login。
 * 这样老前端拿到的 message 一个字都没变，不会踩到「靠文案判断成败」（踩坑 032）。
 */

const SUPPORTED = ['zh', 'en', 'de']
const DEFAULT_LANG = 'zh'

/**
 * 把任意语言标识规整成支持的三个之一
 * @param {string} [value] 如 'de'、'de-DE'、'DE'
 * @returns {string|null} 认不出来返回 null
 */
export function normalizeLang(value) {
  if (!value || typeof value !== 'string') return null
  const lower = value.trim().toLowerCase()
  return SUPPORTED.find((code) => lower === code || lower.startsWith(`${code}-`)) || null
}

/**
 * 解析这次请求用哪种语言
 *
 * 优先级：Accept-Language 头 → 登录用户的 users.language → 中文
 * 前端 api.ts 会把当前界面语言放进 Accept-Language，所以头是最准的。
 *
 * @param {import('express').Request} req
 * @returns {'zh'|'en'|'de'}
 */
export function resolveLang(req) {
  // Accept-Language 可能是 "de-DE,de;q=0.9,en;q=0.8"，按 q 值从高到低逐个试
  const header = req?.headers?.['accept-language']
  if (header) {
    const tags = String(header)
      .split(',')
      .map((part) => {
        const [tag, ...params] = part.trim().split(';')
        const q = params.find((p) => p.trim().startsWith('q='))
        return { tag: tag.trim(), q: q ? parseFloat(q.split('=')[1]) || 0 : 1 }
      })
      .sort((a, b) => b.q - a.q)
    for (const { tag } of tags) {
      const matched = normalizeLang(tag)
      if (matched) return matched
    }
  }

  // 没有头（后台任务、老前端）就用账号上存的语言
  const fromUser = normalizeLang(req?.user?.language)
  if (fromUser) return fromUser

  return DEFAULT_LANG
}

/**
 * 从一行基础数据里挑出对应语言的名称
 *
 * 逐级回退：目标语言 → 英文 → 中文 → 空串。
 * name_de 允许为空（运营新加的行可能没填德语），所以必须有回退，
 * 否则德语界面会出现空白选项。
 *
 * @param {object} row 至少含 name_zh，可能含 name_en / name_de
 * @param {'zh'|'en'|'de'} lang
 * @returns {string}
 */
export function pickName(row, lang) {
  if (!row) return ''
  const byLang = { zh: row.name_zh, en: row.name_en, de: row.name_de }
  return byLang[lang] || row.name_en || row.name_zh || ''
}

export default { normalizeLang, resolveLang, pickName }
