/**
 * 系统设置路由
 */

import { Router } from 'express'
import { authenticateToken } from '../../middleware/auth.js'
import { query } from '../../core/db.js'

const router = Router()
router.use(authenticateToken)

router.get('/settings', async (req, res) => {
  try {
    const result = await query(`SELECT setting_key, setting_value, setting_type, description FROM system_settings ORDER BY setting_key`)
    const settings = {}
    for (const row of result.rows) {
      settings[row.setting_key] = {
        value: row.setting_type === 'NUMBER' ? parseFloat(row.setting_value) :
               row.setting_type === 'BOOLEAN' ? row.setting_value === 'true' : row.setting_value,
        type: row.setting_type, description: row.description
      }
    }
    res.json({ code: 200, message: 'success', data: settings })
  } catch (error) { res.status(500).json({ code: 500, message: '获取系统配置失败', data: null }) }
})

router.put('/settings', async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await query(`UPDATE system_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2`,
        [String(value), key])
    }
    res.json({ code: 200, message: '系统配置更新成功', data: null })
  } catch (error) { res.status(500).json({ code: 500, message: error.message, data: null }) }
})

router.get('/settings/account', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, email, phone, display_name, language FROM users WHERE id = $1`, [req.user.id])
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) { res.status(500).json({ code: 500, message: '获取账户设置失败', data: null }) }
})

router.put('/settings/account', async (req, res) => {
  try {
    const { email, phone, displayName, language } = req.body
    await query(`UPDATE users SET email = COALESCE($1, email), phone = COALESCE($2, phone),
      display_name = COALESCE($3, display_name), language = COALESCE($4, language), updated_at = NOW()
      WHERE id = $5`, [email, phone, displayName, language, req.user.id])
    res.json({ code: 200, message: '账户设置更新成功', data: null })
  } catch (error) { res.status(500).json({ code: 500, message: error.message, data: null }) }
})

export default router
