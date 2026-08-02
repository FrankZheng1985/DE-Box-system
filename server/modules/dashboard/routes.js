/**
 * 仪表板数据聚合路由
 */

import { Router } from 'express'
import { authenticateToken, requireUserType, requirePermission } from '../../middleware/auth.js'
import { query } from '../../core/db.js'

const router = Router()
router.use(authenticateToken)

/**
 * 运营仪表板
 * GET /api/v1/dashboard/operator
 */
router.get('/operator', requireUserType('OPERATOR'), requirePermission('dashboard:view'), async (req, res) => {
  try {
    // 订单统计
    const orderStats = await query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_new,
        COUNT(*) FILTER (WHERE status = 'IN_TRANSIT' OR delivery_status = 'IN_TRANSIT') as in_transit,
        COUNT(*) FILTER (WHERE status = 'COMPLETED' AND created_at >= date_trunc('month', CURRENT_DATE)) as month_completed,
        COUNT(*) FILTER (WHERE status = 'EXCEPTION' OR delivery_status = 'EXCEPTION') as exceptions,
        COALESCE(SUM(client_price) FILTER (WHERE status = 'COMPLETED' AND created_at >= date_trunc('month', CURRENT_DATE)), 0) as month_revenue,
        COALESCE(SUM(carrier_cost) FILTER (WHERE status = 'COMPLETED' AND created_at >= date_trunc('month', CURRENT_DATE)), 0) as month_cost
      FROM orders
    `)

    // 状态分布
    const statusDist = await query(`
      SELECT status, COUNT(*) as count FROM orders
      WHERE status NOT IN ('COMPLETED', 'CANCELLED')
      GROUP BY status ORDER BY count DESC
    `)

    // 待处理事项
    const pendingReview = await query(`SELECT COUNT(*) as cnt FROM orders WHERE status = 'PENDING_REVIEW'`)
    const pendingAssign = await query(`SELECT COUNT(*) as cnt FROM orders WHERE status = 'PENDING_ASSIGN'`)
    const exceptions = await query(`SELECT COUNT(*) as cnt FROM orders WHERE status = 'EXCEPTION'`)

    // 最近订单
    const recentOrders = await query(`
      SELECT o.id, o.order_number, o.business_type, o.status, o.delivery_status,
             o.transport_type, o.client_price, o.currency, o.created_at,
             c.company_name as client_name, cr.company_name as carrier_name,
             o.pickup_address->>'city' as from_city, o.delivery_address->>'city' as to_city
      FROM orders o
      LEFT JOIN clients c ON c.id = o.client_id
      LEFT JOIN carriers cr ON cr.id = o.carrier_id
      ORDER BY o.created_at DESC LIMIT 10
    `)

    const stats = orderStats.rows[0]
    const revenue = parseFloat(stats.month_revenue)
    const cost = parseFloat(stats.month_cost)

    res.json({
      code: 200, message: 'success',
      data: {
        stats: {
          todayNew: parseInt(stats.today_new),
          inTransit: parseInt(stats.in_transit),
          monthCompleted: parseInt(stats.month_completed),
          exceptions: parseInt(stats.exceptions),
          monthRevenue: revenue,
          profitMargin: revenue > 0 ? ((revenue - cost) / revenue * 100).toFixed(1) : 0
        },
        statusDistribution: statusDist.rows,
        pendingItems: {
          pendingReview: parseInt(pendingReview.rows[0].cnt),
          pendingAssign: parseInt(pendingAssign.rows[0].cnt),
          exceptions: parseInt(exceptions.rows[0].cnt)
        },
        recentOrders: recentOrders.rows
      }
    })
  } catch (error) {
    console.error('获取仪表板数据失败:', error)
    res.status(500).json({ code: 500, message: '获取仪表板数据失败', data: null })
  }
})

/**
 * 客户仪表板
 * GET /api/v1/dashboard/client
 */
router.get('/client', requirePermission('dashboard:view', 'portal:order_view'), async (req, res) => {
  try {
    const clientId = req.user.linkedEntityId
    if (!clientId) {
      return res.json({ code: 200, message: 'success', data: { stats: {}, recentOrders: [] } })
    }

    const stats = await query(`
      SELECT
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status IN ('IN_TRANSIT', 'ASSIGNED')) as in_transit,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
        COUNT(*) FILTER (WHERE status = 'EXCEPTION') as exceptions
      FROM orders WHERE client_id = $1
    `, [clientId])

    const recentOrders = await query(`
      SELECT id, order_number, business_type, status, delivery_status,
             transport_type, client_price, currency, created_at,
             pickup_address->>'city' as from_city, delivery_address->>'city' as to_city
      FROM orders WHERE client_id = $1
      ORDER BY created_at DESC LIMIT 10
    `, [clientId])

    res.json({ code: 200, message: 'success', data: { stats: stats.rows[0], recentOrders: recentOrders.rows } })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取仪表板数据失败', data: null })
  }
})

/**
 * 承运商仪表板
 * GET /api/v1/dashboard/carrier
 */
router.get('/carrier', requirePermission('dashboard:view', 'carrier_portal:task_view'), async (req, res) => {
  try {
    const carrierId = req.user.linkedEntityId
    if (!carrierId) {
      return res.json({ code: 200, message: 'success', data: { stats: {}, pendingTasks: [], activeTasks: [] } })
    }

    const stats = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ASSIGNED') as pending_accept,
        COUNT(*) FILTER (WHERE status = 'IN_TRANSIT') as in_transit,
        COUNT(*) FILTER (WHERE status = 'COMPLETED' AND updated_at >= date_trunc('month', CURRENT_DATE)) as month_completed,
        COALESCE(SUM(carrier_cost) FILTER (WHERE status = 'COMPLETED' AND updated_at >= date_trunc('month', CURRENT_DATE)), 0) as month_earnings
      FROM orders WHERE carrier_id = $1
    `, [carrierId])

    const pendingTasks = await query(`
      SELECT id, order_number, business_type, transport_type, cargo_weight_kg,
             client_price, currency, pickup_date,
             pickup_address->>'city' as from_city, delivery_address->>'city' as to_city
      FROM orders WHERE carrier_id = $1 AND status = 'ASSIGNED'
      ORDER BY pickup_date ASC LIMIT 10
    `, [carrierId])

    const activeTasks = await query(`
      SELECT id, order_number, business_type, status, delivery_status,
             pickup_address->>'city' as from_city, delivery_address->>'city' as to_city
      FROM orders WHERE carrier_id = $1 AND status = 'IN_TRANSIT'
      ORDER BY updated_at DESC LIMIT 10
    `, [carrierId])

    res.json({ code: 200, message: 'success', data: { stats: stats.rows[0], pendingTasks: pendingTasks.rows, activeTasks: activeTasks.rows } })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取仪表板数据失败', data: null })
  }
})

export default router
