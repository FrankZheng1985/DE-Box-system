/**
 * 船司放单管理路由
 * 5个放单状态：无需放单 / 正本待邮寄 / 正本已邮寄 / 待放行 / 船司放行
 */

import { Router } from 'express'
import { authenticateToken, requireUserType, requirePermission } from '../../middleware/auth.js'
import { withTransaction, query } from '../../core/db.js'
import { documentEngine, notificationEngine, NOTIFICATION_TYPES } from '../../core/index.js'

const router = Router()
router.use(authenticateToken)

// ⚠️ 安全收紧（P5）：船司放单是纯运营内部流程，两个门户都不调用，
//    以前只挂 authenticateToken，客户/承运商账号也能访问。
router.use(requireUserType('OPERATOR'))

/**
 * 放单记录列表
 */
router.get('/', requirePermission('shipping_release:view'), async (req, res) => {
  try {
    const { releaseStatus, search, page = 1, pageSize = 20 } = req.query
    let sql = `
      SELECT sr.*, o.order_number, o.shipping_line, o.bl_number, o.container_no,
             c.company_name as client_name
      FROM shipping_releases sr
      LEFT JOIN orders o ON o.id = sr.order_id
      LEFT JOIN clients c ON c.id = o.client_id
      WHERE 1=1`
    const params = []; let idx = 0

    if (releaseStatus) { params.push(releaseStatus); sql += ` AND sr.release_status = $${++idx}` }
    if (search) {
      params.push(`%${search}%`)
      sql += ` AND (o.order_number ILIKE $${++idx} OR o.bl_number ILIKE $${idx} OR o.container_no ILIKE $${idx})`
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) t`, params)
    sql += ` ORDER BY sr.updated_at DESC`
    params.push(parseInt(pageSize)); sql += ` LIMIT $${++idx}`
    params.push((parseInt(page) - 1) * parseInt(pageSize)); sql += ` OFFSET $${++idx}`

    const result = await query(sql, params)
    res.json({
      code: 200, message: 'success', data: result.rows,
      pagination: { total: parseInt(countResult.rows[0].total), page: parseInt(page), pageSize: parseInt(pageSize) }
    })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取放单列表失败', data: null })
  }
})

/**
 * 放单统计
 */
router.get('/stats', requirePermission('shipping_release:view'), async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE release_status = 'NOT_REQUIRED') as not_required,
        COUNT(*) FILTER (WHERE release_status = 'ORIGINAL_PENDING') as original_pending,
        COUNT(*) FILTER (WHERE release_status = 'ORIGINAL_SENT') as original_sent,
        COUNT(*) FILTER (WHERE release_status = 'PENDING_RELEASE') as pending_release,
        COUNT(*) FILTER (WHERE release_status = 'RELEASED') as released
      FROM shipping_releases
    `)
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取统计失败', data: null })
  }
})

/**
 * 获取订单放单详情
 */
router.get('/:orderId', requirePermission('shipping_release:view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT sr.*, o.order_number, o.shipping_line, o.bl_number,
              u.display_name as authorized_by_name
       FROM shipping_releases sr
       LEFT JOIN orders o ON o.id = sr.order_id
       LEFT JOIN users u ON u.id = sr.authorized_by
       WHERE sr.order_id = $1`, [req.params.orderId])
    if (result.rows.length === 0) return res.status(404).json({ code: 404, message: '放单记录不存在', data: null })
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取放单详情失败', data: null })
  }
})

/**
 * 更新放单状态
 * PUT /api/v1/shipping-releases/:orderId/status
 */
router.put('/:orderId/status', requirePermission('shipping_release:manage'), async (req, res) => {
  try {
    const { releaseStatus, courierService, courierAddress, releaseValidUntil } = req.body
    const validStatuses = ['NOT_REQUIRED', 'ORIGINAL_PENDING', 'ORIGINAL_SENT', 'PENDING_RELEASE', 'RELEASED']
    if (!validStatuses.includes(releaseStatus)) {
      return res.status(400).json({ code: 400, message: '无效的放单状态', data: null })
    }

    await withTransaction(async (client) => {
      // upsert 放单记录
      await client.query(`
        INSERT INTO shipping_releases (order_id, release_status, courier_service, courier_address, release_valid_until)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (order_id)
        DO UPDATE SET release_status = $2, courier_service = COALESCE($3, shipping_releases.courier_service),
                      courier_address = COALESCE($4, shipping_releases.courier_address),
                      release_valid_until = COALESCE($5, shipping_releases.release_valid_until),
                      updated_at = NOW()`,
        [req.params.orderId, releaseStatus, courierService, courierAddress, releaseValidUntil]
      )

      // 同步更新订单表的放单状态
      await client.query(
        `UPDATE orders SET release_status = $1, updated_at = NOW() WHERE id = $2`,
        [releaseStatus, req.params.orderId]
      )
    })
    res.json({ code: 200, message: '放单状态更新成功', data: null })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 客户授权放行
 * POST /api/v1/shipping-releases/:orderId/authorize
 */
router.post('/:orderId/authorize', requirePermission('shipping_release:manage'), async (req, res) => {
  try {
    await withTransaction(async (client) => {
      await client.query(`
        UPDATE shipping_releases
        SET release_status = 'RELEASED', authorized_by = $1, authorized_at = NOW(), updated_at = NOW()
        WHERE order_id = $2 AND release_status = 'PENDING_RELEASE'`,
        [req.user.id, req.params.orderId]
      )
      await client.query(
        `UPDATE orders SET release_status = 'RELEASED', updated_at = NOW() WHERE id = $1`,
        [req.params.orderId]
      )
    })
    res.json({ code: 200, message: '授权放行成功', data: null })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

export default router
