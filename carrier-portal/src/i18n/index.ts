/**
 * 承运商门户 · 国际化（P9）
 *
 * 中 / 英 / 德三语。语言选择的优先级：
 *   1. localStorage 里上次手动选的（未登录也能记住）
 *   2. 登录账号的 users.language（登录成功后由 AuthContext 应用）
 *   3. 浏览器语言
 *   4. 兜底中文
 *
 * 注意：这个文件不许 import api.ts —— api.ts 要用 i18n 翻译错误提示，
 * 反过来 import 会形成循环依赖。写库的动作放在 LanguageSwitcher 组件里做。
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './locales/zh.json'
import en from './locales/en.json'
import de from './locales/de.json'

/** 支持的语言。label 用各语言自己的写法，方便用户认 */
export const SUPPORTED_LANGUAGES = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
]

export const LANG_STORAGE_KEY = 'eu_tms_lang'

const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code)

/** 把任意语言标识规整成我们支持的三个之一，不认识就返回 null */
export function normalizeLanguage(value?: string | null): string | null {
  if (!value) return null
  const lower = value.toLowerCase()
  const matched = SUPPORTED_CODES.find((code) => lower === code || lower.startsWith(`${code}-`))
  return matched || null
}

/** 首次进入时决定用哪种语言 */
function detectLanguage(): string {
  if (typeof window === 'undefined') return 'zh'
  const saved = normalizeLanguage(localStorage.getItem(LANG_STORAGE_KEY))
  if (saved) return saved
  const browser = normalizeLanguage(navigator.language)
  if (browser) return browser
  return 'zh'
}

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
    de: { translation: de },
  },
  lng: detectLanguage(),
  fallbackLng: 'zh',
  interpolation: {
    // React 自己会转义，i18next 不用再转一次
    escapeValue: false,
  },
})

/**
 * 切换界面语言（只管前端，不写数据库）
 * @param lang 语言码
 * @param remember 是否记进 localStorage。登录时应用账号语言传 false，
 *                 免得覆盖用户在这台机器上手动选过的语言
 */
export function applyLanguage(lang: string, remember = true): void {
  const normalized = normalizeLanguage(lang)
  if (!normalized) return
  i18n.changeLanguage(normalized)
  if (remember) localStorage.setItem(LANG_STORAGE_KEY, normalized)
  if (typeof document !== 'undefined') document.documentElement.lang = normalized
}

export default i18n
