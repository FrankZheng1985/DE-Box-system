import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import BrandMark from '../components/BrandMark'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login, loginWithTicket, logout, isAuthenticated } = useAuth()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 运营端跳过来时带的代入票据。
  // 用 useState 的惰性初始值同步读一次——下面的 effect 会立刻把它从地址栏抹掉，
  // 那之后再去读 location.search 就什么都没有了。
  const [ticket] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('ticket')
  )

  // 票据只能兑换一次，这个 ref 保证 effect 无论被执行几次都只发一次请求。
  // 开发模式的 React.StrictMode 会 mount→unmount→mount，effect 因此跑两遍：
  // 第一遍换票成功、第二遍拿同一张已用过的票去换，必然 401。
  // 用 cleanup 里的 cancelled 标志挡不住——那只能丢弃结果，请求已经发出去了。
  const exchangeStartedRef = useRef(false)

  useEffect(() => {
    if (!ticket || exchangeStartedRef.current) return
    exchangeStartedRef.current = true

    // 票据尽早从地址栏抹掉：它会留在浏览器历史里，也会作为 Referer 带给页面上的外链。
    // 票据本身是一次性的，但没必要让它多存在一秒
    window.history.replaceState({}, '', window.location.pathname)

    // 浏览器里可能还躺着上一次登录（甚至是另一家公司）的 token。
    // 先清干净，免得换票失败时人还停在别人的账号里，误以为进的是刚点的那家
    logout()

    const run = async () => {
      setLoading(true)
      setError('')
      const result = await loginWithTicket(ticket)
      setLoading(false)
      if (result.success) {
        navigate('/', { replace: true })
      } else {
        setError(result.message)
      }
    }
    // 换票是不可撤销的副作用（服务端那一刻就把票据标记成已用了），
    // 所以这里刻意不写 cleanup 去"取消"它
    run()
    // 只在拿到票据时跑一次；依赖里刻意不放 logout/loginWithTicket，
    // 它们每次渲染都是新函数，放进去会让这个 effect 反复执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket])

  useEffect(() => {
    // 带票据来的时候不走这条自动跳转：此刻的登录态是上一次的，
    // 跳走了票据就再也没机会兑换
    if (isAuthenticated && !ticket) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, ticket, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      setError(t('login.errorEmpty'))
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await login(username, password)
      if (result.success) {
        navigate('/', { replace: true })
      } else {
        setError(result.message)
      }
    } catch (err: any) {
      setError(err.message || t('login.errorFailed'))
    } finally {
      setLoading(false)
    }
  }

  // 带票据来的时候不能提前 return：正在换票 / 换票失败都还要给人看
  if (isAuthenticated && !ticket) return null

  // 代入客户门户的过渡界面：换票中显示进度，失败了说清楚该怎么办
  if (ticket) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #1F4E79, #4472C4)' }}
      >
        <div className="w-[420px] max-w-[90vw] bg-white rounded-2xl p-10 shadow-[0_20px_60px_rgba(0,0,0,0.3)] text-center">
          <div className="inline-flex items-center gap-2.5 mb-6">
            <BrandMark className="w-8 h-8" barColor="#1C1C1E" />
            <span className="text-2xl font-bold" style={{ color: '#1C1C1E' }}>KALUNA SPED</span>
          </div>

          {error ? (
            <>
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-4">
                {error}
              </div>
              <p className="text-xs text-slate-500">{t('impersonation.retryHint')}</p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#1F4E79' }} />
              <span className="text-sm">{t('impersonation.signingIn')}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #1F4E79, #4472C4)' }}
    >
      <div className="w-[420px] max-w-[90vw] bg-white rounded-2xl p-10 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
        {/* 标题 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-2.5">
            <BrandMark className="w-8 h-8" barColor="#1C1C1E" />
            <span className="text-2xl font-bold" style={{ color: '#1C1C1E' }}>KALUNA SPED</span>
          </div>
          <div className="text-sm text-slate-500">
            {t('app.loginSubtitle')}
          </div>
          {/* 语言切换（未登录也能切） */}
          <div className="flex justify-center mt-4">
            <LanguageSwitcher className="w-40" />
          </div>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">{t('login.username')}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your@company.com"
              className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">{t('login.password')}</label>
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
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

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

        <div className="text-center mt-4 text-xs text-slate-400">
          {t('login.noAccount')} <a href="#" style={{ color: '#4472C4' }}>{t('login.contactAdmin')}</a>
        </div>
      </div>
    </div>
  )
}
