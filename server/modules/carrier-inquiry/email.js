/**
 * 服务商询价邮件的组装与入队（2026-08-07）
 *
 * 模式与 quotation/email.js 相同：不直接调 sendEmail，
 * 往 notifications 表插一行 email_status='PENDING'，
 * 由邮件队列（utils/email-queue.js + cron 每 2 分钟）真正发出去，
 * 复用已有的重试、多进程防重发、失败留痕机制。
 *
 * ⚠️ 邮件内容只有路线和货物信息，绝不能带客户名/客户价格（对服务商保密）。
 */

/** 通知类型，沿用报价邮件的做法，不为此单独加枚举 */
const NOTIFICATION_TYPE = 'STATUS_UPDATE'

/** 业务类型在邮件里的英/德说法（值域见 order/service.js 的 BUSINESS_TYPES） */
const SERVICE_LABELS = {
  TRUCK_FTL: { en: 'Road freight FTL (full load)', de: 'LKW-Komplettladung (FTL)' },
  TRUCK_LTL: { en: 'Road freight LTL (part load)', de: 'LKW-Teilladung (LTL)' },
  LOCAL_DELIVERY: { en: 'Local delivery', de: 'Lokale Zustellung' },
}

/** 宽松的邮箱格式检查：有 @、@ 两侧非空、域名带点。挡手误，不追求 RFC 完备 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * 把 inquiry_emails 列的值归一成干净的邮箱数组
 * （pg 的 JSONB 通常回来已是数组，但历史数据/手工导入可能是字符串）
 */
export function normalizeEmails(value) {
  let list = value
  if (typeof list === 'string') {
    try { list = JSON.parse(list) } catch { list = list.split(/[,;\s]+/) }
  }
  if (!Array.isArray(list)) return []

  const seen = new Set()
  const result = []
  for (const item of list) {
    const email = String(item || '').trim()
    if (!email || !EMAIL_PATTERN.test(email)) continue
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(email)
  }
  return result
}

/**
 * 一家服务商接收询价邮件的收件人列表
 * 登记的询价邮箱优先；一个都没登记时回退用联系邮箱
 */
export function recipientsForCarrier(carrier) {
  const listed = normalizeEmails(carrier?.inquiry_emails)
  if (listed.length > 0) return listed
  return normalizeEmails([carrier?.contact_email])
}

/** JSONB 列保险解析：pg 通常已给对象，字符串再兜底 parse 一次 */
function parseJsonColumn(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return {} }
}

/** 拼 "DE Hamburg → PL Warszawa" */
function routeText(from, to) {
  const f = parseJsonColumn(from)
  const t = parseJsonColumn(to)
  const fs = [f.country, f.city].filter(Boolean).join(' ')
  const ts = [t.country, t.city].filter(Boolean).join(' ')
  if (!fs && !ts) return ''
  return `${fs || '-'} → ${ts || '-'}`
}

/** NUMERIC 回来是字符串（踩坑 002），格式化前先转数字；空值返回空串不占行 */
function formatNumber(value, unit) {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return `${n.toLocaleString('en-US')} ${unit}`.trim()
}

/**
 * 给一条服务商询价组装邮件并排进发送队列
 *
 * 必须在事务内调用（和建询价记录同一笔事务）：入队失败就一起回滚，
 * 不会出现"记录上标着已发邮件、队列里却没有这封"。
 *
 * @param {object} client 事务客户端
 * @param {object} p
 * @param {object} p.carrierInquiry carrier_inquiries 行（要有 id / carrier_inquiry_number / request_remarks）
 * @param {object} p.inquiry        inquiries 行（含 special_req_en / special_req_de 别名列）
 * @param {object} p.carrier        carriers 行（要有 company_name / contact_email / inquiry_emails）
 * @returns {Promise<{queued: boolean, reason?: string, recipients: string[]}>}
 */
export async function queueCarrierInquiryEmail(client, { carrierInquiry, inquiry, carrier }) {
  const recipients = recipientsForCarrier(carrier)
  if (recipients.length === 0) {
    // 没邮箱不是错误：询价记录照建，如实告诉运营这家没发出去
    return { queued: false, reason: 'NO_EMAIL', recipients: [] }
  }

  const service = SERVICE_LABELS[inquiry.business_type] || null
  const payload = {
    carrierInquiryNumber: carrierInquiry.carrier_inquiry_number,
    carrierName: carrier.company_name || '',
    route: routeText(inquiry.route_from, inquiry.route_to),
    serviceEn: service?.en || inquiry.business_type || '',
    serviceDe: service?.de || '',
    containerType: inquiry.container_type || '',
    pod: inquiry.pod || '',
    cargoDescription: inquiry.cargo_description || '',
    weightKg: formatNumber(inquiry.cargo_weight_kg, 'kg'),
    volumeM3: formatNumber(inquiry.cargo_volume_m3, 'm³'),
    quantity: inquiry.cargo_quantity !== null && inquiry.cargo_quantity !== undefined
      ? String(inquiry.cargo_quantity) : '',
    specialReqEn: inquiry.special_req_en || inquiry.special_requirements || '',
    specialReqDe: inquiry.special_req_de || '',
    requestRemarks: carrierInquiry.request_remarks || '',
  }

  // user_id 留空：收件人是外部服务商，系统里没有账号（迁移 108 已放开该列）
  const inserted = await client.query(
    `INSERT INTO notifications
       (user_id, type, title, message, channel, email_to, email_status,
        email_template, email_payload)
     VALUES (NULL, $1, $2, $3, 'EMAIL', $4, 'PENDING', 'CARRIER_INQUIRY', $5)
     RETURNING id`,
    [
      NOTIFICATION_TYPE,
      `服务商询价 ${carrierInquiry.carrier_inquiry_number}`,
      `向 ${carrier.company_name || '服务商'} 发送询价邮件`,
      recipients.join(','),
      JSON.stringify(payload),
    ]
  )

  await client.query(
    `UPDATE carrier_inquiries
     SET email_notification_id = $1, email_recipients = $2, updated_at = NOW()
     WHERE id = $3`,
    [inserted.rows[0].id, JSON.stringify(recipients), carrierInquiry.id]
  )

  return { queued: true, recipients }
}

export default { queueCarrierInquiryEmail, recipientsForCarrier, normalizeEmails }
