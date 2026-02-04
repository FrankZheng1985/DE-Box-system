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

// ==================== 订单相关 API ====================

export interface Order {
  id: string
  orderNo: string
  customerId?: string
  customerName: string
  customerRef?: string
  status: string
  totalAmount: number
  currency: string
  remark?: string
  operatorId?: string
  createTime?: string
  updateTime?: string
  // 运输信息
  transportMode?: string
  incoterms?: string
  origin?: { port: string; country: string }
  destination?: { port: string; country: string }
  etd?: string
  eta?: string
  // 货物信息
  packages?: number
  grossWeight?: number
  volume?: number
  isDangerous?: boolean
  requiresTemperatureControl?: boolean
  // 船务信息
  shippingLine?: string
  vesselName?: string
  voyageNo?: string
  blNumber?: string
  bookingNo?: string
  containers?: Array<{
    containerNo: string
    type: string
    sealNo: string
    vgm: number
  }>
}

/**
 * 获取订单列表
 */
export async function getOrderList(params?: {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  startDate?: string
  endDate?: string
  customerId?: string
}): Promise<ApiResponse<PaginatedResponse<Order>>> {
  const queryParams = new URLSearchParams()
  if (params?.page) queryParams.append('page', params.page.toString())
  if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString())
  if (params?.search) queryParams.append('search', params.search)
  if (params?.status) queryParams.append('status', params.status)
  if (params?.startDate) queryParams.append('startDate', params.startDate)
  if (params?.endDate) queryParams.append('endDate', params.endDate)
  if (params?.customerId) queryParams.append('customerId', params.customerId)
  
  const queryString = queryParams.toString()
  return request<ApiResponse<PaginatedResponse<Order>>>(
    `/api/orders${queryString ? `?${queryString}` : ''}`
  )
}

/**
 * 获取订单详情
 */
export async function getOrderDetail(id: string): Promise<ApiResponse<Order>> {
  return request<ApiResponse<Order>>(`/api/orders/${id}`)
}

/**
 * 创建订单
 */
export async function createOrder(data: Partial<Order> & {
  items?: Array<{
    productId: string
    productName: string
    quantity: number
    price: number
  }>
}): Promise<ApiResponse<{ id: string; orderNo: string; totalAmount: number }>> {
  return request<ApiResponse<{ id: string; orderNo: string; totalAmount: number }>>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 更新订单状态
 */
export async function updateOrderStatus(id: string, status: string): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/orders/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}

/**
 * 删除订单（仅限草稿状态）
 */
export async function deleteOrder(id: string): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/orders/${id}`, {
    method: 'DELETE',
  })
}

/**
 * 作废订单（非草稿状态）
 */
export async function voidOrder(id: string, reason: string): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/orders/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

/**
 * 更新订单
 */
export async function updateOrder(id: string, data: Partial<Order>): Promise<ApiResponse<Order>> {
  return request<ApiResponse<Order>>(`/api/orders/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// ==================== 客户相关 API ====================

export interface Customer {
  id: string
  name: string
  code?: string
  level?: string
  stage?: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  country?: string
  status: 'active' | 'inactive'
  remark?: string
  createTime?: string
  updateTime?: string
}

/**
 * 获取客户列表
 */
export async function getCustomerList(params?: {
  page?: number
  pageSize?: number
  search?: string
  level?: string
  stage?: string
  status?: string
}): Promise<ApiResponse<PaginatedResponse<Customer>>> {
  const queryParams = new URLSearchParams()
  if (params?.page) queryParams.append('page', params.page.toString())
  if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString())
  if (params?.search) queryParams.append('search', params.search)
  if (params?.level) queryParams.append('level', params.level)
  if (params?.stage) queryParams.append('stage', params.stage)
  if (params?.status) queryParams.append('status', params.status)
  
  const queryString = queryParams.toString()
  return request<ApiResponse<PaginatedResponse<Customer>>>(
    `/api/customers${queryString ? `?${queryString}` : ''}`
  )
}

/**
 * 创建客户
 */
export async function createCustomer(data: Partial<Customer>): Promise<ApiResponse<Customer>> {
  return request<ApiResponse<Customer>>('/api/customers', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 更新客户
 */
export async function updateCustomer(id: string, data: Partial<Customer>): Promise<ApiResponse<Customer>> {
  return request<ApiResponse<Customer>>(`/api/customers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/**
 * 删除客户
 */
export async function deleteCustomer(id: string): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/customers/${id}`, {
    method: 'DELETE',
  })
}

// ==================== 供应商相关 API ====================

export interface Supplier {
  id: string
  name: string
  code?: string
  type?: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  country?: string
  status: 'active' | 'inactive'
  remark?: string
  bankAccount?: string
  bankName?: string
  taxNo?: string
  createTime?: string
  updateTime?: string
}

/**
 * 获取供应商列表
 */
export async function getSupplierList(params?: {
  page?: number
  pageSize?: number
  search?: string
  type?: string
  status?: string
}): Promise<ApiResponse<PaginatedResponse<Supplier>>> {
  const queryParams = new URLSearchParams()
  if (params?.page) queryParams.append('page', params.page.toString())
  if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString())
  if (params?.search) queryParams.append('search', params.search)
  if (params?.type) queryParams.append('type', params.type)
  if (params?.status) queryParams.append('status', params.status)
  
  const queryString = queryParams.toString()
  return request<ApiResponse<PaginatedResponse<Supplier>>>(
    `/api/suppliers${queryString ? `?${queryString}` : ''}`
  )
}

/**
 * 创建供应商
 */
export async function createSupplier(data: Partial<Supplier>): Promise<ApiResponse<Supplier>> {
  return request<ApiResponse<Supplier>>('/api/suppliers', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 更新供应商
 */
export async function updateSupplier(id: string, data: Partial<Supplier>): Promise<ApiResponse<Supplier>> {
  return request<ApiResponse<Supplier>>(`/api/suppliers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/**
 * 删除供应商
 */
export async function deleteSupplier(id: string): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/suppliers/${id}`, {
    method: 'DELETE',
  })
}

// ==================== 发票相关 API ====================

export interface Invoice {
  id: string
  invoiceNo: string
  customerId?: string
  customerName: string
  amount: number
  currency: string
  status: string
  issueDate: string
  dueDate?: string
  paidAmount?: number
  paidDate?: string
  remark?: string
  createTime?: string
  updateTime?: string
  items?: Array<{
    id: string
    description: string
    quantity: number
    unitPrice: number
    amount: number
  }>
}

/**
 * 获取发票列表
 */
export async function getInvoiceList(params?: {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  startDate?: string
  endDate?: string
  customerId?: string
}): Promise<ApiResponse<PaginatedResponse<Invoice>>> {
  const queryParams = new URLSearchParams()
  if (params?.page) queryParams.append('page', params.page.toString())
  if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString())
  if (params?.search) queryParams.append('search', params.search)
  if (params?.status) queryParams.append('status', params.status)
  if (params?.startDate) queryParams.append('startDate', params.startDate)
  if (params?.endDate) queryParams.append('endDate', params.endDate)
  if (params?.customerId) queryParams.append('customerId', params.customerId)
  
  const queryString = queryParams.toString()
  return request<ApiResponse<PaginatedResponse<Invoice>>>(
    `/api/invoices${queryString ? `?${queryString}` : ''}`
  )
}

/**
 * 创建发票
 */
export async function createInvoice(data: Partial<Invoice>): Promise<ApiResponse<Invoice>> {
  return request<ApiResponse<Invoice>>('/api/invoices', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 更新发票
 */
export async function updateInvoice(id: string, data: Partial<Invoice>): Promise<ApiResponse<Invoice>> {
  return request<ApiResponse<Invoice>>(`/api/invoices/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/**
 * 删除发票
 */
export async function deleteInvoice(id: string): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/invoices/${id}`, {
    method: 'DELETE',
  })
}

/**
 * 记录发票付款
 */
export async function recordInvoicePayment(id: string, data: {
  amount: number
  paymentDate: string
  paymentMethod?: string
  remark?: string
}): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/invoices/${id}/payment`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// ==================== 应付账款相关 API ====================

export interface Payable {
  id: string
  billNo: string
  supplierId?: string
  supplierName: string
  amount: number
  currency: string
  status: string
  billDate: string
  dueDate?: string
  paidAmount?: number
  paidDate?: string
  remark?: string
  createTime?: string
  updateTime?: string
}

/**
 * 获取应付账款列表
 */
export async function getPayableList(params?: {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  startDate?: string
  endDate?: string
  supplierId?: string
}): Promise<ApiResponse<PaginatedResponse<Payable>>> {
  const queryParams = new URLSearchParams()
  if (params?.page) queryParams.append('page', params.page.toString())
  if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString())
  if (params?.search) queryParams.append('search', params.search)
  if (params?.status) queryParams.append('status', params.status)
  if (params?.startDate) queryParams.append('startDate', params.startDate)
  if (params?.endDate) queryParams.append('endDate', params.endDate)
  if (params?.supplierId) queryParams.append('supplierId', params.supplierId)
  
  const queryString = queryParams.toString()
  return request<ApiResponse<PaginatedResponse<Payable>>>(
    `/api/payables${queryString ? `?${queryString}` : ''}`
  )
}

/**
 * 创建应付账款
 */
export async function createPayable(data: Partial<Payable>): Promise<ApiResponse<Payable>> {
  return request<ApiResponse<Payable>>('/api/payables', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 更新应付账款
 */
export async function updatePayable(id: string, data: Partial<Payable>): Promise<ApiResponse<Payable>> {
  return request<ApiResponse<Payable>>(`/api/payables/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/**
 * 删除应付账款
 */
export async function deletePayable(id: string): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/payables/${id}`, {
    method: 'DELETE',
  })
}

/**
 * 记录应付账款付款
 */
export async function recordPayablePayment(id: string, data: {
  amount: number
  paymentDate: string
  paymentMethod?: string
  remark?: string
}): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/payables/${id}/payment`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// ==================== 产品定价相关 API ====================

export interface Product {
  id: string
  code: string
  name: string
  category?: string
  unit?: string
  basePrice?: number
  currency: string
  status: 'active' | 'inactive'
  description?: string
  createTime?: string
  updateTime?: string
}

export interface PriceRule {
  id: string
  productId: string
  name: string
  ruleType: string
  conditions?: Record<string, any>
  priceAdjustment?: number
  adjustmentType?: 'fixed' | 'percentage'
  priority?: number
  startDate?: string
  endDate?: string
  status: 'active' | 'inactive'
}

/**
 * 获取产品列表
 */
export async function getProductList(params?: {
  page?: number
  pageSize?: number
  search?: string
  category?: string
  status?: string
}): Promise<ApiResponse<PaginatedResponse<Product>>> {
  const queryParams = new URLSearchParams()
  if (params?.page) queryParams.append('page', params.page.toString())
  if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString())
  if (params?.search) queryParams.append('search', params.search)
  if (params?.category) queryParams.append('category', params.category)
  if (params?.status) queryParams.append('status', params.status)
  
  const queryString = queryParams.toString()
  return request<ApiResponse<PaginatedResponse<Product>>>(
    `/api/products${queryString ? `?${queryString}` : ''}`
  )
}

/**
 * 创建产品
 */
export async function createProduct(data: Partial<Product>): Promise<ApiResponse<Product>> {
  return request<ApiResponse<Product>>('/api/products', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 更新产品
 */
export async function updateProduct(id: string, data: Partial<Product>): Promise<ApiResponse<Product>> {
  return request<ApiResponse<Product>>(`/api/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/**
 * 删除产品
 */
export async function deleteProduct(id: string): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/products/${id}`, {
    method: 'DELETE',
  })
}

/**
 * 获取价格规则列表
 */
export async function getPriceRuleList(productId?: string): Promise<ApiResponse<PriceRule[]>> {
  const queryString = productId ? `?productId=${productId}` : ''
  return request<ApiResponse<PriceRule[]>>(`/api/products/price-rules${queryString}`)
}

/**
 * 创建价格规则
 */
export async function createPriceRule(data: Partial<PriceRule>): Promise<ApiResponse<PriceRule>> {
  return request<ApiResponse<PriceRule>>('/api/products/price-rules', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 更新价格规则
 */
export async function updatePriceRule(id: string, data: Partial<PriceRule>): Promise<ApiResponse<PriceRule>> {
  return request<ApiResponse<PriceRule>>(`/api/products/price-rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/**
 * 删除价格规则
 */
export async function deletePriceRule(id: string): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/products/price-rules/${id}`, {
    method: 'DELETE',
  })
}

// ==================== 对账相关 API ====================

export interface Reconciliation {
  id: string
  reconciliationNo: string
  customerId?: string
  customerName: string
  startDate: string
  endDate: string
  totalAmount: number
  currency: string
  status: string
  confirmedAt?: string
  confirmedBy?: string
  remark?: string
  createTime?: string
  updateTime?: string
  items?: Array<{
    id: string
    type: string
    documentNo: string
    date: string
    amount: number
    description?: string
  }>
}

/**
 * 获取对账单列表
 */
export async function getReconciliationList(params?: {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  startDate?: string
  endDate?: string
  customerId?: string
}): Promise<ApiResponse<PaginatedResponse<Reconciliation>>> {
  const queryParams = new URLSearchParams()
  if (params?.page) queryParams.append('page', params.page.toString())
  if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString())
  if (params?.search) queryParams.append('search', params.search)
  if (params?.status) queryParams.append('status', params.status)
  if (params?.startDate) queryParams.append('startDate', params.startDate)
  if (params?.endDate) queryParams.append('endDate', params.endDate)
  if (params?.customerId) queryParams.append('customerId', params.customerId)
  
  const queryString = queryParams.toString()
  return request<ApiResponse<PaginatedResponse<Reconciliation>>>(
    `/api/reconciliations${queryString ? `?${queryString}` : ''}`
  )
}

/**
 * 创建对账单
 */
export async function createReconciliation(data: Partial<Reconciliation>): Promise<ApiResponse<Reconciliation>> {
  return request<ApiResponse<Reconciliation>>('/api/reconciliations', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 发送对账单
 */
export async function sendReconciliation(id: string): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/reconciliations/${id}/send`, {
    method: 'POST',
  })
}

/**
 * 确认对账单
 */
export async function confirmReconciliation(id: string, data?: {
  remark?: string
}): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/reconciliations/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  })
}

/**
 * 删除对账单
 */
export async function deleteReconciliation(id: string): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/reconciliations/${id}`, {
    method: 'DELETE',
  })
}

// ==================== TMS 运输相关 API ====================

export interface Shipment {
  id: string
  shipmentNo: string
  orderId?: string
  orderNo?: string
  type: string
  status: string
  origin: {
    address: string
    city: string
    country: string
    contact?: string
    phone?: string
  }
  destination: {
    address: string
    city: string
    country: string
    contact?: string
    phone?: string
  }
  carrier?: string
  trackingNo?: string
  estimatedPickup?: string
  estimatedDelivery?: string
  actualPickup?: string
  actualDelivery?: string
  weight?: number
  volume?: number
  packages?: number
  costs?: Array<{
    id: string
    type: string
    amount: number
    currency: string
    description?: string
  }>
  milestones?: Array<{
    id: string
    status: string
    location?: string
    time: string
    description?: string
  }>
  remark?: string
  createTime?: string
  updateTime?: string
}

/**
 * 获取运输单列表
 */
export async function getShipmentList(params?: {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  type?: string
  startDate?: string
  endDate?: string
}): Promise<ApiResponse<PaginatedResponse<Shipment>>> {
  const queryParams = new URLSearchParams()
  if (params?.page) queryParams.append('page', params.page.toString())
  if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString())
  if (params?.search) queryParams.append('search', params.search)
  if (params?.status) queryParams.append('status', params.status)
  if (params?.type) queryParams.append('type', params.type)
  if (params?.startDate) queryParams.append('startDate', params.startDate)
  if (params?.endDate) queryParams.append('endDate', params.endDate)
  
  const queryString = queryParams.toString()
  return request<ApiResponse<PaginatedResponse<Shipment>>>(
    `/api/tms/shipments${queryString ? `?${queryString}` : ''}`
  )
}

/**
 * 获取运输单详情
 */
export async function getShipmentDetail(id: string): Promise<ApiResponse<Shipment>> {
  return request<ApiResponse<Shipment>>(`/api/tms/shipments/${id}`)
}

/**
 * 创建运输单
 */
export async function createShipment(data: Partial<Shipment>): Promise<ApiResponse<Shipment>> {
  return request<ApiResponse<Shipment>>('/api/tms/shipments', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 更新运输单
 */
export async function updateShipment(id: string, data: Partial<Shipment>): Promise<ApiResponse<Shipment>> {
  return request<ApiResponse<Shipment>>(`/api/tms/shipments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/**
 * 更新运输单状态
 */
export async function updateShipmentStatus(id: string, status: string, data?: {
  location?: string
  description?: string
}): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/tms/shipments/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, ...data }),
  })
}

/**
 * 删除运输单
 */
export async function deleteShipment(id: string): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/tms/shipments/${id}`, {
    method: 'DELETE',
  })
}

/**
 * 添加运输费用
 */
export async function addShipmentCost(shipmentId: string, data: {
  type: string
  amount: number
  currency: string
  description?: string
}): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/tms/shipments/${shipmentId}/costs`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 添加运输里程碑
 */
export async function addShipmentMilestone(shipmentId: string, data: {
  status: string
  location?: string
  time: string
  description?: string
}): Promise<ApiResponse<void>> {
  return request<ApiResponse<void>>(`/api/tms/shipments/${shipmentId}/milestones`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 重置用户密码
 */
export async function resetUserPassword(id: string, newPassword?: string): Promise<ApiResponse<{ tempPassword?: string }>> {
  return request<ApiResponse<{ tempPassword?: string }>>(`/api/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  })
}
