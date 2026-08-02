import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

const AUTH_STORAGE_KEY = 'eu_tms_client_auth'

interface User {
  id: string
  username: string
  name: string
  email: string
  userType: string
  // 登录接口一直有返回，只是此前没声明；公司级通知设置要靠它判断是不是 client_admin
  roleCode?: string
  linkedEntityId?: string
  company?: string
}

interface LoginResult {
  success: boolean
  message: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  loading: boolean
  /** 当前角色的权限码（P5），如 portal:billing_view */
  permissions: string[]
  /** 是否拥有某个权限码 */
  hasPermission: (code: string) => boolean
  login: (username: string, password: string) => Promise<LoginResult>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(AUTH_STORAGE_KEY)
    if (saved) {
      try {
        const data = JSON.parse(saved)
        if (data.token && data.user) {
          setToken(data.token)
          setUser(data.user)
          setPermissions(data.permissions || [])
        }
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY)
      }
    }
    setLoading(false)
  }, [])

  const login = async (username: string, password: string): Promise<LoginResult> => {
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      if (data.code === 200 && data.data) {
        const userData = data.data.user
        const tokenStr = data.data.token

        // 验证用户类型必须是 CLIENT
        if (userData.userType !== 'CLIENT') {
          return { success: false, message: '此账户不是客户账户，请使用管理后台登录' }
        }

        const perms: string[] = data.data.permissions || []
        setUser(userData)
        setToken(tokenStr)
        setPermissions(perms)
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
          token: tokenStr,
          user: userData,
          permissions: perms,
        }))
        return { success: true, message: '登录成功' }
      }

      return { success: false, message: data.message || '用户名或密码错误' }
    } catch (error: any) {
      console.error('登录失败:', error)
      return { success: false, message: '网络错误，请检查连接' }
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
      value={{ user, token, isAuthenticated: !!token, loading, permissions, hasPermission, login, logout }}
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
