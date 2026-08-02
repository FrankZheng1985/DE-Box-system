/**
 * 承运商管理路由
 */

import { Router } from 'express'
import ExcelJS from 'exceljs'
import { authenticateToken, requireUserType, requirePermission } from '../../middleware/auth.js'
import { withTransaction, query } from '../../core/db.js'
import { getPool } from '../../core/db.js'
import { changeTracker, numberRange } from '../../core/index.js'

const router = Router()
router.use(authenticateToken)

// ⚠️ 安全收紧（P5）：本模块是承运商主数据，含资质、保险、结算与绩效。
//    以前整个模块只挂 authenticateToken——客户门户和承运商门户的账号
//    拿自己的 token 就能读写全部承运商资料（包括同行的）。只放行运营端。
router.use(requireUserType('OPERATOR'))

const CARRIER_FIELDS = [
  { name: 'company_name', label: '公司名称' },
  { name: 'performance_score', label: '绩效评分' },
  { name: 'status', label: '状态' },
  { name: 'transport_license', label: '运输许可证' },
  { name: 'insurance_number', label: '保险编号' }
]

/**
 * 承运商列表
 */
router.get('/', requirePermission('carrier:view'), async (req, res) => {
  try {
    const { search, status, page = 1, pageSize = 20 } = req.query
    let sql = `
      SELECT cr.*,
        (SELECT COUNT(*) FROM carrier_vehicles cv WHERE cv.carrier_id = cr.id) as vehicle_count,
        (SELECT COUNT(*) FROM orders o WHERE o.carrier_id = cr.id AND o.status = 'COMPLETED') as completed_orders
      FROM carriers cr WHERE 1=1`
    const params = []
    let idx = 0

    if (search) {
      params.push(`%${search}%`)
      sql += ` AND (cr.company_name ILIKE $${++idx} OR cr.carrier_code ILIKE $${idx})`
    }
    if (status) {
      params.push(status)
      sql += ` AND cr.status = $${++idx}`
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) t`, params)
    sql += ` ORDER BY cr.performance_score DESC`
    params.push(parseInt(pageSize))
    sql += ` LIMIT $${++idx}`
    params.push((parseInt(page) - 1) * parseInt(pageSize))
    sql += ` OFFSET $${++idx}`

    const result = await query(sql, params)
    res.json({
      code: 200, message: 'success', data: result.rows,
      pagination: { total: parseInt(countResult.rows[0].total), page: parseInt(page), pageSize: parseInt(pageSize) }
    })
  } catch (error) {
    console.error('获取承运商列表失败:', error)
    res.status(500).json({ code: 500, message: '获取承运商列表失败', data: null })
  }
})

/**
 * 匹配承运商（派单用）- 必须在 /:id 前面
 */
router.get('/match', requirePermission('carrier:view'), async (req, res) => {
  try {
    const { routeFrom, routeTo, vehicleType } = req.query
    const result = await query(
      `SELECT cr.id, cr.carrier_code, cr.company_name, cr.country,
              cr.performance_score, cr.vehicle_types,
              (SELECT COUNT(*) FROM carrier_vehicles cv WHERE cv.carrier_id = cr.id AND cv.status = 'IDLE') as available_vehicles
       FROM carriers cr
       WHERE cr.status = 'ACTIVE'
       ORDER BY cr.performance_score DESC
       LIMIT 10`
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '匹配承运商失败', data: null })
  }
})

/**
 * 承运商导出 Excel（放在 /:id 前面，避免被匹配为 id）
 * GET /api/v1/carriers/export
 */
router.get('/export', requirePermission('carrier:export'), async (req, res) => {
  try {
    const pool = getPool()
    const result = await pool.query(
      `SELECT carrier_code, company_name, vat_number, country,
              transport_license, license_expiry, insurance_number, insurance_expiry,
              performance_score, status
       FROM carriers WHERE status = 'ACTIVE'
       ORDER BY performance_score DESC LIMIT 5000`
    )

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'EU-TMS'
    workbook.created = new Date()
    const sheet = workbook.addWorksheet('承运商列表')

    const statusMap = { ACTIVE: '活跃', INACTIVE: '停用', SUSPENDED: '暂停' }

    sheet.columns = [
      { header: '承运商编码', key: 'carrierCode', width: 16 },
      { header: '公司名称', key: 'companyName', width: 28 },
      { header: 'VAT税号', key: 'vatNumber', width: 22 },
      { header: '国家', key: 'country', width: 12 },
      { header: '许可证号', key: 'license', width: 20 },
      { header: '许可证到期', key: 'licenseExpiry', width: 14 },
      { header: '保险号', key: 'insurance', width: 20 },
      { header: '保险到期', key: 'insuranceExpiry', width: 14 },
      { header: '评分', key: 'score', width: 8 },
      { header: '状态', key: 'status', width: 10 },
    ]

    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } }

    for (const row of result.rows) {
      sheet.addRow({
        carrierCode: row.carrier_code || '-',
        companyName: row.company_name || '-',
        vatNumber: row.vat_number || '-',
        country: row.country || '-',
        license: row.transport_license || '-',
        licenseExpiry: row.license_expiry ? new Date(row.license_expiry).toISOString().slice(0, 10) : '-',
        insurance: row.insurance_number || '-',
        insuranceExpiry: row.insurance_expiry ? new Date(row.insurance_expiry).toISOString().slice(0, 10) : '-',
        score: row.performance_score ? Number(row.performance_score) : 0,
        status: statusMap[row.status] || row.status || '-',
      })
    }

    const filename = `carriers_${new Date().toISOString().slice(0, 10)}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    await workbook.xlsx.write(res)
    res.end()
  } catch (error) {
    console.error('承运商导出失败:', error)
    res.status(500).json({ code: 500, message: '导出失败' })
  }
})

/**
 * 承运商详情
 */
router.get('/:id', requirePermission('carrier:view'), async (req, res) => {
  try {
    const result = await query(`SELECT * FROM carriers WHERE id = $1`, [req.params.id])
    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '承运商不存在', data: null })
    }
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取承运商详情失败', data: null })
  }
})

/**
 * 创建承运商
 */
router.post('/', requirePermission('carrier:create'), async (req, res) => {
  try {
    const carrier = await withTransaction(async (tx) => {
      const { docNumber } = await numberRange.getNextNumber(tx, 'CAR', 'DE01')
      const result = await tx.query(
        `INSERT INTO carriers
         (carrier_code, company_name, vat_number, country, transport_license,
          license_expiry, insurance_number, insurance_expiry,
          service_countries, vehicle_types, contact_name, contact_email,
          contact_phone, address, status, company_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *`,
        [docNumber, req.body.companyName, req.body.vatNumber, req.body.country,
         req.body.transportLicense, req.body.licenseExpiry,
         req.body.insuranceNumber, req.body.insuranceExpiry,
         JSON.stringify(req.body.serviceCountries || []),
         JSON.stringify(req.body.vehicleTypes || []),
         req.body.contactName, req.body.contactEmail, req.body.contactPhone,
         req.body.address, 'ACTIVE', 'DE01']
      )

      await changeTracker.trackChanges(tx, {
        objectType: 'CARRIER', objectId: result.rows[0].id,
        changeType: 'INSERT', transactionType: 'CREATE_CARRIER',
        tableName: 'carriers', newData: result.rows[0],
        trackedFields: CARRIER_FIELDS, changedBy: req.user.id
      })

      return result.rows[0]
    })
    res.json({ code: 200, message: '承运商创建成功', data: carrier })
  } catch (error) {
    console.error('创建承运商失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 编辑承运商
 */
router.put('/:id', requirePermission('carrier:edit'), async (req, res) => {
  try {
    await withTransaction(async (tx) => {
      const old = await tx.query(`SELECT * FROM carriers WHERE id = $1`, [req.params.id])
      if (old.rows.length === 0) throw new Error('承运商不存在')

      const map = {
        companyName: 'company_name', vatNumber: 'vat_number',
        transportLicense: 'transport_license', licenseExpiry: 'license_expiry',
        insuranceNumber: 'insurance_number', insuranceExpiry: 'insurance_expiry',
        contactName: 'contact_name', contactEmail: 'contact_email',
        contactPhone: 'contact_phone', performanceScore: 'performance_score'
      }
      const setClauses = []
      const params = []
      const newData = {}
      let idx = 0

      for (const [camel, snake] of Object.entries(map)) {
        if (req.body[camel] !== undefined) {
          params.push(req.body[camel])
          setClauses.push(`${snake} = $${++idx}`)
          newData[snake] = req.body[camel]
        }
      }
      if (req.body.serviceCountries) {
        params.push(JSON.stringify(req.body.serviceCountries))
        setClauses.push(`service_countries = $${++idx}`)
      }
      if (req.body.vehicleTypes) {
        params.push(JSON.stringify(req.body.vehicleTypes))
        setClauses.push(`vehicle_types = $${++idx}`)
      }
      if (req.body.status) {
        params.push(req.body.status)
        setClauses.push(`status = $${++idx}`)
        newData.status = req.body.status
      }

      if (setClauses.length === 0) throw new Error('没有可更新的字段')

      params.push(req.params.id)
      setClauses.push(`updated_at = NOW()`)
      await tx.query(`UPDATE carriers SET ${setClauses.join(', ')} WHERE id = $${++idx}`, params)

      await changeTracker.trackChanges(tx, {
        objectType: 'CARRIER', objectId: req.params.id,
        changeType: 'UPDATE', transactionType: 'EDIT_CARRIER',
        tableName: 'carriers', oldData: old.rows[0], newData,
        trackedFields: CARRIER_FIELDS, changedBy: req.user.id
      })
    })
    res.json({ code: 200, message: '承运商更新成功', data: null })
  } catch (error) {
    res.status(400).json({ code: 400, message: error.message, data: null })
  }
})

/**
 * 车队管理
 */
router.get('/:id/vehicles', requirePermission('carrier:view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM carrier_vehicles WHERE carrier_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取车队信息失败', data: null })
  }
})

router.post('/:id/vehicles', requirePermission('carrier:edit'), async (req, res) => {
  try {
    const result = await query(
      `INSERT INTO carrier_vehicles (carrier_id, plate_number, vehicle_type, driver_name, driver_phone, has_gps)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, req.body.plateNumber, req.body.vehicleType,
       req.body.driverName, req.body.driverPhone, req.body.hasGps || false]
    )
    res.json({ code: 200, message: '车辆添加成功', data: result.rows[0] })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 承运商财务概览
 */
router.get('/:id/finance', requirePermission('carrier:view'), async (req, res) => {
  try {
    const stats = await query(
      `SELECT
         COALESCE(SUM(amount), 0) as total_payable,
         COALESCE(SUM(paid_amount), 0) as total_paid,
         COALESCE(SUM(amount - paid_amount), 0) as outstanding
       FROM financial_records
       WHERE counterparty_type = 'CARRIER' AND counterparty_id = $1 AND type = 'PAYABLE'`,
      [req.params.id]
    )
    res.json({ code: 200, message: 'success', data: stats.rows[0] })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取财务概览失败', data: null })
  }
})

// 承运商作废/恢复：切换 status (ACTIVE <-> INACTIVE)
router.put('/:id/toggle-status', requirePermission('carrier:edit'), async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body || {}

    const current = await query('SELECT id, carrier_code, company_name, status FROM carriers WHERE id = $1', [id])
    if (current.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '承运商不存在', data: null })
    }
    const old = current.rows[0]

    // 作废前检查：还有进行中的订单或未付清的应付
    if (old.status === 'ACTIVE') {
      if (!reason || !reason.trim()) {
        return res.status(400).json({ code: 400, message: '请填写作废原因', data: null })
      }
      const activeOrders = await query(
        `SELECT COUNT(*) as c FROM orders WHERE carrier_id = $1 AND status NOT IN ('COMPLETED','CANCELLED')`,
        [id]
      )
      if (parseInt(activeOrders.rows[0].c) > 0) {
        return res.status(400).json({
          code: 400,
          message: `该承运商还有 ${activeOrders.rows[0].c} 个进行中的订单，请先处理完毕再作废`,
          data: null,
        })
      }
      const unpaidFinance = await query(
        `SELECT COUNT(*) as c FROM financial_records
         WHERE counterparty_type = 'CARRIER' AND counterparty_id = $1
         AND type = 'PAYABLE' AND payment_status IN ('UNPAID','PARTIAL','OVERDUE')`,
        [id]
      )
      if (parseInt(unpaidFinance.rows[0].c) > 0) {
        return res.status(400).json({
          code: 400,
          message: `该承运商还有 ${unpaidFinance.rows[0].c} 笔未结清的应付账款，请先处理`,
          data: null,
        })
      }
    }

    const newStatus = old.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    const voidReason = old.status === 'ACTIVE' ? (reason || '').trim() : null

    await withTransaction(async (tx) => {
      await tx.query(
        `UPDATE carriers SET status = $1, void_reason = $2, updated_at = NOW() WHERE id = $3`,
        [newStatus, voidReason, id]
      )
      await changeTracker.trackChanges(tx, {
        objectType: 'CARRIER',
        objectId: id,
        changeType: 'UPDATE',
        transactionType: newStatus === 'INACTIVE' ? 'VOID_CARRIER' : 'RESTORE_CARRIER',
        tableName: 'carriers',
        oldData: { status: old.status },
        newData: { status: newStatus, void_reason: voidReason },
        trackedFields: [
          { name: 'status', label: '状态' },
          { name: 'void_reason', label: '作废原因' },
        ],
        changedBy: req.user.id,
      })
    })

    const actionText = newStatus === 'INACTIVE' ? '作废' : '恢复'
    res.json({ code: 200, message: `承运商 "${old.company_name}" 已${actionText}`, data: { status: newStatus } })
  } catch (error) {
    console.error('[Carrier] 切换状态失败:', error)
    res.status(500).json({ code: 500, message: error.message || '操作失败', data: null })
  }
})

export default router
