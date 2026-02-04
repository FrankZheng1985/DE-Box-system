/**
 * 财务管理模块路由
 * 
 * ERP标准优化：
 * - 事务处理确保财务数据一致性
 * - 严格的金额验证
 * - 发票与支付的核销逻辑
 * - 审计日志记录
 */

import { Router } from 'express'
import { getDatabase, generateId } from '../../config/database.js'
import { authenticateToken, requirePermission } from '../../middleware/auth.js'
import { validateInvoiceCreate, validatePaymentCreate } from '../../middleware/validators.js'
import { logAudit, AuditActions } from '../../middleware/auditLog.js'

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
 * 
 * ERP标准：使用事务确保发票主表和明细表的数据一致性
 */
router.post('/invoices', authenticateToken, requirePermission('finance:invoice_create'), validateInvoiceCreate, async (req, res) => {
  try {
    const { customerId, customerName, invoiceDate, dueDate, items, currency = 'EUR', remark } = req.body
    
    const db = getDatabase()
    const id = generateId('inv')
    const invoiceNo = 'INV' + Date.now()
    
    // 精确计算总金额（使用高精度）
    const totalAmount = items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0
      const price = parseFloat(item.unitPrice) || 0
      return sum + Math.round(qty * price * 100) / 100
    }, 0)
    
    // 使用事务确保数据一致性
    const createInvoiceTx = db.transaction(async function() {
      // 插入发票主表
      await this.prepare(`
        INSERT INTO invoices (id, invoice_no, customer_id, customer_name, invoice_date, due_date,
                             total_amount, paid_amount, currency, status, remark, operator_id,
                             create_time, update_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'draft', ?, ?, NOW(), NOW())
      `).run(id, invoiceNo, customerId, customerName, invoiceDate || new Date().toISOString().split('T')[0], 
             dueDate, totalAmount, currency, remark || null, req.user.id)
      
      // 插入发票明细
      for (const item of items) {
        const qty = parseFloat(item.quantity) || 0
        const price = parseFloat(item.unitPrice) || 0
        const amount = Math.round(qty * price * 100) / 100
        
        await this.prepare(`
          INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, amount)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(generateId('item'), id, item.description, qty, price, amount)
      }
      
      return { id, invoiceNo, totalAmount }
    })
    
    const result = await createInvoiceTx()
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: AuditActions.INVOICE_CREATE,
      targetType: 'invoice',
      targetId: id,
      details: { invoiceNo, customerId, totalAmount, itemCount: items.length, currency },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '创建成功',
      data: result,
    })
  } catch (error) {
    console.error('创建发票失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '创建发票失败: ' + error.message,
      data: null,
    })
  }
})

/**
 * 登记收款
 * POST /api/finance/payments
 * 
 * ERP标准：
 * - 使用事务确保收款和发票更新的一致性
 * - 严格的金额验证（不能超付）
 * - 自动更新发票状态
 */
router.post('/payments', authenticateToken, requirePermission('finance:payment_view'), validatePaymentCreate, async (req, res) => {
  try {
    const { invoiceId, amount, paymentDate, paymentMethod, remark } = req.body
    
    const db = getDatabase()
    const paymentAmount = parseFloat(amount)
    
    // 获取发票信息并验证
    const invoice = await db.prepare(`
      SELECT id, invoice_no, total_amount, paid_amount, status 
      FROM invoices WHERE id = ?
    `).get(invoiceId)
    
    if (!invoice) {
      return res.status(404).json({
        errCode: 404,
        msg: '发票不存在',
        data: null,
      })
    }
    
    // ERP标准：不允许对已付清的发票再次收款
    if (invoice.status === 'paid') {
      return res.json({
        errCode: 400,
        msg: '该发票已付清，无需再次收款',
        data: null,
      })
    }
    
    // ERP标准：不允许对草稿状态的发票收款
    if (invoice.status === 'draft') {
      return res.json({
        errCode: 400,
        msg: '草稿状态的发票不能收款，请先确认发票',
        data: null,
      })
    }
    
    const totalAmount = parseFloat(invoice.total_amount)
    const paidAmount = parseFloat(invoice.paid_amount)
    const remainingAmount = totalAmount - paidAmount
    
    // ERP标准：收款金额不能超过剩余应收金额
    if (paymentAmount > remainingAmount + 0.01) { // 允许0.01的误差
      return res.json({
        errCode: 400,
        msg: `收款金额(${paymentAmount})超过剩余应收金额(${remainingAmount.toFixed(2)})`,
        data: null,
      })
    }
    
    const id = generateId('pay')
    const actualPaymentDate = paymentDate || new Date().toISOString().split('T')[0]
    const actualPaymentMethod = paymentMethod || 'bank_transfer'
    
    // 计算新的已付金额和状态
    const newPaidAmount = paidAmount + paymentAmount
    const newStatus = newPaidAmount >= totalAmount - 0.01 ? 'paid' : 'partial'
    
    // 使用事务确保收款和发票更新的一致性
    const createPaymentTx = db.transaction(async function() {
      // 插入收款记录
      await this.prepare(`
        INSERT INTO payments (id, invoice_id, amount, payment_date, payment_method, remark,
                             operator_id, create_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `).run(id, invoiceId, paymentAmount, actualPaymentDate, actualPaymentMethod, 
             remark || null, req.user.id)
      
      // 更新发票已付金额和状态
      await this.prepare(`
        UPDATE invoices 
        SET paid_amount = ?, status = ?, update_time = NOW()
        WHERE id = ?
      `).run(newPaidAmount, newStatus, invoiceId)
      
      return { 
        id, 
        newPaidAmount, 
        newStatus, 
        remainingAfterPayment: totalAmount - newPaidAmount 
      }
    })
    
    const result = await createPaymentTx()
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: AuditActions.PAYMENT_CREATE,
      targetType: 'payment',
      targetId: id,
      details: { 
        invoiceId, 
        invoiceNo: invoice.invoice_no,
        amount: paymentAmount, 
        paymentMethod: actualPaymentMethod,
        previousPaidAmount: paidAmount,
        newPaidAmount: result.newPaidAmount,
        newStatus: result.newStatus
      },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: result.newStatus === 'paid' ? '收款成功，发票已付清' : '收款成功',
      data: {
        id,
        paidAmount: result.newPaidAmount,
        remainingAmount: result.remainingAfterPayment,
        invoiceStatus: result.newStatus,
      },
    })
  } catch (error) {
    console.error('登记收款失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '登记收款失败: ' + error.message,
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
    
    let whereClause = "status != 'void'"
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

/**
 * 删除发票
 * DELETE /api/finance/invoices/:id
 * 
 * ERP标准：
 * - 仅允许删除草稿状态的发票
 * - 已确认/已收款的发票只能作废，不能删除
 */
router.delete('/invoices/:id', authenticateToken, requirePermission('finance:invoice_create'), async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    const invoice = await db.prepare(`
      SELECT id, invoice_no, status, paid_amount FROM invoices WHERE id = ?
    `).get(id)
    
    if (!invoice) {
      return res.status(404).json({
        errCode: 404,
        msg: '发票不存在',
        data: null,
      })
    }
    
    // 仅允许删除草稿状态的发票
    if (invoice.status !== 'draft') {
      return res.json({
        errCode: 400,
        msg: '只能删除草稿状态的发票，其他状态请使用"作废"功能',
        data: null,
      })
    }
    
    // 使用事务删除发票及其明细
    const deleteInvoiceTx = db.transaction(async function() {
      await this.prepare(`DELETE FROM invoice_items WHERE invoice_id = ?`).run(id)
      await this.prepare(`DELETE FROM invoices WHERE id = ?`).run(id)
    })
    
    await deleteInvoiceTx()
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: AuditActions.INVOICE_DELETE,
      targetType: 'invoice',
      targetId: id,
      details: { invoiceNo: invoice.invoice_no },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '删除成功',
      data: null,
    })
  } catch (error) {
    console.error('删除发票失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '删除发票失败',
      data: null,
    })
  }
})

/**
 * 作废发票
 * POST /api/finance/invoices/:id/void
 * 
 * ERP标准：
 * - 已确认/已部分收款的发票只能作废，不能删除
 * - 已付清的发票作废需要特殊处理（可能需要退款）
 * - 作废必须填写原因
 */
router.post('/invoices/:id/void', authenticateToken, requirePermission('finance:invoice_create'), async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body
    
    if (!reason || reason.trim().length < 2) {
      return res.json({
        errCode: 400,
        msg: '请填写作废原因（至少2个字符）',
        data: null,
      })
    }
    
    const db = getDatabase()
    
    const invoice = await db.prepare(`
      SELECT id, invoice_no, status, total_amount, paid_amount, void_time 
      FROM invoices WHERE id = ?
    `).get(id)
    
    if (!invoice) {
      return res.status(404).json({
        errCode: 404,
        msg: '发票不存在',
        data: null,
      })
    }
    
    // 已作废的发票不能再次作废
    if (invoice.void_time || invoice.status === 'void') {
      return res.json({
        errCode: 400,
        msg: '该发票已作废',
        data: null,
      })
    }
    
    // 草稿状态直接删除即可
    if (invoice.status === 'draft') {
      return res.json({
        errCode: 400,
        msg: '草稿状态的发票请直接删除，无需作废',
        data: null,
      })
    }
    
    const paidAmount = parseFloat(invoice.paid_amount) || 0
    
    // 如果已有收款，提示需要处理退款
    let warningMsg = ''
    if (paidAmount > 0) {
      warningMsg = `注意：该发票已收款 ${paidAmount.toFixed(2)}，作废后请妥善处理退款事宜。`
    }
    
    // 执行作废
    await db.prepare(`
      UPDATE invoices 
      SET status = 'void', void_time = NOW(), void_reason = ?, void_by = ?, update_time = NOW()
      WHERE id = ?
    `).run(reason.trim(), req.user.id, id)
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'INVOICE_VOID',
      targetType: 'invoice',
      targetId: id,
      details: { 
        invoiceNo: invoice.invoice_no, 
        previousStatus: invoice.status,
        totalAmount: invoice.total_amount,
        paidAmount: paidAmount,
        reason: reason.trim() 
      },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: warningMsg ? `发票已作废。${warningMsg}` : '发票已作废',
      data: { paidAmount },
    })
  } catch (error) {
    console.error('作废发票失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '作废发票失败',
      data: null,
    })
  }
})

/**
 * 确认发票（从草稿变为待收款）
 * POST /api/finance/invoices/:id/confirm
 */
router.post('/invoices/:id/confirm', authenticateToken, requirePermission('finance:invoice_create'), async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    const invoice = await db.prepare(`
      SELECT id, invoice_no, status FROM invoices WHERE id = ?
    `).get(id)
    
    if (!invoice) {
      return res.status(404).json({
        errCode: 404,
        msg: '发票不存在',
        data: null,
      })
    }
    
    if (invoice.status !== 'draft') {
      return res.json({
        errCode: 400,
        msg: '只有草稿状态的发票可以确认',
        data: null,
      })
    }
    
    await db.prepare(`
      UPDATE invoices SET status = 'pending', update_time = NOW() WHERE id = ?
    `).run(id)
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: AuditActions.INVOICE_STATUS_CHANGE,
      targetType: 'invoice',
      targetId: id,
      details: { invoiceNo: invoice.invoice_no, oldStatus: 'draft', newStatus: 'pending' },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '发票已确认',
      data: null,
    })
  } catch (error) {
    console.error('确认发票失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '确认发票失败',
      data: null,
    })
  }
})

/**
 * 作废收款记录
 * POST /api/finance/payments/:id/void
 * 
 * ERP标准：
 * - 收款作废后需要同步更新发票的已付金额和状态
 * - 必须填写作废原因
 */
router.post('/payments/:id/void', authenticateToken, requirePermission('finance:payment_view'), async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body
    
    if (!reason || reason.trim().length < 2) {
      return res.json({
        errCode: 400,
        msg: '请填写作废原因（至少2个字符）',
        data: null,
      })
    }
    
    const db = getDatabase()
    
    // 获取收款记录
    const payment = await db.prepare(`
      SELECT p.*, i.invoice_no, i.total_amount as invoice_total, i.paid_amount as invoice_paid, i.status as invoice_status
      FROM payments p
      LEFT JOIN invoices i ON p.invoice_id = i.id
      WHERE p.id = ?
    `).get(id)
    
    if (!payment) {
      return res.status(404).json({
        errCode: 404,
        msg: '收款记录不存在',
        data: null,
      })
    }
    
    // 检查是否已作废（简单判断：检查是否有void标记，这里我们用remark包含[已作废]来标记）
    if (payment.remark && payment.remark.includes('[已作废]')) {
      return res.json({
        errCode: 400,
        msg: '该收款记录已作废',
        data: null,
      })
    }
    
    // 检查发票是否已作废
    if (payment.invoice_status === 'void') {
      return res.json({
        errCode: 400,
        msg: '关联发票已作废，无需单独作废收款记录',
        data: null,
      })
    }
    
    const paymentAmount = parseFloat(payment.amount) || 0
    const invoicePaid = parseFloat(payment.invoice_paid) || 0
    const invoiceTotal = parseFloat(payment.invoice_total) || 0
    
    // 计算作废后的发票状态
    const newPaidAmount = Math.max(0, invoicePaid - paymentAmount)
    let newInvoiceStatus = 'pending'
    if (newPaidAmount >= invoiceTotal - 0.01) {
      newInvoiceStatus = 'paid'
    } else if (newPaidAmount > 0) {
      newInvoiceStatus = 'partial'
    }
    
    // 使用事务更新
    const voidPaymentTx = db.transaction(async function() {
      // 标记收款记录为已作废（在remark前面加标记）
      const newRemark = `[已作废:${reason.trim()}] ${payment.remark || ''}`
      await this.prepare(`
        UPDATE payments SET remark = ? WHERE id = ?
      `).run(newRemark, id)
      
      // 更新发票已付金额和状态
      await this.prepare(`
        UPDATE invoices SET paid_amount = ?, status = ?, update_time = NOW() WHERE id = ?
      `).run(newPaidAmount, newInvoiceStatus, payment.invoice_id)
    })
    
    await voidPaymentTx()
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'PAYMENT_VOID',
      targetType: 'payment',
      targetId: id,
      details: { 
        invoiceId: payment.invoice_id,
        invoiceNo: payment.invoice_no,
        amount: paymentAmount,
        reason: reason.trim(),
        newInvoicePaidAmount: newPaidAmount,
        newInvoiceStatus: newInvoiceStatus
      },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '收款记录已作废',
      data: {
        newInvoicePaidAmount: newPaidAmount,
        newInvoiceStatus: newInvoiceStatus,
      },
    })
  } catch (error) {
    console.error('作废收款记录失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '作废收款记录失败',
      data: null,
    })
  }
})

export default router
