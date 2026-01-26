/**
 * TMS运输管理模块路由
 */

import { Router } from 'express'
import { getDatabase, generateId } from '../../config/database.js'
import { authenticateToken, requirePermission } from '../../middleware/auth.js'

const router = Router()

/**
 * 获取运输单列表
 * GET /api/tms/shipments
 */
router.get('/shipments', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, search } = req.query
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    
    const db = getDatabase()
    
    let whereClause = '1=1'
    const params = []
    
    if (status) {
      whereClause += ' AND s.status = $' + (params.length + 1)
      params.push(status)
    }
    
    if (search) {
      whereClause += ' AND (s.shipment_no ILIKE $' + (params.length + 1) + ' OR s.tracking_no ILIKE $' + (params.length + 1) + ')'
      params.push(`%${search}%`)
    }
    
    const countResult = await db.prepare(`
      SELECT COUNT(*) as total FROM tms_shipments s WHERE ${whereClause}
    `).get(...params)
    
    const list = await db.prepare(`
      SELECT s.id, s.shipment_no as "shipmentNo", s.order_id as "orderId",
             s.tracking_no as "trackingNo", s.carrier, s.status,
             s.origin, s.destination, s.estimated_delivery as "estimatedDelivery",
             s.actual_delivery as "actualDelivery", s.freight_cost as "freightCost",
             s.create_time as "createTime", s.update_time as "updateTime"
      FROM tms_shipments s
      WHERE ${whereClause}
      ORDER BY s.create_time DESC
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
    console.error('获取运输单列表失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取运输单列表失败',
      data: null,
    })
  }
})

/**
 * 获取运输单详情
 * GET /api/tms/shipments/:id
 */
router.get('/shipments/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    const shipment = await db.prepare(`
      SELECT * FROM tms_shipments WHERE id = ?
    `).get(id)
    
    if (!shipment) {
      return res.status(404).json({
        errCode: 404,
        msg: '运输单不存在',
        data: null,
      })
    }
    
    // 获取运输轨迹
    const tracks = await db.prepare(`
      SELECT * FROM tms_tracks WHERE shipment_id = ? ORDER BY track_time DESC
    `).all(id)
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: {
        ...shipment,
        tracks,
      },
    })
  } catch (error) {
    console.error('获取运输单详情失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取运输单详情失败',
      data: null,
    })
  }
})

/**
 * 创建运输单
 * POST /api/tms/shipments
 */
router.post('/shipments', authenticateToken, requirePermission('tms:operate'), async (req, res) => {
  try {
    const { orderId, carrier, origin, destination, estimatedDelivery, freightCost, remark } = req.body
    
    const db = getDatabase()
    const id = generateId('ship')
    const shipmentNo = 'TMS' + Date.now()
    
    await db.prepare(`
      INSERT INTO tms_shipments (id, shipment_no, order_id, carrier, status, origin, destination,
                                 estimated_delivery, freight_cost, remark, create_time, update_time)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, NOW(), NOW())
    `).run(id, shipmentNo, orderId, carrier, origin, destination, estimatedDelivery, freightCost, remark || null)
    
    res.json({
      errCode: 200,
      msg: '创建成功',
      data: { id, shipmentNo },
    })
  } catch (error) {
    console.error('创建运输单失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '创建运输单失败',
      data: null,
    })
  }
})

/**
 * 更新运输单状态
 * PUT /api/tms/shipments/:id/status
 */
router.put('/shipments/:id/status', authenticateToken, requirePermission('tms:operate'), async (req, res) => {
  try {
    const { id } = req.params
    const { status, trackingNo, actualDelivery } = req.body
    
    const db = getDatabase()
    
    const updates = ['status = $1', 'update_time = NOW()']
    const params = [status]
    
    if (trackingNo) {
      updates.push('tracking_no = $' + (params.length + 1))
      params.push(trackingNo)
    }
    
    if (actualDelivery) {
      updates.push('actual_delivery = $' + (params.length + 1))
      params.push(actualDelivery)
    }
    
    params.push(id)
    
    await db.prepare(`
      UPDATE tms_shipments SET ${updates.join(', ')} WHERE id = $${params.length}
    `).run(...params)
    
    res.json({
      errCode: 200,
      msg: '更新成功',
      data: null,
    })
  } catch (error) {
    console.error('更新运输单状态失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '更新运输单状态失败',
      data: null,
    })
  }
})

/**
 * 添加运输轨迹
 * POST /api/tms/shipments/:id/tracks
 */
router.post('/shipments/:id/tracks', authenticateToken, requirePermission('tms:operate'), async (req, res) => {
  try {
    const { id } = req.params
    const { location, description, trackTime } = req.body
    
    const db = getDatabase()
    const trackId = generateId('track')
    
    await db.prepare(`
      INSERT INTO tms_tracks (id, shipment_id, location, description, track_time, create_time)
      VALUES (?, ?, ?, ?, ?, NOW())
    `).run(trackId, id, location, description, trackTime || new Date().toISOString())
    
    res.json({
      errCode: 200,
      msg: '添加成功',
      data: { id: trackId },
    })
  } catch (error) {
    console.error('添加运输轨迹失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '添加运输轨迹失败',
      data: null,
    })
  }
})

/**
 * 获取运费价格列表
 * GET /api/tms/pricing
 */
router.get('/pricing', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    
    const list = await db.prepare(`
      SELECT id, carrier, origin_zone as "originZone", destination_zone as "destinationZone",
             weight_min as "weightMin", weight_max as "weightMax", price_per_kg as "pricePerKg",
             min_price as "minPrice", currency, status,
             create_time as "createTime", update_time as "updateTime"
      FROM tms_pricing
      WHERE status = 'active'
      ORDER BY carrier, origin_zone, destination_zone
    `).all()
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: list,
    })
  } catch (error) {
    console.error('获取运费价格失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取运费价格失败',
      data: null,
    })
  }
})

export default router
