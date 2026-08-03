/**
 * API 服务工具
 * 客户门户 API 接口
 */

// ==================== 类型定义 ====================

import i18n from '../i18n'

/**
 * 按后端返回的 messageCode 翻译提示语（P9）
 *
 * 后端在响应里 additive 地带 messageCode（见 server/middleware/messageCode.js）。
 * 这里按码查语言包 `apiMessage.<CODE>`，查不到就原样用后端给的中文 message ——
 * 所以后端漏映射、或者语言包漏一条，只是那条不翻译，不会显示成空白或 key。
 */
function translateByCode(
  body: { message?: string; msg?: string; messageCode?: string } | null | undefined
): string | undefined {
  if (!body) return undefined
  // 认证/限流中间件走的是 { errCode, msg } 老格式，所以两个字段名都兜一下
  const raw = body.message || body.msg
  if (!body.messageCode) return raw
  return i18n.t(`apiMessage.${body.messageCode}`, { defaultValue: raw || '' }) || raw
}

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
        // 后端按这个头决定基础数据下拉框（国家/币种/港口…）用哪种语言的名称
        'Accept-Language': i18n.language || 'zh',
        ...authHeaders,
        ...fetchOptions.headers,
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      let errorMsg = response.statusText
      try {
        const errorData = await response.json()
        errorMsg = translateByCode(errorData) || errorData.msg || errorMsg
      } catch {
        // 无法解析响应体
      }

      if (response.status === 401) {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        throw new ApiError(i18n.t('apiError.sessionExpired'), 401, 'UNAUTHORIZED')
      }

      throw new ApiError(errorMsg, response.status, `HTTP_${response.status}`)
    }

    const body = await response.json()
    // 成功响应里的 message 也按码翻译，页面直接用 res.message 就是当前语言
    if (body && typeof body === 'object' && body.messageCode) {
      body.message = translateByCode(body) ?? body.message
    }
    return body
  } catch (error: any) {
    clearTimeout(timeoutId)

    if (error instanceof ApiError) throw error

    if (error.name === 'AbortError') {
      throw new ApiError(i18n.t('apiError.timeout'), 0, 'TIMEOUT')
    }

    throw new ApiError(error.message || i18n.t('apiError.requestFailed'), 0, 'UNKNOWN_ERROR')
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
