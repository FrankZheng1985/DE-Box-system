/**
 * CMR 单据管理路由
 * CMR 上传/签署状态/货损标记/下载
 */

import { Router } from 'express'
import { authenticateToken } from '../../middleware/auth.js'
import { withTransaction, query } from '../../core/db.js'
import { documentEngine, documentFlow, notificationEngine, NOTIFICATION_TYPES } from '../../core/index.js'
import multer from 'multer'
import { uploadToOSS } from '../../utils/oss-service.js'
import fs from 'fs'
import path from 'path'

const router = Router()
router.use(authenticateToken)

// 确保上传目录存在
const CMR_UPLOAD_DIR = '/var/www/germany-box-system/uploads/cmr'
fs.mkdirSync(CMR_UPLOAD_DIR, { recursive: true })

// 文件上传配置
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    cb(null, allowed.includes(file.mimetype))
  }
})

/**
 * CMR 列表
 */
router.get('/', async (req, res) => {
  try {
    const { signStatus, orderId, search, page = 1, pageSize = 20 } = req.query
    let sql = `
      SELECT cmr.*, o.order_number, c.company_name as client_name,
             o.pickup_address->>'city' as from_city, o.delivery_address->>'city' as to_city,
             u.display_name as uploaded_by_name
      FROM cmr_documents cmr
      LEFT JOIN orders o ON o.id = cmr.order_id
      LEFT JOIN clients c ON c.id = o.client_id
      LEFT JOIN users u ON u.id = cmr.uploaded_by
      WHERE 1=1`
    const params = []; let idx = 0

    if (signStatus) { params.push(signStatus); sql += ` AND cmr.sign_status = $${++idx}` }
    if (orderId) { params.push(orderId); sql += ` AND cmr.order_id = $${++idx}` }
    if (search) { params.push(`%${search}%`); sql += ` AND (cmr.cmr_number ILIKE $${++idx} OR o.order_number ILIKE $${idx})` }

    // 承运商/客户只能看自己订单的 CMR（按登录身份强制过滤，不信任前端传参）
    const userType = req.user.userType || req.user.roleCode
    if (userType === 'CARRIER') {
      params.push(req.user.linkedEntityId); sql += ` AND o.carrier_id = $${++idx}`
    } else if (userType === 'CLIENT') {
      params.push(req.user.linkedEntityId); sql += ` AND o.client_id = $${++idx}`
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) t`, params)
    sql += ` ORDER BY cmr.uploaded_at DESC`
    params.push(parseInt(pageSize)); sql += ` LIMIT $${++idx}`
    params.push((parseInt(page) - 1) * parseInt(pageSize)); sql += ` OFFSET $${++idx}`

    const result = await query(sql, params)
    res.json({
      code: 200, message: 'success', data: result.rows,
      pagination: { total: parseInt(countResult.rows[0].total), page: parseInt(page), pageSize: parseInt(pageSize) }
    })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取CMR列表失败', data: null })
  }
})

/**
 * CMR 统计
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE sign_status = 'COMPLETED') as completed,
        COUNT(*) FILTER (WHERE sign_status IN ('UNSIGNED', 'SENDER_SIGNED', 'RECEIVER_SIGNED')) as pending,
        COUNT(*) FILTER (WHERE has_damage_note = true) as damaged
      FROM cmr_documents
    `)
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取统计失败', data: null })
  }
})

/**
 * CMR 详情
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT cmr.*, o.order_number, c.company_name as client_name
       FROM cmr_documents cmr
       LEFT JOIN orders o ON o.id = cmr.order_id
       LEFT JOIN clients c ON c.id = o.client_id
       WHERE cmr.id = $1`, [req.params.id])
    if (result.rows.length === 0) return res.status(404).json({ code: 404, message: 'CMR不存在', data: null })
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取CMR详情失败', data: null })
  }
})

/**
 * 上传 CMR（承运商操作）
 * POST /api/v1/cmr/upload
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const cmr = await withTransaction(async (client) => {
      // 创建凭证
      const doc = await documentEngine.createDocument(client, {
        docType: 'CMR', companyCode: 'DE01', postingDate: new Date(),
        headerText: `CMR上传 - 订单 ${req.body.orderId}`,
        createdBy: req.user.id
      })

      // 查询订单信息（用于文件目录组织）
      const orderInfo = await client.query(
        `SELECT order_number, container_no FROM orders WHERE id = $1`, [req.body.orderId]
      )
      const orderNumber = orderInfo.rows[0]?.order_number || 'unknown'
      const containerNo = orderInfo.rows[0]?.container_no || ''

      // 文件路径：按订单号/柜号组织
      // 例如：cmr/EU-20260410-0001/CMR-xxx.pdf
      // 或者：cmr/EU-20260410-0001_MSCU1234567/CMR-xxx.pdf
      const originalName = req.file?.originalname || `${doc.docNumber}.pdf`
      const safeOriginalName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
      const folderName = containerNo ? `${orderNumber}_${containerNo}` : orderNumber
      const filename = `${doc.docNumber}-${safeOriginalName}`
      const ossPath = `cmr/${folderName}/${filename}`
      let fileUrl = `/uploads/cmr/${filename}`

      if (req.file?.buffer) {
        try {
          const ossResult = await uploadToOSS(req.file.buffer, ossPath)
          if (ossResult) {
            fileUrl = ossResult.url
          } else {
            // OSS 未配置，存本地（本地不建子目录，保持简单）
            const filePath = path.join(CMR_UPLOAD_DIR, filename)
            fs.writeFileSync(filePath, req.file.buffer)
          }
        } catch (ossErr) {
          console.warn('[CMR] OSS 上传失败，回退到本地:', ossErr.message)
          const filePath = path.join(CMR_UPLOAD_DIR, filename)
          fs.writeFileSync(filePath, req.file.buffer)
        }
      }

      const result = await client.query(
        `INSERT INTO cmr_documents
         (document_id, order_id, cmr_number, file_url, file_type, sign_status, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, 'UNSIGNED', $6)
         RETURNING *`,
        [doc.id, req.body.orderId, req.body.cmrNumber || doc.docNumber,
         fileUrl, req.body.fileType || 'PDF', req.user.id]
      )

      // 更新单据流：订单 → CMR
      const order = await client.query(
        `SELECT document_id, order_number FROM orders WHERE id = $1`, [req.body.orderId]
      )
      if (order.rows[0]?.document_id) {
        await documentFlow.createFlowLink(client, {
          precedingDocType: 'ORD', precedingDocId: order.rows[0].document_id,
          subsequentDocType: 'CMR', subsequentDocId: doc.id,
          flowType: 'ORDER_TO_CMR'
        })
      }

      // CMR 上传通知运营（承运商在门户传的 CMR 运营第一时间能看到）
      try {
        const operators = await client.query(
          `SELECT id FROM users WHERE user_type = 'OPERATOR' AND is_active = true`
        )
        if (operators.rows.length > 0) {
          await notificationEngine.notify(client, {
            userIds: operators.rows.map(u => u.id),
            type: NOTIFICATION_TYPES.CMR_UPLOADED,
            title: `订单 ${orderNumber} 的 CMR 已上传`,
            message: `CMR ${result.rows[0].cmr_number} 已上传，请及时核对签署状态`,
            relatedOrderId: req.body.orderId
          })
        }
      } catch (notifyErr) {
        console.warn('CMR 上传通知发送失败（不影响主流程）:', notifyErr.message)
      }

      return result.rows[0]
    })
    res.json({ code: 200, message: 'CMR上传成功', data: cmr })
  } catch (error) {
    console.error('CMR上传失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 更新签署状态
 * PUT /api/v1/cmr/:id/sign-status
 */
router.put('/:id/sign-status', async (req, res) => {
  try {
    const { signStatus } = req.body
    const validStatuses = ['UNSIGNED', 'SENDER_SIGNED', 'RECEIVER_SIGNED', 'COMPLETED']
    if (!validStatuses.includes(signStatus)) {
      return res.status(400).json({ code: 400, message: '无效的签署状态', data: null })
    }
    await query(`UPDATE cmr_documents SET sign_status = $1 WHERE id = $2`, [signStatus, req.params.id])
    res.json({ code: 200, message: '签署状态更新成功', data: null })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 标记货损
 */
router.put('/:id/damage', async (req, res) => {
  try {
    await query(
      `UPDATE cmr_documents SET has_damage_note = true, damage_note = $1 WHERE id = $2`,
      [req.body.damageNote, req.params.id])
    res.json({ code: 200, message: '货损标记成功', data: null })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

export default router
