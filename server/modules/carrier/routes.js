/**
 * 承运商管理路由
 */

import { Router } from 'express'
import ExcelJS from 'exceljs'
import { authenticateToken, requireUserType, requirePermission } from '../../middleware/auth.js'
import { withTransaction, query } from '../../core/db.js'
import { resolveLang, t } from '../../utils/i18n.js'
import { getPool } from '../../core/db.js'
import { changeTracker, numberRange } from '../../core/index.js'

/**
 * 城市名归一化的 SQL 片段：去首尾空格 → 转小写 → 抹掉变音符号。
 *
 * 为什么不用 unaccent 扩展：生产 RDS 上没装（可装但要库级权限），
 * translate() 是内置函数，不依赖任何扩展，今天就能上。
 *
 * ß 要先单独 replace —— translate() 是 1:1 字符映射，做不了 ß→ss 这种一对二。
 *
 * @param {string} expr 已经是合法 SQL 的表达式（列名或占位符），**不接受用户输入拼接**
 * @returns {string} 归一化后的 SQL 表达式
 */
function normCity(expr) {
  return `TRANSLATE(LOWER(TRIM(REPLACE(${expr}, 'ß', 'ss'))), ` +
    `'áàâãäåéèêëíìîïóòôõöøúùûüñçý', ` +
    `'aaaaaaeeeeiiiioooooouuuuncy')`
}

const router = Router()
router.use(authenticateToken)

// ⚠️ 安全收紧（P5）：本模块是承运商主数据，含资质、保险、结算与绩效。
//    以前整个模块只挂 authenticateToken——客户门户和承运商门户的账号
//    拿自己的 token 就能读写全部承运商资料（包括同行的）。只放行运营端。
router.use(requireUserType('OPERATOR'))

const CARRIER_FIELDS = [
  { name: 'company_name', label: '公司名称' },
  { name: 'carrier_category', label: '分类' },
  { name: 'carrier_type', label: '类型' },
  { name: 'remarks', label: '备注' },
  { name: 'performance_score', label: '绩效评分' },
  { name: 'status', label: '状态' },
  { name: 'transport_license', label: '运输许可证' },
  { name: 'insurance_number', label: '保险编号' }
]

/** 承运商分类 / 类型的合法值（和迁移 111 的 CHECK 约束保持一致） */
const CARRIER_CATEGORIES = ['EXTERNAL', 'OWN_FLEET']
const CARRIER_TYPES = ['PLATFORM', 'FLEET', 'INDIVIDUAL']

/** 宽松的邮箱格式检查：挡手误，不追求 RFC 完备 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * 整理前端传来的询价邮箱数组：去空格、去空项、去重（不分大小写）。
 * 有格式不对的直接抛错点名，别静默丢掉——运营以为登记上了，实际发不出去。
 */
function parseInquiryEmails(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const emails = []
  const invalid = []
  for (const item of value) {
    const email = String(item || '').trim()
    if (!email) continue
    if (!EMAIL_PATTERN.test(email)) { invalid.push(email); continue }
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    emails.push(email)
  }
  if (invalid.length > 0) {
    throw new Error(`参数错误：询价邮箱格式不正确：${invalid.join('、')}`)
  }
  return emails
}

/**
 * 承运商列表
 */
router.get('/', requirePermission('carrier:view'), async (req, res) => {
  try {
    const { search, status, carrierCategory, carrierType, page = 1, pageSize = 20 } = req.query
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
    if (carrierCategory) {
      params.push(carrierCategory)
      sql += ` AND cr.carrier_category = $${++idx}`
    }
    if (carrierType) {
      params.push(carrierType)
      sql += ` AND cr.carrier_type = $${++idx}`
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
    // 三个筛选参数（2026-08-06 补做，此前接收了但从未使用）。
    // 全部可选：一个都不传时行为与以前完全一致，返回全部启用中的承运商。
    const routeFrom = req.query.routeFrom?.trim() || null
    const routeTo = req.query.routeTo?.trim() || null
    const vehicleType = req.query.vehicleType?.trim() || null
    /**
     * 派单页的承运商匹配
     *
     * 准时率和覆盖路线原来根本没查 —— 前端 interface 里写着这两个字段，
     * 接口不返回，于是「历史准时率」永远显示 "-"、「覆盖路线」区块永远不渲染。
     * 现在都从真实订单数据算出来：
     *
     * - 准时率：该承运商已送达/已完成、且填了计划送达日的单里，
     *   实际送达（order_status_logs 里 DELIVERED/COMPLETED 那条的日期）
     *   不晚于计划日的占比。同时返回样本量，样本为 0 时前端显示 "-"，
     *   不拿一两单算出来的 100% 骗人。
     * - 覆盖路线：跑过的真实线路（装货城市 → 卸货城市）按次数取前 5 条，
     *   比让运营手工维护一张路线表实在。
     *
     * 筛选口径（2026-08-06 Frank 拍板）：
     *
     * - **车型是硬筛，但"没填过"不算不合格**。把 `carriers.vehicle_types`（声明的能力）
     *   和 `carrier_vehicles.vehicle_type`（实际在册车辆）并起来当作「已知能力集」：
     *   集合为空 = 这家根本没维护过车型信息，**未知不等于做不了**，照常显示；
     *   集合非空才要求包含所需车型。
     *   否则以当前数据（两家承运商 vehicle_types 都是 []、车辆表 0 条）
     *   一硬筛就会把派单页筛空，运营没法派单。
     *
     * - **路线只影响排序，绝不排除**。覆盖路线是从历史订单算出来的，
     *   "没跑过这条线"不等于"跑不了"——尤其系统刚开始运营、订单还没几单时。
     *   命中的排在前面并返回 route_matched 供前端标记。
     */
    const result = await query(
      `WITH caps AS (
         -- 已知车型能力集 = 声明的 vehicle_types ∪ 实际在册车辆的 vehicle_type
         SELECT c.id AS carrier_id,
                COALESCE((
                  SELECT ARRAY_AGG(DISTINCT UPPER(t)) FROM (
                    SELECT jsonb_array_elements_text(
                             CASE WHEN jsonb_typeof(c.vehicle_types) = 'array'
                                  THEN c.vehicle_types ELSE '[]'::jsonb END
                           ) AS t
                    UNION
                    SELECT cv.vehicle_type
                    FROM carrier_vehicles cv
                    WHERE cv.carrier_id = c.id AND cv.vehicle_type IS NOT NULL
                  ) u WHERE t IS NOT NULL AND t <> ''
                ), ARRAY[]::text[]) AS known_types
         FROM carriers c
       ),
       route_hits AS (
         -- 该承运商跑过多少次「装货城市 → 卸货城市」这条线。
         -- 比较前统一归一：去首尾空格 + 转小写 + **抹掉变音符号**。
         --
         -- 变音符号那一步是 2026-08-07 补的，之前漏了，导致这个匹配在德国
         -- 基本等于废的：同一个城市运营有时打 Lünen、有时打 LUNEN，
         -- lower() 之后是 'lünen' vs 'lunen'，**永远不相等**。
         -- München / Köln / Düsseldorf 全是这个毛病。
         SELECT o.carrier_id, COUNT(*)::int AS hits
         FROM orders o
         WHERE o.carrier_id IS NOT NULL
           -- 取消/拒单的单子根本没跑过，不能算作这家跑过这条线
           AND o.status NOT IN ('CANCELLED', 'REJECTED')
           AND $1::text IS NOT NULL AND $2::text IS NOT NULL
           AND ${normCity("o.pickup_address->>'city'")}   = ${normCity('$1::text')}
           AND ${normCity("o.delivery_address->>'city'")} = ${normCity('$2::text')}
         GROUP BY o.carrier_id
       ),
       delivered AS (
         -- 每单第一次进入 DELIVERED/COMPLETED 的时间，就是实际送达时间
         SELECT o.id, o.carrier_id, o.delivery_date,
                MIN(l.created_at)::date AS actual_date
         FROM orders o
         JOIN order_status_logs l ON l.order_id = o.id
                                 AND l.to_status IN ('DELIVERED', 'COMPLETED')
         WHERE o.carrier_id IS NOT NULL AND o.delivery_date IS NOT NULL
         GROUP BY o.id, o.carrier_id, o.delivery_date
       ),
       ontime AS (
         SELECT carrier_id,
                COUNT(*) AS sample,
                COUNT(*) FILTER (WHERE actual_date <= delivery_date) AS on_time
         FROM delivered GROUP BY carrier_id
       ),
       routes AS (
         SELECT carrier_id, ARRAY_AGG(route ORDER BY cnt DESC) AS covered_routes
         FROM (
           SELECT o.carrier_id,
                  (o.pickup_address->>'city') || ' → ' || (o.delivery_address->>'city') AS route,
                  COUNT(*) AS cnt,
                  ROW_NUMBER() OVER (PARTITION BY o.carrier_id ORDER BY COUNT(*) DESC) AS rn
           FROM orders o
           WHERE o.carrier_id IS NOT NULL
             -- 同上：取消/拒单的不算跑过，否则会虚报承运商的线路经验
             AND o.status NOT IN ('CANCELLED', 'REJECTED')
             AND o.pickup_address->>'city' IS NOT NULL
             AND o.delivery_address->>'city' IS NOT NULL
           GROUP BY o.carrier_id, 2
         ) t WHERE rn <= 5
         GROUP BY carrier_id
       )
       SELECT cr.id, cr.carrier_code, cr.company_name, cr.country,
              cr.performance_score, cr.vehicle_types,
              (SELECT COUNT(*) FROM carrier_vehicles cv WHERE cv.carrier_id = cr.id AND cv.status = 'IDLE') as available_vehicles,
              -- 样本为 0 时给 null，前端显示 "-"；不给 0% 造成"这家很差"的错觉
              CASE WHEN ot.sample > 0
                   THEN ROUND(ot.on_time::numeric * 100 / ot.sample, 1)
                   END AS on_time_rate,
              COALESCE(ot.sample, 0)::int AS on_time_sample,
              COALESCE(r.covered_routes, ARRAY[]::text[]) AS covered_routes,
              -- 跑过这条线没有：只用于排序与前端标记，不参与过滤
              (COALESCE(rh.hits, 0) > 0) AS route_matched
       FROM carriers cr
       JOIN caps cap       ON cap.carrier_id = cr.id
       LEFT JOIN ontime ot ON ot.carrier_id = cr.id
       LEFT JOIN routes r  ON r.carrier_id  = cr.id
       LEFT JOIN route_hits rh ON rh.carrier_id = cr.id
       WHERE cr.status = 'ACTIVE'
         -- 车型硬筛：没传就不筛；已知能力集为空视为"未维护"，不排除
         AND (
           $3::text IS NULL
           OR CARDINALITY(cap.known_types) = 0
           OR UPPER(TRIM($3::text)) = ANY(cap.known_types)
         )
       ORDER BY route_matched DESC,                              -- 跑过这条线的排前面
                ot.sample > 0 DESC NULLS LAST,                   -- 有准时率样本的优先于无样本
                on_time_rate DESC NULLS LAST,
                cr.performance_score DESC
       LIMIT 10`,
      [routeFrom, routeTo, vehicleType]
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
  // Excel 表头按请求语言渲染（P9）
  const lang = resolveLang(req)
  try {
    const pool = getPool()
    const result = await pool.query(
      `SELECT carrier_code, company_name, vat_number, country,
              carrier_category, carrier_type, remarks,
              transport_license, license_expiry, insurance_number, insurance_expiry,
              performance_score, status
       FROM carriers WHERE status = 'ACTIVE'
       ORDER BY performance_score DESC LIMIT 5000`
    )

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'EU-TMS'
    workbook.created = new Date()
    const sheet = workbook.addWorksheet(t(lang, 'excel.sheetCarriers'))

    const statusMap = { ACTIVE: '活跃', INACTIVE: '停用', SUSPENDED: '暂停' }
    const categoryMap = { EXTERNAL: '外部服务商', OWN_FLEET: '自营车辆' }
    const typeMap = { PLATFORM: '平台型', FLEET: '自营车队型', INDIVIDUAL: '个体车辆' }

    sheet.columns = [
      { header: t(lang, 'excel.carrierCode'), key: 'carrierCode', width: 16 },
      { header: t(lang, 'excel.companyName'), key: 'companyName', width: 28 },
      { header: t(lang, 'excel.vatNumber'), key: 'vatNumber', width: 22 },
      { header: t(lang, 'excel.country'), key: 'country', width: 12 },
      { header: t(lang, 'excel.category'), key: 'category', width: 14 },
      { header: t(lang, 'excel.type'), key: 'type', width: 14 },
      { header: t(lang, 'excel.licenseNo'), key: 'license', width: 20 },
      { header: t(lang, 'excel.licenseExpiry'), key: 'licenseExpiry', width: 14 },
      { header: t(lang, 'excel.insuranceNo'), key: 'insurance', width: 20 },
      { header: t(lang, 'excel.insuranceExpiry'), key: 'insuranceExpiry', width: 14 },
      { header: t(lang, 'excel.score'), key: 'score', width: 8 },
      { header: t(lang, 'excel.status'), key: 'status', width: 10 },
      { header: t(lang, 'excel.remarks'), key: 'remarks', width: 40 },
    ]

    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } }

    for (const row of result.rows) {
      sheet.addRow({
        carrierCode: row.carrier_code || '-',
        companyName: row.company_name || '-',
        vatNumber: row.vat_number || '-',
        country: row.country || '-',
        category: categoryMap[row.carrier_category] || row.carrier_category || '-',
        type: typeMap[row.carrier_type] || '-',
        license: row.transport_license || '-',
        licenseExpiry: row.license_expiry ? new Date(row.license_expiry).toISOString().slice(0, 10) : '-',
        insurance: row.insurance_number || '-',
        insuranceExpiry: row.insurance_expiry ? new Date(row.insurance_expiry).toISOString().slice(0, 10) : '-',
        score: row.performance_score ? Number(row.performance_score) : 0,
        status: statusMap[row.status] || row.status || '-',
        remarks: row.remarks || '-',
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
          contact_phone, address, carrier_category, carrier_type, remarks,
          inquiry_emails, status, company_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING *`,
        [docNumber, req.body.companyName, req.body.vatNumber, req.body.country,
         req.body.transportLicense, req.body.licenseExpiry,
         req.body.insuranceNumber, req.body.insuranceExpiry,
         JSON.stringify(req.body.serviceCountries || []),
         JSON.stringify(req.body.vehicleTypes || []),
         req.body.contactName, req.body.contactEmail, req.body.contactPhone,
         req.body.address,
         CARRIER_CATEGORIES.includes(req.body.carrierCategory) ? req.body.carrierCategory : 'EXTERNAL',
         // 类型可以先不填，别硬塞默认值制造假数据
         CARRIER_TYPES.includes(req.body.carrierType) ? req.body.carrierType : null,
         req.body.remarks || null,
         JSON.stringify(parseInquiryEmails(req.body.inquiryEmails)),
         'ACTIVE', 'DE01']
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

      // 分类/类型有 CHECK 约束，非法值先挡掉，别让数据库抛原始错误给前端
      if (req.body.carrierCategory !== undefined &&
          !CARRIER_CATEGORIES.includes(req.body.carrierCategory)) {
        throw new Error(`参数错误：承运商分类只能是 ${CARRIER_CATEGORIES.join(' / ')}`)
      }
      if (req.body.carrierType !== undefined && req.body.carrierType !== null &&
          req.body.carrierType !== '' && !CARRIER_TYPES.includes(req.body.carrierType)) {
        throw new Error(`参数错误：承运商类型只能是 ${CARRIER_TYPES.join(' / ')}`)
      }
      // 类型允许清空回"未分类"
      if (req.body.carrierType === '') req.body.carrierType = null

      const map = {
        companyName: 'company_name', vatNumber: 'vat_number',
        transportLicense: 'transport_license', licenseExpiry: 'license_expiry',
        insuranceNumber: 'insurance_number', insuranceExpiry: 'insurance_expiry',
        contactName: 'contact_name', contactEmail: 'contact_email',
        contactPhone: 'contact_phone', performanceScore: 'performance_score',
        carrierCategory: 'carrier_category', carrierType: 'carrier_type',
        remarks: 'remarks'
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
      // 这两个字段前端传的一定是数组，而**空数组 [] 在 JS 里是真值**，
      // 所以 `if (xxx)` already 能让「取消全部勾选」正常落库（已实测验证）。
      // 别照搬下面 inquiryEmails 的 `!== undefined` —— 那个字段前端传的是
      // 逗号字符串，空串 '' 才是假值，情况不同；这里改成 !== undefined 反而会让
      // 传 null 时把字符串 "null" 写进 jsonb 列。
      if (req.body.serviceCountries) {
        params.push(JSON.stringify(req.body.serviceCountries))
        setClauses.push(`service_countries = $${++idx}`)
      }
      if (req.body.vehicleTypes) {
        params.push(JSON.stringify(req.body.vehicleTypes))
        setClauses.push(`vehicle_types = $${++idx}`)
      }
      // 用 !== undefined 判断：传空数组 [] 表示清空询价邮箱，也要落库
      if (req.body.inquiryEmails !== undefined) {
        params.push(JSON.stringify(parseInquiryEmails(req.body.inquiryEmails)))
        setClauses.push(`inquiry_emails = $${++idx}`)
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
