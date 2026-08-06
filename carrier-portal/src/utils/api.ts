/**
 * API 服务工具
 * EU-TMS 承运商门户 API 接口
 */

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

// API 基础地址配置
export function getApiBaseUrl(): string {
  if (import.meta.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL as string
  }
  return ''
}

const API_BASE_URL = getApiBaseUrl()
const API_PREFIX = '/api/v1'

// 承运商门户使用独立的存储键
const AUTH_STORAGE_KEY = 'eu_tms_carrier_auth'

const DEFAULT_TIMEOUT = 30000

// 获取存储的认证 Token
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

export class ApiError extends Error {
  status: number
  code: string
  isTimeout: boolean
  isNetworkError: boolean

  constructor(
    message: string,
    status = 0,
    code = 'UNKNOWN_ERROR',
    isTimeout = false,
    isNetworkError = false
  ) {
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
  rawUrl?: boolean
}

// 通用 API 请求函数
async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    timeout = DEFAULT_TIMEOUT,
    rawUrl = false,
    ...fetchOptions
  } = options

  const prefix = rawUrl ? '' : API_PREFIX
  const url = API_BASE_URL ? `${API_BASE_URL}${prefix}${endpoint}` : `${prefix}${endpoint}`

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
        // 登录态失效：清凭据并整页跳回登录页，只清不跳会停在空页面上（踩坑 043）
        localStorage.removeItem(AUTH_STORAGE_KEY)
        if (window.location.pathname !== '/carrier/login') {
          window.location.href = '/carrier/login'
        }
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

    if (error.name === 'AbortError') {
      throw new ApiError(i18n.t('apiError.timeout'), 0, 'TIMEOUT', true)
    }

    if (error instanceof ApiError) throw error

    throw new ApiError(error.message || i18n.t('apiError.requestFailed'), 0, 'UNKNOWN_ERROR')
  }
}

// 便捷 API 对象
const api = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { method: 'GET', ...options }),

  post: <T>(endpoint: string, data?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    }),

  put: <T>(endpoint: string, data?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    }),

  delete: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { method: 'DELETE', ...options }),
}

export { AUTH_STORAGE_KEY }
export default api
