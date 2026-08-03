import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { applyLanguage, LANG_STORAGE_KEY } from '../i18n'

interface User {
  id: string
  username: string
  name: string
  email: string
  userType: string
  linkedEntityId?: string
  company?: string
  /** 账号上保存的界面语言（P9），登录接口返回 */
  language?: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  loading: boolean
  /** 当前角色的权限码（P5），如 carrier_portal:billing_view */
  permissions: string[]
  /** 是否拥有某个权限码 */
  hasPermission: (code: string) => boolean
  login: (username: string, password: string) => Promise<{ success: boolean; messageCode?: string }>
  logout: () => void
}

const AUTH_STORAGE_KEY = 'eu_tms_carrier_auth'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * 把账号上存的语言应用到界面（P9）
 * 只在这台机器上没手动选过语言时才生效——手动选的优先级更高
 */
function applyAccountLanguage(language?: string) {
  if (!language) return
  if (localStorage.getItem(LANG_STORAGE_KEY)) return
  applyLanguage(language, false)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 检查本地存储的认证信息
    const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY)
    if (savedAuth) {
      try {
        const data = JSON.parse(savedAuth)
        if (data.token && data.user) {
          setToken(data.token)
          setUser(data.user)
          setPermissions(data.permissions || [])
          applyAccountLanguage(data.user.language)
        }
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY)
      }
    }
    setLoading(false)
  }, [])

  const login = async (username: string, password: string): Promise<{ success: boolean; messageCode?: string }> => {
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, userType: 'CARRIER' }),
      })

      const data = await response.json()

      if (data.code === 200 && data.data) {
        const authData = {
          token: data.data.token,
          user: data.data.user,
          permissions: data.data.permissions || [],
        }
        setUser(authData.user)
        setToken(authData.token)
        setPermissions(authData.permissions)
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData))
        applyAccountLanguage(authData.user.language)
        return { success: true }
      }
      // 带出后端的 messageCode（P9），让登录页能显示「账号已停用」这类具体原因
      return { success: false, messageCode: data.messageCode }
    } catch (error) {
      console.error('登录失败:', error)
      return { success: false }
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    setPermissions([])
    localStorage.removeItem(AUTH_STORAGE_KEY)
  }

  /** 判断当前账号有没有某个权限码 */
  const hasPermission = (code: string): boolean => permissions.includes(code)

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        loading,
        permissions,
        hasPermission,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
