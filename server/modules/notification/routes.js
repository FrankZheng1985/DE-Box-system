/**
 * 通知中心路由
 */

import { Router } from 'express'
import { authenticateToken } from '../../middleware/auth.js'
import { query, withTransaction } from '../../core/db.js'
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
    res.json({ code: 200, message: 'success', data: result.rows,
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

router.get('/preferences', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM notification_preferences WHERE user_id = $1`, [req.user.id])
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) { res.status(500).json({ code: 500, message: '获取通知偏好失败', data: null }) }
})

/**
 * 保存通知偏好
 * 同时支持两种请求体：
 *   - 批量：{ preferences: [{ eventType, channelEmail, channelSystem }, ...] }（前端设置页用）
 *   - 单条：{ eventType, channelEmail, channelSystem }（保留旧调用方式）
 */
router.put('/preferences', async (req, res) => {
  try {
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
        await client.query(`
          INSERT INTO notification_preferences (user_id, event_type, channel_email, channel_system)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_id, event_type) DO UPDATE SET channel_email = $3, channel_system = $4`,
          [req.user.id, pref.eventType, Boolean(pref.channelEmail), Boolean(pref.channelSystem)])
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
