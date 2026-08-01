/**
 * 订单管理路由
 * 14 个 API 端点
 */

import { Router } from 'express'
import ExcelJS from 'exceljs'
import { authenticateToken, requireUserType } from '../../middleware/auth.js'
import { getPool } from '../../core/db.js'
import orderController from './controller.js'
import { BUSINESS_TYPE_LABELS, getStatusLabel } from './service.js'

const router = Router()

// 所有订单路由需要认证
router.use(authenticateToken)

// 统计（放在 /:id 前面，避免被匹配为 id）
router.get('/stats', orderController.getStats)

// Excel 导出（放在 /:id 前面，避免被匹配为 id）
router.get('/export', async (req, res) => {
  try {
    const { businessType, status, dateFrom, dateTo, search } = req.query
    const pool = getPool()

    // 构建查询（复用 list 的筛选逻辑）
    let sql = `
      SELECT o.order_number, o.business_type, o.status, o.transport_type,
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
    const sheet = workbook.addWorksheet('订单列表')

    // 中文名统一从 service.js 取，避免前后端/各处各抄一份
    // ⚠️ 原来的 bizTypeMap 放的是 FTL/LTL/CONTAINER 这些"运输类型"值，
    //    却拿去匹配 business_type，导出的业务类型列一直显示原始英文

    sheet.columns = [
      { header: '订单号', key: 'orderNumber', width: 18 },
      { header: '客户', key: 'clientName', width: 20 },
      { header: '业务类型', key: 'businessType', width: 12 },
      { header: '状态', key: 'status', width: 12 },
      { header: '运输类型', key: 'transportType', width: 12 },
      { header: '重量(kg)', key: 'weight', width: 12 },
      { header: '路线', key: 'route', width: 25 },
      { header: '客户报价', key: 'clientPrice', width: 14 },
      { header: '承运商成本', key: 'carrierCost', width: 14 },
      { header: '币种', key: 'currency', width: 8 },
      { header: '创建日期', key: 'createdAt', width: 18 },
    ]

    // 表头样式
    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } }

    for (const row of result.rows) {
      sheet.addRow({
        orderNumber: row.order_number,
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

// CRUD
router.get('/', orderController.list)
router.post('/', requireUserType('OPERATOR', 'CLIENT'), orderController.create)
router.get('/:id', orderController.getById)
router.put('/:id', orderController.update)

// 状态操作
router.put('/:id/status', orderController.updateStatus)
router.put('/:id/delivery-status', orderController.updateDeliveryStatus)

// 跟踪号（本地派送，仅运营可写）
router.put('/:id/tracking-number', requireUserType('OPERATOR'), orderController.updateTrackingNumber)

// 派单/接单/拒单/取消
router.post('/:id/assign', orderController.assign)
router.post('/:id/accept', orderController.accept)
router.post('/:id/reject', orderController.reject)
router.post('/:id/cancel', orderController.cancel)

// 时间线和变更历史
router.get('/:id/timeline', orderController.getTimeline)
router.get('/:id/changes', orderController.getChanges)

export default router
