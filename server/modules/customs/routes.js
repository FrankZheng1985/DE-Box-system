/**
 * 清关管理路由
 * 清关状态流转 + 文件上传 + 异常标记
 */

import { Router } from 'express'
import { authenticateToken } from '../../middleware/auth.js'
import { withTransaction, query } from '../../core/db.js'
import multer from 'multer'
import fs from 'fs'
import path from 'path'

const router = Router()
router.use(authenticateToken)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

// 确保上传目录存在
const CUSTOMS_UPLOAD_DIR = '/var/www/germany-box-system/uploads/customs'
fs.mkdirSync(CUSTOMS_UPLOAD_DIR, { recursive: true })

/**
 * 清关记录列表
 */
router.get('/', async (req, res) => {
  try {
    const { status, search, page = 1, pageSize = 20 } = req.query
    let sql = `
      SELECT cc.*, o.order_number, o.delivery_address->>'city' as destination,
             c.company_name as client_name,
             (SELECT COUNT(*) FROM customs_documents cd WHERE cd.clearance_id = cc.id) as doc_count
      FROM customs_clearances cc
      LEFT JOIN orders o ON o.id = cc.order_id
      LEFT JOIN clients c ON c.id = o.client_id
      WHERE 1=1`
    const params = []; let idx = 0

    if (status) { params.push(status); sql += ` AND cc.status = $${++idx}` }
    if (search) { params.push(`%${search}%`); sql += ` AND (o.order_number ILIKE $${++idx} OR c.company_name ILIKE $${idx})` }

    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) t`, params)
    sql += ` ORDER BY cc.updated_at DESC`
    params.push(parseInt(pageSize)); sql += ` LIMIT $${++idx}`
    params.push((parseInt(page) - 1) * parseInt(pageSize)); sql += ` OFFSET $${++idx}`

    const result = await query(sql, params)
    res.json({
      code: 200, message: 'success', data: result.rows,
      pagination: { total: parseInt(countResult.rows[0].total), page: parseInt(page), pageSize: parseInt(pageSize) }
    })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取清关列表失败', data: null })
  }
})

/**
 * 清关统计
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as in_progress,
        COUNT(*) FILTER (WHERE status = 'CLEARED') as cleared,
        COUNT(*) FILTER (WHERE status = 'EXCEPTION') as exceptions
      FROM customs_clearances
    `)
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取统计失败', data: null })
  }
})

/**
 * 获取订单清关详情
 */
router.get('/:orderId', async (req, res) => {
  try {
    const clearance = await query(
      `SELECT cc.*, o.order_number FROM customs_clearances cc
       LEFT JOIN orders o ON o.id = cc.order_id
       WHERE cc.order_id = $1`, [req.params.orderId])
    if (clearance.rows.length === 0) return res.status(404).json({ code: 404, message: '清关记录不存在', data: null })

    const docs = await query(
      `SELECT * FROM customs_documents WHERE clearance_id = $1 ORDER BY uploaded_at DESC`,
      [clearance.rows[0].id])

    res.json({ code: 200, message: 'success', data: { ...clearance.rows[0], documents: docs.rows } })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取清关详情失败', data: null })
  }
})

/**
 * 更新清关状态
 * PUT /api/v1/customs/:orderId/status
 */
router.put('/:orderId/status', async (req, res) => {
  try {
    const { status, customsBroker } = req.body
    const validStatuses = ['PENDING', 'IN_PROGRESS', 'CLEARED', 'EXCEPTION']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ code: 400, message: '无效的清关状态', data: null })
    }

    await withTransaction(async (client) => {
      // upsert 清关记录
      await client.query(`
        INSERT INTO customs_clearances (order_id, status, customs_broker, cleared_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (order_id)
        DO UPDATE SET status = $2,
                      customs_broker = COALESCE($3, customs_clearances.customs_broker),
                      cleared_at = CASE WHEN $2 = 'CLEARED' THEN NOW() ELSE customs_clearances.cleared_at END,
                      updated_at = NOW()`,
        [req.params.orderId, status, customsBroker,
         status === 'CLEARED' ? new Date() : null]
      )
      // 同步更新订单
      await client.query(
        `UPDATE orders SET clearance_status = $1, updated_at = NOW() WHERE id = $2`,
        [status, req.params.orderId])
    })
    res.json({ code: 200, message: '清关状态更新成功', data: null })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 上传清关文件
 */
router.post('/:orderId/documents', upload.single('file'), async (req, res) => {
  try {
    // 确保清关记录存在
    let clearance = await query(
      `SELECT id FROM customs_clearances WHERE order_id = $1`, [req.params.orderId])
    if (clearance.rows.length === 0) {
      // 自动创建清关记录
      clearance = await query(
        `INSERT INTO customs_clearances (order_id, status) VALUES ($1, 'PENDING') RETURNING id`,
        [req.params.orderId])
    }

    // 保存上传文件到磁盘
    const originalName = req.file?.originalname || req.body.fileName || 'document'
    const safeOriginalName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filename = `${Date.now()}-${safeOriginalName}`
    const fileUrl = `/uploads/customs/${filename}`

    if (req.file?.buffer) {
      const filePath = path.join(CUSTOMS_UPLOAD_DIR, filename)
      fs.writeFileSync(filePath, req.file.buffer)
    }

    const result = await query(
      `INSERT INTO customs_documents (clearance_id, file_name, file_url, file_type, uploaded_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [clearance.rows[0].id, req.body.fileName || originalName, fileUrl, req.body.fileType, req.user.id]
    )
    res.json({ code: 200, message: '文件上传成功', data: result.rows[0] })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 获取清关文件列表
 */
router.get('/:orderId/documents', async (req, res) => {
  try {
    const clearance = await query(`SELECT id FROM customs_clearances WHERE order_id = $1`, [req.params.orderId])
    if (clearance.rows.length === 0) return res.json({ code: 200, message: 'success', data: [] })

    const result = await query(
      `SELECT cd.*, u.display_name as uploaded_by_name
       FROM customs_documents cd LEFT JOIN users u ON u.id = cd.uploaded_by
       WHERE cd.clearance_id = $1 ORDER BY cd.uploaded_at DESC`,
      [clearance.rows[0].id])
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取文件列表失败', data: null })
  }
})

/**
 * 标记清关异常
 */
router.post('/:orderId/exception', async (req, res) => {
  try {
    await withTransaction(async (client) => {
      await client.query(`
        UPDATE customs_clearances SET status = 'EXCEPTION', exception_reason = $1, updated_at = NOW()
        WHERE order_id = $2`, [req.body.reason, req.params.orderId])
      await client.query(`UPDATE orders SET clearance_status = 'EXCEPTION', updated_at = NOW() WHERE id = $1`, [req.params.orderId])
    })
    res.json({ code: 200, message: '异常已标记', data: null })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

export default router
