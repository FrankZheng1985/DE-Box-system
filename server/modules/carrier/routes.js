/**
 * 承运商管理路由
 */

import { Router } from 'express'
import { authenticateToken } from '../../middleware/auth.js'
import { withTransaction, query } from '../../core/db.js'
import { changeTracker, numberRange } from '../../core/index.js'

const router = Router()
router.use(authenticateToken)

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
router.get('/', async (req, res) => {
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
router.get('/match', async (req, res) => {
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
 * 承运商详情
 */
router.get('/:id', async (req, res) => {
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
router.post('/', async (req, res) => {
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
router.put('/:id', async (req, res) => {
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
router.get('/:id/vehicles', async (req, res) => {
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

router.post('/:id/vehicles', async (req, res) => {
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
router.get('/:id/finance', async (req, res) => {
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

export default router
