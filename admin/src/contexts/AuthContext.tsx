/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { type User } from '../utils/api'

// API 基础地址
function getApiBaseUrl(): string {
  if (import.meta.env.DEV) {
    return 'http://localhost:3002/api'
  }
  return '/api'
}

const API_BASE_URL = getApiBaseUrl()

interface AuthState {
  user: User | null
  permissions: string[]
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>
  logout: () => void
  getAccessToken: () => Promise<string | null>
  hasPermission: (permission: string) => boolean
  hasAnyPermission: (permissions: string[]) => boolean
  hasAllPermissions: (permissions: string[]) => boolean
  isAdmin: () => boolean
  isManager: () => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// 本地存储键
const AUTH_STORAGE_KEY = 'germany_box_auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    permissions: [],
    token: null,
    isAuthenticated: false,
    isLoading: true,
  })

  // 检查是否有登录缓存
  useEffect(() => {
    const authData = localStorage.getItem(AUTH_STORAGE_KEY)
    if (authData) {
      try {
        const data = JSON.parse(authData)
        setState({
          user: data.user,
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

  // 用户名+密码登录
  const login = useCallback(async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      if (data.errCode === 200 && data.data) {
        const { user, permissions, token } = data.data

        // 保存登录数据
        const loginData = { user, permissions, token }
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loginData))

        setState({
          user,
          permissions: permissions || [],
          token,
          isAuthenticated: true,
          isLoading: false,
        })

        return { success: true, message: '登录成功' }
      } else {
        return { success: false, message: data.msg || '登录失败' }
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
      permissions: [],
      token: null,
      isAuthenticated: false,
      isLoading: false,
    })
    window.location.href = '/login'
  }, [])

  // 获取 Access Token
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
  const hasPermission = useCallback((permission: string): boolean => {
    if (state.user?.role === 'admin') return true
    if (!state.permissions || !Array.isArray(state.permissions)) return false
    return state.permissions.includes(permission)
  }, [state.user?.role, state.permissions])

  // 检查是否有任意一个权限
  const hasAnyPermission = useCallback((permissions: string[]): boolean => {
    if (state.user?.role === 'admin') return true
    if (!state.permissions || !Array.isArray(state.permissions)) return false
    if (!permissions || !Array.isArray(permissions)) return false
    return permissions.some(p => state.permissions.includes(p))
  }, [state.user?.role, state.permissions])

  // 检查是否有所有权限
  const hasAllPermissions = useCallback((permissions: string[]): boolean => {
    if (state.user?.role === 'admin') return true
    if (!state.permissions || !Array.isArray(state.permissions)) return false
    if (!permissions || !Array.isArray(permissions)) return false
    return permissions.every(p => state.permissions.includes(p))
  }, [state.user?.role, state.permissions])

  // 是否是管理员
  const isAdmin = useCallback((): boolean => {
    return state.user?.role === 'admin'
  }, [state.user?.role])

  // 是否是经理
  const isManager = useCallback((): boolean => {
    return state.user?.role === 'manager' || state.user?.role === 'admin'
  }, [state.user?.role])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        getAccessToken,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        isAdmin,
        isManager,
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

// 权限常量
export const PERMISSIONS = {
  // 系统概览
  DASHBOARD_VIEW: 'dashboard:view',
  // 订单管理
  BILL_VIEW: 'bill:view',
  BILL_VIEW_ALL: 'bill:view_all',
  BILL_CREATE: 'bill:create',
  BILL_EDIT: 'bill:edit',
  BILL_DELETE: 'bill:delete',
  // TMS运输
  TMS_VIEW: 'tms:view',
  TMS_OPERATE: 'tms:operate',
  TMS_PRICING: 'tms:pricing',
  TMS_CONDITIONS: 'tms:conditions',
  // CRM客户管理
  CRM_VIEW: 'crm:view',
  CRM_MANAGE: 'crm:manage',
  CRM_CUSTOMER_VIEW: 'crm:customer:view',
  CRM_CUSTOMER_MANAGE: 'crm:customer:manage',
  // 供应商管理
  SUPPLIER_VIEW: 'supplier:view',
  SUPPLIER_MANAGE: 'supplier:manage',
  // 财务管理
  FINANCE_VIEW: 'finance:view',
  FINANCE_MANAGE: 'finance:manage',
  FINANCE_INVOICE_VIEW: 'finance:invoice_view',
  FINANCE_INVOICE_CREATE: 'finance:invoice_create',
  FINANCE_PAYMENT_VIEW: 'finance:payment_view',
  FINANCE_REPORT_VIEW: 'finance:report_view',
  // 产品定价
  PRODUCT_VIEW: 'product:view',
  PRODUCT_MANAGE: 'product:manage',
  // 系统管理
  SYSTEM_USER: 'system:user',
  SYSTEM_BASIC_DATA: 'system:basic_data',
  SYSTEM_INFO_CENTER: 'system:info_center',
} as const

export default AuthContext
