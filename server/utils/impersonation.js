/**
 * 员工代入客户门户（impersonation）共享工具
 *
 * 员工在客户列表点「进入客户门户」时，走的是两步握手：
 *   第 1 步 运营端调 POST /api/v1/clients/:id/impersonate 换一张一次性票据
 *   第 2 步 浏览器跳到客户门户，门户拿票据调 POST /api/v1/auth/impersonate/exchange 换真 token
 *
 * 为什么不让第 1 步直接返回 token：token 会被塞进 URL 传给客户门户，
 * 而 URL 会进浏览器历史、进 nginx access log、进 Referer 头。
 * 票据则是一次性的、60 秒过期的，即便泄漏也基本无法利用。
 */

import crypto from 'node:crypto'

/** 票据有效期（秒）。够浏览器跳一次页，不够别人捡去慢慢用 */
export const TICKET_TTL_SECONDS = 60

/**
 * 代入客户门户签发的 JWT 有效期。
 * 正常登录是 7d，这里刻意短得多——员工"顺手看一眼"不该留下一张管用一周的客户视角令牌。
 */
export const IMPERSONATION_TOKEN_EXPIRES_IN = '2h'

/**
 * 生成一张明文票据
 * @returns {string} 64 位十六进制随机串
 */
export function generateTicket() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * 计算票据的存储指纹
 *
 * 库里只存这个值。票据本身是高熵随机串，不存在字典攻击面，所以不加盐。
 * @param {string} ticket - 明文票据
 * @returns {string} sha256 十六进制
 */
export function hashTicket(ticket) {
  return crypto.createHash('sha256').update(ticket).digest('hex')
}

/**
 * 取请求方 IP（审计用）
 *
 * 生产在 nginx 后面，req.ip 会是 127.0.0.1，真实地址在 X-Forwarded-For 第一段。
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim().slice(0, 64)
  }
  return (req.ip || req.socket?.remoteAddress || '').slice(0, 64) || null
}
