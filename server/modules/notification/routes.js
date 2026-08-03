/**
 * 通知中心路由
 */

import { Router } from 'express'
import { authenticateToken } from '../../middleware/auth.js'
import { query, withTransaction } from '../../core/db.js'
import { resolveLang, renderNotification } from '../../utils/i18n.js'
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS } from '../../core/index.js'

const router = Router()
router.use(authenticateToken)

router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query
    const countResult = await query(`SELECT COUNT(*) as total FROM notifications WHERE user_id = $1`, [req.user.id])
    const result = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize)])
    // 有 title_key 的按当前语言重渲染；老通知没有 key，原样返回库里的中文
    const lang = resolveLang(req)
    const rows = result.rows.map((row) => ({ ...row, ...renderNotification(row, lang) }))
    res.json({ code: 200, message: 'success', data: rows,
      pagination: { total: parseInt(countResult.rows[0].total), page: parseInt(page), pageSize: parseInt(pageSize) } })
  } catch (error) { res.status(500).json({ code: 500, message: '获取通知失败', data: null }) }
})

router.get('/unread-count', async (req, res) => {
  try {
    const result = await query(`SELECT COUNT(*) as cnt FROM notifications WHERE user_id = $1 AND is_read = false`, [req.user.id])
    res.json({ code: 200, message: 'success', data: { count: parseInt(result.rows[0].cnt) } })
  } catch (error) { res.status(500).json({ code: 500, message: '获取未读数量失败', data: null }) }
})

router.put('/:id/read', async (req, res) => {
  try {
    await query(`UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id])
    res.json({ code: 200, message: '已标记已读', data: null })
  } catch (error) { res.status(500).json({ code: 500, message: error.message, data: null }) }
})

router.put('/read-all', async (req, res) => {
  try {
    await query(`UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`, [req.user.id])
    res.json({ code: 200, message: '全部已读', data: null })
  } catch (error) { res.status(500).json({ code: 500, message: error.message, data: null }) }
})

/**
 * 解析本次操作的偏好归属（个人 / 公司）
 *
 * scope=CLIENT 表示给整个客户公司设默认值（需求 8）：
 *   - 客户账号：只能设自己公司的，且必须是 client_admin
 *   - 运营账号：可以代设，但必须显式传 clientId
 *
 * @returns {{ ok: true, userId: string|null, clientId: string|null }
 *         | { ok: false, code: number, message: string }}
 */
function resolvePreferenceScope(req) {
  const scope = String(req.query.scope || req.body?.scope || 'USER').toUpperCase()
  if (scope === 'USER') {
    return { ok: true, userId: req.user.id, clientId: null }
  }
  if (scope !== 'CLIENT') {
    return { ok: false, code: 400, message: '参数错误：scope 只能是 USER 或 CLIENT' }
  }

  const userType = req.user.userType || req.user.roleCode
  if (userType === 'CLIENT') {
    // 客户账号一律锁定到自己公司，不看前端传的 clientId（踩坑 016）
    if (!req.user.linkedEntityId) {
      return { ok: false, code: 400, message: '当前账号未关联客户公司' }
    }
    if (req.user.roleCode !== 'client_admin') {
      return { ok: false, code: 403, message: '只有客户管理员可以设置公司级通知偏好' }
    }
    return { ok: true, userId: null, clientId: req.user.linkedEntityId }
  }

  if (userType === 'OPERATOR' || req.user.roleCode === 'sys_admin') {
    const clientId = req.query.clientId || req.body?.clientId
    if (!clientId) {
      return { ok: false, code: 400, message: '参数错误：运营代设公司偏好时必须传 clientId' }
    }
    return { ok: true, userId: null, clientId }
  }

  return { ok: false, code: 403, message: '没有权限设置公司级通知偏好' }
}

/**
 * 读取通知偏好
 * GET /api/v1/notifications/preferences?scope=USER|CLIENT[&clientId=]
 */
router.get('/preferences', async (req, res) => {
  try {
    const scope = resolvePreferenceScope(req)
    if (!scope.ok) {
      return res.status(scope.code).json({ code: scope.code, message: scope.message, data: null })
    }

    const result = scope.userId
      ? await query(`SELECT * FROM notification_preferences WHERE user_id = $1`, [scope.userId])
      : await query(`SELECT * FROM notification_preferences WHERE client_id = $1`, [scope.clientId])

    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    console.error('[通知] 获取通知偏好失败:', error)
    res.status(500).json({ code: 500, message: '获取通知偏好失败', data: null })
  }
})

/**
 * 保存通知偏好
 * 同时支持两种请求体：
 *   - 批量：{ preferences: [{ eventType, channelEmail, channelSystem }, ...] }（前端设置页用）
 *   - 单条：{ eventType, channelEmail, channelSystem }（保留旧调用方式）
 * scope=CLIENT 时写的是客户公司级默认值（需求 8）。
 */
router.put('/preferences', async (req, res) => {
  try {
    const scope = resolvePreferenceScope(req)
    if (!scope.ok) {
      return res.status(scope.code).json({ code: scope.code, message: scope.message, data: null })
    }

    const body = req.body || {}
    const list = Array.isArray(body.preferences) ? body.preferences : [body]

    // 事件类型必须是后端定义的常量，防止写进一批匹配不到的 key
    const invalid = list.filter(p => !p?.eventType || !NOTIFICATION_TYPES[p.eventType])
    if (invalid.length > 0) {
      return res.status(400).json({
        code: 400,
        message: `参数错误：不支持的通知事件类型 ${invalid.map(p => p?.eventType || '(空)').join(', ')}`,
        data: null
      })
    }

    await withTransaction(async (client) => {
      for (const pref of list) {
        const email = Boolean(pref.channelEmail)
        const system = Boolean(pref.channelSystem)
        // ⚠️ 迁移 108 把原来的 UNIQUE(user_id, event_type) 换成了两个**部分**唯一索引，
        //    ON CONFLICT 想命中部分索引，必须把索引的 WHERE 条件原样写出来，
        //    否则报 "no unique or exclusion constraint matching the ON CONFLICT specification"。
        if (scope.userId) {
          await client.query(`
            INSERT INTO notification_preferences (user_id, event_type, channel_email, channel_system)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, event_type) WHERE user_id IS NOT NULL
            DO UPDATE SET channel_email = $3, channel_system = $4`,
            [scope.userId, pref.eventType, email, system])
        } else {
          await client.query(`
            INSERT INTO notification_preferences (client_id, event_type, channel_email, channel_system)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (client_id, event_type) WHERE client_id IS NOT NULL
            DO UPDATE SET channel_email = $3, channel_system = $4`,
            [scope.clientId, pref.eventType, email, system])
        }
      }
    })

    res.json({ code: 200, message: '通知偏好更新成功', data: null })
  } catch (error) {
    console.error('[通知] 保存通知偏好失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 可配置的通知事件清单（前端设置页据此渲染，不再自己硬编码 key）
 * GET /api/v1/notifications/event-types
 */
router.get('/event-types', async (req, res) => {
  res.json({
    code: 200,
    message: 'success',
    data: Object.keys(NOTIFICATION_TYPES).map(key => ({
      event_type: key,
      label: NOTIFICATION_TYPE_LABELS[key] || key
    }))
  })
})

export default router
