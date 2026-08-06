/**
 * 订单管理路由
 * 14 个 API 端点
 */

import { Router } from 'express'
import ExcelJS from 'exceljs'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { authenticateToken, requireUserType, requirePermission, requireTenantBinding } from '../../middleware/auth.js'
import { getPool, withTransaction } from '../../core/db.js'
import { notificationEngine, NOTIFICATION_TYPES } from '../../core/index.js'
import { resolveLang, t } from '../../utils/i18n.js'
import { uploadToOSS, deleteFromOSS } from '../../utils/oss-service.js'
import orderController from './controller.js'
import { orderService, BUSINESS_TYPE_LABELS, getStatusLabel } from './service.js'
import importService from './import-service.js'

const router = Router()

// 所有订单路由需要认证
router.use(authenticateToken)
// 门户账号必须绑定公司才能进来——绑定为空时各处的租户过滤条件会整个不加，
// 等于返回全部数据（失效方向必须是拒绝，不是放行）
router.use(requireTenantBinding)

// 订单是三端共用的资源，同一个接口三种身份都会调，
// 所以权限码写成"任意一个满足即可"：
//   运营 order:*  /  客户门户 portal:*  /  承运商门户 carrier_portal:*
// 至于"能看到哪些订单"，由 controller 按登录身份强制收窄（见 controller.js 的租户隔离）
const CAN_VIEW_ORDER = ['order:view', 'portal:order_view', 'carrier_portal:task_view']

// ==================== 订单文件中心（需求 3） ====================

// 本地回退目录（OSS 不可用时；与 CMR 模块同一套约定）
const ORDER_FILES_UPLOAD_DIR = '/var/www/germany-box-system/uploads/orders'
try {
  fs.mkdirSync(ORDER_FILES_UPLOAD_DIR, { recursive: true })
} catch {
  // 本地开发机可能没有 /var/www 写权限；OSS 正常时用不到这个目录
}

// 文件上传配置（与 CMR 模块一致：内存存储，20MB，PDF/JPG/PNG/WebP）
const orderFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    cb(null, allowed.includes(file.mimetype))
  }
})

/**
 * 批量导入的文件接收器
 *
 * 用内存存储：文件解析完就没用了，不落盘（订单附件才需要留存）。
 */
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: importService.MAX_FILE_SIZE, files: 1 },
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 校验导入请求，取出「导给哪个客户 + 哪个运输产品」
 *
 * ⚠️ 客户门户一律用 JWT 里的绑定客户，忽略前端传的 clientId ——
 *    否则登录一个客户就能给别的客户造单（踩坑 016 / 023 同族）。
 *
 * @returns {{clientId: string, businessType: string}|null} 已经回过响应时返回 null
 */
function resolveImportContext(req, res) {
  const businessType = String(req.body?.businessType || '').toUpperCase()
  if (!importService.IMPORT_BUSINESS_TYPES.includes(businessType)) {
    res.status(400).json({
      code: 400,
      message: `请指定运输产品，允许值：${importService.IMPORT_BUSINESS_TYPES.join(' / ')}`,
      data: null,
    })
    return null
  }

  if (!req.file) {
    res.status(400).json({ code: 400, message: '请选择要导入的 Excel 文件', data: null })
    return null
  }

  const userType = req.user.userType || req.user.roleCode
  if (userType === 'CLIENT') {
    return { clientId: req.user.linkedEntityId, businessType }
  }

  const clientId = req.body?.clientId
  if (!clientId) {
    res.status(400).json({ code: 400, message: '请先选择要导入到哪个客户', data: null })
    return null
  }
  if (!UUID_RE.test(String(clientId))) {
    res.status(400).json({ code: 400, message: '客户 clientId 格式不正确', data: null })
    return null
  }
  return { clientId: String(clientId), businessType }
}

/** 解析结果 → 前端要的结构（预览和导入失败共用，两边看到的一模一样） */
function buildPreviewPayload(result, businessType) {
  return {
    businessType,
    totalRows: result.totalRows,
    orderCount: result.orders.length,
    orders: result.orders.map((o) => ({ rowNumber: o.rowNumber, ...o.payload })),
    errors: result.errors,
    warnings: result.warnings,
  }
}

/**
 * 批量导入成功后给操作员发一条汇总通知
 *
 * 走独立连接（导入事务已经提交），发失败不影响导入结果 —— 单子已经进库了，
 * 这里再抛错会让前端以为导入失败又去导一遍。
 */
async function notifyBatchImported(created, businessType) {
  if (created.length === 0) return
  try {
    const pool = getPool()
    const operators = await pool.query(
      `SELECT id FROM users WHERE user_type = 'OPERATOR' AND is_active = true`
    )
    if (operators.rows.length === 0) return

    const productLabel = BUSINESS_TYPE_LABELS[businessType] || businessType
    await notificationEngine.notify(pool, {
      userIds: operators.rows.map((u) => u.id),
      type: NOTIFICATION_TYPES.STATUS_UPDATE,
      title: `批量导入 ${created.length} 张订单`,
      message: `${productLabel}：批量导入 ${created.length} 张订单（${created[0].orderNumber} 等），请及时审核`,
      titleKey: 'notify.orderBatchImportTitle',
      messageKey: 'notify.orderBatchImportMessage',
      payload: { count: created.length, product: productLabel, orderNo: created[0].orderNumber },
      relatedOrderId: created[0].id,
    })
  } catch (error) {
    console.warn('批量导入汇总通知发送失败（不影响导入结果）:', error.message)
  }
}

const FILE_CATEGORIES = ['LOADING_PHOTO', 'CMR', 'POD_PROOF', 'OTHER']

const MIME_TO_FILE_TYPE = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
}

/**
 * 校验当前用户是否有权访问该订单（客户/承运商只能看自己的）
 * @returns {Promise<object|null>} 有权限时返回订单行，无权限/不存在返回 null 并已写响应
 */
async function loadOrderWithAccessCheck(orderId, user, res) {
  const pool = getPool()
  const result = await pool.query(
    `SELECT id, order_number, container_no, client_id, carrier_id FROM orders WHERE id = $1`,
    [orderId]
  )
  if (result.rows.length === 0) {
    res.status(404).json({ code: 404, message: '订单不存在', data: null })
    return null
  }
  const order = result.rows[0]
  const userType = user.userType || user.roleCode
  if (userType === 'CLIENT' && order.client_id !== user.linkedEntityId) {
    res.status(403).json({ code: 403, message: '无权访问该订单的文件', data: null })
    return null
  }
  if (userType === 'CARRIER' && order.carrier_id !== user.linkedEntityId) {
    res.status(403).json({ code: 403, message: '无权访问该订单的文件', data: null })
    return null
  }
  return order
}

/**
 * 订单文件列表（order_files + cmr_documents 统一视图）
 * GET /api/v1/orders/:id/files
 */
router.get('/:id/files', requirePermission(...CAN_VIEW_ORDER, 'portal:file_download'), async (req, res) => {
  try {
    const order = await loadOrderWithAccessCheck(req.params.id, req.user, res)
    if (!order) return

    const pool = getPool()
    const [files, cmrDocs] = await Promise.all([
      pool.query(
        `SELECT f.id, f.file_category, f.file_name, f.file_url, f.file_type,
                f.file_size_bytes, f.remarks, f.uploaded_at,
                u.display_name AS uploaded_by_name
         FROM order_files f
         LEFT JOIN users u ON u.id = f.uploaded_by
         WHERE f.order_id = $1
         ORDER BY f.uploaded_at DESC`,
        [order.id]
      ),
      pool.query(
        `SELECT cmr.id, cmr.cmr_number, cmr.file_url, cmr.file_type,
                cmr.sign_status, cmr.has_damage_note, cmr.uploaded_at,
                u.display_name AS uploaded_by_name
         FROM cmr_documents cmr
         LEFT JOIN users u ON u.id = cmr.uploaded_by
         WHERE cmr.order_id = $1
         ORDER BY cmr.uploaded_at DESC`,
        [order.id]
      ),
    ])

    // 统一成一个数组：CMR 单据来自 cmr_documents（签署状态是它的专属价值），
    // 只在这里聚合展示，不复制进 order_files
    const unified = [
      ...files.rows.map((f) => ({ ...f, source: 'ORDER_FILE' })),
      ...cmrDocs.rows.map((c) => ({
        id: c.id,
        file_category: 'CMR',
        file_name: c.cmr_number || 'CMR',
        file_url: c.file_url,
        file_type: c.file_type,
        file_size_bytes: null,
        remarks: null,
        uploaded_at: c.uploaded_at,
        uploaded_by_name: c.uploaded_by_name,
        sign_status: c.sign_status,
        has_damage_note: c.has_damage_note,
        source: 'CMR_DOC',
      })),
    ].sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))

    res.json({ code: 200, message: 'success', data: unified })
  } catch (error) {
    console.error('获取订单文件失败:', error)
    res.status(500).json({ code: 500, message: '获取订单文件失败', data: null })
  }
})

/**
 * 上传订单文件（装车图/签收凭证/其他；CMR 请走 /cmr/upload 以保留签署状态跟踪）
 * POST /api/v1/orders/:id/files
 */
router.post('/:id/files', requirePermission('order:file_upload', 'carrier_portal:cmr_upload'), orderFileUpload.single('file'), async (req, res) => {
  try {
    const order = await loadOrderWithAccessCheck(req.params.id, req.user, res)
    if (!order) return

    const category = req.body.fileCategory || 'OTHER'
    if (!FILE_CATEGORIES.includes(category)) {
      return res.status(400).json({ code: 400, message: `无效的文件类别: ${category}`, data: null })
    }
    if (category === 'CMR') {
      return res.status(400).json({ code: 400, message: 'CMR 请通过 /cmr/upload 上传（需要跟踪签署状态）', data: null })
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ code: 400, message: '未选择文件或文件类型不支持（仅 PDF/JPG/PNG/WebP，20MB 以内）', data: null })
    }

    // 文件路径：orders/{订单号}_{柜号}/{时间戳}-{原文件名}
    const safeName = (req.file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
    const folderName = order.container_no
      ? `${order.order_number}_${order.container_no}`
      : order.order_number
    const filename = `${Date.now()}-${safeName}`
    const ossPath = `orders/${folderName}/${filename}`

    let fileUrl = `/uploads/orders/${filename}`
    let storedOssPath = null
    try {
      const ossResult = await uploadToOSS(req.file.buffer, ossPath)
      if (ossResult) {
        fileUrl = ossResult.url
        storedOssPath = ossResult.ossPath
      } else {
        fs.writeFileSync(path.join(ORDER_FILES_UPLOAD_DIR, filename), req.file.buffer)
      }
    } catch (ossErr) {
      console.warn('[订单文件] OSS 上传失败，回退到本地:', ossErr.message)
      fs.writeFileSync(path.join(ORDER_FILES_UPLOAD_DIR, filename), req.file.buffer)
    }

    const pool = getPool()
    const result = await pool.query(
      `INSERT INTO order_files
       (order_id, file_category, file_name, file_url, oss_path, file_type, file_size_bytes, remarks, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [order.id, category, safeName, fileUrl, storedOssPath,
       MIME_TO_FILE_TYPE[req.file.mimetype] || 'PDF', req.file.size,
       req.body.remarks || null, req.user.id]
    )

    res.json({ code: 200, message: '文件上传成功', data: result.rows[0] })
  } catch (error) {
    console.error('上传订单文件失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 删除订单文件（仅运营；CMR 单据不在此删除）
 * DELETE /api/v1/orders/files/:fileId
 */
router.delete('/files/:fileId', requireUserType('OPERATOR'), requirePermission('order:file_delete'), async (req, res) => {
  try {
    const pool = getPool()
    const result = await pool.query(
      `DELETE FROM order_files WHERE id = $1 RETURNING file_url, oss_path`,
      [req.params.fileId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '文件不存在', data: null })
    }

    // 同步清理存储（失败不影响删除结果，OSS 里最多留个孤儿对象）
    const { file_url, oss_path } = result.rows[0]
    if (oss_path) {
      deleteFromOSS(oss_path).catch(() => {})
    } else if (file_url?.startsWith('/uploads/orders/')) {
      try {
        fs.unlinkSync(path.join(ORDER_FILES_UPLOAD_DIR, path.basename(file_url)))
      } catch {
        // 本地文件可能已不存在
      }
    }

    res.json({ code: 200, message: '文件已删除', data: null })
  } catch (error) {
    console.error('删除订单文件失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

// 统计（放在 /:id 前面，避免被匹配为 id）
// ⚠️ 统计是全公司口径（不按客户/承运商收窄），只能给运营看，
//    两个门户各自走 /dashboard/client 和 /dashboard/carrier
router.get('/stats', requireUserType('OPERATOR'), requirePermission('order:view'), orderController.getStats)

// Excel 导出（放在 /:id 前面，避免被匹配为 id）
// 导出走的是全量 SQL（含 client_price / carrier_cost），且不按登录方收窄，
// 所以必须和 /stats 一样先挡住门户身份，不能只靠"门户角色恰好没配这个权限码"
router.get('/export', requireUserType('OPERATOR'), requirePermission('order:export'), async (req, res) => {
  // Excel 表头按请求语言渲染（P9）
  const lang = resolveLang(req)
  try {
    const { businessType, status, dateFrom, dateTo, search } = req.query
    const pool = getPool()

    // 构建查询（复用 list 的筛选逻辑）
    let sql = `
      SELECT o.order_number, o.customer_ref, o.business_type, o.status, o.transport_type,
             o.cargo_weight_kg, o.client_price, o.carrier_cost, o.currency,
             o.created_at,
             c.company_name as client_name,
             o.pickup_address->>'city' as pickup_city,
             o.delivery_address->>'city' as delivery_city
      FROM orders o
      LEFT JOIN clients c ON c.id = o.client_id
      WHERE 1=1`
    const params = []
    let paramIdx = 0

    if (businessType) {
      params.push(businessType)
      sql += ` AND o.business_type = $${++paramIdx}`
    }
    if (status) {
      params.push(status)
      sql += ` AND o.status = $${++paramIdx}`
    }
    if (search) {
      params.push(`%${search}%`)
      sql += ` AND (o.order_number ILIKE $${++paramIdx} OR o.container_no ILIKE $${paramIdx})`
    }
    if (dateFrom) {
      params.push(dateFrom)
      sql += ` AND o.created_at >= $${++paramIdx}`
    }
    if (dateTo) {
      params.push(dateTo)
      sql += ` AND o.created_at <= $${++paramIdx}`
    }
    sql += ` ORDER BY o.created_at DESC LIMIT 5000`

    const result = await pool.query(sql, params)

    // 构建 Excel
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'EU-TMS'
    workbook.created = new Date()
    const sheet = workbook.addWorksheet(t(lang, 'excel.sheetOrders'))

    // 中文名统一从 service.js 取，避免前后端/各处各抄一份
    // ⚠️ 原来的 bizTypeMap 放的是 FTL/LTL/CONTAINER 这些"运输类型"值，
    //    却拿去匹配 business_type，导出的业务类型列一直显示原始英文

    sheet.columns = [
      { header: t(lang, 'excel.orderNo'), key: 'orderNumber', width: 18 },
      { header: t(lang, 'excel.customerRef'), key: 'customerRef', width: 18 },
      { header: t(lang, 'excel.client'), key: 'clientName', width: 20 },
      { header: t(lang, 'excel.businessType'), key: 'businessType', width: 12 },
      { header: t(lang, 'excel.status'), key: 'status', width: 12 },
      { header: t(lang, 'excel.transportType'), key: 'transportType', width: 12 },
      { header: t(lang, 'excel.weightKg'), key: 'weight', width: 12 },
      { header: t(lang, 'excel.route'), key: 'route', width: 25 },
      { header: t(lang, 'excel.clientPrice'), key: 'clientPrice', width: 14 },
      { header: t(lang, 'excel.carrierCost'), key: 'carrierCost', width: 14 },
      { header: t(lang, 'excel.currency'), key: 'currency', width: 8 },
      { header: t(lang, 'excel.createdDate'), key: 'createdAt', width: 18 },
    ]

    // 表头样式
    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } }

    for (const row of result.rows) {
      sheet.addRow({
        orderNumber: row.order_number,
        customerRef: row.customer_ref || '-',
        clientName: row.client_name || '-',
        businessType: BUSINESS_TYPE_LABELS[row.business_type] || row.business_type,
        status: getStatusLabel(row.business_type, row.status),
        transportType: row.transport_type || '-',
        weight: row.cargo_weight_kg ? Number(row.cargo_weight_kg) : 0,
        route: `${row.pickup_city || '?'} → ${row.delivery_city || '?'}`,
        clientPrice: row.client_price ? Number(row.client_price) : 0,
        carrierCost: row.carrier_cost ? Number(row.carrier_cost) : 0,
        currency: row.currency || 'EUR',
        createdAt: row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : '-',
      })
    }

    // 设置响应头并流式输出
    const filename = `orders_${new Date().toISOString().slice(0, 10)}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    await workbook.xlsx.write(res)
    res.end()
  } catch (error) {
    console.error('订单导出失败:', error)
    res.status(500).json({ code: 500, message: '导出失败' })
  }
})

// ==================== 批量导入（按运输产品分模板） ====================

/**
 * 下载某个运输产品的导入模板
 * GET /api/v1/orders/import-template?businessType=TRUCK_LTL
 *
 * ⚠️ 和 /stats /export 一样必须放在 /:id 前面（踩坑 001）
 *
 * 表头按请求语言渲染（P9）；解析时三种语言的表头都认，所以德语同事下的模板
 * 中文同事也能拿来导。
 */
router.get('/import-template',
  requireUserType('OPERATOR', 'CLIENT'),
  requirePermission('order:import', 'portal:order_import'),
  async (req, res) => {
    const lang = resolveLang(req)
    const businessType = String(req.query.businessType || '').toUpperCase()
    if (!importService.IMPORT_BUSINESS_TYPES.includes(businessType)) {
      return res.status(400).json({
        code: 400,
        message: `请指定运输产品，允许值：${importService.IMPORT_BUSINESS_TYPES.join(' / ')}`,
        data: null,
      })
    }
    try {
      const workbook = importService.buildTemplateWorkbook(businessType, lang)
      const filename = `order_import_${businessType.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.xlsx`
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      await workbook.xlsx.write(res)
      res.end()
    } catch (error) {
      console.error('生成订单导入模板失败:', error)
      res.status(500).json({ code: 500, message: '生成导入模板失败', data: null })
    }
  })

/**
 * 批量导入预览（只解析校验，不写库）
 * POST /api/v1/orders/import/preview   multipart: file, businessType [, clientId]
 *
 * ⚠️ 必须在 /import 之前注册，否则 /import/preview 会被后面的参数路由抢走
 *    （同踩坑 001 的套路）
 */
router.post('/import/preview',
  requireUserType('OPERATOR', 'CLIENT'),
  requirePermission('order:import', 'portal:order_import'),
  importUpload.single('file'),
  async (req, res) => {
    const lang = resolveLang(req)
    try {
      const context = resolveImportContext(req, res)
      if (!context) return

      const result = await importService.analyzeImportFile(req.file.buffer, context.businessType, lang)
      res.json({ code: 200, message: 'success', data: buildPreviewPayload(result, context.businessType) })
    } catch (error) {
      console.error('解析订单导入文件失败:', error)
      res.status(500).json({ code: 500, message: '解析导入文件失败', data: null })
    }
  })

/**
 * 批量导入（解析 + 写库）
 * POST /api/v1/orders/import   multipart: file, businessType [, clientId]
 *
 * 用的是和预览完全相同的解析函数，所以「预览看到几张单，导进去就是几张」。
 * 有任何一条错误就整批不导 —— 导一半客户没法知道该补哪几张。
 */
router.post('/import',
  requireUserType('OPERATOR', 'CLIENT'),
  requirePermission('order:import', 'portal:order_import'),
  importUpload.single('file'),
  async (req, res) => {
    const lang = resolveLang(req)
    try {
      const context = resolveImportContext(req, res)
      if (!context) return

      const result = await importService.analyzeImportFile(req.file.buffer, context.businessType, lang)
      if (result.errors.length > 0 || result.orders.length === 0) {
        return res.status(400).json({
          code: 400,
          message: '导入文件有错误，请修正后重试',
          data: buildPreviewPayload(result, context.businessType),
        })
      }

      const created = await withTransaction(async (client) =>
        importService.createOrdersFromRows(client, result.orders, {
          clientId: context.clientId,
          userId: req.user.id,
          createOrder: orderService.createOrder,
        })
      )

      // 逐单通知在导入时关掉了，这里给操作员补一条汇总
      await notifyBatchImported(created, context.businessType)

      res.json({
        code: 200,
        message: `成功导入 ${created.length} 张订单`,
        data: { created, count: created.length },
      })
    } catch (error) {
      console.error('批量导入订单失败:', error)
      res.status(500).json({ code: 500, message: error.message, data: null })
    }
  })

// CRUD
router.get('/', requirePermission(...CAN_VIEW_ORDER), orderController.list)
router.post('/', requireUserType('OPERATOR', 'CLIENT'), requirePermission('order:create', 'portal:order_create'), orderController.create)
router.get('/:id', requirePermission(...CAN_VIEW_ORDER), orderController.getById)
router.put('/:id', requireUserType('OPERATOR'), requirePermission('order:edit'), orderController.update)

// 状态操作
router.put('/:id/status', requirePermission('order:status'), orderController.updateStatus)
router.put('/:id/delivery-status', requirePermission('order:status', 'carrier_portal:task_respond'), orderController.updateDeliveryStatus)

// 跟踪号（本地派送，仅运营可写）
router.put('/:id/tracking-number', requireUserType('OPERATOR'), requirePermission('order:status'), orderController.updateTrackingNumber)

// 派单/接单/拒单/取消
router.post('/:id/assign', requireUserType('OPERATOR'), requirePermission('order:assign'), orderController.assign)
router.post('/:id/accept', requirePermission('order:assign', 'carrier_portal:task_respond'), orderController.accept)
router.post('/:id/reject', requirePermission('order:assign', 'carrier_portal:task_respond'), orderController.reject)
router.post('/:id/cancel', requireUserType('OPERATOR'), requirePermission('order:cancel'), orderController.cancel)

// 时间线和变更历史
router.get('/:id/timeline', requirePermission(...CAN_VIEW_ORDER), orderController.getTimeline)
router.get('/:id/changes', requireUserType('OPERATOR'), requirePermission('order:view'), orderController.getChanges)

export default router
