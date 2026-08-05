/**
 * 开放 API Webhook 推送服务（P8 第四阶段）
 *
 * Outbox 模式，完全不侵入业务模块：
 *   扫描器 —— 增量扫 order_status_logs / quotations 里外部单据的状态变化 → 入队
 *   分发器 —— 领取到期的 PENDING 投递 → HMAC 签名 POST → 2xx 即成功，失败退避重试
 *
 * 双实例安全（PM2 -i 2，两个进程同时跑 cron）：
 *   - 入队去重靠 UNIQUE(api_key_id, event_type, dedupe_key) + ON CONFLICT DO NOTHING
 *     （普通唯一约束不是部分索引，ON CONFLICT 能推断——踩坑 020）
 *   - 投递领取靠 UPDATE ... FOR UPDATE SKIP LOCKED（与 email-queue.js 同一套路）
 *
 * 签名方案（Stripe 风格，文档第 8 节同步描述）：
 *   X-EUTMS-Signature: t=<unix秒>,v1=<hex(hmac_sha256(secret, `${t}.${rawBody}`))>
 */

import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import net from 'node:net'
import { query } from '../../core/db.js'
import { getStatusLabel } from '../order/service.js'
import { getNumberSetting } from '../../utils/settings.js'

// 单轮最多入队/投递多少条，防止一次拉太多
const BATCH_SIZE = 50

/**
 * 判断一个 IP 是不是内网/保留地址。
 * webhook 目标由运营在后台自己填，不加这道校验就等于把「服务器视角的
 * 任意 HTTP 请求」开放出去：既能探测内网服务，在云上还能读实例元数据
 * （169.254.169.254），属于 SSRF。
 */
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number)
    if (p[0] === 10) return true                              // 10.0.0.0/8
    if (p[0] === 127) return true                             // 环回
    if (p[0] === 0) return true                               // 0.0.0.0/8
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true // 172.16.0.0/12
    if (p[0] === 192 && p[1] === 168) return true             // 192.168.0.0/16
    if (p[0] === 169 && p[1] === 254) return true             // 链路本地 + 云元数据
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true // CGNAT 100.64.0.0/10
    if (p[0] >= 224) return true                              // 组播 / 保留
    return false
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::') return true
    if (v.startsWith('fc') || v.startsWith('fd')) return true // 唯一本地地址
    if (v.startsWith('fe80')) return true                     // 链路本地
    // IPv4-mapped（::ffff:127.0.0.1 这类）拆出 v4 部分再判一次
    const m = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (m) return isPrivateAddress(m[1])
    return false
  }
  return true // 认不出来的一律当内网拒绝
}

/**
 * 校验 webhook 目标地址是否允许出站。
 * 域名要真解析一次再判，否则攻击者用一个解析到 127.0.0.1 的域名就能绕过。
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function assertWebhookTargetAllowed(rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false, reason: '地址格式不合法' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: '只允许 http/https 地址' }
  }
  // 生产强制 https：测试事件带签名密钥信息，明文出站没有意义
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    return { ok: false, reason: '生产环境的 Webhook 地址必须是 https' }
  }

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host)) {
    return isPrivateAddress(host)
      ? { ok: false, reason: '不允许指向内网或保留地址' }
      : { ok: true }
  }
  // 域名：解析出的每个地址都必须是公网
  let addrs
  try {
    addrs = await dns.lookup(host, { all: true })
  } catch {
    return { ok: false, reason: '域名解析失败' }
  }
  if (!addrs.length) return { ok: false, reason: '域名解析不到地址' }
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    return { ok: false, reason: '该域名解析到内网地址，不允许' }
  }
  return { ok: true }
}
// 失败退避（分钟）：第 1 次失败后 1 分钟重试，以此类推；数组耗尽即 FAILED
const RETRY_DELAYS_MIN = [1, 5, 30, 120, 360]
// 单次 HTTP 投递超时（毫秒）
const DELIVER_TIMEOUT_MS = 10_000
// 领取后超过这个分钟数仍无结果的投递，视为进程中途挂掉，放回队列
const STUCK_MINUTES = 10
// 扫描游标回看重叠（秒）：两实例游标写入有竞态，靠回看+去重保证不漏
const CURSOR_OVERLAP_SEC = 120

// ==================== 游标（system_settings） ====================

async function getCursor(key) {
  const r = await query(`SELECT setting_value FROM system_settings WHERE setting_key = $1`, [key])
  const v = r.rows[0]?.setting_value
  const d = v ? new Date(v) : null
  // 游标缺失/损坏时从当下开始，不回灌历史
  return d && !Number.isNaN(d.getTime()) ? d : new Date()
}

async function setCursor(key, date) {
  await query(
    `UPDATE system_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2`,
    [date.toISOString(), key]
  )
}

// ==================== 扫描入队 ====================

/**
 * 入队一条投递，重复事件静默跳过
 * @returns {Promise<boolean>} 是否真的插入了新行
 */
async function enqueue({ apiKeyId, partnerCode, eventType, dedupeKey, externalRef, payload }) {
  const r = await query(
    `INSERT INTO api_webhook_deliveries
       (api_key_id, partner_code, event_type, dedupe_key, external_ref, payload)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (api_key_id, event_type, dedupe_key) DO NOTHING
     RETURNING id`,
    [apiKeyId, partnerCode, eventType, dedupeKey, externalRef, JSON.stringify(payload)]
  )
  return r.rows.length > 0
}

/**
 * 事件 1：API 直推订单的状态变更（数据源 order_status_logs，UUID 主键即天然去重键）
 */
async function scanOrderStatusChanges() {
  const CURSOR_KEY = 'open_api_webhook_cursor_orders'
  const cursor = await getCursor(CURSOR_KEY)
  const since = new Date(cursor.getTime() - CURSOR_OVERLAP_SEC * 1000)

  const rows = await query(
    `SELECT l.id AS log_id, l.from_status, l.to_status, l.created_at AS occurred_at,
            o.order_number, o.external_ref, o.business_type, o.tracking_number,
            k.id AS api_key_id, k.partner_code
     FROM order_status_logs l
     JOIN orders o   ON o.id = l.order_id AND o.external_source IS NOT NULL
     JOIN api_keys k ON k.partner_code = o.external_source
                    AND k.status = 'ACTIVE' AND k.webhook_url IS NOT NULL
     WHERE l.created_at > $1
     ORDER BY l.created_at
     LIMIT $2`,
    [since, BATCH_SIZE]
  )

  let enqueued = 0
  let maxSeen = cursor
  for (const r of rows.rows) {
    const inserted = await enqueue({
      apiKeyId: r.api_key_id,
      partnerCode: r.partner_code,
      eventType: 'ORDER_STATUS_CHANGED',
      dedupeKey: r.log_id,
      externalRef: r.external_ref,
      payload: {
        externalOrderNo: r.external_ref,
        orderNumber: r.order_number,
        fromStatus: r.from_status,
        toStatus: r.to_status,
        statusLabel: getStatusLabel(r.business_type, r.to_status),
        trackingNumber: r.tracking_number,
        occurredAt: r.occurred_at,
      },
    })
    if (inserted) enqueued++
    if (new Date(r.occurred_at) > maxSeen) maxSeen = new Date(r.occurred_at)
  }
  if (maxSeen > cursor) await setCursor(CURSOR_KEY, maxSeen)
  return enqueued
}

/**
 * 事件 2/3：API 推的询价，其报价被发送 / 客户做出终局决策
 * 数据源 quotations.updated_at（相关状态转换处都会刷 updated_at，已核实）。
 * 去重键 = 报价UUID:状态 —— 同一版报价改内容重发不会重复推事件（可靠但保守，
 * 金额变化合作方可用回查接口获取）。
 *
 * ⚠️ 点名列查询，carrier_cost 等成本字段绝不选出（踩坑 026）。
 */
async function scanQuotationEvents() {
  const CURSOR_KEY = 'open_api_webhook_cursor_quotations'
  const cursor = await getCursor(CURSOR_KEY)
  const since = new Date(cursor.getTime() - CURSOR_OVERLAP_SEC * 1000)

  const rows = await query(
    `SELECT q.id AS quotation_id, q.quotation_number, q.status, q.total_price, q.currency,
            q.valid_until, q.updated_at, q.converted_order_id,
            i.inquiry_number, i.external_ref,
            o.order_number AS converted_order_number,
            k.id AS api_key_id, k.partner_code
     FROM quotations q
     JOIN inquiries i ON i.id = q.inquiry_id AND i.external_source IS NOT NULL
     JOIN api_keys k  ON k.partner_code = i.external_source
                     AND k.status = 'ACTIVE' AND k.webhook_url IS NOT NULL
     LEFT JOIN orders o ON o.id = q.converted_order_id
     WHERE q.updated_at > $1
       AND q.status IN ('SENT', 'CONVERTED', 'REJECTED')
     ORDER BY q.updated_at
     LIMIT $2`,
    [since, BATCH_SIZE]
  )

  let enqueued = 0
  let maxSeen = cursor
  for (const r of rows.rows) {
    const isQuoted = r.status === 'SENT'
    const inserted = await enqueue({
      apiKeyId: r.api_key_id,
      partnerCode: r.partner_code,
      eventType: isQuoted ? 'INQUIRY_QUOTED' : 'QUOTATION_DECISION',
      dedupeKey: `${r.quotation_id}:${r.status}`,
      externalRef: r.external_ref,
      payload: {
        externalOrderNo: r.external_ref,
        inquiryNumber: r.inquiry_number,
        quotationNumber: r.quotation_number,
        status: r.status,
        // NUMERIC 回来是字符串（踩坑 002）
        totalPrice: r.total_price === null ? null : Number(r.total_price),
        currency: r.currency,
        validUntil: r.valid_until,
        orderNumber: r.converted_order_number,
        occurredAt: r.updated_at,
      },
    })
    if (inserted) enqueued++
    if (new Date(r.updated_at) > maxSeen) maxSeen = new Date(r.updated_at)
  }
  if (maxSeen > cursor) await setCursor(CURSOR_KEY, maxSeen)
  return enqueued
}

// ==================== 签名与投递 ====================

/** 计算签名头的值：t=<unix秒>,v1=<hmac hex>（导出供测试脚本验签） */
export function buildSignatureHeader(secret, rawBody, timestampSec = Math.floor(Date.now() / 1000)) {
  const mac = crypto.createHmac('sha256', secret).update(`${timestampSec}.${rawBody}`, 'utf8').digest('hex')
  return `t=${timestampSec},v1=${mac}`
}

/**
 * 联调自测：立刻给合作方的接收端发一条 WEBHOOK_TEST 事件，把对方的应答原样带回。
 *
 * 与真实投递的区别（有意为之）：
 *   - 同步执行，运营点一下马上看到结果，不用等 cron
 *   - **不进 outbox**：测试不该混进投递记录，也不该触发退避重试
 *   - 载荷用固定的假数据，且事件类型独立，合作方可以据此跳过业务处理
 *
 * @returns {Promise<{ok: boolean, statusCode: number|null, durationMs: number,
 *                     responseSnippet: string|null, error: string|null}>}
 */
export async function sendTestEvent(apiKey) {
  const body = JSON.stringify({
    event: 'WEBHOOK_TEST',
    deliveryId: 'test',
    partnerCode: apiKey.partner_code,
    occurredAt: new Date().toISOString(),
    data: {
      message: '这是一条来自 EU-TMS 的联调测试事件，收到即说明接收端与验签配置正确',
      externalOrderNo: 'TEST-0000',
    },
  })

  const startedAt = Date.now()

  // 出站前先过地址白名单：不校验的话这个接口等于一个 SSRF 探针
  const allowed = await assertWebhookTargetAllowed(apiKey.webhook_url)
  if (!allowed.ok) {
    return {
      ok: false,
      statusCode: null,
      durationMs: Date.now() - startedAt,
      responseSnippet: null,
      error: `目标地址不允许：${allowed.reason}`,
    }
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DELIVER_TIMEOUT_MS)
    const res = await fetch(apiKey.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EUTMS-Event': 'WEBHOOK_TEST',
        'X-EUTMS-Delivery-Id': 'test',
        'X-EUTMS-Signature': buildSignatureHeader(apiKey.webhook_secret, body),
      },
      body,
      signal: controller.signal,
    })
    clearTimeout(timer)
    // 不回显对方响应体：一旦地址被填成内网服务，这段 body 就是把内网
    // 接口的返回内容读回给调用方（full-read SSRF）。状态码足够判断连通性
    return {
      ok: res.ok,
      statusCode: res.status,
      durationMs: Date.now() - startedAt,
      responseSnippet: null,
      error: res.ok ? null : `对方返回 HTTP ${res.status}`,
    }
  } catch (err) {
    return {
      ok: false,
      statusCode: null,
      durationMs: Date.now() - startedAt,
      responseSnippet: null,
      error: err.name === 'AbortError'
        ? `连接超时（${DELIVER_TIMEOUT_MS / 1000} 秒无响应）`
        : err.message,
    }
  }
}

/** 投递一条：2xx 记 SENT；其余按退避排下一次或判 FAILED */
async function deliverOne(row) {
  const body = JSON.stringify({
    event: row.event_type,
    deliveryId: String(row.id),
    partnerCode: row.partner_code,
    occurredAt: row.payload?.occurredAt || row.created_at,
    data: row.payload,
  })

  let statusCode = null
  let errMsg = null

  // 正式投递同样要过白名单：地址可能是在这道校验加上之前就存进库的。
  // 地址本身不合法，重试多少次都一样，直接判 FAILED 不进退避队列
  const allowed = await assertWebhookTargetAllowed(row.webhook_url)
  if (!allowed.ok) {
    await query(
      `UPDATE api_webhook_deliveries
       SET status = 'FAILED', attempts = $1, last_status_code = NULL, last_error = $2
       WHERE id = $3`,
      [row.attempts + 1, `目标地址不允许：${allowed.reason}`, row.id]
    )
    return false
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DELIVER_TIMEOUT_MS)
    const res = await fetch(row.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EUTMS-Event': row.event_type,
        'X-EUTMS-Delivery-Id': String(row.id),
        'X-EUTMS-Signature': buildSignatureHeader(row.webhook_secret, body),
      },
      body,
      signal: controller.signal,
    })
    clearTimeout(timer)
    statusCode = res.status
    if (res.ok) {
      await query(
        `UPDATE api_webhook_deliveries
         SET status = 'SENT', sent_at = NOW(), last_status_code = $1, last_error = NULL
         WHERE id = $2`,
        [statusCode, row.id]
      )
      return true
    }
    errMsg = `HTTP ${res.status}`
  } catch (err) {
    errMsg = err.name === 'AbortError' ? `超时（${DELIVER_TIMEOUT_MS}ms）` : err.message
  }

  const attempts = row.attempts + 1
  if (attempts >= RETRY_DELAYS_MIN.length + 1) {
    await query(
      `UPDATE api_webhook_deliveries
       SET status = 'FAILED', attempts = $1, last_status_code = $2, last_error = $3
       WHERE id = $4`,
      [attempts, statusCode, errMsg, row.id]
    )
  } else {
    const delayMin = RETRY_DELAYS_MIN[attempts - 1]
    await query(
      `UPDATE api_webhook_deliveries
       SET status = 'PENDING', attempts = $1, last_status_code = $2, last_error = $3,
           next_attempt_at = NOW() + ($4 || ' minutes')::INTERVAL
       WHERE id = $5`,
      [attempts, statusCode, errMsg, String(delayMin), row.id]
    )
  }
  return false
}

/** 领取并投递到期的 PENDING 记录 */
async function dispatchDue() {
  // 回收上一轮卡死的（进程被 kill 时可能停在 SENDING）
  await query(
    `UPDATE api_webhook_deliveries SET status = 'PENDING'
     WHERE status = 'SENDING' AND claimed_at < NOW() - ($1 || ' minutes')::INTERVAL`,
    [String(STUCK_MINUTES)]
  )

  // 原子领取（SKIP LOCKED：一条只会被一个进程领到）；顺带带出当前的 URL 和密钥
  const claimed = await query(
    `UPDATE api_webhook_deliveries d
     SET status = 'SENDING', claimed_at = NOW()
     FROM api_keys k
     WHERE d.id IN (
       SELECT id FROM api_webhook_deliveries
       WHERE status = 'PENDING' AND next_attempt_at <= NOW()
       ORDER BY next_attempt_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
       AND k.id = d.api_key_id
     RETURNING d.id, d.event_type, d.partner_code, d.payload, d.attempts, d.created_at,
               k.webhook_url, k.webhook_secret, k.status AS key_status`,
    [BATCH_SIZE]
  )

  let sent = 0
  for (const row of claimed.rows) {
    // 领取后发现钥匙已停用或 URL 被清空：不投了，直接判 FAILED 留痕
    if (row.key_status !== 'ACTIVE' || !row.webhook_url || !row.webhook_secret) {
      await query(
        `UPDATE api_webhook_deliveries
         SET status = 'FAILED', last_error = '密钥已停用或 Webhook 配置已移除'
         WHERE id = $1`,
        [row.id]
      )
      continue
    }
    if (await deliverOne(row)) sent++
  }
  return { claimed: claimed.rows.length, sent }
}

// ==================== 主循环（cron 每分钟调一次） ====================

/**
 * 一轮完整周期：扫描入队 → 投递到期记录。
 * 任何一步抛错都只影响本轮，下一轮从游标处继续。
 */
export async function runWebhookCycle() {
  // 没有任何配置了 Webhook 的启用钥匙就整体跳过，不空转扫描
  const active = await query(
    `SELECT 1 FROM api_keys WHERE status = 'ACTIVE' AND webhook_url IS NOT NULL LIMIT 1`
  )
  if (active.rows.length === 0) return { skipped: true }

  const enqueuedOrders = await scanOrderStatusChanges()
  const enqueuedQuotes = await scanQuotationEvents()
  const { claimed, sent } = await dispatchDue()

  if (enqueuedOrders + enqueuedQuotes + claimed > 0) {
    console.warn(`[Webhook] 入队 ${enqueuedOrders + enqueuedQuotes} 条，投递 ${sent}/${claimed} 成功`)
  }
  return { enqueued: enqueuedOrders + enqueuedQuotes, claimed, sent }
}

// ==================== 日志清理（每天一次） ====================

/**
 * 清理超期的开放 API 日志。
 *
 * 两张表只写不删，合作方接入后增长很快（推送/回查各 1 条请求日志、
 * 每次状态变更 1 条投递记录）。保留天数走 system_settings，运营可调，
 * 设为 0 表示永不清理。
 *
 * ⚠️ 投递记录只清 SENT / FAILED 这类**已完结**的：
 *    PENDING（含排队重试中）和 SENDING 一律不动，
 *    否则会把还没送达的通知连同重试计划一起删掉。
 *
 * 分批删除，避免一次锁太多行影响正在写日志的请求。
 */
export async function cleanupOldLogs() {
  const BATCH = 5000
  const logDays = await getNumberSetting('open_api_log_retention_days', 90)
  const deliveryDays = await getNumberSetting('open_api_delivery_retention_days', 90)

  let logsDeleted = 0
  if (logDays > 0) {
    for (;;) {
      const r = await query(
        `DELETE FROM api_request_logs
         WHERE id IN (
           SELECT id FROM api_request_logs
           WHERE created_at < NOW() - ($1 || ' days')::INTERVAL
           LIMIT $2
         )`,
        [String(logDays), BATCH]
      )
      logsDeleted += r.rowCount
      if (r.rowCount < BATCH) break
    }
  }

  let deliveriesDeleted = 0
  if (deliveryDays > 0) {
    for (;;) {
      const r = await query(
        `DELETE FROM api_webhook_deliveries
         WHERE id IN (
           SELECT id FROM api_webhook_deliveries
           WHERE status IN ('SENT', 'FAILED')
             AND created_at < NOW() - ($1 || ' days')::INTERVAL
           LIMIT $2
         )`,
        [String(deliveryDays), BATCH]
      )
      deliveriesDeleted += r.rowCount
      if (r.rowCount < BATCH) break
    }
  }

  if (logsDeleted + deliveriesDeleted > 0) {
    console.warn(`[开放API清理] 请求日志 ${logsDeleted} 条、投递记录 ${deliveriesDeleted} 条已超期删除`)
  }
  return { logsDeleted, deliveriesDeleted }
}

export default { runWebhookCycle, buildSignatureHeader, sendTestEvent, cleanupOldLogs }
