/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { User, UserType, Organization, AuthObject } from '../types'

// 认证存储键（与 api.ts 保持一致）
const AUTH_STORAGE_KEY = 'eu_tms_auth'

// ==================== 类型定义 ====================

interface AuthState {
  user: User | null
  userType: UserType | null
  roleCode: string | null
  organization: Organization | null
  authObjects: AuthObject[]
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
        const { token, user, organization, authObjects } = data.data

        // 保存到 localStorage
        const loginData = { token, user, organization, authObjects }
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loginData))

        setState({
          user,
          userType: user.userType || null,
          roleCode: user.roleCode || null,
          organization: organization || null,
          authObjects: authObjects || [],
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

  // 是否是管理员
  const isAdmin = useCallback((): boolean => {
    return state.roleCode === 'admin'
  }, [state.roleCode])

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
