import i18n from '../i18n'
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

/**
 * 员工代入客户门户时的身份信息；客户本人登录时为 null
 *
 * 代入态下 user 里的 id/username 就是员工自己的，
 * 这里额外留一份是为了横幅文案能同时说清"我是谁"和"我在看谁的门户"
 */
interface Impersonation {
  /** 代入的员工账号 */
  operatorUsername: string
  /** 员工姓名，横幅优先显示它 */
  operatorDisplayName?: string
  /** 正在查看的客户公司名 */
  companyName: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  loading: boolean
  /** 当前角色的权限码（P5），如 portal:billing_view */
  permissions: string[]
  /** 非 null 表示当前是员工代入某家客户的门户，界面上必须持续可见地提示 */
  impersonation: Impersonation | null
  /** 是否拥有某个权限码 */
  hasPermission: (code: string) => boolean
  login: (username: string, password: string) => Promise<LoginResult>
  /** 用运营端签发的一次性票据进入客户门户（见 server/utils/impersonation.js） */
  loginWithTicket: (ticket: string) => Promise<LoginResult>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [impersonation, setImpersonation] = useState<Impersonation | null>(null)
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
          setImpersonation(data.impersonation || null)
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
          return { success: false, message: i18n.t('login.errorNotClient') }
        }

        const perms: string[] = data.data.permissions || []
        setUser(userData)
        setToken(tokenStr)
        setPermissions(perms)
        // 客户本人登录，清掉可能残留的代入标记
        setImpersonation(null)
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
          token: tokenStr,
          user: userData,
          permissions: perms,
        }))
        return { success: true, message: i18n.t('login.success') }
      }

      // 后端会带 messageCode（P9），按码查本端语言包；
      // 查不到才退回后端 message —— 否则德语界面上会冒出中文报错
      return {
        success: false,
        message: data.messageCode
          ? i18n.t(`loginError.${data.messageCode}`, { defaultValue: data.message || i18n.t('login.errorWrong') })
          : data.message || i18n.t('login.errorWrong'),
      }
    } catch (error: any) {
      console.error('登录失败:', error)
      return { success: false, message: i18n.t('login.errorNetwork') }
    }
  }

  /**
   * 员工代入客户门户：拿运营端签发的一次性票据换 token
   *
   * 和 login 的差别只有换 token 的方式，拿到之后的登录态处理完全一样，
   * 额外多存一个 impersonation 块用来在界面上持续提示。
   */
  const loginWithTicket = async (ticket: string): Promise<LoginResult> => {
    try {
      const response = await fetch('/api/v1/auth/impersonate/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket }),
      })

      const data = await response.json()

      if (data.code === 200 && data.data) {
        const userData = data.data.user
        const tokenStr = data.data.token

        // 和普通登录一样守住这道口子（踩坑 028）。
        // 代入态下后端签的也是 CLIENT 外壳（否则租户过滤不生效），
        // 所以这道检查对两条链路的判断标准是一致的
        if (userData.userType !== 'CLIENT') {
          return { success: false, message: i18n.t('login.errorNotClient') }
        }

        const perms: string[] = data.data.permissions || []
        const imp: Impersonation | null = data.data.impersonation || null

        setUser(userData)
        setToken(tokenStr)
        setPermissions(perms)
        setImpersonation(imp)
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
          token: tokenStr,
          user: userData,
          permissions: perms,
          impersonation: imp,
        }))
        return { success: true, message: i18n.t('login.success') }
      }

      return {
        success: false,
        message: data.messageCode
          ? i18n.t(`loginError.${data.messageCode}`, { defaultValue: data.message || i18n.t('login.errorWrong') })
          : data.message || i18n.t('login.errorWrong'),
      }
    } catch (error: any) {
      console.error('进入客户门户失败:', error)
      return { success: false, message: i18n.t('login.errorNetwork') }
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    setPermissions([])
    setImpersonation(null)
    localStorage.removeItem(AUTH_STORAGE_KEY)
  }

  /** 判断当前账号有没有某个权限码 */
  const hasPermission = (code: string): boolean => permissions.includes(code)

  return (
    <AuthContext.Provider
      value={{ user, token, isAuthenticated: !!token, loading, permissions, impersonation, hasPermission, login, loginWithTicket, logout }}
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
