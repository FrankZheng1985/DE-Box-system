/**
 * CRM客户管理模块路由
 * 
 * ERP标准：
 * - 软删除机制保护客户数据
 * - 有业务关联的客户禁止删除，只能停用
 * - 审计日志记录所有操作
 */

import { Router } from 'express'
import { getDatabase, generateId } from '../../config/database.js'
import { authenticateToken, requirePermission } from '../../middleware/auth.js'
import { logAudit } from '../../middleware/auditLog.js'

const router = Router()

/**
 * 获取客户列表
 * GET /api/crm/customers
 */
router.get('/customers', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, search, level, includeDeleted } = req.query
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    
    const db = getDatabase()
    
    // 默认过滤已删除的客户
    let whereClause = includeDeleted === 'true' ? '1=1' : '(c.is_deleted IS NULL OR c.is_deleted = FALSE)'
    const params = []
    
    if (status) {
      whereClause += ' AND c.status = $' + (params.length + 1)
      params.push(status)
    }
    
    if (search) {
      whereClause += ' AND (c.name ILIKE $' + (params.length + 1) + ' OR c.code ILIKE $' + (params.length + 1) + ' OR c.contact_person ILIKE $' + (params.length + 1) + ')'
      params.push(`%${search}%`)
    }
    
    if (level) {
      whereClause += ' AND c.level = $' + (params.length + 1)
      params.push(level)
    }
    
    const countResult = await db.prepare(`
      SELECT COUNT(*) as total FROM customers c WHERE ${whereClause}
    `).get(...params)
    
    const list = await db.prepare(`
      SELECT c.id, c.code, c.name, c.short_name as "shortName", c.level,
             c.contact_person as "contactPerson", c.phone, c.email, c.address,
             c.credit_limit as "creditLimit", c.payment_terms as "paymentTerms",
             c.status, c.remark, c.sales_id as "salesId",
             c.create_time as "createTime", c.update_time as "updateTime",
             c.is_deleted as "isDeleted"
      FROM customers c
      WHERE ${whereClause}
      ORDER BY c.create_time DESC
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
    console.error('获取客户列表失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取客户列表失败',
      data: null,
    })
  }
})

/**
 * 获取客户详情
 * GET /api/crm/customers/:id
 */
router.get('/customers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    const customer = await db.prepare(`
      SELECT c.*, u.name as "salesName"
      FROM customers c
      LEFT JOIN users u ON c.sales_id = u.id
      WHERE c.id = ?
    `).get(id)
    
    if (!customer) {
      return res.status(404).json({
        errCode: 404,
        msg: '客户不存在',
        data: null,
      })
    }
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: customer,
    })
  } catch (error) {
    console.error('获取客户详情失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取客户详情失败',
      data: null,
    })
  }
})

/**
 * 创建客户
 * POST /api/crm/customers
 */
router.post('/customers', authenticateToken, requirePermission('crm:manage'), async (req, res) => {
  try {
    const { name, shortName, level, contactPerson, phone, email, address, creditLimit, paymentTerms, salesId, remark } = req.body
    
    if (!name) {
      return res.json({
        errCode: 400,
        msg: '客户名称不能为空',
        data: null,
      })
    }
    
    const db = getDatabase()
    const id = generateId('cust')
    const code = 'C' + Date.now().toString().slice(-8)
    
    await db.prepare(`
      INSERT INTO customers (id, code, name, short_name, level, contact_person, phone, email,
                            address, credit_limit, payment_terms, sales_id, status, remark,
                            create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW(), NOW())
    `).run(id, code, name, shortName || null, level || 'normal', contactPerson || null,
           phone || null, email || null, address || null, creditLimit || 0,
           paymentTerms || 30, salesId || null, remark || null)
    
    res.json({
      errCode: 200,
      msg: '创建成功',
      data: { id, code },
    })
  } catch (error) {
    console.error('创建客户失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '创建客户失败',
      data: null,
    })
  }
})

/**
 * 更新客户
 * PUT /api/crm/customers/:id
 */
router.put('/customers/:id', authenticateToken, requirePermission('crm:manage'), async (req, res) => {
  try {
    const { id } = req.params
    const { name, shortName, level, contactPerson, phone, email, address, creditLimit, paymentTerms, salesId, status, remark } = req.body
    
    const db = getDatabase()
    
    const updates = []
    const params = []
    
    if (name !== undefined) { updates.push('name = $' + (params.length + 1)); params.push(name) }
    if (shortName !== undefined) { updates.push('short_name = $' + (params.length + 1)); params.push(shortName) }
    if (level !== undefined) { updates.push('level = $' + (params.length + 1)); params.push(level) }
    if (contactPerson !== undefined) { updates.push('contact_person = $' + (params.length + 1)); params.push(contactPerson) }
    if (phone !== undefined) { updates.push('phone = $' + (params.length + 1)); params.push(phone) }
    if (email !== undefined) { updates.push('email = $' + (params.length + 1)); params.push(email) }
    if (address !== undefined) { updates.push('address = $' + (params.length + 1)); params.push(address) }
    if (creditLimit !== undefined) { updates.push('credit_limit = $' + (params.length + 1)); params.push(creditLimit) }
    if (paymentTerms !== undefined) { updates.push('payment_terms = $' + (params.length + 1)); params.push(paymentTerms) }
    if (salesId !== undefined) { updates.push('sales_id = $' + (params.length + 1)); params.push(salesId) }
    if (status !== undefined) { updates.push('status = $' + (params.length + 1)); params.push(status) }
    if (remark !== undefined) { updates.push('remark = $' + (params.length + 1)); params.push(remark) }
    
    updates.push('update_time = NOW()')
    params.push(id)
    
    await db.prepare(`
      UPDATE customers SET ${updates.join(', ')} WHERE id = $${params.length}
    `).run(...params)
    
    res.json({
      errCode: 200,
      msg: '更新成功',
      data: null,
    })
  } catch (error) {
    console.error('更新客户失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '更新客户失败',
      data: null,
    })
  }
})

/**
 * 删除客户（软删除）
 * DELETE /api/crm/customers/:id
 * 
 * ERP标准：
 * - 有订单或发票关联的客户禁止删除，只能停用
 * - 采用软删除机制保护数据
 */
router.delete('/customers/:id', authenticateToken, requirePermission('crm:manage'), async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    // 检查客户是否存在
    const customer = await db.prepare(`
      SELECT id, code, name, is_deleted FROM customers WHERE id = ?
    `).get(id)
    
    if (!customer) {
      return res.status(404).json({
        errCode: 404,
        msg: '客户不存在',
        data: null,
      })
    }
    
    if (customer.is_deleted) {
      return res.json({
        errCode: 400,
        msg: '该客户已被删除',
        data: null,
      })
    }
    
    // 检查是否有关联订单（非取消状态）
    const hasOrders = await db.prepare(`
      SELECT 1 FROM orders WHERE customer_id = ? AND status NOT IN ('cancelled', 'void') LIMIT 1
    `).get(id)
    
    // 检查是否有关联发票（非草稿和作废状态）
    const hasInvoices = await db.prepare(`
      SELECT 1 FROM invoices WHERE customer_id = ? AND status NOT IN ('draft', 'void') LIMIT 1
    `).get(id)
    
    if (hasOrders || hasInvoices) {
      return res.json({
        errCode: 400,
        msg: '该客户存在业务数据（订单或发票），无法删除。请将客户状态设为"停用"。',
        data: {
          hasOrders: !!hasOrders,
          hasInvoices: !!hasInvoices,
          suggestion: '建议使用"停用"功能替代删除'
        },
      })
    }
    
    // 执行软删除
    await db.prepare(`
      UPDATE customers 
      SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = ?, status = 'inactive', update_time = NOW()
      WHERE id = ?
    `).run(req.user.id, id)
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'CUSTOMER_DELETE',
      targetType: 'customer',
      targetId: id,
      details: { code: customer.code, name: customer.name },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '删除成功',
      data: null,
    })
  } catch (error) {
    console.error('删除客户失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '删除客户失败: ' + error.message,
      data: null,
    })
  }
})

export default router
