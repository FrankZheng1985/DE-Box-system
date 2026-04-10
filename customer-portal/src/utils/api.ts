/**
 * API 服务工具
 * 客户门户 API 接口
 */

// ==================== 类型定义 ====================

export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
  pagination?: {
    total: number
    page: number
    pageSize: number
    totalPages?: number
  }
}

// ==================== 配置 ====================

const API_PREFIX = '/api/v1'
const AUTH_STORAGE_KEY = 'eu_tms_client_auth'
const DEFAULT_TIMEOUT = 30000

// ==================== 工具函数 ====================

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

export function getAuthHeaders(): Record<string, string> {
  const token = getStoredToken()
  if (token) {
    return { 'Authorization': `Bearer ${token}` }
  }
  return {}
}

// ==================== 自定义错误 ====================

export class ApiError extends Error {
  status: number
  code: string

  constructor(message: string, status = 0, code = 'UNKNOWN_ERROR') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

// ==================== 请求函数 ====================

interface RequestOptions extends RequestInit {
  timeout?: number
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options

  const url = `${API_PREFIX}${endpoint}`
  const token = getStoredToken()
  const authHeaders: Record<string, string> = {}
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

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
      try {
        const errorData = await response.json()
        errorMsg = errorData.message || errorData.msg || errorMsg
      } catch {
        // 无法解析响应体
      }

      if (response.status === 401) {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        throw new ApiError('登录已过期，请重新登录', 401, 'UNAUTHORIZED')
      }

      throw new ApiError(errorMsg, response.status, `HTTP_${response.status}`)
    }

    return response.json()
  } catch (error: any) {
    clearTimeout(timeoutId)

    if (error instanceof ApiError) throw error

    if (error.name === 'AbortError') {
      throw new ApiError('请求超时，请检查网络连接', 0, 'TIMEOUT')
    }

    throw new ApiError(error.message || '请求失败', 0, 'UNKNOWN_ERROR')
  }
}

// ==================== 便捷 API 对象 ====================

const api = {
  get: <T>(endpoint: string, options?: { timeout?: number; signal?: AbortSignal }) =>
    request<T>(endpoint, { method: 'GET', ...options }),

  post: <T>(endpoint: string, data?: unknown, options?: { timeout?: number; signal?: AbortSignal }) =>
    request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    }),

  put: <T>(endpoint: string, data?: unknown, options?: { timeout?: number; signal?: AbortSignal }) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    }),

  delete: <T>(endpoint: string, options?: { timeout?: number; signal?: AbortSignal }) =>
    request<T>(endpoint, { method: 'DELETE', ...options }),
}

export { AUTH_STORAGE_KEY }
export default api
