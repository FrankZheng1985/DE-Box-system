/**
 * 开放 API 专用中间件：请求留痕 + API-Key 认证 + 按钥匙限速
 *
 * 和 /api/v1 的 JWT 体系完全隔离：这里没有登录态，身份就是钥匙。
 * 失败响应统一 { code, message, data: { errorCode } }，errorCode 给对方程序判断用。
 */

import {
  findKeyByPresented, touchLastUsed, consumeRateLimit, logRequest,
} from './service.js'

/**
 * 取真实来源 IP。
 * 生产走 nginx 反代，req.ip 永远是 127.0.0.1，得看 X-Forwarded-For 的第一跳
 * （nginx 会设置这个头；绕过 nginx 直连 3002 的流量出不了防火墙，不用担心伪造）。
 */
export function realIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  const ip = fwd || req.ip || ''
  return ip.replace(/^::ffff:/, '')
}

/** 失败应答统一出口：先把结果挂到 req 上（留痕中间件要用），再回响应 */
export function apiFail(req, res, httpStatus, errorCode, message) {
  req.apiResult = errorCode
  req.apiError = message
  return res.status(httpStatus).json({ code: httpStatus, message, data: { errorCode } })
}

/**
 * 请求留痕：挂在最前面，认证失败/限速失败也要留一笔（踩坑 027 的精神——
 * 越是被拦下的请求越要说得清"谁、什么时候、为什么被拦"）。
 */
export function apiRequestLogger(req, res, next) {
  const start = Date.now()
  res.on('finish', () => {
    logRequest({
      apiKeyId: req.apiPartner?.id || null,
      partnerCode: req.apiPartner?.partner_code || null,
      method: req.method,
      path: req.originalUrl,
      // 推送类端点单号在请求体里；回查类端点在路径参数里，由 handler 挂到 req.apiExternalRef
      externalRef: (req.apiExternalRef
        || (typeof req.body?.externalOrderNo === 'string' ? req.body.externalOrderNo : null)
      )?.slice(0, 100) || null,
      statusCode: res.statusCode,
      result: req.apiResult || (res.statusCode < 400 ? 'SUCCESS' : 'SERVER_ERROR'),
      errorMessage: req.apiError || null,
      requestBody: req.method === 'GET' ? null : req.body,
      ip: realIp(req).slice(0, 64),
      durationMs: Date.now() - start,
    })
  })
  next()
}

/** API-Key 认证 + 停用检查 + IP 白名单 + 限速，通过后挂 req.apiPartner */
export async function apiKeyAuth(req, res, next) {
  try {
    const presented = req.get('X-API-Key')
    if (!presented) {
      return apiFail(req, res, 401, 'AUTH_ERROR', '缺少 X-API-Key 请求头')
    }
    const keyRow = await findKeyByPresented(presented)
    if (!keyRow) {
      return apiFail(req, res, 401, 'AUTH_ERROR', 'API Key 无效')
    }
    if (keyRow.status !== 'ACTIVE') {
      // 停用的钥匙也认出来是谁，日志里挂上合作方，方便排查"为什么我推不进来了"
      req.apiPartner = keyRow
      return apiFail(req, res, 403, 'FORBIDDEN', 'API Key 已停用，请联系运营')
    }

    const whitelist = Array.isArray(keyRow.ip_whitelist) ? keyRow.ip_whitelist : []
    if (whitelist.length > 0) {
      const ip = realIp(req)
      const allowed = whitelist.some((rule) => {
        if (typeof rule !== 'string') return false
        if (rule.includes('*')) {
          const pattern = rule.replace(/\./g, '\\.').replace(/\*/g, '\\d+')
          return new RegExp(`^${pattern}$`).test(ip)
        }
        return rule === ip
      })
      if (!allowed) {
        req.apiPartner = keyRow
        return apiFail(req, res, 403, 'FORBIDDEN', `来源 IP ${ip} 不在白名单内`)
      }
    }

    if (!consumeRateLimit(keyRow)) {
      req.apiPartner = keyRow
      return apiFail(req, res, 429, 'RATE_LIMITED',
        `请求过于频繁（限 ${keyRow.rate_limit_per_min} 次/分钟），请稍后重试`)
    }

    req.apiPartner = keyRow
    touchLastUsed(keyRow)
    next()
  } catch (err) {
    console.error('[open-api] 认证中间件异常:', err)
    return apiFail(req, res, 500, 'SERVER_ERROR', '服务器内部错误')
  }
}
