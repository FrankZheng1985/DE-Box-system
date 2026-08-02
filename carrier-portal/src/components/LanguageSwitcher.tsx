/**
 * 语言切换器（P9）
 *
 * 未登录：只切界面 + 记 localStorage
 * 已登录：同时写回 users.language，换台设备登录也是这个语言
 */

import { useTranslation } from 'react-i18next'
import { Globe, ChevronDown } from 'lucide-react'
import api, { ApiResponse, AUTH_STORAGE_KEY } from '../utils/api'
import { SUPPORTED_LANGUAGES, applyLanguage, normalizeLanguage } from '../i18n'

interface LanguageSwitcherProps {
  className?: string
}

export default function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation()
  const current = normalizeLanguage(i18n.language) || 'zh'

  const handleChange = async (lang: string) => {
    applyLanguage(lang)

    // 没登录就只存本地；写库失败也不打断用户，界面已经切过去了
    if (!localStorage.getItem(AUTH_STORAGE_KEY)) return
    try {
      await api.put<ApiResponse>('/system/settings/account', { language: lang })
    } catch (error) {
      console.warn('语言偏好未能保存到账号，仅本机生效:', error)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <select
        value={current}
        onChange={(e) => handleChange(e.target.value)}
        aria-label={t('language.switchLabel')}
        title={t('language.switchLabel')}
        className="w-full appearance-none pl-9 pr-8 py-2 text-sm rounded-xl border border-slate-200
          bg-white text-slate-700 cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500
          transition-all duration-200 ease-in-out"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
      <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  )
}
