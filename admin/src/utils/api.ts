/**
 * API 服务工具
 * 德国Box运输管理系统 API 接口
 */

// API 基础地址配置
export function getApiBaseUrl(): string {
  if (import.meta.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL as string
  }
  
  // 默认使用相对路径
  return ''
}

const API_BASE_URL = getApiBaseUrl()

// 认证存储键
const AUTH_STORAGE_KEY = 'germany_box_auth'

/**
 * 获取存储的认证 Token
 */
function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  const authData = localStorage.getItem(AUTH_STORAGE_KEY)
  if (!authData) return null
  
  try {
    const data = JSON.parse(authData)
    return data.token || null
  } catch {
    return null
  }
}

/**
 * 获取认证 Headers
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getStoredToken()
  if (token) {
    return { 'Authorization': `Bearer ${token}` }
  }
  return {}
}

// ==================== API 请求配置 ====================
const DEFAULT_TIMEOUT = 30000
const RETRY_COUNT = 1
const RETRY_DELAY = 1000

/**
 * 自定义 API 错误类
 */
export class ApiError extends Error {
  status: number
  code: string
  isTimeout: boolean
  isNetworkError: boolean

  constructor(message: string, status = 0, code = 'UNKNOWN_ERROR', isTimeout = false, isNetworkError = false) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.isTimeout = isTimeout
    this.isNetworkError = isNetworkError
  }
}

interface RequestOptions extends RequestInit {
  timeout?: number
  retry?: boolean
  retryCount?: number
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 通用 API 请求函数
 */
async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { 
    timeout = DEFAULT_TIMEOUT, 
    retry = true,
    retryCount = RETRY_COUNT,
    ...fetchOptions 
  } = options
  
  const url = API_BASE_URL ? `${API_BASE_URL}${endpoint}` : endpoint
  const method = (fetchOptions.method || 'GET').toUpperCase()
  const shouldRetry = retry && method === 'GET' && retryCount > 0

  const token = getStoredToken()
  const authHeaders: Record<string, string> = {}
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`
  }

  async function executeRequest(attemptNumber: number): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, timeout)

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: fetchOptions.signal || controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          ...fetchOptions.headers,
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        let errorMsg = response.statusText
        let errorCode = `HTTP_${response.status}`
        
        try {
          const errorData = await response.json()
          errorMsg = errorData.msg || errorData.message || errorMsg
          errorCode = errorData.errCode?.toString() || errorCode
        } catch {
          // 无法解析响应体
        }

        if (response.status === 401) {
          throw new ApiError('登录已过期，请重新登录', 401, 'UNAUTHORIZED')
        }

        if (response.status === 403) {
          throw new ApiError('没有权限访问此资源', 403, 'FORBIDDEN')
        }

        if (response.status === 404) {
          throw new ApiError('请求的资源不存在', 404, 'NOT_FOUND')
        }

        if (response.status >= 500) {
          throw new ApiError(errorMsg || '服务器错误，请稍后重试', response.status, 'SERVER_ERROR')
        }

        throw new ApiError(errorMsg, response.status, errorCode)
      }

      return response.json()
    } catch (error: any) {
      clearTimeout(timeoutId)

      if (error.name === 'AbortError') {
        const isTimeoutError = !fetchOptions.signal?.aborted
        if (isTimeoutError) {
          const timeoutError = new ApiError(
            `请求超时（${timeout / 1000}秒），请检查网络连接`,
            0,
            'TIMEOUT',
            true
          )
          
          if (shouldRetry && attemptNumber < retryCount) {
            console.warn(`[API] 请求超时，${RETRY_DELAY / 1000}秒后重试...`)
            await delay(RETRY_DELAY)
            return executeRequest(attemptNumber + 1)
          }
          
          throw timeoutError
        }
        throw new ApiError('请求已取消', 0, 'CANCELLED')
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new ApiError(
          '网络连接失败，请检查网络设置',
          0,
          'NETWORK_ERROR',
          false,
          true
        )
        
        if (shouldRetry && attemptNumber < retryCount) {
          console.warn(`[API] 网络错误，${RETRY_DELAY / 1000}秒后重试...`)
          await delay(RETRY_DELAY)
          return executeRequest(attemptNumber + 1)
        }
        
        throw networkError
      }

      if (error instanceof ApiError) {
        throw error
      }

      throw new ApiError(error.message || '请求失败', 0, 'UNKNOWN_ERROR')
    }
  }

  return executeRequest(0)
}

// ==================== 便捷 API 对象 ====================

interface ApiRequestOptions {
  timeout?: number
  signal?: AbortSignal
  retry?: boolean
}

const api = {
  get: <T>(endpoint: string, options?: ApiRequestOptions) => 
    request<T>(endpoint, { method: 'GET', ...options }),
  
  post: <T>(endpoint: string, data?: unknown, options?: ApiRequestOptions) => 
    request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      ...options
    }),
  
  put: <T>(endpoint: string, data?: unknown, options?: ApiRequestOptions) => 
    request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      ...options
    }),
  
  delete: <T>(endpoint: string, options?: ApiRequestOptions) => 
    request<T>(endpoint, { method: 'DELETE', ...options }),
  
  patch: <T>(endpoint: string, data?: unknown, options?: ApiRequestOptions) => 
    request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
      ...options
    })
}

export default api

// ==================== 类型定义 ====================

export interface User {
  id: string
  username: string
  name: string
  email: string
  phone?: string
  avatar?: string
  role: string
  roleName?: string
  status: 'active' | 'inactive'
  lastLoginTime?: string
  createTime?: string
  updateTime?: string
  permissions?: string[]
}

export interface ApiResponse<T = any> {
  errCode: number
  msg: string
  data?: T
}

export interface PaginatedResponse<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  user: User
  permissions: string[]
  token: string
}

/**
 * 用户登录
 */
export async function login(data: LoginRequest): Promise<ApiResponse<LoginResponse>> {
  return request<ApiResponse<LoginResponse>>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 获取用户列表
 */
export async function getUserList(params?: {
  page?: number
  pageSize?: number
  search?: string
  role?: string
  status?: string
}): Promise<ApiResponse<PaginatedResponse<User>>> {
  const queryParams = new URLSearchParams()
  if (params?.page) queryParams.append('page', params.page.toString())
  if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString())
  if (params?.search) queryParams.append('search', params.search)
  if (params?.role) queryParams.append('role', params.role)
  if (params?.status) queryParams.append('status', params.status)
  
  const queryString = queryParams.toString()
  return request<ApiResponse<PaginatedResponse<User>>>(
    `/api/users${queryString ? `?${queryString}` : ''}`
  )
}

/**
 * 创建用户
 */
export async function createUser(data: {
  username: string
  name: string
  email?: string
  phone?: string
  role: string
  password: string
}): Promise<ApiResponse<User>> {
  return request<ApiResponse<User>>('/api/users', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 更新用户
 */
export async function updateUser(id: string, data: {
  name?: string
  email?: string
  phone?: string
  role?: string
  status?: 'active' | 'inactive'
}): Promise<ApiResponse<User>> {
  return request<ApiResponse<User>>(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/**
 * 删除用户
 */
export async function deleteUser(id: string): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/users/${id}`, {
    method: 'DELETE',
  })
}
