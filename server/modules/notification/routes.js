/**
 * 通知中心路由
 */

import { Router } from 'express'
import { authenticateToken } from '../../middleware/auth.js'
import { query } from '../../core/db.js'

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

router.put('/preferences', async (req, res) => {
  try {
    const { eventType, channelEmail, channelSystem } = req.body
    await query(`
      INSERT INTO notification_preferences (user_id, event_type, channel_email, channel_system)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, event_type) DO UPDATE SET channel_email = $3, channel_system = $4`,
      [req.user.id, eventType, channelEmail, channelSystem])
    res.json({ code: 200, message: '通知偏好更新成功', data: null })
  } catch (error) { res.status(500).json({ code: 500, message: error.message, data: null }) }
})

export default router
