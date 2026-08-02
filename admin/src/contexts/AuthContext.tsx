/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { User, UserType, Organization, AuthObject } from '../types'
import { SUPER_ROLE_CODE } from '../constants/permissions'

// 认证存储键（与 api.ts 保持一致）
const AUTH_STORAGE_KEY = 'eu_tms_auth'

// 非运营账号登录管理端时的引导文案（nginx 路由：/customer/、/carrier/）
const PORTAL_LOGIN_HINT: Partial<Record<UserType, string>> = {
  CLIENT: '这是运营管理端，客户账号请前往客户门户 /customer/ 登录',
  CARRIER: '这是运营管理端，承运商账号请前往承运商门户 /carrier/ 登录',
}

// ==================== 类型定义 ====================

interface AuthState {
  user: User | null
  userType: UserType | null
  roleCode: string | null
  organization: Organization | null
  authObjects: AuthObject[]
  /** 当前角色的权限码（P5），如 order:view、finance:post */
  permissions: string[]
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>
  logout: () => void
  getAccessToken: () => Promise<string | null>
  hasAuth: (authCode: string) => boolean
  hasAnyAuth: (authCodes: string[]) => boolean
  hasAllAuth: (authCodes: string[]) => boolean
  isAdmin: () => boolean
  /** 是否拥有某个权限码（P5） */
  hasPermission: (code: string) => boolean
  /** 是否拥有其中任意一个权限码（P5） */
  hasAnyPermission: (codes: string[]) => boolean
  /** 重新从后端拉权限码——管理员刚改完角色权限时用，不用退出重登 */
  refreshPermissions: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// ==================== AuthProvider ====================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    userType: null,
    roleCode: null,
    organization: null,
    authObjects: [],
    permissions: [],
    token: null,
    isAuthenticated: false,
    isLoading: true,
  })

  // 从 localStorage 恢复登录状态
  useEffect(() => {
    const authData = localStorage.getItem(AUTH_STORAGE_KEY)
    if (authData) {
      try {
        const data = JSON.parse(authData)
        setState({
          user: data.user,
          userType: data.user?.userType || null,
          roleCode: data.user?.roleCode || null,
          organization: data.organization || null,
          authObjects: data.authObjects || [],
          permissions: data.permissions || [],
          token: data.token,
          isAuthenticated: true,
          isLoading: false,
        })
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        setState(prev => ({ ...prev, isLoading: false }))
      }
    } else {
      setState(prev => ({ ...prev, isLoading: false }))
    }
  }, [])

  // 登录
  const login = useCallback(async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      // V2 格式：检查 code === 200
      if (data.code === 200 && data.data) {
        const { token, user, organization, authObjects, permissions } = data.data

        // 管理端只允许运营账号登录，客户/承运商各走自己的门户
        if (user?.userType !== 'OPERATOR') {
          return { success: false, message: PORTAL_LOGIN_HINT[user?.userType as UserType] || '该账号无权访问运营管理端' }
        }

        // 保存到 localStorage
        const loginData = { token, user, organization, authObjects, permissions }
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loginData))

        setState({
          user,
          userType: user.userType || null,
          roleCode: user.roleCode || null,
          organization: organization || null,
          authObjects: authObjects || [],
          permissions: permissions || [],
          token,
          isAuthenticated: true,
          isLoading: false,
        })

        return { success: true, message: '登录成功' }
      } else {
        return { success: false, message: data.message || '登录失败' }
      }
    } catch (error: any) {
      console.error('登录失败:', error)
      return { success: false, message: error.message || '登录失败，请稍后重试' }
    }
  }, [])

  // 登出
  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    setState({
      user: null,
      userType: null,
      roleCode: null,
      organization: null,
      authObjects: [],
      permissions: [],
      token: null,
      isAuthenticated: false,
      isLoading: false,
    })
    window.location.href = '/login'
  }, [])

  // 获取 Token
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (state.token) {
      return state.token
    }

    const authData = localStorage.getItem(AUTH_STORAGE_KEY)
    if (authData) {
      try {
        const data = JSON.parse(authData)
        return data.token || null
      } catch {
        return null
      }
    }

    return null
  }, [state.token])

  // 检查是否有某个权限
  const hasAuth = useCallback((authCode: string): boolean => {
    // admin 角色拥有所有权限
    if (state.roleCode === 'admin') return true
    if (!state.authObjects || !Array.isArray(state.authObjects)) return false
    return state.authObjects.some(a => a.code === authCode)
  }, [state.roleCode, state.authObjects])

  // 检查是否有任意一个权限
  const hasAnyAuth = useCallback((authCodes: string[]): boolean => {
    if (state.roleCode === 'admin') return true
    if (!state.authObjects || !Array.isArray(state.authObjects)) return false
    if (!authCodes || !Array.isArray(authCodes)) return false
    return authCodes.some(code => state.authObjects.some(a => a.code === code))
  }, [state.roleCode, state.authObjects])

  // 检查是否有所有权限
  const hasAllAuth = useCallback((authCodes: string[]): boolean => {
    if (state.roleCode === 'admin') return true
    if (!state.authObjects || !Array.isArray(state.authObjects)) return false
    if (!authCodes || !Array.isArray(authCodes)) return false
    return authCodes.every(code => state.authObjects.some(a => a.code === code))
  }, [state.roleCode, state.authObjects])

  // 是否是系统管理员
  // ⚠️ 角色码是 sys_admin，不是 admin（历史上这里写的是 'admin'，永远返回 false）
  const isAdmin = useCallback((): boolean => {
    return state.roleCode === SUPER_ROLE_CODE
  }, [state.roleCode])

  // ==================== 权限码（P5） ====================

  const hasPermission = useCallback((code: string): boolean => {
    if (state.roleCode === SUPER_ROLE_CODE) return true
    return state.permissions.includes(code)
  }, [state.roleCode, state.permissions])

  const hasAnyPermission = useCallback((codes: string[]): boolean => {
    if (state.roleCode === SUPER_ROLE_CODE) return true
    if (!Array.isArray(codes) || codes.length === 0) return true
    return codes.some(code => state.permissions.includes(code))
  }, [state.roleCode, state.permissions])

  // 管理员刚在角色权限页改完勾选时，本人不用退出重登
  const refreshPermissions = useCallback(async (): Promise<void> => {
    const token = await getAccessToken()
    if (!token) return
    try {
      const res = await fetch('/api/v1/auth/permissions', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.code === 200 && Array.isArray(data.data?.permissions)) {
        const permissions: string[] = data.data.permissions
        setState(prev => ({ ...prev, permissions }))
        // localStorage 也同步，免得刷新页面又退回旧权限
        const stored = localStorage.getItem(AUTH_STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...parsed, permissions }))
        }
      }
    } catch (error) {
      console.error('刷新权限失败:', error)
    }
  }, [getAccessToken])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        getAccessToken,
        hasAuth,
        hasAnyAuth,
        hasAllAuth,
        isAdmin,
        hasPermission,
        hasAnyPermission,
        refreshPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ==================== Hook ====================

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用')
  }
  return context
}

export default AuthContext
