/**
 * 客户管理路由
 */

import { Router } from 'express'
import ExcelJS from 'exceljs'
import { authenticateToken } from '../../middleware/auth.js'
import { withTransaction, query } from '../../core/db.js'
import { getPool } from '../../core/db.js'
import { changeTracker, numberRange } from '../../core/index.js'

const router = Router()
router.use(authenticateToken)

// 客户变更追踪字段
const CLIENT_FIELDS = [
  { name: 'company_name', label: '公司名称' },
  { name: 'credit_limit', label: '信用额度' },
  { name: 'credit_level', label: '信用等级' },
  { name: 'risk_category', label: '风险类别' },
  { name: 'payment_terms', label: '账期' },
  { name: 'status', label: '状态' },
  { name: 'invoice_email', label: '发票邮箱' }
]

/**
 * 客户列表
 * GET /api/v1/clients
 */
router.get('/', async (req, res) => {
  try {
    const { search, status, page = 1, pageSize = 20 } = req.query
    let sql = `
      SELECT c.*,
        (SELECT COUNT(*) FROM orders o WHERE o.client_id = c.id) as order_count,
        (SELECT COALESCE(SUM(amount - paid_amount), 0) FROM financial_records
         WHERE counterparty_type = 'CLIENT' AND counterparty_id = c.id
         AND type = 'RECEIVABLE' AND payment_status IN ('UNPAID','PARTIAL','OVERDUE')) as outstanding_amount
      FROM clients c WHERE 1=1`
    const params = []
    let idx = 0

    if (search) {
      params.push(`%${search}%`)
      sql += ` AND (c.company_name ILIKE $${++idx} OR c.vat_number ILIKE $${idx} OR c.client_code ILIKE $${idx})`
    }
    if (status) {
      params.push(status)
      sql += ` AND c.status = $${++idx}`
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) t`, params)
    const total = parseInt(countResult.rows[0].total)

    sql += ` ORDER BY c.created_at DESC`
    params.push(parseInt(pageSize))
    sql += ` LIMIT $${++idx}`
    params.push((parseInt(page) - 1) * parseInt(pageSize))
    sql += ` OFFSET $${++idx}`

    const result = await query(sql, params)

    res.json({
      code: 200, message: 'success',
      data: result.rows,
      pagination: { total, page: parseInt(page), pageSize: parseInt(pageSize) }
    })
  } catch (error) {
    console.error('获取客户列表失败:', error)
    res.status(500).json({ code: 500, message: '获取客户列表失败', data: null })
  }
})

/**
 * 客户导出 Excel（放在 /:id 前面，避免被匹配为 id）
 * GET /api/v1/clients/export
 */
router.get('/export', async (req, res) => {
  try {
    const pool = getPool()
    const result = await pool.query(
      `SELECT client_code, company_name, vat_number, country, city,
              contact_name, contact_email, contact_phone,
              credit_limit, credit_level, payment_terms
       FROM clients WHERE status = 'ACTIVE'
       ORDER BY client_code ASC LIMIT 5000`
    )

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'EU-TMS'
    workbook.created = new Date()
    const sheet = workbook.addWorksheet('客户列表')

    const creditLevelMap = {
      A: 'A - 优质', B: 'B - 良好', C: 'C - 一般', D: 'D - 较差'
    }

    sheet.columns = [
      { header: '客户编码', key: 'clientCode', width: 16 },
      { header: '公司名称', key: 'companyName', width: 28 },
      { header: 'VAT税号', key: 'vatNumber', width: 22 },
      { header: '国家', key: 'country', width: 12 },
      { header: '城市', key: 'city', width: 14 },
      { header: '联系人', key: 'contactName', width: 14 },
      { header: '邮箱', key: 'email', width: 24 },
      { header: '电话', key: 'phone', width: 16 },
      { header: '信用额度', key: 'creditLimit', width: 14 },
      { header: '信用等级', key: 'creditLevel', width: 12 },
      { header: '账期(天)', key: 'paymentTerms', width: 10 },
    ]

    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } }

    for (const row of result.rows) {
      sheet.addRow({
        clientCode: row.client_code || '-',
        companyName: row.company_name || '-',
        vatNumber: row.vat_number || '-',
        country: row.country || '-',
        city: row.city || '-',
        contactName: row.contact_name || '-',
        email: row.contact_email || '-',
        phone: row.contact_phone || '-',
        creditLimit: row.credit_limit ? Number(row.credit_limit) : 0,
        creditLevel: creditLevelMap[row.credit_level] || row.credit_level || '-',
        paymentTerms: row.payment_terms ? Number(row.payment_terms) : 30,
      })
    }

    const filename = `clients_${new Date().toISOString().slice(0, 10)}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    await workbook.xlsx.write(res)
    res.end()
  } catch (error) {
    console.error('客户导出失败:', error)
    res.status(500).json({ code: 500, message: '导出失败' })
  }
})

/**
 * 客户详情
 * GET /api/v1/clients/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM clients WHERE id = $1`, [req.params.id])
    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null })
    }
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    console.error('获取客户详情失败:', error)
    res.status(500).json({ code: 500, message: '获取客户详情失败', data: null })
  }
})

/**
 * 创建客户
 * POST /api/v1/clients
 */
router.post('/', async (req, res) => {
  try {
    const client = await withTransaction(async (tx) => {
      // 通过编号范围生成客户编码
      const { docNumber } = await numberRange.getNextNumber(tx, 'CLT', 'DE01')

      const result = await tx.query(
        `INSERT INTO clients
         (client_code, company_name, vat_number, country, city, address,
          contact_name, contact_email, contact_phone, invoice_email,
          credit_limit, credit_level, risk_category, payment_terms, status, company_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *`,
        [docNumber, req.body.companyName, req.body.vatNumber, req.body.country,
         req.body.city, req.body.address, req.body.contactName, req.body.contactEmail,
         req.body.contactPhone, req.body.invoiceEmail,
         req.body.creditLimit || 0, req.body.creditLevel || 'C',
         req.body.riskCategory || 'MEDIUM', req.body.paymentTerms || 30,
         'ACTIVE', 'DE01']
      )

      // 变更追踪
      await changeTracker.trackChanges(tx, {
        objectType: 'CLIENT', objectId: result.rows[0].id,
        changeType: 'INSERT', transactionType: 'CREATE_CLIENT',
        tableName: 'clients', newData: result.rows[0],
        trackedFields: CLIENT_FIELDS, changedBy: req.user.id
      })

      return result.rows[0]
    })

    res.json({ code: 200, message: '客户创建成功', data: client })
  } catch (error) {
    console.error('创建客户失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 编辑客户
 * PUT /api/v1/clients/:id
 */
router.put('/:id', async (req, res) => {
  try {
    await withTransaction(async (tx) => {
      const old = await tx.query(`SELECT * FROM clients WHERE id = $1`, [req.params.id])
      if (old.rows.length === 0) throw new Error('客户不存在')

      const fields = ['company_name', 'vat_number', 'country', 'city', 'address',
        'contact_name', 'contact_email', 'contact_phone', 'invoice_email',
        'credit_limit', 'credit_level', 'risk_category', 'payment_terms', 'status']
      const setClauses = []
      const params = []
      let idx = 0

      // camelCase → snake_case 映射
      const map = {
        companyName: 'company_name', vatNumber: 'vat_number',
        contactName: 'contact_name', contactEmail: 'contact_email',
        contactPhone: 'contact_phone', invoiceEmail: 'invoice_email',
        creditLimit: 'credit_limit', creditLevel: 'credit_level',
        riskCategory: 'risk_category', paymentTerms: 'payment_terms'
      }

      const newData = {}
      for (const [camel, snake] of Object.entries(map)) {
        if (req.body[camel] !== undefined) {
          params.push(req.body[camel])
          setClauses.push(`${snake} = $${++idx}`)
          newData[snake] = req.body[camel]
        }
      }
      // 也支持直接传 snake_case
      for (const f of fields) {
        if (req.body[f] !== undefined && !newData[f]) {
          params.push(req.body[f])
          setClauses.push(`${f} = $${++idx}`)
          newData[f] = req.body[f]
        }
      }

      if (setClauses.length === 0) throw new Error('没有可更新的字段')

      params.push(req.params.id)
      setClauses.push(`updated_at = NOW()`)
      await tx.query(`UPDATE clients SET ${setClauses.join(', ')} WHERE id = $${++idx}`, params)

      await changeTracker.trackChanges(tx, {
        objectType: 'CLIENT', objectId: req.params.id,
        changeType: 'UPDATE', transactionType: 'EDIT_CLIENT',
        tableName: 'clients', oldData: old.rows[0], newData,
        trackedFields: CLIENT_FIELDS, changedBy: req.user.id
      })
    })

    res.json({ code: 200, message: '客户更新成功', data: null })
  } catch (error) {
    console.error('编辑客户失败:', error)
    res.status(400).json({ code: 400, message: error.message, data: null })
  }
})

/**
 * 客户订单历史
 * GET /api/v1/clients/:id/orders
 */
router.get('/:id/orders', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, order_number, business_type, status, transport_type,
              client_price, currency, pickup_date, delivery_date, created_at,
              pickup_address->>'city' as pickup_city,
              delivery_address->>'city' as delivery_city
       FROM orders WHERE client_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取订单历史失败', data: null })
  }
})

/**
 * 客户财务概览
 * GET /api/v1/clients/:id/finance
 */
router.get('/:id/finance', async (req, res) => {
  try {
    const stats = await query(
      `SELECT
         COALESCE(SUM(amount), 0) as total_receivable,
         COALESCE(SUM(paid_amount), 0) as total_paid,
         COALESCE(SUM(CASE WHEN payment_status = 'OVERDUE' THEN amount - paid_amount ELSE 0 END), 0) as overdue_amount
       FROM financial_records
       WHERE counterparty_type = 'CLIENT' AND counterparty_id = $1 AND type = 'RECEIVABLE'`,
      [req.params.id]
    )
    const records = await query(
      `SELECT id, record_number, order_id, amount, paid_amount, currency,
              payment_status, due_date, created_at
       FROM financial_records
       WHERE counterparty_type = 'CLIENT' AND counterparty_id = $1 AND type = 'RECEIVABLE'
       ORDER BY created_at DESC LIMIT 20`,
      [req.params.id]
    )
    res.json({ code: 200, message: 'success', data: { stats: stats.rows[0], records: records.rows } })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取财务概览失败', data: null })
  }
})

export default router
