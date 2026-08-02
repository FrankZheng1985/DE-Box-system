/**
 * 客户咨询路由
 * 公开接口（不需要登录）+ 管理接口（需要登录）
 */

import { Router } from 'express'
import { query } from '../../core/db.js'
import { authenticateToken, requireUserType, requirePermission } from '../../middleware/auth.js'
import { sendEmail } from '../../utils/email-service.js'

const router = Router()

/**
 * 提交咨询（公开接口，不需要登录）
 * POST /api/v1/contact
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body

    if (!name || !email || !message) {
      return res.status(400).json({ code: 400, message: '姓名、邮箱和留言不能为空', data: null })
    }

    // 存入数据库
    const result = await query(
      `INSERT INTO contact_inquiries (name, email, phone, message, source, status)
       VALUES ($1, $2, $3, $4, 'WEBSITE', 'NEW')
       RETURNING id, created_at`,
      [name, email, phone || null, message]
    )

    // 发送邮件通知管理员
    try {
      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'info@kalunasped.com',
        subject: `[KALUNA SPED] 新客户咨询 - ${name}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#1C1C1E;padding:20px 30px;border-radius:12px 12px 0 0">
              <h2 style="color:#FFFFFF;margin:0;font-size:18px">KALUNA <span style="color:#FF6A55">SPED</span></h2>
              <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:12px">新客户咨询通知</p>
            </div>
            <div style="background:#fff;padding:30px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr><td style="padding:8px 0;color:#718096;width:80px">姓名</td><td style="padding:8px 0;font-weight:600">${name}</td></tr>
                <tr><td style="padding:8px 0;color:#718096">邮箱</td><td style="padding:8px 0"><a href="mailto:${email}" style="color:#2B6CB0">${email}</a></td></tr>
                ${phone ? `<tr><td style="padding:8px 0;color:#718096">电话</td><td style="padding:8px 0">${phone}</td></tr>` : ''}
                <tr><td style="padding:8px 0;color:#718096;vertical-align:top">留言</td><td style="padding:8px 0">${message.replace(/\n/g, '<br>')}</td></tr>
              </table>
              <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#a0aec0">
                提交时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Europe/Berlin' })}<br>
                来源：kalunasped.com 官网<br>
                <a href="${process.env.APP_BASE_URL || 'https://kalunasped.com'}/admin/" style="color:#2B6CB0">登录管理后台查看</a>
              </div>
            </div>
          </div>
        `
      })
    } catch (emailErr) {
      // 邮件发送失败不影响咨询保存
      console.warn('咨询通知邮件发送失败:', emailErr.message)
    }

    res.json({ code: 200, message: '咨询已提交，我们会尽快回复您', data: { id: result.rows[0].id } })
  } catch (error) {
    console.error('提交咨询失败:', error)
    res.status(500).json({ code: 500, message: '提交失败，请稍后重试', data: null })
  }
})

// ========== 以下接口需要登录 ==========

/**
 * 获取咨询列表（管理后台）
 * GET /api/v1/contact
 */
router.get('/', authenticateToken, requireUserType('OPERATOR'), requirePermission('contact:view'), async (req, res) => {
  try {
    const { status, search, page = 1, pageSize = 20 } = req.query
    let sql = `SELECT * FROM contact_inquiries WHERE 1=1`
    const params = []
    let idx = 0

    if (status) { params.push(status); sql += ` AND status = $${++idx}` }
    if (search) { params.push(`%${search}%`); sql += ` AND (name ILIKE $${++idx} OR email ILIKE $${idx} OR message ILIKE $${idx})` }

    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) t`, params)
    sql += ` ORDER BY created_at DESC`
    params.push(parseInt(pageSize)); sql += ` LIMIT $${++idx}`
    params.push((parseInt(page) - 1) * parseInt(pageSize)); sql += ` OFFSET $${++idx}`

    const result = await query(sql, params)
    res.json({
      code: 200, message: 'success', data: result.rows,
      pagination: { total: parseInt(countResult.rows[0].total), page: parseInt(page), pageSize: parseInt(pageSize) }
    })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取咨询列表失败', data: null })
  }
})

/**
 * 标记已处理
 * PUT /api/v1/contact/:id/status
 */
router.put('/:id/status', authenticateToken, requireUserType('OPERATOR'), requirePermission('contact:manage'), async (req, res) => {
  try {
    const { status, notes } = req.body
    await query(
      `UPDATE contact_inquiries SET status = $1, notes = COALESCE($2, notes),
       replied_at = CASE WHEN $1 = 'REPLIED' THEN NOW() ELSE replied_at END,
       replied_by = CASE WHEN $1 = 'REPLIED' THEN $3 ELSE replied_by END
       WHERE id = $4`,
      [status || 'REPLIED', notes, req.user.id, req.params.id]
    )
    res.json({ code: 200, message: '状态更新成功', data: null })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 咨询统计
 */
router.get('/stats', authenticateToken, requireUserType('OPERATOR'), requirePermission('contact:view'), async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'NEW') as new_count,
        COUNT(*) FILTER (WHERE status = 'REPLIED') as replied,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today
      FROM contact_inquiries
    `)
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取统计失败', data: null })
  }
})

export default router
