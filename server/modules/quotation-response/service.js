/**
 * 报价确认链接的 token 管理（需求 5.2）
 *
 * 安全模型和「密码重置链接」同一套路：
 *   - token 明文只出现在那封邮件里，库里只存 SHA-256 哈希
 *   - 单次使用，用过即作废
 *   - 有过期时间，默认跟随报价的 valid_until
 *
 * 之所以不用 JWT：JWT 一旦签发就无法作废，做不到"点过一次就失效"，
 * 而且吊销需要额外的黑名单表，反而比直接存一张表更麻烦。
 */

import crypto from 'crypto'

/** token 明文长度（字节），32 字节 = 256 位随机，够抗暴力枚举 */
const TOKEN_BYTES = 32

/** 报价没写有效期时，链接默认多少天后过期（可被 system_settings 覆盖） */
const DEFAULT_VALID_DAYS = 14

/**
 * 生成一对 (明文, 哈希)
 * @returns {{ plain: string, hash: string }}
 */
export function generateToken() {
  const plain = crypto.randomBytes(TOKEN_BYTES).toString('base64url')
  return { plain, hash: hashToken(plain) }
}

/** 把明文 token 换算成入库用的哈希 */
export function hashToken(plain) {
  return crypto.createHash('sha256').update(String(plain)).digest('hex')
}

/**
 * 为一张报价签发确认 token
 *
 * 同一张报价重复发送邮件时，把之前未使用的 token 一并作废，
 * 否则客户手上会有多个有效链接，点旧的那封邮件拿到的是过期价格。
 *
 * @param {object} client   事务客户端
 * @param {object} opts
 * @param {string} opts.quotationId
 * @param {string|Date|null} [opts.validUntil] 报价有效期
 * @param {number} [opts.defaultValidDays]     没有有效期时用的天数
 * @param {string} [opts.sentTo]               收件邮箱，用于追溯
 * @param {string} [opts.createdBy]            签发人
 * @returns {Promise<{ plain: string, expiresAt: Date }>}
 */
export async function issueToken(client, {
  quotationId,
  validUntil = null,
  defaultValidDays = DEFAULT_VALID_DAYS,
  sentTo = null,
  createdBy = null,
}) {
  // 作废这张报价此前所有还没用过的链接
  await client.query(
    `UPDATE quotation_response_tokens
     SET used_at = NOW(), used_action = 'SUPERSEDED'
     WHERE quotation_id = $1 AND used_at IS NULL`,
    [quotationId]
  )

  const expiresAt = resolveExpiry(validUntil, defaultValidDays)
  const { plain, hash } = generateToken()

  await client.query(
    `INSERT INTO quotation_response_tokens
       (quotation_id, token_hash, expires_at, sent_to, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [quotationId, hash, expiresAt, sentTo, createdBy]
  )

  return { plain, expiresAt }
}

/**
 * 算过期时间
 *
 * 有效期已经过去的报价（运营补发旧单）不能算出一个过去的时间，
 * 否则邮件一发出去链接就是死的 —— 这种情况退回默认天数。
 */
export function resolveExpiry(validUntil, defaultValidDays = DEFAULT_VALID_DAYS) {
  const fallback = new Date(Date.now() + defaultValidDays * 24 * 60 * 60 * 1000)
  if (!validUntil) return fallback

  const d = new Date(validUntil)
  if (Number.isNaN(d.getTime())) return fallback
  // valid_until 是 DATE，落到当天 23:59:59 才合理，否则当天就点不了了
  d.setHours(23, 59, 59, 999)
  return d > new Date() ? d : fallback
}

/**
 * 校验 token 并取出对应报价
 *
 * @returns {Promise<{ ok: true, token: object, quotation: object }
 *                 | { ok: false, reason: 'NOT_FOUND'|'USED'|'EXPIRED' }>}
 */
export async function verifyToken(client, plain) {
  if (!plain || typeof plain !== 'string') return { ok: false, reason: 'NOT_FOUND' }

  const result = await client.query(
    `SELECT t.*, q.quotation_number, q.status AS quotation_status, q.total_price,
            q.currency, q.valid_until, q.route_from, q.route_to, q.remarks,
            q.business_type, c.company_name AS client_name
     FROM quotation_response_tokens t
     JOIN quotations q ON q.id = t.quotation_id
     LEFT JOIN clients c ON c.id = q.client_id
     WHERE t.token_hash = $1`,
    [hashToken(plain)]
  )
  if (result.rows.length === 0) return { ok: false, reason: 'NOT_FOUND' }

  const row = result.rows[0]
  if (row.used_at) return { ok: false, reason: 'USED', token: row }
  if (new Date(row.expires_at) < new Date()) return { ok: false, reason: 'EXPIRED', token: row }

  return { ok: true, token: row, quotation: row }
}

/**
 * 标记 token 已使用
 *
 * ⚠️ 必须带 `used_at IS NULL` 条件并检查 rowCount：
 *    客户连点两下按钮会并发进来两个请求，只有抢到这一行的那个能继续，
 *    否则会建出两张订单。
 *
 * @returns {Promise<boolean>} true = 本次成功占用
 */
export async function consumeToken(client, tokenId, action, ip = null) {
  const result = await client.query(
    `UPDATE quotation_response_tokens
     SET used_at = NOW(), used_action = $1, used_ip = $2
     WHERE id = $3 AND used_at IS NULL`,
    [action, ip ? String(ip).slice(0, 64) : null, tokenId]
  )
  return result.rowCount === 1
}

export default {
  generateToken,
  hashToken,
  issueToken,
  resolveExpiry,
  verifyToken,
  consumeToken,
}
