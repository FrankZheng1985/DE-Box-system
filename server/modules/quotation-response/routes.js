/**
 * 报价确认链接的公开路由（需求 5.2）
 *
 * ⚠️ 全站唯一不挂 authenticateToken 的业务路由 —— 客户从邮件点进来时没有登录态。
 *    安全边界完全靠一次性 token：
 *      - 明文只存在于那封邮件里，库里是 SHA-256 哈希
 *      - 单次使用，用过即废
 *      - 有过期时间
 *      - 挂了限流，防止有人枚举 token
 *
 * ⚠️ GET 只渲染确认页，绝不改状态 —— 邮件客户端的安全扫描器会预取链接，
 *    GET 落库会导致"客户还没看到邮件，报价已经被同意了"。
 */

import { Router } from 'express'
import { withTransaction } from '../../core/db.js'
import { rateLimiter } from '../../middleware/security.js'
import quotationService, { DECISION_ACTIONS } from '../quotation/service.js'
import tokenService from './service.js'
import { messagePage, confirmPage } from './page.js'

const router = Router()

// 免登录端点必须限流：60 秒内同一 IP 最多 20 次，挡住 token 枚举
router.use(rateLimiter(20, 60000))

/** 表单里的动作名 → 内部枚举 */
const ACTION_MAP = {
  accept: DECISION_ACTIONS.ACCEPT,
  reject: DECISION_ACTIONS.REJECT,
  pending: DECISION_ACTIONS.PENDING,
  ACCEPT: DECISION_ACTIONS.ACCEPT,
  REJECT: DECISION_ACTIONS.REJECT,
  PENDING: DECISION_ACTIONS.PENDING,
}

const FAIL_MESSAGES = {
  NOT_FOUND: '链接无效。请确认是否复制完整，或改用客户门户「我的报价」确认。',
  USED: '这个链接已经使用过了。报价的最新状态请登录客户门户查看。',
  EXPIRED: '链接已过期。请联系业务人员重新发送报价。',
}

function sendHtml(res, status, html) {
  res.status(status)
  res.set('Content-Type', 'text/html; charset=utf-8')
  // 带 token 的页面不允许被缓存或收录
  res.set('Cache-Control', 'no-store')
  res.set('X-Robots-Tag', 'noindex, nofollow')
  res.send(html)
}

/**
 * 确认页
 * GET /api/v1/quotation-response/:token?action=accept
 */
router.get('/:token', async (req, res) => {
  try {
    const check = await withTransaction((client) => tokenService.verifyToken(client, req.params.token))

    if (!check.ok) {
      return sendHtml(res, check.reason === 'NOT_FOUND' ? 404 : 410, messagePage({
        title: '链接不可用',
        message: FAIL_MESSAGES[check.reason] || FAIL_MESSAGES.NOT_FOUND,
      }))
    }

    // token 还有效，但报价可能已经被别的途径处理过（比如客户在门户里点了）
    if (!quotationService.CLIENT_DECIDABLE.includes(check.quotation.quotation_status)) {
      return sendHtml(res, 409, messagePage({
        title: '该报价已处理',
        message: `报价 ${check.quotation.quotation_number} 当前状态不再需要确认。详情请登录客户门户查看。`,
      }))
    }

    const action = ACTION_MAP[req.query.action] || ''
    sendHtml(res, 200, confirmPage({
      token: req.params.token,
      action,
      quotation: check.quotation,
      formAction: `${req.baseUrl}/${encodeURIComponent(req.params.token)}`,
    }))
  } catch (error) {
    console.error('[报价确认页] 渲染失败:', error)
    sendHtml(res, 500, messagePage({
      title: '系统繁忙',
      message: '请稍后重试，或登录客户门户「我的报价」完成确认。',
    }))
  }
})

/**
 * 执行确认
 * POST /api/v1/quotation-response/:token   body: { action, note }
 *
 * 表单提交（urlencoded）和 JSON 都支持。
 */
router.post('/:token', async (req, res) => {
  const action = ACTION_MAP[req.body?.action]
  if (!action) {
    return sendHtml(res, 400, messagePage({
      title: '操作无效',
      message: '请回到邮件重新点击「同意 / 待定 / 拒绝」按钮。',
    }))
  }

  try {
    const result = await withTransaction(async (client) => {
      const check = await tokenService.verifyToken(client, req.params.token)
      if (!check.ok) return { fail: check.reason }

      // 先抢占 token 再动业务数据：抢不到说明并发的另一个请求已经处理了，
      // 直接退出，避免建出两张订单（客户连点两下就会撞上）
      const claimed = await tokenService.consumeToken(
        client, check.token.id, action, req.ip
      )
      if (!claimed) return { fail: 'USED' }

      // 邮件链接场景没有登录用户，userId 传 null；
      // quotations.client_response_by 允许为空，追溯靠 token 表的 used_ip / sent_to
      const decision = await quotationService.applyClientDecision(
        client, check.token.quotation_id, action,
        { userId: null, note: req.body?.note?.slice(0, 1000) || null }
      )
      return { decision, quotationNumber: check.quotation.quotation_number }
    })

    if (result.fail) {
      return sendHtml(res, result.fail === 'NOT_FOUND' ? 404 : 410, messagePage({
        title: '链接不可用',
        message: FAIL_MESSAGES[result.fail] || FAIL_MESSAGES.NOT_FOUND,
      }))
    }

    const { decision, quotationNumber } = result
    const message = {
      [DECISION_ACTIONS.ACCEPT]: decision.order
        ? `感谢确认！报价 ${quotationNumber} 已接受，订单 ${decision.order.order_number} 已自动创建，我司将尽快安排。`
        : `感谢确认！报价 ${quotationNumber} 已接受。`,
      [DECISION_ACTIONS.REJECT]: `已记录您的决定，报价 ${quotationNumber} 已拒绝。感谢您的反馈。`,
      [DECISION_ACTIONS.PENDING]: `已记录为待定，报价 ${quotationNumber} 我们会保留并跟进联系您。`,
    }[action]

    sendHtml(res, 200, messagePage({ title: '提交成功', message, tone: 'ok' }))
  } catch (error) {
    console.error('[报价确认] 处理失败:', error)
    // 信用超额等业务拒绝，事务已回滚、token 也随之回滚成未使用，客户可以再点
    const isCreditBlock = String(error.message).includes('信用检查未通过')
    sendHtml(res, 400, messagePage({
      title: isCreditBlock ? '暂时无法接受' : '处理失败',
      message: isCreditBlock
        ? '您的账户信用额度不足，报价未接受。请联系业务人员处理后再确认。'
        : (error.message || '请稍后重试，或登录客户门户完成确认。'),
    }))
  }
})

export default router
