/**
 * 财务管理路由
 * 应收/应付 + 付款/收款 + 利润分析 + 账龄 + 报表
 * 所有财务操作通过凭证引擎和科目确定自动生成会计分录
 */

import { Router } from 'express'
import ExcelJS from 'exceljs'
import { authenticateToken, requireUserType, requirePermission, requireTenantBinding } from '../../middleware/auth.js'
import { withTransaction, query } from '../../core/db.js'
import { resolveLang, t } from '../../utils/i18n.js'
import { getPool } from '../../core/db.js'
import { documentEngine, accountDetermination, documentFlow } from '../../core/index.js'

const router = Router()
router.use(authenticateToken)
// 门户账号必须绑定公司才能进来——绑定为空时各处的租户过滤条件会整个不加，
// 等于返回全部数据（失效方向必须是拒绝，不是放行）
router.use(requireTenantBinding)

/**
 * 租户隔离（P5）
 *
 * 应收/应付列表以前直接用 query 里的 clientId / carrierId 筛选，
 * 客户门户账号把参数一换就能看到别家公司的账单金额，不传参数更是看全部。
 * 这里对客户/承运商强制按 JWT 里的 linkedEntityId 收窄。
 *
 * @param {object} user req.user
 * @param {'CLIENT'|'CARRIER'} ownerType 这个列表属于哪一方
 * @param {string} queryValue 前端传来的 clientId / carrierId
 * @returns {{value: string|undefined, forbidden: boolean}}
 *          forbidden = true 表示这个身份根本不该看这张表
 */
function resolveCounterparty(user, ownerType, queryValue) {
  const userType = user.userType || user.roleCode
  if (userType === 'CLIENT' || userType === 'CARRIER') {
    if (userType !== ownerType) return { value: undefined, forbidden: true }
    return { value: user.linkedEntityId, forbidden: false }
  }
  return { value: queryValue, forbidden: false }
}

// === 应收账款 ===
router.get('/receivables', requirePermission('finance:view', 'portal:billing_view'), async (req, res) => {
  try {
    const { paymentStatus, page = 1, pageSize = 20 } = req.query
    const scoped = resolveCounterparty(req.user, 'CLIENT', req.query.clientId)
    if (scoped.forbidden) {
      return res.status(403).json({ code: 403, message: '没有权限查看应收账款', data: null })
    }
    const clientId = scoped.value
    let sql = `SELECT fr.*, c.company_name as counterparty_name, o.order_number
      FROM financial_records fr LEFT JOIN clients c ON c.id = fr.counterparty_id
      LEFT JOIN orders o ON o.id = fr.order_id WHERE fr.type = 'RECEIVABLE'`
    const params = []; let idx = 0
    if (paymentStatus) { params.push(paymentStatus); sql += ` AND fr.payment_status = $${++idx}` }
    if (clientId) { params.push(clientId); sql += ` AND fr.counterparty_id = $${++idx}` }
    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) t`, params)
    sql += ` ORDER BY fr.due_date ASC`
    params.push(parseInt(pageSize)); sql += ` LIMIT $${++idx}`
    params.push((parseInt(page) - 1) * parseInt(pageSize)); sql += ` OFFSET $${++idx}`
    const result = await query(sql, params)
    res.json({ code: 200, message: 'success', data: result.rows,
      pagination: { total: parseInt(countResult.rows[0].total), page: parseInt(page), pageSize: parseInt(pageSize) } })
  } catch (error) { res.status(500).json({ code: 500, message: '获取应收列表失败', data: null }) }
})

// === 应付账款 ===
router.get('/payables', requirePermission('finance:view', 'carrier_portal:billing_view'), async (req, res) => {
  try {
    const { paymentStatus, page = 1, pageSize = 20 } = req.query
    const scoped = resolveCounterparty(req.user, 'CARRIER', req.query.carrierId)
    if (scoped.forbidden) {
      return res.status(403).json({ code: 403, message: '没有权限查看应付账款', data: null })
    }
    const carrierId = scoped.value
    let sql = `SELECT fr.*, cr.company_name as counterparty_name, o.order_number
      FROM financial_records fr LEFT JOIN carriers cr ON cr.id = fr.counterparty_id
      LEFT JOIN orders o ON o.id = fr.order_id WHERE fr.type = 'PAYABLE'`
    const params = []; let idx = 0
    if (paymentStatus) { params.push(paymentStatus); sql += ` AND fr.payment_status = $${++idx}` }
    if (carrierId) { params.push(carrierId); sql += ` AND fr.counterparty_id = $${++idx}` }
    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) t`, params)
    sql += ` ORDER BY fr.due_date ASC`
    params.push(parseInt(pageSize)); sql += ` LIMIT $${++idx}`
    params.push((parseInt(page) - 1) * parseInt(pageSize)); sql += ` OFFSET $${++idx}`
    const result = await query(sql, params)
    res.json({ code: 200, message: 'success', data: result.rows,
      pagination: { total: parseInt(countResult.rows[0].total), page: parseInt(page), pageSize: parseInt(pageSize) } })
  } catch (error) { res.status(500).json({ code: 500, message: '获取应付列表失败', data: null }) }
})

// === 应收导出 Excel ===
router.get('/export/receivables', requireUserType('OPERATOR'), requirePermission('finance:export'), async (req, res) => {
  // Excel 表头按请求语言渲染（P9）
  const lang = resolveLang(req)
  try {
    const pool = getPool()
    const result = await pool.query(
      `SELECT fr.record_number, c.company_name as counterparty_name, o.order_number,
              fr.amount, fr.currency, fr.payment_status, fr.due_date, fr.paid_amount
       FROM financial_records fr
       LEFT JOIN clients c ON c.id = fr.counterparty_id
       LEFT JOIN orders o ON o.id = fr.order_id
       WHERE fr.type = 'RECEIVABLE'
       ORDER BY fr.due_date ASC LIMIT 5000`
    )

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'EU-TMS'
    workbook.created = new Date()
    const sheet = workbook.addWorksheet(t(lang, 'excel.sheetReceivables'))

    const statusMap = {
      UNPAID: '未付款', PARTIAL: '部分付款', PAID: '已付款', OVERDUE: '已逾期', VOID: '已作废'
    }

    sheet.columns = [
      { header: t(lang, 'excel.billNo'), key: 'recordNumber', width: 18 },
      { header: t(lang, 'excel.client'), key: 'client', width: 24 },
      { header: t(lang, 'excel.relatedOrder'), key: 'orderNumber', width: 18 },
      { header: t(lang, 'excel.amount'), key: 'amount', width: 14 },
      { header: t(lang, 'excel.currency'), key: 'currency', width: 8 },
      { header: t(lang, 'excel.status'), key: 'status', width: 12 },
      { header: t(lang, 'excel.dueDate'), key: 'dueDate', width: 14 },
      { header: t(lang, 'excel.paidAmount'), key: 'paidAmount', width: 14 },
    ]

    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } }

    for (const row of result.rows) {
      sheet.addRow({
        recordNumber: row.record_number || '-',
        client: row.counterparty_name || '-',
        orderNumber: row.order_number || '-',
        amount: row.amount ? Number(row.amount) : 0,
        currency: row.currency || 'EUR',
        status: statusMap[row.payment_status] || row.payment_status || '-',
        dueDate: row.due_date ? new Date(row.due_date).toISOString().slice(0, 10) : '-',
        paidAmount: row.paid_amount ? Number(row.paid_amount) : 0,
      })
    }

    const filename = `receivables_${new Date().toISOString().slice(0, 10)}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    await workbook.xlsx.write(res)
    res.end()
  } catch (error) {
    console.error('应收导出失败:', error)
    res.status(500).json({ code: 500, message: '导出失败' })
  }
})

// === 应付导出 Excel ===
router.get('/export/payables', requireUserType('OPERATOR'), requirePermission('finance:export'), async (req, res) => {
  // Excel 表头按请求语言渲染（P9）
  const lang = resolveLang(req)
  try {
    const pool = getPool()
    const result = await pool.query(
      `SELECT fr.record_number, cr.company_name as counterparty_name, o.order_number,
              fr.amount, fr.currency, fr.payment_status, fr.due_date, fr.paid_amount
       FROM financial_records fr
       LEFT JOIN carriers cr ON cr.id = fr.counterparty_id
       LEFT JOIN orders o ON o.id = fr.order_id
       WHERE fr.type = 'PAYABLE'
       ORDER BY fr.due_date ASC LIMIT 5000`
    )

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'EU-TMS'
    workbook.created = new Date()
    const sheet = workbook.addWorksheet(t(lang, 'excel.sheetPayables'))

    const statusMap = {
      UNPAID: '未付款', PARTIAL: '部分付款', PAID: '已付款', OVERDUE: '已逾期', VOID: '已作废'
    }

    sheet.columns = [
      { header: t(lang, 'excel.billNo'), key: 'recordNumber', width: 18 },
      { header: t(lang, 'excel.carrier'), key: 'carrier', width: 24 },
      { header: t(lang, 'excel.relatedOrder'), key: 'orderNumber', width: 18 },
      { header: t(lang, 'excel.amount'), key: 'amount', width: 14 },
      { header: t(lang, 'excel.currency'), key: 'currency', width: 8 },
      { header: t(lang, 'excel.status'), key: 'status', width: 12 },
      { header: t(lang, 'excel.dueDate'), key: 'dueDate', width: 14 },
      { header: t(lang, 'excel.paidAmount'), key: 'paidAmount', width: 14 },
    ]

    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } }

    for (const row of result.rows) {
      sheet.addRow({
        recordNumber: row.record_number || '-',
        carrier: row.counterparty_name || '-',
        orderNumber: row.order_number || '-',
        amount: row.amount ? Number(row.amount) : 0,
        currency: row.currency || 'EUR',
        status: statusMap[row.payment_status] || row.payment_status || '-',
        dueDate: row.due_date ? new Date(row.due_date).toISOString().slice(0, 10) : '-',
        paidAmount: row.paid_amount ? Number(row.paid_amount) : 0,
      })
    }

    const filename = `payables_${new Date().toISOString().slice(0, 10)}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    await workbook.xlsx.write(res)
    res.end()
  } catch (error) {
    console.error('应付导出失败:', error)
    res.status(500).json({ code: 500, message: '导出失败' })
  }
})

// === 创建财务记录（应收/应付发票） ===
router.post('/records', requireUserType('OPERATOR'), requirePermission('finance:create'), async (req, res) => {
  try {
    const record = await withTransaction(async (client) => {
      const { type, counterpartyType, counterpartyId, orderId, amount, currency, dueDate, remarks } = req.body
      const docType = type === 'RECEIVABLE' ? 'FI_AR' : 'FI_AP'
      const companyCode = 'DE01'

      const doc = await documentEngine.createDocument(client, {
        docType, companyCode, postingDate: new Date(),
        headerText: `${type === 'RECEIVABLE' ? '应收' : '应付'}发票`, createdBy: req.user.id
      })

      let businessType = 'ALL'
      if (orderId) {
        const order = await client.query(`SELECT business_type, document_id FROM orders WHERE id = $1`, [orderId])
        if (order.rows[0]) {
          businessType = order.rows[0].business_type
          await documentFlow.createFlowLink(client, {
            precedingDocType: 'ORD', precedingDocId: order.rows[0].document_id,
            subsequentDocType: docType, subsequentDocId: doc.id,
            flowType: `ORDER_TO_${docType}`, amount, currency
          })
        }
      }

      await accountDetermination.createJournalEntries(client, {
        documentId: doc.id,
        transactionType: type === 'RECEIVABLE' ? 'AR_INVOICE' : 'AP_INVOICE',
        businessType, amount: parseFloat(amount), currency: currency || 'EUR',
        postingDate: new Date(), companyCode,
        subledgerType: counterpartyType, subledgerId: counterpartyId, orderId
      })

      const result = await client.query(
        `INSERT INTO financial_records
         (document_id, record_number, order_id, type, counterparty_type, counterparty_id,
          amount, currency, payment_status, due_date, remarks, company_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'UNPAID',$9,$10,$11) RETURNING *`,
        [doc.id, doc.docNumber, orderId, type, counterpartyType, counterpartyId,
         amount, currency || 'EUR', dueDate, remarks, companyCode])
      return result.rows[0]
    })
    res.json({ code: 200, message: '财务记录创建成功', data: record })
  } catch (error) {
    console.error('创建财务记录失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

// === 记录付款/收款 ===
router.put('/:id/payment', requireUserType('OPERATOR'), requirePermission('finance:payment'), async (req, res) => {
  try {
    await withTransaction(async (client) => {
      const fr = await client.query(`SELECT * FROM financial_records WHERE id = $1`, [req.params.id])
      if (fr.rows.length === 0) throw new Error('财务记录不存在')
      const record = fr.rows[0]
      if (['PAID', 'VOID'].includes(record.payment_status)) throw new Error(`状态 ${record.payment_status} 不允许付款`)

      const payAmount = parseFloat(req.body.amount)
      const newPaidAmount = parseFloat(record.paid_amount) + payAmount
      if (newPaidAmount > parseFloat(record.amount)) throw new Error(`付款金额超出`)

      const newStatus = newPaidAmount >= parseFloat(record.amount) ? 'PAID' : 'PARTIAL'
      const docType = record.type === 'RECEIVABLE' ? 'FI_REC' : 'FI_PAY'

      const doc = await documentEngine.createDocument(client, {
        docType, companyCode: record.company_code || 'DE01', postingDate: new Date(),
        headerText: `${record.type === 'RECEIVABLE' ? '收款' : '付款'} ${record.record_number}`,
        sourceDocType: record.type === 'RECEIVABLE' ? 'FI_AR' : 'FI_AP',
        sourceDocId: record.document_id, createdBy: req.user.id
      })

      await accountDetermination.createJournalEntries(client, {
        documentId: doc.id,
        transactionType: record.type === 'RECEIVABLE' ? 'AR_PAYMENT' : 'AP_PAYMENT',
        businessType: 'ALL', amount: payAmount, currency: record.currency,
        postingDate: new Date(), companyCode: record.company_code || 'DE01',
        subledgerType: record.counterparty_type, subledgerId: record.counterparty_id, orderId: record.order_id
      })

      const updateFields = { paid_amount: newPaidAmount, payment_status: newStatus, updated_at: 'NOW()' }
      if (newStatus === 'PAID') {
        await client.query(
          `UPDATE financial_records SET paid_amount = $1, payment_status = $2, paid_date = NOW(), updated_at = NOW() WHERE id = $3`,
          [newPaidAmount, newStatus, req.params.id])
      } else {
        await client.query(
          `UPDATE financial_records SET paid_amount = $1, payment_status = $2, updated_at = NOW() WHERE id = $3`,
          [newPaidAmount, newStatus, req.params.id])
      }
    })
    res.json({ code: 200, message: '付款记录成功', data: null })
  } catch (error) { res.status(400).json({ code: 400, message: error.message, data: null }) }
})

// === 作废发票（冲销） ===
router.put('/:id/void', requireUserType('OPERATOR'), requirePermission('finance:void'), async (req, res) => {
  try {
    await withTransaction(async (client) => {
      const fr = await client.query(`SELECT * FROM financial_records WHERE id = $1`, [req.params.id])
      if (fr.rows.length === 0) throw new Error('财务记录不存在')
      if (parseFloat(fr.rows[0].paid_amount) > 0) throw new Error('已有付款记录的发票不能直接作废，请先回滚付款')

      await documentEngine.reverseDocument(client, {
        originalDocId: fr.rows[0].document_id, reversalReason: req.body.reason || '发票作废',
        postingDate: new Date(), createdBy: req.user.id
      })
      await client.query(`UPDATE financial_records SET payment_status = 'VOID', updated_at = NOW() WHERE id = $1`, [req.params.id])
    })
    res.json({ code: 200, message: '发票已作废', data: null })
  } catch (error) { res.status(400).json({ code: 400, message: error.message, data: null }) }
})

// === 按客户利润分析 ===
router.get('/profit/by-client', requireUserType('OPERATOR'), requirePermission('finance:profit'), async (req, res) => {
  try {
    const result = await query(`
      SELECT c.id, c.company_name, c.client_code,
        COALESCE(SUM(o.client_price), 0) as total_revenue,
        COALESCE(SUM(o.carrier_cost), 0) as total_cost,
        COALESCE(SUM(o.client_price) - SUM(o.carrier_cost), 0) as gross_profit,
        CASE WHEN SUM(o.client_price) > 0
          THEN ROUND((SUM(o.client_price) - SUM(o.carrier_cost)) / SUM(o.client_price) * 100, 1)
          ELSE 0 END as margin_pct,
        COUNT(o.id) as order_count
      FROM clients c LEFT JOIN orders o ON o.client_id = c.id AND o.status = 'COMPLETED'
      GROUP BY c.id HAVING COUNT(o.id) > 0 ORDER BY gross_profit DESC`)
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) { res.status(500).json({ code: 500, message: '获取利润分析失败', data: null }) }
})

// === 账龄分析 ===
router.get('/aging/:type', requireUserType('OPERATOR'), requirePermission('finance:view'), async (req, res) => {
  try {
    const type = req.params.type === 'receivable' ? 'RECEIVABLE' : 'PAYABLE'
    const result = await query(`
      SELECT
        COALESCE(SUM(amount - paid_amount) FILTER (WHERE due_date >= CURRENT_DATE - INTERVAL '30 days'), 0) as "0_30",
        COALESCE(SUM(amount - paid_amount) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '30 days' AND due_date >= CURRENT_DATE - INTERVAL '60 days'), 0) as "31_60",
        COALESCE(SUM(amount - paid_amount) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '60 days' AND due_date >= CURRENT_DATE - INTERVAL '90 days'), 0) as "61_90",
        COALESCE(SUM(amount - paid_amount) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '90 days'), 0) as "90_plus",
        COALESCE(SUM(amount - paid_amount), 0) as total
      FROM financial_records WHERE type = $1 AND payment_status IN ('UNPAID', 'PARTIAL', 'OVERDUE')`, [type])
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) { res.status(500).json({ code: 500, message: '获取账龄分析失败', data: null }) }
})

// === 财务摘要 ===
router.get('/summary', requireUserType('OPERATOR'), requirePermission('finance:view'), async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE type = 'RECEIVABLE' AND created_at >= date_trunc('month', CURRENT_DATE)), 0) as month_revenue,
        COALESCE(SUM(amount - paid_amount) FILTER (WHERE type = 'RECEIVABLE' AND payment_status IN ('UNPAID','PARTIAL','OVERDUE')), 0) as ar_outstanding,
        COALESCE(SUM(amount - paid_amount) FILTER (WHERE type = 'PAYABLE' AND payment_status IN ('UNPAID','PARTIAL','OVERDUE')), 0) as ap_outstanding
      FROM financial_records`)
    const profitResult = await query(`
      SELECT COALESCE(SUM(client_price), 0) as rev, COALESCE(SUM(carrier_cost), 0) as cost
      FROM orders WHERE status = 'COMPLETED' AND created_at >= date_trunc('month', CURRENT_DATE)`)
    const p = profitResult.rows[0]
    const marginPct = parseFloat(p.rev) > 0 ? ((parseFloat(p.rev) - parseFloat(p.cost)) / parseFloat(p.rev) * 100).toFixed(1) : 0
    res.json({ code: 200, message: 'success', data: {
      monthRevenue: parseFloat(result.rows[0].month_revenue),
      arOutstanding: parseFloat(result.rows[0].ar_outstanding),
      apOutstanding: parseFloat(result.rows[0].ap_outstanding), marginPct } })
  } catch (error) { res.status(500).json({ code: 500, message: '获取财务摘要失败', data: null }) }
})

export default router
