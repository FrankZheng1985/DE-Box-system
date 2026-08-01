/**
 * 报价邮件的组装与入队（需求 5.2）
 *
 * 不直接调 sendEmail，而是往 notifications 表插一行 email_status='PENDING'，
 * 由 P0 建好的邮件队列（utils/email-queue.js + cron 每 2 分钟）真正发出去。
 * 好处是复用已有的重试、多进程防重发、失败留痕机制，
 * 而且发信慢/SMTP 挂了都不会拖住"发送报价"这个接口。
 */

import { getBoolSetting, getNumberSetting } from '../../utils/settings.js'
import tokenService from '../quotation-response/service.js'
import { parseJsonColumn } from './service.js'

/** 通知类型，复用现有的状态变更类型，不为此单独加一个枚举 */
const NOTIFICATION_TYPE = 'STATUS_UPDATE'

/**
 * 客户能收到报价邮件的地址
 *
 * 优先级：询价单上填的联系邮箱 → 客户主数据的联系邮箱 → 开票邮箱
 * 询价联系人优先，是因为那是本次业务对接的人，比公司主数据上的总邮箱更精确。
 */
export function pickRecipient({ inquiryEmail, contactEmail, invoiceEmail }) {
  return inquiryEmail || contactEmail || invoiceEmail || null
}

/** 拼 "DE München → PL Warszawa" */
function routeText(from, to) {
  const f = parseJsonColumn(from)
  const t = parseJsonColumn(to)
  const fs = [f.country, f.city].filter(Boolean).join(' ')
  const ts = [t.country, t.city].filter(Boolean).join(' ')
  if (!fs && !ts) return ''
  return `${fs || '-'} → ${ts || '-'}`
}

function formatMoney(amount, currency = 'EUR') {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '-'
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(n)
  } catch {
    return `${currency || 'EUR'} ${n.toFixed(2)}`
  }
}

/**
 * 系统对外的访问地址
 *
 * 邮件里的链接必须是绝对地址，客户的邮箱里没有"当前站点"这个概念。
 * 优先读 APP_BASE_URL；没配就退回 CORS_ORIGIN（生产两者是同一个值）。
 */
export function getBaseUrl() {
  const raw = process.env.APP_BASE_URL || process.env.CORS_ORIGIN || ''
  return raw.replace(/\/+$/, '')
}

/**
 * 给一张报价签发确认链接并把邮件排进队列
 *
 * 必须在事务内调用（和"报价改为已发送"同一笔事务）：
 * 邮件入队失败就该连状态一起回滚，避免出现"状态是已发送但客户没收到"。
 *
 * @param {object} client 事务客户端
 * @param {string} quotationId
 * @param {string} [userId] 操作人
 * @returns {Promise<{queued: boolean, reason?: string, to?: string}>}
 */
export async function queueQuotationEmail(client, quotationId, userId = null) {
  const enabled = await getBoolSetting('quotation_email_enabled', true)
  if (!enabled) return { queued: false, reason: '系统配置已关闭报价邮件' }

  const result = await client.query(
    `SELECT q.id, q.quotation_number, q.total_price, q.currency, q.valid_until,
            q.remarks, q.route_from, q.route_to,
            c.company_name AS client_name, c.contact_email, c.invoice_email,
            i.contact_email AS inquiry_email
     FROM quotations q
     LEFT JOIN clients c   ON c.id = q.client_id
     LEFT JOIN inquiries i ON i.id = q.inquiry_id
     WHERE q.id = $1`,
    [quotationId]
  )
  if (result.rows.length === 0) return { queued: false, reason: '报价不存在' }
  const q = result.rows[0]

  const to = pickRecipient({
    inquiryEmail: q.inquiry_email,
    contactEmail: q.contact_email,
    invoiceEmail: q.invoice_email,
  })
  if (!to) {
    // 没邮箱不是错误：报价照样发送成功，客户可以登录门户确认，
    // 但要如实告诉运营"这封没发出去"，而不是假装发了
    return { queued: false, reason: '该客户没有可用的联系邮箱，未发送邮件' }
  }

  const validDays = await getNumberSetting('quotation_token_valid_days', 14)
  const { plain, expiresAt } = await tokenService.issueToken(client, {
    quotationId,
    validUntil: q.valid_until,
    defaultValidDays: validDays,
    sentTo: to,
    createdBy: userId,
  })

  const base = getBaseUrl()
  const link = (action) =>
    `${base}/api/v1/quotation-response/${encodeURIComponent(plain)}?action=${action}`

  const payload = {
    quotationNumber: q.quotation_number,
    clientName: q.client_name || '客户',
    route: routeText(q.route_from, q.route_to),
    totalPrice: formatMoney(q.total_price, q.currency),
    validUntil: q.valid_until ? new Date(q.valid_until).toLocaleDateString('de-DE') : '',
    remarks: q.remarks || '',
    acceptUrl: link('accept'),
    pendingUrl: link('pending'),
    rejectUrl: link('reject'),
  }

  // user_id 留空：收件人是询价单上的联系人，未必在系统里有账号（迁移 108 已放开该列）
  await client.query(
    `INSERT INTO notifications
       (user_id, type, title, message, channel, email_to, email_status,
        email_template, email_payload)
     VALUES (NULL, $1, $2, $3, 'EMAIL', $4, 'PENDING', 'QUOTATION_RESPONSE', $5)`,
    [
      NOTIFICATION_TYPE,
      `报价单 ${q.quotation_number} 请确认`,
      `报价金额 ${payload.totalPrice}，请点击邮件中的链接确认。`,
      to,
      JSON.stringify(payload),
    ]
  )

  return { queued: true, to, expiresAt }
}

export default { queueQuotationEmail, pickRecipient, getBaseUrl }
