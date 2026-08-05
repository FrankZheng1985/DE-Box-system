/**
 * 发票模板管理路由
 */

import { Router } from 'express'
import { authenticateToken, requireUserType, requirePermission } from '../../middleware/auth.js'
import { query } from '../../core/db.js'

const router = Router()
router.use(authenticateToken)

// ⚠️ 安全收紧（P5）：发票模板是纯运营内部配置，两个门户都不调用，
//    以前只挂 authenticateToken，客户/承运商账号也能访问。
router.use(requireUserType('OPERATOR'))

router.get('/', requirePermission('invoice_template:view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM invoice_templates WHERE is_active = true ORDER BY created_at DESC`
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    console.error('获取发票模板失败:', error)
    res.status(500).json({ code: 500, message: '获取发票模板失败', data: null })
  }
})

// ⚠️ 固定路径 /rules 必须写在 /:id 之前（踩坑 001）。
//    原来它在文件末尾，请求 /rules 会被 /:id 接走，
//    而 invoice_templates.id 是 UUID，`WHERE id = 'rules'` 直接抛类型错误 → 500。
router.get('/rules', requirePermission('invoice_template:view'), async (req, res) => {
  try {
    const result = await query(`SELECT * FROM auto_invoice_rules WHERE is_active = true`)
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    console.error('获取自动开票规则失败:', error)
    res.status(500).json({ code: 500, message: '获取规则失败', data: null })
  }
})

router.get('/:id', requirePermission('invoice_template:view'), async (req, res) => {
  try {
    const result = await query(`SELECT * FROM invoice_templates WHERE id = $1`, [req.params.id])
    if (result.rows.length === 0) return res.status(404).json({ code: 404, message: '模板不存在', data: null })
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取模板详情失败', data: null })
  }
})

router.post('/', requirePermission('invoice_template:manage'), async (req, res) => {
  try {
    const { templateName, clientId, currency, taxRate, autoTrigger, headerInfo, footerInfo } = req.body
    const result = await query(
      `INSERT INTO invoice_templates (template_name, client_id, currency, tax_rate, auto_trigger, header_info, footer_info)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [templateName, clientId, currency || 'EUR', taxRate || 19, autoTrigger, JSON.stringify(headerInfo), footerInfo]
    )
    res.json({ code: 200, message: '模板创建成功', data: result.rows[0] })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

// 更新模板。前端编辑弹窗一直在调这条，但此前后端根本没有 PUT，
// 404 被前端的空 catch 吞掉、界面照样显示"保存成功"，刷新即丢
router.put('/:id', requirePermission('invoice_template:manage'), async (req, res) => {
  try {
    const { templateName, clientId, currency, taxRate, autoTrigger, headerInfo, footerInfo } = req.body

    // 只更新请求里显式给出的字段，避免把没传的字段刷成 null
    const sets = []
    const params = []
    let idx = 0
    const push = (col, val) => { params.push(val); sets.push(`${col} = $${++idx}`) }

    if (templateName !== undefined) push('template_name', templateName)
    if (clientId !== undefined) push('client_id', clientId || null)
    if (currency !== undefined) push('currency', currency)
    if (taxRate !== undefined) push('tax_rate', taxRate)
    if (autoTrigger !== undefined) push('auto_trigger', autoTrigger)
    // header_info 是 jsonb、footer_info 是 text，两列处理方式不同：
    // jsonb 不接受裸文本，纯字符串也要 stringify 成合法 JSON 字面量
    if (headerInfo !== undefined) push('header_info', JSON.stringify(headerInfo ?? null))
    if (footerInfo !== undefined) push('footer_info', footerInfo)

    if (sets.length === 0) {
      return res.status(400).json({ code: 400, message: '没有可更新的字段', data: null })
    }

    params.push(req.params.id)
    const result = await query(
      `UPDATE invoice_templates SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${++idx} RETURNING *`,
      params
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '模板不存在', data: null })
    }
    res.json({ code: 200, message: '模板已保存', data: result.rows[0] })
  } catch (error) {
    console.error('更新发票模板失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

export default router
