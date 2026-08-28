/**
 * 订单履约沟通日志（飞书开发意见 #14）
 *
 * 运营在订单下写一条履约信息 → 客户门户订单详情里能看到、能标记已读、能在下面回复，
 * 回执和回复都回传后台。目的是把原本散在微信群里的交付沟通搬到订单上，可追溯。
 *
 * 为什么单独一个文件：order/routes.js 已经 731 行（红灯 800），
 * 这套端点自成一块，挂进去只会让那个文件更难读。父 router 已经做过
 * authenticateToken + requireTenantBinding，本文件只管自己的鉴权与租户校验。
 *
 * ⚠️ 承运商门户拿不到这条链路：他们的 token 走到这里一律按「订单不存在」处理。
 *    履约沟通里会出现价格、客户内部安排这些不该给承运方看的内容。
 */

import { Router } from 'express'
import { requirePermission, requireUserType } from '../../middleware/auth.js'
import { getPool } from '../../core/db.js'
import { notificationEngine, NOTIFICATION_TYPES } from '../../core/index.js'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 一条消息的最大长度：够写清一件事，又不至于被人当文件传 */
const MAX_CONTENT_LENGTH = 2000

/**
 * 还不能开始履约沟通的订单状态
 *
 * 意见 #14 的原话是「针对已经确认的订单」——我司尚未受理（卡车 PENDING_REVIEW /
 * 本地派送 PENDING_QUOTE）时还谈不上履约；已取消的单也不该再往里写东西。
 * 其余状态（CONFIRMED 及之后）全部放行。
 */
const NOT_YET_CONFIRMED = ['PENDING_REVIEW', 'PENDING_QUOTE', 'CANCELLED']

/**
 * 取订单并校验当前登录方有没有权限在它下面沟通
 *
 * 与 order/routes.js 的 loadOrderWithAccessCheck 同口径，两点不同：
 *   1. 承运商一律拒绝（这条链路只在运营 ↔ 客户之间）
 *   2. 不属于自己的单回 404 而不是 403 —— 403 等于确认这个 UUID 是有效记录（踩坑 069）
 *
 * @returns {Promise<object|null>} 有权限时返回订单行；否则返回 null 且响应已写出
 */
async function loadOrderForMessaging(orderId, user, res) {
  if (!UUID_RE.test(String(orderId))) {
    res.status(404).json({ code: 404, message: '订单不存在', data: null })
    return null
  }

  const pool = getPool()
  const result = await pool.query(
    `SELECT id, order_number, client_id, status, business_type FROM orders WHERE id = $1`,
    [orderId]
  )
  if (result.rows.length === 0) {
    res.status(404).json({ code: 404, message: '订单不存在', data: null })
    return null
  }

  const order = result.rows[0]
  const userType = user.userType || user.roleCode

  if (userType === 'CARRIER') {
    res.status(404).json({ code: 404, message: '订单不存在', data: null })
    return null
  }
  if (userType === 'CLIENT' && order.client_id !== user.linkedEntityId) {
    res.status(404).json({ code: 404, message: '订单不存在', data: null })
    return null
  }
  return order
}

/** 当前登录方在这套端点里的身份：OPERATOR 或 CLIENT */
function senderTypeOf(user) {
  return (user.userType || user.roleCode) === 'CLIENT' ? 'CLIENT' : 'OPERATOR'
}

/**
 * 取发送人的显示名
 *
 * JWT 里只有 username（登录名），通知正文里要给人看的是 display_name，
 * 所以这里回表查一次；查不到就退回登录名，不因为署名而让整条通知发不出去。
 */
async function resolveSenderName(user) {
  try {
    const result = await getPool().query(
      `SELECT display_name FROM users WHERE id = $1`, [user.id]
    )
    return result.rows[0]?.display_name || user.username || '—'
  } catch {
    return user.username || '—'
  }
}

/**
 * 取一张订单下的全部消息，组装成「主消息 + 回复」两层
 *
 * 字段一律 snake_case，与前端 interface 逐字对齐（踩坑 003 / 066）。
 */
async function loadMessageTree(orderId) {
  const pool = getPool()

  const messages = await pool.query(
    `SELECT m.id, m.parent_id, m.sender_type, m.sender_id, m.content, m.created_at,
            u.display_name AS sender_name
     FROM order_messages m
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.order_id = $1
     ORDER BY m.created_at`,
    [orderId]
  )

  if (messages.rows.length === 0) return []

  const reads = await pool.query(
    `SELECT r.message_id, r.user_id, r.read_at, u.display_name AS user_name
     FROM order_message_reads r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.message_id = ANY($1::uuid[])
     ORDER BY r.read_at`,
    [messages.rows.map(m => m.id)]
  )

  const readsByMessage = new Map()
  for (const row of reads.rows) {
    const list = readsByMessage.get(row.message_id) || []
    list.push({ user_id: row.user_id, user_name: row.user_name, read_at: row.read_at })
    readsByMessage.set(row.message_id, list)
  }

  const decorate = (row) => ({ ...row, reads: readsByMessage.get(row.id) || [] })

  const roots = messages.rows.filter(m => !m.parent_id).map(decorate)
  const repliesByParent = new Map()
  for (const row of messages.rows.filter(m => m.parent_id)) {
    const list = repliesByParent.get(row.parent_id) || []
    list.push(decorate(row))
    repliesByParent.set(row.parent_id, list)
  }

  return roots.map(root => ({ ...root, replies: repliesByParent.get(root.id) || [] }))
}

/**
 * 发通知
 *
 * ⚠️ 将来要把履约信息推到客户的微信群，出口加在这个函数里就行 ——
 *    调用点只管「发生了什么」，不管「发到哪里去」。
 *    本次只做站内信 + 邮件：个人微信群没有官方发送接口，
 *    企业微信群机器人 webhook 要等客户那边确认群类型后才能接（Frank 2026-08-28 定）。
 *
 * 失败只记警告、绝不抛回前端：消息已经写进库了，
 * 这时候报错会让人以为没发出去而重复提交（同 a530c07 的做法）。
 *
 * @param {object} params
 * @param {'TO_CLIENT'|'TO_OPERATOR'} params.direction 发给谁
 * @param {object} params.order 订单行（要 id / order_number / client_id）
 * @param {string} params.senderName 发送人显示名
 * @param {string} params.content 消息正文（通知里截断展示）
 * @param {boolean} params.isReply 是主消息还是回复
 */
async function sendOrderMessageNotification({ direction, order, senderName, content, isReply }) {
  try {
    const pool = getPool()
    const excerpt = content.length > 60 ? `${content.slice(0, 60)}…` : content

    if (direction === 'TO_CLIENT') {
      const users = await pool.query(
        `SELECT id FROM users
         WHERE linked_entity_id = $1 AND user_type = 'CLIENT' AND is_active = true`,
        [order.client_id]
      )
      if (users.rows.length === 0) return

      // 强制 BOTH：这条链路是拿来替代微信群通知的，客户没看到就等于没送达。
      // 用户没填邮箱时通知引擎会自己退回纯站内信。
      await notificationEngine.notify(pool, {
        userIds: users.rows.map(u => u.id),
        type: NOTIFICATION_TYPES.STATUS_UPDATE,
        title: `订单 ${order.order_number} 有新的履约信息`,
        message: `${senderName}：${excerpt}`,
        titleKey: 'notify.orderMessageTitle',
        messageKey: 'notify.orderMessageMessage',
        payload: { orderNo: order.order_number, sender: senderName, excerpt },
        relatedOrderId: order.id,
        channel: 'BOTH'
      })
      return
    }

    // TO_OPERATOR：客户回复/留言 → 通知全体在职运营（口径同 a530c07）
    const operators = await pool.query(
      `SELECT id FROM users WHERE user_type = 'OPERATOR' AND is_active = true`
    )
    if (operators.rows.length === 0) return

    await notificationEngine.notify(pool, {
      userIds: operators.rows.map(u => u.id),
      type: NOTIFICATION_TYPES.STATUS_UPDATE,
      title: `订单 ${order.order_number} 客户${isReply ? '回复' : '留言'}`,
      message: `${senderName}：${excerpt}`,
      titleKey: isReply ? 'notify.orderMessageClientReplyTitle' : 'notify.orderMessageClientNewTitle',
      messageKey: 'notify.orderMessageClientMessage',
      payload: { orderNo: order.order_number, sender: senderName, excerpt },
      relatedOrderId: order.id
    })
  } catch (err) {
    console.warn(`[订单沟通] 通知发送失败（消息已保存）: ${err.message}`)
  }
}

/** 正文校验：空内容和超长内容都挡在入口 */
function normalizeContent(raw, res) {
  const content = typeof raw === 'string' ? raw.trim() : ''
  if (!content) {
    res.status(400).json({ code: 400, message: '参数错误：内容不能为空', data: null })
    return null
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    res.status(400).json({
      code: 400,
      message: `参数错误：内容最多 ${MAX_CONTENT_LENGTH} 字`,
      data: null
    })
    return null
  }
  return content
}

/**
 * 沟通记录列表
 * GET /api/v1/orders/:id/messages
 */
router.get('/:id/messages',
  requirePermission('order:message', 'portal:order_message'),
  async (req, res) => {
    try {
      const order = await loadOrderForMessaging(req.params.id, req.user, res)
      if (!order) return

      const data = await loadMessageTree(order.id)
      res.json({ code: 200, message: 'success', data })
    } catch (error) {
      console.error('获取订单沟通记录失败:', error)
      res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
    }
  }
)

/**
 * 发布一条履约信息（运营）
 * POST /api/v1/orders/:id/messages
 */
router.post('/:id/messages',
  requireUserType('OPERATOR'),
  requirePermission('order:message'),
  async (req, res) => {
    try {
      const order = await loadOrderForMessaging(req.params.id, req.user, res)
      if (!order) return

      if (NOT_YET_CONFIRMED.includes(order.status)) {
        return res.status(400).json({
          code: 400,
          message: '参数错误：订单尚未确认或已取消，暂不能发布履约信息',
          data: null
        })
      }

      const content = normalizeContent(req.body?.content, res)
      if (!content) return

      const pool = getPool()
      const inserted = await pool.query(
        `INSERT INTO order_messages (order_id, parent_id, sender_type, sender_id, content)
         VALUES ($1, NULL, 'OPERATOR', $2, $3)
         RETURNING id, created_at`,
        [order.id, req.user.id, content]
      )

      await sendOrderMessageNotification({
        direction: 'TO_CLIENT',
        order,
        senderName: await resolveSenderName(req.user),
        content,
        isReply: false
      })

      res.json({
        code: 200,
        message: 'success',
        data: { id: inserted.rows[0].id, created_at: inserted.rows[0].created_at }
      })
    } catch (error) {
      console.error('发布订单履约信息失败:', error)
      res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
    }
  }
)

/**
 * 在某条信息下回复（客户填处理意见，运营也可以接着回）
 * POST /api/v1/orders/:id/messages/:messageId/replies
 */
router.post('/:id/messages/:messageId/replies',
  requirePermission('order:message', 'portal:order_message'),
  async (req, res) => {
    try {
      const order = await loadOrderForMessaging(req.params.id, req.user, res)
      if (!order) return

      if (!UUID_RE.test(String(req.params.messageId))) {
        return res.status(404).json({ code: 404, message: '信息不存在', data: null })
      }

      const content = normalizeContent(req.body?.content, res)
      if (!content) return

      const pool = getPool()
      // 只能回复本订单下的**主消息**：跨订单的 messageId 查不到，
      // 回复的回复也挡在这里（结构就两层）
      const parent = await pool.query(
        `SELECT id FROM order_messages
         WHERE id = $1 AND order_id = $2 AND parent_id IS NULL`,
        [req.params.messageId, order.id]
      )
      if (parent.rows.length === 0) {
        return res.status(404).json({ code: 404, message: '信息不存在', data: null })
      }

      const senderType = senderTypeOf(req.user)
      const inserted = await pool.query(
        `INSERT INTO order_messages (order_id, parent_id, sender_type, sender_id, content)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
        [order.id, parent.rows[0].id, senderType, req.user.id, content]
      )

      await sendOrderMessageNotification({
        direction: senderType === 'CLIENT' ? 'TO_OPERATOR' : 'TO_CLIENT',
        order,
        senderName: await resolveSenderName(req.user),
        content,
        isReply: true
      })

      res.json({
        code: 200,
        message: 'success',
        data: { id: inserted.rows[0].id, created_at: inserted.rows[0].created_at }
      })
    } catch (error) {
      console.error('回复订单履约信息失败:', error)
      res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
    }
  }
)

/**
 * 标记已读（回执回传后台）
 * POST /api/v1/orders/:id/messages/:messageId/read
 */
router.post('/:id/messages/:messageId/read',
  requirePermission('order:message', 'portal:order_message'),
  async (req, res) => {
    try {
      const order = await loadOrderForMessaging(req.params.id, req.user, res)
      if (!order) return

      if (!UUID_RE.test(String(req.params.messageId))) {
        return res.status(404).json({ code: 404, message: '信息不存在', data: null })
      }

      const pool = getPool()
      const message = await pool.query(
        `SELECT id FROM order_messages WHERE id = $1 AND order_id = $2`,
        [req.params.messageId, order.id]
      )
      if (message.rows.length === 0) {
        return res.status(404).json({ code: 404, message: '信息不存在', data: null })
      }

      // 主键 (message_id, user_id) 保证幂等：重复点不会写第二行，read_at 保留第一次的时间
      await pool.query(
        `INSERT INTO order_message_reads (message_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (message_id, user_id) DO NOTHING`,
        [message.rows[0].id, req.user.id]
      )

      res.json({ code: 200, message: 'success', data: null })
    } catch (error) {
      console.error('标记订单履约信息已读失败:', error)
      res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
    }
  }
)

export default router
