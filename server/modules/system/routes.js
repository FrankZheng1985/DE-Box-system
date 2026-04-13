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

// ==================== 过账期间管理 ====================

router.get('/posting-periods', async (req, res) => {
  try {
    const { companyCode = 'DE01', fiscalYear = new Date().getFullYear() } = req.query
    const result = await query(
      `SELECT id, company_code, fiscal_year, period_month, is_open,
              opened_by, opened_at, closed_by, closed_at
       FROM posting_periods
       WHERE company_code = $1 AND fiscal_year = $2
       ORDER BY period_month`,
      [companyCode, parseInt(fiscalYear)]
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取过账期间失败', data: null })
  }
})

router.put('/posting-periods/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params
    // 获取当前状态
    const current = await query(`SELECT id, is_open FROM posting_periods WHERE id = $1`, [id])
    if (current.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '过账期间不存在', data: null })
    }

    const isOpen = current.rows[0].is_open
    if (isOpen) {
      // 关闭期间
      await query(
        `UPDATE posting_periods SET is_open = false, closed_by = $1, closed_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [req.user.display_name || req.user.username, id]
      )
    } else {
      // 开放期间
      await query(
        `UPDATE posting_periods SET is_open = true, opened_by = $1, opened_at = NOW(), closed_by = NULL, closed_at = NULL, updated_at = NOW() WHERE id = $2`,
        [req.user.display_name || req.user.username, id]
      )
    }
    res.json({ code: 200, message: isOpen ? '期间已关闭' : '期间已开放', data: null })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

// ==================== 编号范围管理 ====================

router.get('/number-ranges', async (req, res) => {
  try {
    const { companyCode = 'DE01' } = req.query
    const result = await query(
      `SELECT id, object_type, prefix, current_number,
              range_start, range_end, number_format, company_code
       FROM number_ranges
       WHERE company_code = $1
       ORDER BY object_type`,
      [companyCode]
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取编号范围失败', data: null })
  }
})

// ==================== 会计科目表 ====================

router.get('/chart-of-accounts', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, account_code, account_name, account_type, parent_code,
              is_reconciliation, is_postable
       FROM chart_of_accounts
       ORDER BY account_code`
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取科目表失败', data: null })
  }
})

export default router
