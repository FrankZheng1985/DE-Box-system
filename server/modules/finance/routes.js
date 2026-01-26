/**
 * 财务管理模块路由
 */

import { Router } from 'express'
import { getDatabase, generateId } from '../../config/database.js'
import { authenticateToken, requirePermission } from '../../middleware/auth.js'

const router = Router()

/**
 * 获取发票列表
 * GET /api/finance/invoices
 */
router.get('/invoices', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, search, startDate, endDate } = req.query
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    
    const db = getDatabase()
    
    let whereClause = '1=1'
    const params = []
    
    if (status) {
      whereClause += ' AND i.status = $' + (params.length + 1)
      params.push(status)
    }
    
    if (search) {
      whereClause += ' AND (i.invoice_no ILIKE $' + (params.length + 1) + ' OR i.customer_name ILIKE $' + (params.length + 1) + ')'
      params.push(`%${search}%`)
    }
    
    if (startDate) {
      whereClause += ' AND i.invoice_date >= $' + (params.length + 1)
      params.push(startDate)
    }
    
    if (endDate) {
      whereClause += ' AND i.invoice_date <= $' + (params.length + 1)
      params.push(endDate)
    }
    
    const countResult = await db.prepare(`
      SELECT COUNT(*) as total FROM invoices i WHERE ${whereClause}
    `).get(...params)
    
    const list = await db.prepare(`
      SELECT i.id, i.invoice_no as "invoiceNo", i.customer_id as "customerId",
             i.customer_name as "customerName", i.invoice_date as "invoiceDate",
             i.due_date as "dueDate", i.total_amount as "totalAmount",
             i.paid_amount as "paidAmount", i.currency, i.status, i.remark,
             i.create_time as "createTime", i.update_time as "updateTime"
      FROM invoices i
      WHERE ${whereClause}
      ORDER BY i.create_time DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `).all(...params, parseInt(pageSize), offset)
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: {
        list,
        total: parseInt(countResult.total),
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      },
    })
  } catch (error) {
    console.error('获取发票列表失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取发票列表失败',
      data: null,
    })
  }
})

/**
 * 获取发票详情
 * GET /api/finance/invoices/:id
 */
router.get('/invoices/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    const invoice = await db.prepare(`
      SELECT * FROM invoices WHERE id = ?
    `).get(id)
    
    if (!invoice) {
      return res.status(404).json({
        errCode: 404,
        msg: '发票不存在',
        data: null,
      })
    }
    
    // 获取发票明细
    const items = await db.prepare(`
      SELECT * FROM invoice_items WHERE invoice_id = ?
    `).all(id)
    
    // 获取收款记录
    const payments = await db.prepare(`
      SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC
    `).all(id)
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: {
        ...invoice,
        items,
        payments,
      },
    })
  } catch (error) {
    console.error('获取发票详情失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取发票详情失败',
      data: null,
    })
  }
})

/**
 * 创建发票
 * POST /api/finance/invoices
 */
router.post('/invoices', authenticateToken, requirePermission('finance:invoice_create'), async (req, res) => {
  try {
    const { customerId, customerName, invoiceDate, dueDate, items, currency, remark } = req.body
    
    if (!customerId || !items || items.length === 0) {
      return res.json({
        errCode: 400,
        msg: '客户和明细信息不能为空',
        data: null,
      })
    }
    
    const db = getDatabase()
    const id = generateId('inv')
    const invoiceNo = 'INV' + Date.now()
    
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
    
    await db.prepare(`
      INSERT INTO invoices (id, invoice_no, customer_id, customer_name, invoice_date, due_date,
                           total_amount, paid_amount, currency, status, remark, operator_id,
                           create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'draft', ?, ?, NOW(), NOW())
    `).run(id, invoiceNo, customerId, customerName, invoiceDate, dueDate, totalAmount,
           currency || 'EUR', remark || null, req.user.id)
    
    // 插入明细
    for (const item of items) {
      await db.prepare(`
        INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(generateId('item'), id, item.description, item.quantity, item.unitPrice,
             item.quantity * item.unitPrice)
    }
    
    res.json({
      errCode: 200,
      msg: '创建成功',
      data: { id, invoiceNo },
    })
  } catch (error) {
    console.error('创建发票失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '创建发票失败',
      data: null,
    })
  }
})

/**
 * 登记收款
 * POST /api/finance/payments
 */
router.post('/payments', authenticateToken, requirePermission('finance:payment_view'), async (req, res) => {
  try {
    const { invoiceId, amount, paymentDate, paymentMethod, remark } = req.body
    
    if (!invoiceId || !amount) {
      return res.json({
        errCode: 400,
        msg: '发票ID和金额不能为空',
        data: null,
      })
    }
    
    const db = getDatabase()
    const id = generateId('pay')
    
    await db.prepare(`
      INSERT INTO payments (id, invoice_id, amount, payment_date, payment_method, remark,
                           operator_id, create_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `).run(id, invoiceId, amount, paymentDate || new Date().toISOString().split('T')[0],
           paymentMethod || 'bank_transfer', remark || null, req.user.id)
    
    // 更新发票已付金额
    await db.prepare(`
      UPDATE invoices 
      SET paid_amount = paid_amount + ?, 
          status = CASE WHEN paid_amount + ? >= total_amount THEN 'paid' ELSE 'partial' END,
          update_time = NOW()
      WHERE id = ?
    `).run(amount, amount, invoiceId)
    
    res.json({
      errCode: 200,
      msg: '登记成功',
      data: { id },
    })
  } catch (error) {
    console.error('登记收款失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '登记收款失败',
      data: null,
    })
  }
})

/**
 * 获取财务报表数据
 * GET /api/finance/reports/summary
 */
router.get('/reports/summary', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const db = getDatabase()
    
    let whereClause = '1=1'
    const params = []
    
    if (startDate) {
      whereClause += ' AND invoice_date >= $' + (params.length + 1)
      params.push(startDate)
    }
    
    if (endDate) {
      whereClause += ' AND invoice_date <= $' + (params.length + 1)
      params.push(endDate)
    }
    
    const summary = await db.prepare(`
      SELECT 
        COUNT(*) as "invoiceCount",
        COALESCE(SUM(total_amount), 0) as "totalAmount",
        COALESCE(SUM(paid_amount), 0) as "paidAmount",
        COALESCE(SUM(total_amount - paid_amount), 0) as "unpaidAmount"
      FROM invoices
      WHERE ${whereClause}
    `).get(...params)
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: summary,
    })
  } catch (error) {
    console.error('获取财务报表失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取财务报表失败',
      data: null,
    })
  }
})

export default router
