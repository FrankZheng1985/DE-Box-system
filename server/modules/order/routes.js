/**
 * 订单管理模块路由
 */

import { Router } from 'express'
import { getDatabase, generateId } from '../../config/database.js'
import { authenticateToken, requirePermission } from '../../middleware/auth.js'

const router = Router()

/**
 * 获取订单列表
 * GET /api/orders
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, search, startDate, endDate } = req.query
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    
    const db = getDatabase()
    
    let whereClause = '1=1'
    const params = []
    
    if (status) {
      whereClause += ' AND o.status = $' + (params.length + 1)
      params.push(status)
    }
    
    if (search) {
      whereClause += ' AND (o.order_no ILIKE $' + (params.length + 1) + ' OR o.customer_name ILIKE $' + (params.length + 1) + ')'
      params.push(`%${search}%`)
    }
    
    if (startDate) {
      whereClause += ' AND o.create_time >= $' + (params.length + 1)
      params.push(startDate)
    }
    
    if (endDate) {
      whereClause += ' AND o.create_time <= $' + (params.length + 1)
      params.push(endDate)
    }
    
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
 */
router.post('/', authenticateToken, requirePermission('bill:create'), async (req, res) => {
  try {
    const { customerId, customerName, items, remark } = req.body
    
    if (!customerId || !items || items.length === 0) {
      return res.json({
        errCode: 400,
        msg: '客户和商品信息不能为空',
        data: null,
      })
    }
    
    const db = getDatabase()
    const id = generateId('order')
    const orderNo = 'ORD' + Date.now()
    
    // 计算总金额
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.price), 0)
    
    await db.prepare(`
      INSERT INTO orders (id, order_no, customer_id, customer_name, status, total_amount, 
                         currency, remark, operator_id, create_time, update_time)
      VALUES (?, ?, ?, ?, 'draft', ?, 'EUR', ?, ?, NOW(), NOW())
    `).run(id, orderNo, customerId, customerName, totalAmount, remark || null, req.user.id)
    
    // 插入订单商品
    for (const item of items) {
      await db.prepare(`
        INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price, amount)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(generateId('item'), id, item.productId, item.productName, item.quantity, item.price, item.quantity * item.price)
    }
    
    res.json({
      errCode: 200,
      msg: '创建成功',
      data: { id, orderNo },
    })
  } catch (error) {
    console.error('创建订单失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '创建订单失败',
      data: null,
    })
  }
})

/**
 * 更新订单状态
 * PUT /api/orders/:id/status
 */
router.put('/:id/status', authenticateToken, requirePermission('bill:edit'), async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    
    const db = getDatabase()
    
    await db.prepare(`
      UPDATE orders SET status = ?, update_time = NOW() WHERE id = ?
    `).run(status, id)
    
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
 */
router.delete('/:id', authenticateToken, requirePermission('bill:delete'), async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    // 删除订单商品
    await db.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(id)
    // 删除订单
    await db.prepare(`DELETE FROM orders WHERE id = ?`).run(id)
    
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

export default router
