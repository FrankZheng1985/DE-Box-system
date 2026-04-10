/**
 * 询价管理路由
 * 客户发起询价，运营接收后创建报价
 */

import { Router } from 'express'
import { authenticateToken } from '../../middleware/auth.js'
import { withTransaction, query } from '../../core/db.js'
import { documentEngine, changeTracker } from '../../core/index.js'

const router = Router()
router.use(authenticateToken)

/**
 * 询价列表
 * GET /api/v1/inquiries
 */
router.get('/', async (req, res) => {
  try {
    const { status, clientId, businessType, page = 1, pageSize = 20 } = req.query
    let sql = `
      SELECT i.*, c.company_name as client_name
      FROM inquiries i
      LEFT JOIN clients c ON c.id = i.client_id
      WHERE 1=1`
    const params = []
    let idx = 0

    // 客户端只能看自己的询价
    if (req.user.userType === 'CLIENT' && req.user.linkedEntityId) {
      params.push(req.user.linkedEntityId)
      sql += ` AND i.client_id = $${++idx}`
    } else if (clientId) {
      params.push(clientId)
      sql += ` AND i.client_id = $${++idx}`
    }
    if (status) { params.push(status); sql += ` AND i.status = $${++idx}` }
    if (businessType) { params.push(businessType); sql += ` AND i.business_type = $${++idx}` }

    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) t`, params)
    sql += ` ORDER BY i.created_at DESC`
    params.push(parseInt(pageSize)); sql += ` LIMIT $${++idx}`
    params.push((parseInt(page) - 1) * parseInt(pageSize)); sql += ` OFFSET $${++idx}`

    const result = await query(sql, params)
    res.json({
      code: 200, message: 'success', data: result.rows,
      pagination: { total: parseInt(countResult.rows[0].total), page: parseInt(page), pageSize: parseInt(pageSize) }
    })
  } catch (error) {
    console.error('获取询价列表失败:', error)
    res.status(500).json({ code: 500, message: '获取询价列表失败', data: null })
  }
})

/**
 * 询价详情
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT i.*, c.company_name as client_name
       FROM inquiries i LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.id = $1`, [req.params.id])
    if (result.rows.length === 0) return res.status(404).json({ code: 404, message: '询价不存在', data: null })
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取询价详情失败', data: null })
  }
})

/**
 * 创建询价（客户操作）
 * POST /api/v1/inquiries
 */
router.post('/', async (req, res) => {
  try {
    const inquiry = await withTransaction(async (client) => {
      const doc = await documentEngine.createDocument(client, {
        docType: 'INQ', companyCode: 'DE01',
        postingDate: new Date(),
        headerText: `询价 - ${req.body.businessType}`,
        createdBy: req.user.id
      })

      const result = await client.query(
        `INSERT INTO inquiries
         (document_id, inquiry_number, client_id, business_type, transport_type,
          route_from, route_to, cargo_description, cargo_weight_kg,
          cargo_volume_m3, cargo_quantity, special_requirements,
          pod, container_type, remarks, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *`,
        [doc.id, doc.docNumber,
         req.body.clientId || req.user.linkedEntityId,
         req.body.businessType, req.body.transportType,
         JSON.stringify(req.body.routeFrom), JSON.stringify(req.body.routeTo),
         req.body.cargoDescription, req.body.cargoWeightKg,
         req.body.cargoVolumeM3, req.body.cargoQuantity,
         req.body.specialRequirements, req.body.pod, req.body.containerType,
         req.body.remarks, 'PENDING_QUOTE']
      )
      return result.rows[0]
    })
    res.json({ code: 200, message: '询价创建成功', data: inquiry })
  } catch (error) {
    console.error('创建询价失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 编辑询价
 */
router.put('/:id', async (req, res) => {
  try {
    await withTransaction(async (client) => {
      const old = await client.query(`SELECT * FROM inquiries WHERE id = $1`, [req.params.id])
      if (old.rows.length === 0) throw new Error('询价不存在')
      if (old.rows[0].status !== 'PENDING_QUOTE') throw new Error('当前状态不允许编辑')

      const fields = {}
      const map = {
        cargoDescription: 'cargo_description', cargoWeightKg: 'cargo_weight_kg',
        cargoVolumeM3: 'cargo_volume_m3', cargoQuantity: 'cargo_quantity',
        specialRequirements: 'special_requirements', remarks: 'remarks'
      }
      for (const [camel, snake] of Object.entries(map)) {
        if (req.body[camel] !== undefined) fields[snake] = req.body[camel]
      }
      if (req.body.routeFrom) fields.route_from = JSON.stringify(req.body.routeFrom)
      if (req.body.routeTo) fields.route_to = JSON.stringify(req.body.routeTo)

      const setClauses = []; const params = []; let idx = 0
      for (const [k, v] of Object.entries(fields)) {
        params.push(v); setClauses.push(`${k} = $${++idx}`)
      }
      params.push(req.params.id); setClauses.push('updated_at = NOW()')
      await client.query(`UPDATE inquiries SET ${setClauses.join(', ')} WHERE id = $${++idx}`, params)
    })
    res.json({ code: 200, message: '询价更新成功', data: null })
  } catch (error) {
    res.status(400).json({ code: 400, message: error.message, data: null })
  }
})

/**
 * 删除询价（仅待报价状态）
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await query(`SELECT status FROM inquiries WHERE id = $1`, [req.params.id])
    if (result.rows.length === 0) return res.status(404).json({ code: 404, message: '询价不存在', data: null })
    if (result.rows[0].status !== 'PENDING_QUOTE') {
      return res.status(400).json({ code: 400, message: '仅待报价状态的询价可以删除', data: null })
    }
    await query(`DELETE FROM inquiries WHERE id = $1`, [req.params.id])
    res.json({ code: 200, message: '询价已删除', data: null })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

export default router
