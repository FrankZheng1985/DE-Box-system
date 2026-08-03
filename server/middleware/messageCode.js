/**
 * 响应消息码中间件（P9）
 *
 * 包一层 res.json：如果响应体里有中文 message、但没有 messageCode，
 * 就按文案查 utils/message-codes.js 补一个 messageCode 进去。
 *
 * 为什么这么做：
 *   - **完全 additive**。message 一个字不改，老前端（以及第三方接开放 API 的
 *     合作方）拿到的响应和以前完全一样，只是多了一个字段。
 *   - **业务代码零改动**。300 处 res.json 不用碰，也就不会因为手改而引入
 *     语法错误或改错文案。
 *   - **不会漏**。以后新增的消息只要往码表里加一条就自动生效。
 *
 * 已经显式写了 messageCode 的地方（如 auth/login）不会被覆盖。
 */

import { codeForMessage } from '../utils/message-codes.js'

export function attachMessageCode(req, res, next) {
  const originalJson = res.json.bind(res)

  res.json = (body) => {
    // 只处理普通对象；数组、字符串、null 一律原样放行
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      // 已经有码就尊重业务代码自己写的，不覆盖。
      // 认证/限流中间件用的是 { errCode, msg } 的老格式，所以两种字段名都查。
      if (!body.messageCode) {
        const text = typeof body.message === 'string' ? body.message
          : typeof body.msg === 'string' ? body.msg
          : null
        const code = text ? codeForMessage(text) : undefined
        if (code) body.messageCode = code
      }
    }
    return originalJson(body)
  }

  next()
}

export default attachMessageCode
