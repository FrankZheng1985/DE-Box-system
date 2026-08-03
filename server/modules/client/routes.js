/**
 * 客户管理路由
 */

import { Router } from 'express'
import ExcelJS from 'exceljs'
import { authenticateToken, requireUserType, requirePermission } from '../../middleware/auth.js'
import { withTransaction, query } from '../../core/db.js'
import { resolveLang, t } from '../../utils/i18n.js'
import { getPool } from '../../core/db.js'
import { changeTracker, numberRange, creditManager } from '../../core/index.js'
import { roleHasAnyPermission } from '../../core/permission-service.js'

const router = Router()
router.use(authenticateToken)

// ⚠️ 安全收紧（P5）：本模块是客户主数据，含信用额度、账期、应收余额。
//    以前整个模块只挂 authenticateToken——客户门户和承运商门户的账号
//    拿自己的 token 就能读写全部客户资料。这里统一挡成只有运营端能进。
router.use(requireUserType('OPERATOR'))

/** 只有 client:credit 权限才能改的敏感字段（信用与账期） */
const CREDIT_FIELDS = ['creditLimit', 'credit_limit', 'creditLevel', 'credit_level',
  'riskCategory', 'risk_category', 'paymentTerms', 'payment_terms']

/**
 * 校验账期：clients.payment_terms 是 INTEGER（天数）
 * 前端历史上传过 'net_30' 这种字符串，会让 PostgreSQL 直接报类型错误，
 * 所以在入库前先挡一道
 * @param {*} value - 请求里的账期值
 * @returns {number|null} 合法天数，或 null 表示"没传"
 */
function parsePaymentTerms(value) {
  if (value === undefined || value === null || value === '') return null
  const days = Number(value)
  if (!Number.isInteger(days) || days < 0 || days > 365) {
    throw new Error('参数错误：账期必须是 0-365 之间的整数天数')
  }
  return days
}

// 客户变更追踪字段
const CLIENT_FIELDS = [
  { name: 'company_name', label: '公司名称' },
  { name: 'client_level', label: '客户等级' },
  { name: 'credit_limit', label: '信用额度' },
  { name: 'credit_level', label: '信用等级' },
  { name: 'risk_category', label: '风险类别' },
  { name: 'credit_blocked', label: '信用冻结' },
  { name: 'payment_terms', label: '账期' },
  { name: 'status', label: '状态' },
  { name: 'invoice_email', label: '发票邮箱' }
]

/**
 * 客户列表
 * GET /api/v1/clients
 */
router.get('/', requirePermission('client:view'), async (req, res) => {
  try {
    const { search, status, clientLevel, creditLevel, page = 1, pageSize = 20 } = req.query
    let sql = `
      SELECT c.*,
        (SELECT COUNT(*) FROM orders o WHERE o.client_id = c.id) as order_count,
        (SELECT COALESCE(SUM(amount - paid_amount), 0) FROM financial_records
         WHERE counterparty_type = 'CLIENT' AND counterparty_id = c.id
         AND type = 'RECEIVABLE' AND payment_status IN ('UNPAID','PARTIAL','OVERDUE')) as outstanding_amount
      FROM clients c WHERE 1=1`
    const params = []
    let idx = 0

    if (search) {
      params.push(`%${search}%`)
      sql += ` AND (c.company_name ILIKE $${++idx} OR c.vat_number ILIKE $${idx} OR c.client_code ILIKE $${idx})`
    }
    if (status) {
      params.push(status)
      sql += ` AND c.status = $${++idx}`
    }
    // 商务等级（VIP / NORMAL）和信用等级（A-D）是两套口径，各筛各的
    if (clientLevel) {
      params.push(clientLevel)
      sql += ` AND c.client_level = $${++idx}`
    }
    if (creditLevel) {
      params.push(creditLevel)
      sql += ` AND c.credit_level = $${++idx}`
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) t`, params)
    const total = parseInt(countResult.rows[0].total)

    sql += ` ORDER BY c.created_at DESC`
    params.push(parseInt(pageSize))
    sql += ` LIMIT $${++idx}`
    params.push((parseInt(page) - 1) * parseInt(pageSize))
    sql += ` OFFSET $${++idx}`

    const result = await query(sql, params)

    res.json({
      code: 200, message: 'success',
      data: result.rows,
      pagination: { total, page: parseInt(page), pageSize: parseInt(pageSize) }
    })
  } catch (error) {
    console.error('获取客户列表失败:', error)
    res.status(500).json({ code: 500, message: '获取客户列表失败', data: null })
  }
})

/**
 * 客户导出 Excel（放在 /:id 前面，避免被匹配为 id）
 * GET /api/v1/clients/export
 */
router.get('/export', requirePermission('client:export'), async (req, res) => {
  // Excel 表头按请求语言渲染（P9）
  const lang = resolveLang(req)
  try {
    const pool = getPool()
    const result = await pool.query(
      `SELECT client_code, company_name, vat_number, country, city,
              contact_name, contact_email, contact_phone,
              client_level, credit_limit, credit_level, payment_terms
       FROM clients WHERE status = 'ACTIVE'
       ORDER BY client_code ASC LIMIT 5000`
    )

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'EU-TMS'
    workbook.created = new Date()
    const sheet = workbook.addWorksheet(t(lang, 'excel.sheetClients'))

    const creditLevelMap = {
      A: t(lang, 'excel.creditLevelA'), B: t(lang, 'excel.creditLevelB'),
      C: t(lang, 'excel.creditLevelC'), D: t(lang, 'excel.creditLevelD'),
    }

    sheet.columns = [
      { header: t(lang, 'excel.clientCode'), key: 'clientCode', width: 16 },
      { header: t(lang, 'excel.companyName'), key: 'companyName', width: 28 },
      { header: t(lang, 'excel.vatNumber'), key: 'vatNumber', width: 22 },
      { header: t(lang, 'excel.country'), key: 'country', width: 12 },
      { header: t(lang, 'excel.city'), key: 'city', width: 14 },
      { header: t(lang, 'excel.contactName'), key: 'contactName', width: 14 },
      { header: t(lang, 'excel.email'), key: 'email', width: 24 },
      { header: t(lang, 'excel.phone'), key: 'phone', width: 16 },
      { header: t(lang, 'excel.clientLevel'), key: 'clientLevel', width: 12 },
      { header: t(lang, 'excel.creditLimit'), key: 'creditLimit', width: 14 },
      { header: t(lang, 'excel.creditLevel'), key: 'creditLevel', width: 12 },
      { header: t(lang, 'excel.paymentTermsDays'), key: 'paymentTerms', width: 10 },
    ]

    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } }

    for (const row of result.rows) {
      sheet.addRow({
        clientCode: row.client_code || '-',
        companyName: row.company_name || '-',
        vatNumber: row.vat_number || '-',
        country: row.country || '-',
        city: row.city || '-',
        contactName: row.contact_name || '-',
        email: row.contact_email || '-',
        phone: row.contact_phone || '-',
        clientLevel: row.client_level === 'VIP' ? 'VIP' : '普通',
        creditLimit: row.credit_limit ? Number(row.credit_limit) : 0,
        creditLevel: creditLevelMap[row.credit_level] || row.credit_level || '-',
        paymentTerms: row.payment_terms ? Number(row.payment_terms) : 30,
      })
    }

    const filename = `clients_${new Date().toISOString().slice(0, 10)}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    await workbook.xlsx.write(res)
    res.end()
  } catch (error) {
    console.error('客户导出失败:', error)
    res.status(500).json({ code: 500, message: '导出失败' })
  }
})

/**
 * 客户详情
 * GET /api/v1/clients/:id
 */
router.get('/:id', requirePermission('client:view'), async (req, res) => {
  try {
    const result = await query(`SELECT * FROM clients WHERE id = $1`, [req.params.id])
    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null })
    }
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    console.error('获取客户详情失败:', error)
    res.status(500).json({ code: 500, message: '获取客户详情失败', data: null })
  }
})

/**
 * 创建客户
 * POST /api/v1/clients
 */
router.post('/', requirePermission('client:create'), async (req, res) => {
  try {
    const paymentTerms = parsePaymentTerms(req.body.paymentTerms)

    const client = await withTransaction(async (tx) => {
      // 通过编号范围生成客户编码
      const { docNumber } = await numberRange.getNextNumber(tx, 'CLT', 'DE01')

      const result = await tx.query(
        `INSERT INTO clients
         (client_code, company_name, vat_number, country, city, address,
          contact_name, contact_email, contact_phone, invoice_email,
          client_level, credit_limit, credit_level, risk_category, payment_terms,
          status, company_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING *`,
        [docNumber, req.body.companyName, req.body.vatNumber, req.body.country,
         req.body.city, req.body.address, req.body.contactName, req.body.contactEmail,
         req.body.contactPhone, req.body.invoiceEmail,
         req.body.clientLevel === 'VIP' ? 'VIP' : 'NORMAL',
         req.body.creditLimit || 0, req.body.creditLevel || 'C',
         req.body.riskCategory || 'MEDIUM', paymentTerms ?? 30,
         'ACTIVE', 'DE01']
      )

      // 变更追踪
      await changeTracker.trackChanges(tx, {
        objectType: 'CLIENT', objectId: result.rows[0].id,
        changeType: 'INSERT', transactionType: 'CREATE_CLIENT',
        tableName: 'clients', newData: result.rows[0],
        trackedFields: CLIENT_FIELDS, changedBy: req.user.id
      })

      return result.rows[0]
    })

    res.json({ code: 200, message: '客户创建成功', data: client })
  } catch (error) {
    console.error('创建客户失败:', error)
    // 参数校验失败返回 400，其余按系统错误返回 500
    const statusCode = error.message.startsWith('参数错误') ? 400 : 500
    res.status(statusCode).json({ code: statusCode, message: error.message, data: null })
  }
})

/**
 * 编辑客户
 * PUT /api/v1/clients/:id
 */
// 编辑客户是两种权限的组合：
//   client:edit   —— 改普通资料（公司名、地址、联系人……）
//   client:credit —— 改信用额度/等级/风险类别/账期（财务岗有它，但没有 client:edit）
// 所以路由层放行"任意一个"，具体改哪些字段在处理函数里按字段判。
router.put('/:id', requirePermission('client:edit', 'client:credit'), async (req, res) => {
  try {
    const touchedCredit = CREDIT_FIELDS.some(f => req.body[f] !== undefined)
    const touchedNormal = Object.keys(req.body).some(k => !CREDIT_FIELDS.includes(k))

    if (touchedCredit && !(await roleHasAnyPermission(req.user.roleCode, ['client:credit']))) {
      return res.status(403).json({
        code: 403,
        message: '没有权限修改信用额度、信用等级、风险类别或账期',
        data: null
      })
    }
    if (touchedNormal && !(await roleHasAnyPermission(req.user.roleCode, ['client:edit']))) {
      return res.status(403).json({
        code: 403,
        message: '没有权限修改客户资料',
        data: null
      })
    }

    // 账期先校验再进 SQL（见 parsePaymentTerms 注释）
    const paymentTerms = parsePaymentTerms(
      req.body.paymentTerms !== undefined ? req.body.paymentTerms : req.body.payment_terms
    )
    delete req.body.payment_terms
    if (paymentTerms !== null) {
      req.body.paymentTerms = paymentTerms
    } else {
      // 传了空字符串等于"不改这个字段"，别让空值进 SQL
      delete req.body.paymentTerms
    }

    await withTransaction(async (tx) => {
      const old = await tx.query(`SELECT * FROM clients WHERE id = $1`, [req.params.id])
      if (old.rows.length === 0) throw new Error('客户不存在')

      const fields = ['company_name', 'vat_number', 'country', 'city', 'address',
        'contact_name', 'contact_email', 'contact_phone', 'invoice_email',
        'client_level', 'credit_limit', 'credit_level', 'risk_category',
        'payment_terms', 'status']
      const setClauses = []
      const params = []
      let idx = 0

      // camelCase → snake_case 映射
      const map = {
        companyName: 'company_name', vatNumber: 'vat_number',
        contactName: 'contact_name', contactEmail: 'contact_email',
        contactPhone: 'contact_phone', invoiceEmail: 'invoice_email',
        clientLevel: 'client_level',
        creditLimit: 'credit_limit', creditLevel: 'credit_level',
        riskCategory: 'risk_category', paymentTerms: 'payment_terms'
      }

      const newData = {}
      for (const [camel, snake] of Object.entries(map)) {
        if (req.body[camel] !== undefined) {
          params.push(req.body[camel])
          setClauses.push(`${snake} = $${++idx}`)
          newData[snake] = req.body[camel]
        }
      }
      // 也支持直接传 snake_case
      for (const f of fields) {
        if (req.body[f] !== undefined && !newData[f]) {
          params.push(req.body[f])
          setClauses.push(`${f} = $${++idx}`)
          newData[f] = req.body[f]
        }
      }

      if (setClauses.length === 0) throw new Error('没有可更新的字段')

      params.push(req.params.id)
      setClauses.push(`updated_at = NOW()`)
      await tx.query(`UPDATE clients SET ${setClauses.join(', ')} WHERE id = $${++idx}`, params)

      await changeTracker.trackChanges(tx, {
        objectType: 'CLIENT', objectId: req.params.id,
        changeType: 'UPDATE', transactionType: 'EDIT_CLIENT',
        tableName: 'clients', oldData: old.rows[0], newData,
        trackedFields: CLIENT_FIELDS, changedBy: req.user.id
      })
    })

    res.json({ code: 200, message: '客户更新成功', data: null })
  } catch (error) {
    console.error('编辑客户失败:', error)
    res.status(400).json({ code: 400, message: error.message, data: null })
  }
})

/**
 * 客户订单历史
 * GET /api/v1/clients/:id/orders
 */
router.get('/:id/orders', requirePermission('client:view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT id, order_number, business_type, status, transport_type,
              client_price, currency, pickup_date, delivery_date, created_at,
              pickup_address->>'city' as pickup_city,
              delivery_address->>'city' as delivery_city
       FROM orders WHERE client_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取订单历史失败', data: null })
  }
})

/**
 * 客户财务概览
 * GET /api/v1/clients/:id/finance
 */
router.get('/:id/finance', requirePermission('client:view'), async (req, res) => {
  try {
    const stats = await query(
      `SELECT
         COALESCE(SUM(amount), 0) as total_receivable,
         COALESCE(SUM(paid_amount), 0) as total_paid,
         COALESCE(SUM(CASE WHEN payment_status = 'OVERDUE' THEN amount - paid_amount ELSE 0 END), 0) as overdue_amount
       FROM financial_records
       WHERE counterparty_type = 'CLIENT' AND counterparty_id = $1 AND type = 'RECEIVABLE'`,
      [req.params.id]
    )
    const records = await query(
      `SELECT id, record_number, order_id, amount, paid_amount, currency,
              payment_status, due_date, created_at
       FROM financial_records
       WHERE counterparty_type = 'CLIENT' AND counterparty_id = $1 AND type = 'RECEIVABLE'
       ORDER BY created_at DESC LIMIT 20`,
      [req.params.id]
    )
    res.json({ code: 200, message: 'success', data: { stats: stats.rows[0], records: records.rows } })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取财务概览失败', data: null })
  }
})

/**
 * 客户信用检查日志（P7 需求 6）
 * GET /api/v1/clients/:id/credit-logs
 *
 * 只给有 client:credit 的人看：日志里带着额度、敞口和被拦截的订单金额。
 */
router.get('/:id/credit-logs', requirePermission('client:credit'), async (req, res) => {
  try {
    const { result: resultFilter, page = 1, pageSize = 20 } = req.query

    let sql = `
      SELECT l.id, l.check_point, l.order_id, l.credit_limit, l.credit_exposure,
             l.order_amount, l.check_result, l.override_reason, l.checked_at,
             COALESCE(u.display_name, u.username) AS override_by_name,
             o.order_number
      FROM credit_check_logs l
      LEFT JOIN users u ON u.id = l.override_by
      LEFT JOIN orders o ON o.id = l.order_id
      WHERE l.client_id = $1`
    const params = [req.params.id]
    let idx = 1

    if (resultFilter) {
      params.push(resultFilter)
      sql += ` AND l.check_result = $${++idx}`
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) t`, params)

    sql += ` ORDER BY l.checked_at DESC`
    params.push(parseInt(pageSize))
    sql += ` LIMIT $${++idx}`
    params.push((parseInt(page) - 1) * parseInt(pageSize))
    sql += ` OFFSET $${++idx}`

    const logs = await query(sql, params)

    res.json({
      code: 200, message: 'success', data: logs.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    })
  } catch (error) {
    console.error('[Client] 获取信用检查日志失败:', error)
    res.status(500).json({ code: 500, message: '获取信用检查日志失败', data: null })
  }
})

/**
 * 人工信用释放（P7 需求 6）
 * POST /api/v1/clients/:id/credit-release
 * body: { logId, reason }
 *
 * 做两件事：把那条被拦的检查日志标成 PASSED、解除客户的信用冻结标记。
 * ⚠️ 注意：如果这次拦截是「敞口超额」造成的，光释放只解决当下这一次——
 *    敞口没降下去，下一单照样会被拦。真要长期放行得同时调高信用额度，
 *    前端在释放弹窗里有对应提示。
 */
router.post('/:id/credit-release', requirePermission('client:credit'), async (req, res) => {
  try {
    const { logId, reason } = req.body || {}
    if (!logId) {
      return res.status(400).json({ code: 400, message: '参数错误：缺少信用检查日志 ID', data: null })
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ code: 400, message: '参数错误：请填写释放原因', data: null })
    }

    const log = await query(
      `SELECT id, client_id, check_result FROM credit_check_logs WHERE id = $1`, [logId]
    )
    if (log.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '信用检查记录不存在', data: null })
    }
    // 防止拿 A 客户的 logId 去释放 B 客户
    if (log.rows[0].client_id !== req.params.id) {
      return res.status(400).json({ code: 400, message: '参数错误：该检查记录不属于此客户', data: null })
    }
    if (log.rows[0].check_result === 'PASSED') {
      return res.status(400).json({ code: 400, message: '这条记录本来就是通过的，无需释放', data: null })
    }

    await withTransaction(async (tx) => {
      const old = await tx.query(`SELECT credit_blocked FROM clients WHERE id = $1`, [req.params.id])
      if (old.rows.length === 0) throw new Error('客户不存在')

      await creditManager.overrideBlock(tx, req.params.id, logId, req.user.id, reason.trim())

      await changeTracker.trackChanges(tx, {
        objectType: 'CLIENT',
        objectId: req.params.id,
        changeType: 'UPDATE',
        transactionType: 'CREDIT_RELEASE',
        tableName: 'clients',
        oldData: { credit_blocked: old.rows[0].credit_blocked },
        newData: { credit_blocked: false },
        trackedFields: CLIENT_FIELDS,
        changedBy: req.user.id
      })
    })

    res.json({ code: 200, message: '信用已释放', data: null })
  } catch (error) {
    console.error('[Client] 信用释放失败:', error)
    res.status(500).json({ code: 500, message: error.message || '信用释放失败', data: null })
  }
})

/**
 * 手动冻结 / 解冻客户信用（P7 需求 6）
 * PUT /api/v1/clients/:id/credit-block
 * body: { blocked: true|false, reason }
 */
router.put('/:id/credit-block', requirePermission('client:credit'), async (req, res) => {
  try {
    const { blocked, reason } = req.body || {}
    if (typeof blocked !== 'boolean') {
      return res.status(400).json({ code: 400, message: '参数错误：blocked 必须是 true 或 false', data: null })
    }
    if (blocked && (!reason || !reason.trim())) {
      return res.status(400).json({ code: 400, message: '参数错误：冻结必须填写原因', data: null })
    }

    await withTransaction(async (tx) => {
      const old = await tx.query(
        `SELECT credit_blocked, company_name FROM clients WHERE id = $1`, [req.params.id]
      )
      if (old.rows.length === 0) throw new Error('客户不存在')

      await tx.query(
        `UPDATE clients SET credit_blocked = $1, updated_at = NOW() WHERE id = $2`,
        [blocked, req.params.id]
      )

      // 手动冻结/解冻也记一条检查日志，和自动拦截的记录混排在同一条时间线上
      await tx.query(
        `INSERT INTO credit_check_logs
           (client_id, check_point, check_result, override_by, override_reason)
         VALUES ($1, 'MANUAL', $2, $3, $4)`,
        [req.params.id, blocked ? 'BLOCKED' : 'PASSED', req.user.id,
         blocked ? `人工冻结：${reason.trim()}` : `人工解冻：${(reason || '').trim() || '无'}`]
      )

      await changeTracker.trackChanges(tx, {
        objectType: 'CLIENT',
        objectId: req.params.id,
        changeType: 'UPDATE',
        transactionType: blocked ? 'CREDIT_BLOCK' : 'CREDIT_UNBLOCK',
        tableName: 'clients',
        oldData: { credit_blocked: old.rows[0].credit_blocked },
        newData: { credit_blocked: blocked },
        trackedFields: CLIENT_FIELDS,
        changedBy: req.user.id
      })
    })

    res.json({ code: 200, message: blocked ? '客户信用已冻结' : '客户信用已解冻', data: null })
  } catch (error) {
    console.error('[Client] 冻结/解冻信用失败:', error)
    res.status(500).json({ code: 500, message: error.message || '操作失败', data: null })
  }
})

// 客户作废/恢复：切换 status (ACTIVE <-> INACTIVE)
router.put('/:id/toggle-status', requirePermission('client:edit'), async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body || {}

    const current = await query('SELECT id, client_code, company_name, status FROM clients WHERE id = $1', [id])
    if (current.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '客户不存在', data: null })
    }
    const old = current.rows[0]

    // 如果要作废，需检查是否还有未完成的订单和未结清的应收
    if (old.status === 'ACTIVE') {
      if (!reason || !reason.trim()) {
        return res.status(400).json({ code: 400, message: '请填写作废原因', data: null })
      }
      const activeOrders = await query(
        `SELECT COUNT(*) as c FROM orders WHERE client_id = $1 AND status NOT IN ('COMPLETED','CANCELLED')`,
        [id]
      )
      if (parseInt(activeOrders.rows[0].c) > 0) {
        return res.status(400).json({
          code: 400,
          message: `该客户还有 ${activeOrders.rows[0].c} 个进行中的订单，请先处理完毕再作废`,
          data: null,
        })
      }
      const unpaidFinance = await query(
        `SELECT COUNT(*) as c FROM financial_records
         WHERE counterparty_type = 'CLIENT' AND counterparty_id = $1
         AND type = 'RECEIVABLE' AND payment_status IN ('UNPAID','PARTIAL','OVERDUE')`,
        [id]
      )
      if (parseInt(unpaidFinance.rows[0].c) > 0) {
        return res.status(400).json({
          code: 400,
          message: `该客户还有 ${unpaidFinance.rows[0].c} 笔未结清的应收账款，请先处理`,
          data: null,
        })
      }
    }

    const newStatus = old.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    const voidReason = old.status === 'ACTIVE' ? (reason || '').trim() : null

    await withTransaction(async (tx) => {
      await tx.query(
        `UPDATE clients SET status = $1, void_reason = $2, updated_at = NOW() WHERE id = $3`,
        [newStatus, voidReason, id]
      )

      // 变更追踪
      await changeTracker.trackChanges(tx, {
        objectType: 'CLIENT',
        objectId: id,
        changeType: 'UPDATE',
        transactionType: newStatus === 'INACTIVE' ? 'VOID_CLIENT' : 'RESTORE_CLIENT',
        tableName: 'clients',
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
    res.json({ code: 200, message: `客户 "${old.company_name}" 已${actionText}`, data: { status: newStatus } })
  } catch (error) {
    console.error('[Client] 切换状态失败:', error)
    res.status(500).json({ code: 500, message: error.message || '操作失败', data: null })
  }
})

export default router
