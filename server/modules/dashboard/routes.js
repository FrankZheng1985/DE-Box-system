/**
 * 仪表板数据聚合路由
 */

import { Router } from 'express'
import { authenticateToken, requireUserType, requirePermission, requireTenantBinding } from '../../middleware/auth.js'
import { query } from '../../core/db.js'

const router = Router()
router.use(authenticateToken)
// 门户账号必须绑定公司才能进来——绑定为空时各处的租户过滤条件会整个不加，
// 等于返回全部数据（失效方向必须是拒绝，不是放行）
router.use(requireTenantBinding)

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
        -- 昨日新增，用来算「今日 vs 昨日」的差值（原来这个差值写死是 +3）
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
                           AND created_at <  CURRENT_DATE) as yesterday_new,
        COUNT(*) FILTER (WHERE status = 'IN_TRANSIT' OR delivery_status = 'IN_TRANSIT') as in_transit,
        -- 在途且 3 天内预计到达（ETA 优先，没有 ETA 用计划送达日）
        -- ⚠️ 必须带下界 >= CURRENT_DATE：只写上界的话，ETA 已经过期的在途单
        --    也会被算成「即将到达」（生产实测 26 条在途全被算进来了）
        COUNT(*) FILTER (WHERE (status = 'IN_TRANSIT' OR delivery_status = 'IN_TRANSIT')
                           AND COALESCE(eta, delivery_date) IS NOT NULL
                           AND COALESCE(eta, delivery_date) >= CURRENT_DATE
                           AND COALESCE(eta, delivery_date) <= CURRENT_DATE + INTERVAL '3 days') as arriving_soon,
        -- 在途但预计到达日已经过去的（逾期未到），单独给一个数
        COUNT(*) FILTER (WHERE (status = 'IN_TRANSIT' OR delivery_status = 'IN_TRANSIT')
                           AND COALESCE(eta, delivery_date) IS NOT NULL
                           AND COALESCE(eta, delivery_date) < CURRENT_DATE) as overdue_in_transit,
        COUNT(*) FILTER (WHERE status = 'COMPLETED' AND created_at >= date_trunc('month', CURRENT_DATE)) as month_completed,
        -- 本月新建总数，用来算完成率（原来完成率写死是 94.2%）
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) as month_created,
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

    /**
     * 另外两条待办（原来数字是写死的假数据）
     *
     * ⚠️ 原来第一条叫「账单待确认」，但 financial_records.payment_status
     *    只有 UNPAID / PARTIAL / PAID / OVERDUE / VOID，**没有「待确认」这个状态**。
     *    改成统计真实存在的「未结清应收」，前端文案也跟着改了。
     */
    const unpaidReceivables = await query(
      `SELECT COUNT(*) as cnt FROM financial_records
       WHERE type = 'RECEIVABLE' AND payment_status IN ('UNPAID','PARTIAL','OVERDUE')`
    )
    // 资质到期口径和 utils/cron-jobs.js 的资质到期提醒保持一致（30 天内）
    const expiringCarriers = await query(
      `SELECT COUNT(*) as cnt FROM carriers
       WHERE status = 'ACTIVE'
         AND ((license_expiry   IS NOT NULL AND license_expiry   <= CURRENT_DATE + INTERVAL '30 days')
           OR (insurance_expiry IS NOT NULL AND insurance_expiry <= CURRENT_DATE + INTERVAL '30 days'))`
    )

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
          // 今日新增 - 昨日新增；可能是负数，前端按正负加号显示
          todayVsYesterday: parseInt(stats.today_new) - parseInt(stats.yesterday_new),
          inTransit: parseInt(stats.in_transit),
          arrivingSoon: parseInt(stats.arriving_soon),
          overdueInTransit: parseInt(stats.overdue_in_transit),
          monthCompleted: parseInt(stats.month_completed),
          // 本月完成 / 本月新建；本月还没建过单时给 0，别除出 NaN
          monthCompletionRate: parseInt(stats.month_created) > 0
            ? Number((parseInt(stats.month_completed) / parseInt(stats.month_created) * 100).toFixed(1))
            : 0,
          exceptions: parseInt(stats.exceptions),
          monthRevenue: revenue,
          profitMargin: revenue > 0 ? ((revenue - cost) / revenue * 100).toFixed(1) : 0
        },
        statusDistribution: statusDist.rows,
        pendingItems: {
          pendingReview: parseInt(pendingReview.rows[0].cnt),
          pendingAssign: parseInt(pendingAssign.rows[0].cnt),
          exceptions: parseInt(exceptions.rows[0].cnt),
          unpaidReceivables: parseInt(unpaidReceivables.rows[0].cnt),
          expiringCarriers: parseInt(expiringCarriers.rows[0].cnt)
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
