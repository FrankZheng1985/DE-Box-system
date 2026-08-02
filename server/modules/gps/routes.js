/**
 * GPS 追踪模块路由
 * GPS 位置上报/查询/在途车辆/异常预警
 */

import { Router } from 'express'
import { authenticateToken, requireUserType, requirePermission } from '../../middleware/auth.js'
import { query } from '../../core/db.js'

const router = Router()
router.use(authenticateToken)

/**
 * 租户隔离（P5）：以前 GPS 接口谁登录谁都能查、能报，
 * 客户门户账号能看到全部在途车辆（含别家客户的订单和承运商名），
 * 承运商账号也能给不是自己承运的订单塞轨迹点。
 *
 * @param {object} user req.user
 * @param {string} orderId 订单 UUID
 * @returns {Promise<boolean>} 该用户是否有权访问这条订单的 GPS
 */
async function canAccessOrderGps(user, orderId) {
  const userType = user.userType || user.roleCode
  if (userType !== 'CLIENT' && userType !== 'CARRIER') return true
  if (!user.linkedEntityId) return false

  const column = userType === 'CLIENT' ? 'client_id' : 'carrier_id'
  const result = await query(
    `SELECT 1 FROM orders WHERE id = $1 AND ${column} = $2`,
    [orderId, user.linkedEntityId]
  )
  return result.rows.length > 0
}

/**
 * 上报 GPS 位置（承运商操作）
 * POST /api/v1/gps/report
 */
router.post('/report', requirePermission('gps:manage', 'carrier_portal:gps_report'), async (req, res) => {
  try {
    const { orderId, latitude, longitude, city, country, speedKmh, status, remarks, source } = req.body
    if (!orderId) return res.status(400).json({ code: 400, message: 'orderId 不能为空', data: null })

    if (!(await canAccessOrderGps(req.user, orderId))) {
      return res.status(403).json({ code: 403, message: '无权上报该订单的位置', data: null })
    }

    const result = await query(
      `INSERT INTO gps_tracking
       (order_id, latitude, longitude, city, country, speed_kmh, status, remarks, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [orderId, latitude, longitude, city, country, speedKmh, status, remarks, source || 'MANUAL']
    )
    res.json({ code: 200, message: 'GPS位置上报成功', data: result.rows[0] })
  } catch (error) {
    console.error('GPS上报失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 获取订单最新位置
 * GET /api/v1/gps/latest/:orderId
 */
router.get('/latest/:orderId', requirePermission('gps:view', 'portal:order_view', 'carrier_portal:task_view'), async (req, res) => {
  try {
    if (!(await canAccessOrderGps(req.user, req.params.orderId))) {
      return res.status(403).json({ code: 403, message: '无权查看该订单的位置', data: null })
    }
    const result = await query(
      `SELECT * FROM gps_tracking WHERE order_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [req.params.orderId]
    )
    res.json({ code: 200, message: 'success', data: result.rows[0] || null })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取GPS位置失败', data: null })
  }
})

/**
 * 获取订单 GPS 历史轨迹
 * GET /api/v1/gps/history/:orderId
 */
router.get('/history/:orderId', requirePermission('gps:view', 'portal:order_view', 'carrier_portal:task_view'), async (req, res) => {
  try {
    if (!(await canAccessOrderGps(req.user, req.params.orderId))) {
      return res.status(403).json({ code: 403, message: '无权查看该订单的轨迹', data: null })
    }
    const result = await query(
      `SELECT * FROM gps_tracking WHERE order_id = $1 ORDER BY recorded_at ASC`,
      [req.params.orderId]
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取GPS历史失败', data: null })
  }
})

/**
 * 获取所有在途车辆位置
 * GET /api/v1/gps/active
 */
router.get('/active', requirePermission('gps:view', 'portal:order_view', 'carrier_portal:task_view'), async (req, res) => {
  try {
    const userType = req.user.userType || req.user.roleCode
    const params = []
    let tenantSql = ''
    if (userType === 'CLIENT' && req.user.linkedEntityId) {
      params.push(req.user.linkedEntityId)
      tenantSql = ` AND o.client_id = $${params.length}`
    } else if (userType === 'CARRIER' && req.user.linkedEntityId) {
      params.push(req.user.linkedEntityId)
      tenantSql = ` AND o.carrier_id = $${params.length}`
    }

    const result = await query(`
      SELECT DISTINCT ON (o.id)
        o.id as order_id, o.order_number, o.business_type,
        o.pickup_address->>'city' as from_city,
        o.delivery_address->>'city' as to_city,
        cr.company_name as carrier_name,
        g.latitude, g.longitude, g.city, g.country,
        g.speed_kmh, g.status as gps_status, g.recorded_at
      FROM orders o
      JOIN gps_tracking g ON g.order_id = o.id
      LEFT JOIN carriers cr ON cr.id = o.carrier_id
      WHERE (o.status = 'IN_TRANSIT' OR o.delivery_status = 'IN_TRANSIT')${tenantSql}
      ORDER BY o.id, g.recorded_at DESC
    `, params)
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取在途车辆失败', data: null })
  }
})

/**
 * 获取异常预警（长时间无更新的在途订单）
 * GET /api/v1/gps/alerts
 */
router.get('/alerts', requireUserType('OPERATOR'), requirePermission('gps:view'), async (req, res) => {
  try {
    // 在途订单超过 6 小时无 GPS 更新的
    const result = await query(`
      SELECT o.id as order_id, o.order_number,
             o.pickup_address->>'city' as from_city,
             o.delivery_address->>'city' as to_city,
             cr.company_name as carrier_name,
             g.latitude, g.longitude, g.city as last_city,
             g.recorded_at as last_update,
             EXTRACT(EPOCH FROM (NOW() - g.recorded_at)) / 3600 as hours_since_update
      FROM orders o
      LEFT JOIN LATERAL (
        SELECT * FROM gps_tracking WHERE order_id = o.id ORDER BY recorded_at DESC LIMIT 1
      ) g ON true
      LEFT JOIN carriers cr ON cr.id = o.carrier_id
      WHERE (o.status = 'IN_TRANSIT' OR o.delivery_status = 'IN_TRANSIT')
        AND (g.recorded_at IS NULL OR g.recorded_at < NOW() - INTERVAL '6 hours')
      ORDER BY g.recorded_at ASC NULLS FIRST
    `)
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取异常预警失败', data: null })
  }
})

export default router
