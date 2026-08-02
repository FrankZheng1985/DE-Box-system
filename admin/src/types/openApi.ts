/**
 * 开放 API 管理页的共享类型与展示常量（P8）
 *
 * 字段名与后端返回保持一致的 snake_case（项目规范：前端 interface 直接用 snake_case，
 * 不做 camelCase 映射，避免踩坑 003 那类字段错位）。
 */

export interface ApiKeyRow {
  id: string
  partner_code: string
  partner_name: string
  client_id: string
  key_prefix: string
  status: 'ACTIVE' | 'DISABLED'
  rate_limit_per_min: number
  ip_whitelist: string[]
  last_used_at: string | null
  remarks: string | null
  created_at: string
  client_code: string
  client_name: string
  webhook_url: string | null
  webhook_secret: string | null
}

export interface ApiLogRow {
  id: number
  partner_code: string | null
  method: string
  path: string
  external_ref: string | null
  status_code: number
  result: string
  error_message: string | null
  ip: string
  duration_ms: number
  created_at: string
}

export interface WebhookDeliveryRow {
  id: number
  partner_code: string
  event_type: string
  external_ref: string | null
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED'
  attempts: number
  next_attempt_at: string
  last_status_code: number | null
  last_error: string | null
  created_at: string
  sent_at: string | null
}

export interface ClientOption {
  id: string
  client_code: string
  company_name: string
}

export interface KeyFormData {
  partnerCode: string
  partnerName: string
  clientId: string
  rateLimitPerMin: string
  ipWhitelist: string
  remarks: string
  webhookUrl: string
}

export const EMPTY_KEY_FORM: KeyFormData = {
  partnerCode: '', partnerName: '', clientId: '', rateLimitPerMin: '60',
  ipWhitelist: '', remarks: '', webhookUrl: '',
}

/** 请求日志结果 → 徽章样式与中文名 */
export const RESULT_BADGES: Record<string, { label: string; cls: string }> = {
  SUCCESS: { label: '成功', cls: 'bg-green-100 text-green-700' },
  DUPLICATE: { label: '重复推送', cls: 'bg-blue-100 text-blue-700' },
  VALIDATION_ERROR: { label: '校验不过', cls: 'bg-amber-100 text-amber-700' },
  AUTH_ERROR: { label: '认证失败', cls: 'bg-amber-100 text-amber-700' },
  FORBIDDEN: { label: '被拒绝', cls: 'bg-amber-100 text-amber-700' },
  RATE_LIMITED: { label: '超限速', cls: 'bg-amber-100 text-amber-700' },
  BUSINESS_ERROR: { label: '业务拦截', cls: 'bg-amber-100 text-amber-700' },
  NOT_FOUND: { label: '回查未命中', cls: 'bg-gray-100 text-gray-600' },
  SERVER_ERROR: { label: '服务器错误', cls: 'bg-red-100 text-red-700' },
}

/** Webhook 投递状态徽章 */
export const DELIVERY_BADGES: Record<string, { label: string; cls: string }> = {
  PENDING: { label: '待投递', cls: 'bg-blue-100 text-blue-700' },
  SENDING: { label: '投递中', cls: 'bg-blue-100 text-blue-700' },
  SENT: { label: '成功', cls: 'bg-green-100 text-green-700' },
  FAILED: { label: '重试耗尽', cls: 'bg-red-100 text-red-700' },
}

/** Webhook 事件中文名 */
export const EVENT_LABELS: Record<string, string> = {
  ORDER_STATUS_CHANGED: '订单状态变更',
  INQUIRY_QUOTED: '询价已报价',
  QUOTATION_DECISION: '报价决策结果',
  WEBHOOK_TEST: '联调测试事件',
}

export const formatTime = (v: string | null) => (v ? new Date(v).toLocaleString('zh-CN') : '-')
