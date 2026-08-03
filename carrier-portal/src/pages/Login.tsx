import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import BrandMark from '../components/BrandMark'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password.trim()) {
      setError(t('login.errorEmpty'))
      return
    }

    setLoading(true)
    try {
      const result = await login(username.trim(), password)
      if (result.success) {
        navigate('/')
      } else {
        // 按后端 messageCode 查语言包（P9），拿不到码就退回通用文案
        setError(
          result.messageCode
            ? t(`loginError.${result.messageCode}`, { defaultValue: t('login.errorWrong') })
            : t('login.errorWrong')
        )
      }
    } catch {
      setError(t('login.errorFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#1C1C1E] rounded-2xl mb-4 shadow-lg">
            <BrandMark className="w-9 h-9" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t('app.brand')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('app.loginSubtitle')}</p>
        </div>

        {/* 语言切换（未登录也能切） */}
        <div className="flex justify-center mb-4">
          <LanguageSwitcher className="w-40" />
        </div>

        {/* 登录表单 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 border border-slate-200/60">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('login.username')}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('login.usernamePlaceholder')}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm
                  focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500
                  transition-all duration-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('login.password')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder')}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm pr-10
                    focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500
                    transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-medium
                transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          {t('app.footer')}
        </p>
      </div>
    </div>
  )
}
