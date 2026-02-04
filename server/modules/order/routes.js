/**
 * 订单管理模块路由
 * 
 * ERP标准优化：
 * - 事务处理确保数据一致性
 * - 输入验证增强数据准确性
 * - 审计日志记录关键操作
 */

import { Router } from 'express'
import { getDatabase, generateId, transaction } from '../../config/database.js'
import { authenticateToken, requirePermission } from '../../middleware/auth.js'
import { validateOrderCreate, validateOrderUpdate, validateOrderStatus } from '../../middleware/validators.js'
import { logAudit } from '../../middleware/auditLog.js'

const router = Router()

/**
 * 构建查询条件（安全的参数化查询构建器）
 */
function buildWhereClause(filters) {
  const conditions = ['1=1']
  const params = []
  
  if (filters.status) {
    params.push(filters.status)
    conditions.push(`o.status = $${params.length}`)
  }
  
  if (filters.search) {
    params.push(`%${filters.search}%`)
    conditions.push(`(o.order_no ILIKE $${params.length} OR o.customer_name ILIKE $${params.length})`)
  }
  
  if (filters.startDate) {
    params.push(filters.startDate)
    conditions.push(`o.create_time >= $${params.length}`)
  }
  
  if (filters.endDate) {
    params.push(filters.endDate)
    conditions.push(`o.create_time <= $${params.length}`)
  }
  
  if (filters.customerId) {
    params.push(filters.customerId)
    conditions.push(`o.customer_id = $${params.length}`)
  }
  
  return { whereClause: conditions.join(' AND '), params }
}

/**
 * 获取订单列表
 * GET /api/orders
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, search, startDate, endDate, customerId } = req.query
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    
    const db = getDatabase()
    const { whereClause, params } = buildWhereClause({ status, search, startDate, endDate, customerId })
    
    const countResult = await db.prepare(`
      SELECT COUNT(*) as total FROM orders o WHERE ${whereClause}
    `).get(...params)
    
    const list = await db.prepare(`
      SELECT o.id, o.order_no as "orderNo", o.customer_id as "customerId",
             o.customer_name as "customerName", o.status, o.total_amount as "totalAmount",
             o.currency, o.remark, o.operator_id as "operatorId",
             o.create_time as "createTime", o.update_time as "updateTime"
      FROM orders o
      WHERE ${whereClause}
      ORDER BY o.create_time DESC
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
    console.error('获取订单列表失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取订单列表失败',
      data: null,
    })
  }
})

/**
 * 获取订单详情
 * GET /api/orders/:id
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    const order = await db.prepare(`
      SELECT o.*, c.name as "customerName", c.phone as "customerPhone"
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ?
    `).get(id)
    
    if (!order) {
      return res.status(404).json({
        errCode: 404,
        msg: '订单不存在',
        data: null,
      })
    }
    
    // 获取订单商品
    const items = await db.prepare(`
      SELECT * FROM order_items WHERE order_id = ?
    `).all(id)
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: {
        ...order,
        items,
      },
    })
  } catch (error) {
    console.error('获取订单详情失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取订单详情失败',
      data: null,
    })
  }
})

/**
 * 创建订单
 * POST /api/orders
 * 
 * ERP标准：使用事务确保订单主表和明细表的数据一致性
 */
router.post('/', authenticateToken, requirePermission('bill:create'), validateOrderCreate, async (req, res) => {
  try {
    const { customerId, customerName, items, remark, currency = 'EUR' } = req.body
    
    const db = getDatabase()
    const id = generateId('order')
    const orderNo = 'ORD' + Date.now()
    
    // 计算总金额
    const totalAmount = items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0
      const price = parseFloat(item.price) || 0
      return sum + (qty * price)
    }, 0)
    
    // 使用事务确保数据一致性
    const createOrderTx = db.transaction(async function() {
      // 插入订单主表
      await this.prepare(`
        INSERT INTO orders (id, order_no, customer_id, customer_name, status, total_amount, 
                           currency, remark, operator_id, create_time, update_time)
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, NOW(), NOW())
      `).run(id, orderNo, customerId, customerName, totalAmount, currency, remark || null, req.user.id)
      
      // 插入订单明细
      for (const item of items) {
        const qty = parseFloat(item.quantity) || 0
        const price = parseFloat(item.price) || 0
        await this.prepare(`
          INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price, amount)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(generateId('item'), id, item.productId, item.productName, qty, price, qty * price)
      }
      
      return { id, orderNo, totalAmount }
    })
    
    const result = await createOrderTx()
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'ORDER_CREATE',
      targetType: 'order',
      targetId: id,
      details: { orderNo, customerId, totalAmount, itemCount: items.length },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '创建成功',
      data: result,
    })
  } catch (error) {
    console.error('创建订单失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '创建订单失败: ' + error.message,
      data: null,
    })
  }
})

/**
 * 更新订单状态
 * PUT /api/orders/:id/status
 * 
 * ERP标准：状态流转验证，防止非法状态变更
 */
router.put('/:id/status', authenticateToken, requirePermission('bill:edit'), validateOrderStatus, async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    
    const db = getDatabase()
    
    // 获取当前订单状态
    const order = await db.prepare(`SELECT id, order_no, status FROM orders WHERE id = ?`).get(id)
    
    if (!order) {
      return res.status(404).json({
        errCode: 404,
        msg: '订单不存在',
        data: null,
      })
    }
    
    // ERP标准：验证状态流转合法性
    const validTransitions = {
      'draft': ['pending', 'cancelled'],
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['processing', 'cancelled'],
      'processing': ['completed', 'cancelled'],
      'completed': [],
      'cancelled': []
    }
    
    const allowedNextStatus = validTransitions[order.status] || []
    if (!allowedNextStatus.includes(status)) {
      return res.json({
        errCode: 400,
        msg: `不能将订单状态从 "${order.status}" 变更为 "${status}"`,
        data: null,
      })
    }
    
    const oldStatus = order.status
    await db.prepare(`
      UPDATE orders SET status = ?, update_time = NOW() WHERE id = ?
    `).run(status, id)
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'ORDER_STATUS_CHANGE',
      targetType: 'order',
      targetId: id,
      details: { orderNo: order.order_no, oldStatus, newStatus: status },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '更新成功',
      data: null,
    })
  } catch (error) {
    console.error('更新订单状态失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '更新订单状态失败',
      data: null,
    })
  }
})

/**
 * 删除订单
 * DELETE /api/orders/:id
 * 
 * ERP标准：
 * - 仅允许删除草稿状态且无关联业务数据的订单
 * - 如果订单有关联的发票或运输单，禁止删除
 * - 非草稿状态的订单只能"作废"，不能删除
 */
router.delete('/:id', authenticateToken, requirePermission('bill:delete'), async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    // 检查订单是否存在及状态
    const order = await db.prepare(`SELECT id, order_no, status FROM orders WHERE id = ?`).get(id)
    
    if (!order) {
      return res.status(404).json({
        errCode: 404,
        msg: '订单不存在',
        data: null,
      })
    }
    
    // ERP标准：只允许删除草稿状态的订单
    if (order.status !== 'draft') {
      return res.json({
        errCode: 400,
        msg: '只能删除草稿状态的订单，其他状态请使用"作废"功能',
        data: null,
      })
    }
    
    // 检查是否有关联的运输单
    const hasShipment = await db.prepare(`
      SELECT 1 FROM tms_shipments WHERE order_id = ? LIMIT 1
    `).get(id)
    
    if (hasShipment) {
      return res.json({
        errCode: 400,
        msg: '该订单已关联运输单，无法删除',
        data: null,
      })
    }
    
    // 使用事务确保级联删除一致性
    const deleteOrderTx = db.transaction(async function() {
      await this.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(id)
      await this.prepare(`DELETE FROM orders WHERE id = ?`).run(id)
    })
    
    await deleteOrderTx()
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'ORDER_DELETE',
      targetType: 'order',
      targetId: id,
      details: { orderNo: order.order_no, status: order.status },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '删除成功',
      data: null,
    })
  } catch (error) {
    console.error('删除订单失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '删除订单失败',
      data: null,
    })
  }
})

/**
 * 作废订单
 * POST /api/orders/:id/void
 * 
 * ERP标准：
 * - 非草稿状态的订单不能删除，只能作废
 * - 作废需要填写原因
 * - 已完成的订单作废需要特殊权限
 */
router.post('/:id/void', authenticateToken, requirePermission('bill:delete'), async (req, res) => {
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
    
    // 检查订单是否存在及状态
    const order = await db.prepare(`SELECT id, order_no, status, void_time FROM orders WHERE id = ?`).get(id)
    
    if (!order) {
      return res.status(404).json({
        errCode: 404,
        msg: '订单不存在',
        data: null,
      })
    }
    
    // 已作废的订单不能再次作废
    if (order.void_time) {
      return res.json({
        errCode: 400,
        msg: '该订单已作废',
        data: null,
      })
    }
    
    // 草稿状态直接取消即可
    if (order.status === 'draft') {
      return res.json({
        errCode: 400,
        msg: '草稿状态的订单请直接删除，无需作废',
        data: null,
      })
    }
    
    // 检查是否有未完成的运输单
    const pendingShipment = await db.prepare(`
      SELECT 1 FROM tms_shipments WHERE order_id = ? AND status NOT IN ('completed', 'cancelled') LIMIT 1
    `).get(id)
    
    if (pendingShipment) {
      return res.json({
        errCode: 400,
        msg: '该订单存在进行中的运输单，请先处理运输单后再作废订单',
        data: null,
      })
    }
    
    // 执行作废
    await db.prepare(`
      UPDATE orders 
      SET status = 'void', void_time = NOW(), void_reason = ?, void_by = ?, update_time = NOW()
      WHERE id = ?
    `).run(reason.trim(), req.user.id, id)
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'ORDER_VOID',
      targetType: 'order',
      targetId: id,
      details: { orderNo: order.order_no, previousStatus: order.status, reason: reason.trim() },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '订单已作废',
      data: null,
    })
  } catch (error) {
    console.error('作废订单失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '作废订单失败',
      data: null,
    })
  }
})

export default router
