/**
 * API 服务工具
 * EU-TMS 欧洲运输管理系统 V2 API 接口
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

// API 基础地址配置
export function getApiBaseUrl(): string {
  if (import.meta.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL as string
  }
  // 默认使用相对路径（Vite 代理会处理 /api/v1 前缀）
  return ''
}

const API_BASE_URL = getApiBaseUrl()

// API 版本前缀
const API_PREFIX = '/api/v1'

// 认证存储键
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

const AUTH_STORAGE_KEY = 'eu_tms_auth'

// 请求配置
const DEFAULT_TIMEOUT = 30000
const RETRY_COUNT = 1
const RETRY_DELAY = 1000

// ==================== 工具函数 ====================

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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ==================== 自定义错误 ====================

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

// ==================== 请求函数 ====================

interface RequestOptions extends RequestInit {
  timeout?: number
  retry?: boolean
  retryCount?: number
  // 是否跳过 /api/v1 前缀（用于特殊端点）
  rawUrl?: boolean
}

/**
 * 通用 API 请求函数
 * 所有请求默认加上 /api/v1 前缀
 */
async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retry = true,
    retryCount = RETRY_COUNT,
    rawUrl = false,
    ...fetchOptions
  } = options

  // 拼接完整 URL：基础地址 + /api/v1 前缀 + 端点
  const prefix = rawUrl ? '' : API_PREFIX
  const url = API_BASE_URL ? `${API_BASE_URL}${prefix}${endpoint}` : `${prefix}${endpoint}`
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
          // 后端按这个头决定基础数据下拉框（国家/币种/港口…）用哪种语言的名称
          'Accept-Language': i18n.language || 'zh',
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
          errorMsg = translateByCode(errorData) || errorData.msg || errorMsg
          errorCode = errorData.code?.toString() || errorCode
        } catch {
          // 无法解析响应体
        }

        if (response.status === 401) {
          // Token 过期，清除认证信息
          localStorage.removeItem(AUTH_STORAGE_KEY)
          throw new ApiError(i18n.t('apiError.sessionExpired'), 401, 'UNAUTHORIZED')
        }

        if (response.status === 403) {
          throw new ApiError(i18n.t('apiError.forbidden'), 403, 'FORBIDDEN')
        }

        if (response.status === 404) {
          throw new ApiError(i18n.t('apiError.notFound'), 404, 'NOT_FOUND')
        }

        if (response.status >= 500) {
          throw new ApiError(errorMsg || i18n.t('apiError.serverError'), response.status, 'SERVER_ERROR')
        }

        throw new ApiError(errorMsg, response.status, errorCode)
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
        const isTimeoutError = !fetchOptions.signal?.aborted
        if (isTimeoutError) {
          const timeoutError = new ApiError(
            i18n.t('apiError.timeoutSeconds', { seconds: timeout / 1000 }),
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
        throw new ApiError(i18n.t('apiError.cancelled'), 0, 'CANCELLED')
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new ApiError(
          i18n.t('apiError.networkFailed'),
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

      throw new ApiError(error.message || i18n.t('apiError.requestFailed'), 0, 'UNKNOWN_ERROR')
    }
  }

  return executeRequest(0)
}

// ==================== 便捷 API 对象 ====================

interface ApiRequestOptions {
  timeout?: number
  signal?: AbortSignal
  retry?: boolean
  rawUrl?: boolean
}

/**
 * API 请求对象
 * 所有端点自动加上 /api/v1 前缀
 *
 * 用法示例:
 *   api.get<ApiResponse<Order[]>>('/orders')
 *   api.post<ApiResponse<Order>>('/orders', orderData)
 *   api.put<ApiResponse<Order>>('/orders/123', updateData)
 *   api.delete<ApiResponse<void>>('/orders/123')
 */
const api = {
  get: <T>(endpoint: string, options?: ApiRequestOptions) =>
    request<T>(endpoint, { method: 'GET', ...options }),

  post: <T>(endpoint: string, data?: unknown, options?: ApiRequestOptions) =>
    request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    }),

  put: <T>(endpoint: string, data?: unknown, options?: ApiRequestOptions) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    }),

  delete: <T>(endpoint: string, options?: ApiRequestOptions) =>
    request<T>(endpoint, { method: 'DELETE', ...options }),

  patch: <T>(endpoint: string, data?: unknown, options?: ApiRequestOptions) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    }),
}

export { AUTH_STORAGE_KEY }
export default api
