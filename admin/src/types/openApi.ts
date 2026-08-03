import { formatDateTime } from '../utils/format'

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

/** 请求日志结果 → 徽章样式与语言包 key */
export const RESULT_BADGES: Record<string, { labelKey: string; cls: string }> = {
  SUCCESS: { labelKey: 'apiResult.SUCCESS', cls: 'bg-green-100 text-green-700' },
  DUPLICATE: { labelKey: 'apiResult.DUPLICATE', cls: 'bg-blue-100 text-blue-700' },
  VALIDATION_ERROR: { labelKey: 'apiResult.VALIDATION_ERROR', cls: 'bg-amber-100 text-amber-700' },
  AUTH_ERROR: { labelKey: 'apiResult.AUTH_ERROR', cls: 'bg-amber-100 text-amber-700' },
  FORBIDDEN: { labelKey: 'apiResult.FORBIDDEN', cls: 'bg-amber-100 text-amber-700' },
  RATE_LIMITED: { labelKey: 'apiResult.RATE_LIMITED', cls: 'bg-amber-100 text-amber-700' },
  BUSINESS_ERROR: { labelKey: 'apiResult.BUSINESS_ERROR', cls: 'bg-amber-100 text-amber-700' },
  NOT_FOUND: { labelKey: 'apiResult.NOT_FOUND', cls: 'bg-gray-100 text-gray-600' },
  SERVER_ERROR: { labelKey: 'apiResult.SERVER_ERROR', cls: 'bg-red-100 text-red-700' },
}

/** Webhook 投递状态徽章 */
export const DELIVERY_BADGES: Record<string, { labelKey: string; cls: string }> = {
  PENDING: { labelKey: 'webhookStatus.PENDING', cls: 'bg-blue-100 text-blue-700' },
  SENDING: { labelKey: 'webhookStatus.SENDING', cls: 'bg-blue-100 text-blue-700' },
  SENT: { labelKey: 'webhookStatus.SENT', cls: 'bg-green-100 text-green-700' },
  FAILED: { labelKey: 'webhookStatus.FAILED', cls: 'bg-red-100 text-red-700' },
}

/** Webhook 事件名的语言包 key */
export const EVENT_LABELS: Record<string, string> = {
  ORDER_STATUS_CHANGED: 'webhookEvent.ORDER_STATUS_CHANGED',
  INQUIRY_QUOTED: 'webhookEvent.INQUIRY_QUOTED',
  QUOTATION_DECISION: 'webhookEvent.QUOTATION_DECISION',
  WEBHOOK_TEST: 'webhookEvent.WEBHOOK_TEST',
}

/** 时间戳按当前界面语言格式化（原来写死 zh-CN） */
export const formatTime = (v: string | null) => formatDateTime(v)
