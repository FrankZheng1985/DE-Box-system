import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import BrandMark from '../components/BrandMark'

export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuth()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 如果已登录，跳转到仪表板
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!username || !password) {
      setError(t('loginError.MISSING_CREDENTIALS'))
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await login(username, password)

      if (result.success) {
        navigate('/dashboard', { replace: true })
      } else {
        setError(result.message)
      }
    } catch (err: any) {
      setError(err.message || t('loginError.LOGIN_ERROR'))
    } finally {
      setLoading(false)
    }
  }

  // 已登录时不渲染登录页
  if (isAuthenticated) {
    return null
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #1F4E79, #4472C4)' }}
    >
      <div className="w-[420px] max-w-[90vw] bg-white rounded-2xl p-10 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
        {/* 标题区域 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-2.5">
            <BrandMark className="w-8 h-8" barColor="#1C1C1E" />
            <span className="text-2xl font-bold" style={{ color: '#1C1C1E' }}>KALUNA SPED</span>
          </div>
          <div className="text-sm text-slate-500">
            {t('login.title')}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            European Transport Management System
          </div>
        </div>

        {/* 登录表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 错误提示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* 邮箱/用户名 */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              {t('login.username')}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your@company.com"
              className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
              disabled={loading}
            />
          </div>

          {/* 密码 */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              {t('login.password')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.passwordPlaceholder')}
                className="w-full h-10 px-3 pr-10 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 记住我 & 忘记密码 */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-gray-300"
              />
              {t('login.remember')}
            </label>
            <a href={`mailto:info@kalunasped.com?subject=${encodeURIComponent(t('login.placeholderPasswordResetSubject'))}`} className="text-xs" style={{ color: '#4472C4' }}>
              {t('login.forgot')}
            </a>
          </div>

          {/* 登录按钮 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 text-white font-semibold text-[15px] rounded-lg transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: loading ? '#2E75B6' : '#1F4E79' }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#2E75B6' }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#1F4E79' }}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                {t('login.submitting')}
              </>
            ) : (
              t('login.submit')
            )}
          </button>
        </form>

        {/* 底部提示 */}
        <div className="text-center mt-4 text-xs text-slate-400">
          {t('login.noAccount')}{' '}
          <a
            href={`mailto:info@kalunasped.com?subject=${encodeURIComponent(t('login.placeholderAccountSubject'))}`}
            style={{ color: '#4472C4' }}
          >
            {t('login.contactAdmin')}
          </a>
        </div>
      </div>
    </div>
  )
}
