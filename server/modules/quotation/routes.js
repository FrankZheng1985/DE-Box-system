/**
 * 报价管理路由
 * 运营创建报价 → 发送给客户 → 客户接受/拒绝 → 一键转订单
 */

import { Router } from 'express'
import { authenticateToken } from '../../middleware/auth.js'
import { withTransaction, query } from '../../core/db.js'
import { documentEngine, documentFlow, pricingEngine, changeTracker } from '../../core/index.js'
import orderService from '../order/service.js'

const router = Router()
router.use(authenticateToken)

/**
 * 报价列表
 */
router.get('/', async (req, res) => {
  try {
    const { status, clientId, businessType, page = 1, pageSize = 20 } = req.query
    let sql = `
      SELECT q.*, c.company_name as client_name,
             u.display_name as created_by_name
      FROM quotations q
      LEFT JOIN clients c ON c.id = q.client_id
      LEFT JOIN users u ON u.id = q.created_by
      WHERE 1=1`
    const params = []; let idx = 0

    if (req.user.userType === 'CLIENT' && req.user.linkedEntityId) {
      params.push(req.user.linkedEntityId); sql += ` AND q.client_id = $${++idx}`
    } else if (clientId) {
      params.push(clientId); sql += ` AND q.client_id = $${++idx}`
    }
    if (status) { params.push(status); sql += ` AND q.status = $${++idx}` }
    if (businessType) { params.push(businessType); sql += ` AND q.business_type = $${++idx}` }

    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) t`, params)
    sql += ` ORDER BY q.created_at DESC`
    params.push(parseInt(pageSize)); sql += ` LIMIT $${++idx}`
    params.push((parseInt(page) - 1) * parseInt(pageSize)); sql += ` OFFSET $${++idx}`

    const result = await query(sql, params)
    res.json({
      code: 200, message: 'success', data: result.rows,
      pagination: { total: parseInt(countResult.rows[0].total), page: parseInt(page), pageSize: parseInt(pageSize) }
    })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取报价列表失败', data: null })
  }
})

/**
 * 报价统计
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) as month_total,
        COUNT(*) FILTER (WHERE status = 'SENT') as pending_response,
        COUNT(*) FILTER (WHERE status = 'ACCEPTED') as accepted,
        COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected
      FROM quotations
    `)
    const r = result.rows[0]
    const total = parseInt(r.accepted) + parseInt(r.rejected)
    res.json({
      code: 200, message: 'success',
      data: { ...r, conversionRate: total > 0 ? (parseInt(r.accepted) / total * 100).toFixed(1) : 0 }
    })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取统计失败', data: null })
  }
})

/**
 * 自动定价计算
 * POST /api/v1/quotations/calculate-price
 * 使用定价引擎根据业务类型和输入数据计算价格
 */
router.post('/calculate-price', async (req, res) => {
  try {
    const { procedureCode, inputData } = req.body
    if (!procedureCode || !inputData) {
      return res.status(400).json({ code: 400, message: '缺少 procedureCode 或 inputData', data: null })
    }

    const result = await withTransaction(async (client) => {
      return await pricingEngine.calculatePrice(client, procedureCode, inputData)
    })

    res.json({ code: 200, message: '定价计算成功', data: result })
  } catch (error) {
    console.error('定价计算失败:', error)
    res.status(500).json({ code: 500, message: error.message || '定价计算失败', data: null })
  }
})

/**
 * 报价详情
 */
router.get('/:id', async (req, res) => {
  try {
    const quo = await query(
      `SELECT q.*, c.company_name as client_name FROM quotations q
       LEFT JOIN clients c ON c.id = q.client_id WHERE q.id = $1`, [req.params.id])
    if (quo.rows.length === 0) return res.status(404).json({ code: 404, message: '报价不存在', data: null })

    // 获取定价明细
    const items = await query(
      `SELECT * FROM quotation_pricing_items WHERE quotation_id = $1 ORDER BY sort_order`, [req.params.id])

    res.json({ code: 200, message: 'success', data: { ...quo.rows[0], pricingItems: items.rows } })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取报价详情失败', data: null })
  }
})

/**
 * 创建报价（通过定价引擎计算）
 * POST /api/v1/quotations
 */
router.post('/', async (req, res) => {
  try {
    const quotation = await withTransaction(async (client) => {
      // 凭证引擎创建凭证
      const doc = await documentEngine.createDocument(client, {
        docType: 'QUO', companyCode: 'DE01', postingDate: new Date(),
        headerText: `报价 - ${req.body.clientId}`,
        sourceDocType: req.body.inquiryId ? 'INQ' : null,
        sourceDocId: req.body.inquiryDocId || null,
        createdBy: req.user.id
      })

      // 如果提供了定价输入，使用定价引擎自动计算
      let pricingResult = null
      if (req.body.usePricingEngine && req.body.pricingInput) {
        const procedureCode = req.body.businessType === 'CONTAINER' ? 'CONTAINER' : 'CURTAIN_SIDE'
        pricingResult = await pricingEngine.calculatePrice(client, procedureCode, req.body.pricingInput)
      }

      const totalPrice = pricingResult?.total || req.body.totalPrice ||
        ((req.body.baseFreight || 0) + (req.body.surcharge || 0) + (req.body.insuranceFee || 0))

      const result = await client.query(
        `INSERT INTO quotations
         (document_id, quotation_number, inquiry_id, client_id, version,
          route_from, route_to, business_type, transport_type,
          base_freight, surcharge, insurance_fee, total_price,
          currency, valid_until, status, remarks, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING *`,
        [doc.id, doc.docNumber, req.body.inquiryId, req.body.clientId, 1,
         JSON.stringify(req.body.routeFrom), JSON.stringify(req.body.routeTo),
         req.body.businessType, req.body.transportType,
         req.body.baseFreight || 0, req.body.surcharge || 0, req.body.insuranceFee || 0,
         totalPrice, req.body.currency || 'EUR',
         req.body.validUntil, 'DRAFT', req.body.remarks, req.user.id]
      )

      // 保存定价明细
      if (pricingResult?.items) {
        for (const item of pricingResult.items) {
          await client.query(
            `INSERT INTO quotation_pricing_items
             (quotation_id, step_number, condition_type_code, description,
              amount, currency, calc_type, is_subtotal, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [result.rows[0].id, item.stepNumber, item.typeCode, item.description,
             item.amount, item.currency, item.calcType, item.isSubtotal || false, item.stepNumber]
          )
        }
      }

      // 如果来源于询价，更新询价状态
      if (req.body.inquiryId) {
        await client.query(`UPDATE inquiries SET status = 'QUOTED', updated_at = NOW() WHERE id = $1`, [req.body.inquiryId])
      }

      return result.rows[0]
    })
    res.json({ code: 200, message: '报价创建成功', data: quotation })
  } catch (error) {
    console.error('创建报价失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 编辑报价
 */
router.put('/:id', async (req, res) => {
  try {
    await withTransaction(async (client) => {
      const old = await client.query(`SELECT * FROM quotations WHERE id = $1`, [req.params.id])
      if (old.rows.length === 0) throw new Error('报价不存在')
      if (!['DRAFT', 'SENT'].includes(old.rows[0].status)) throw new Error('当前状态不允许编辑')

      const map = {
        baseFreight: 'base_freight', surcharge: 'surcharge', insuranceFee: 'insurance_fee',
        totalPrice: 'total_price', validUntil: 'valid_until', remarks: 'remarks'
      }
      const setClauses = []; const params = []; let idx = 0
      for (const [camel, snake] of Object.entries(map)) {
        if (req.body[camel] !== undefined) { params.push(req.body[camel]); setClauses.push(`${snake} = $${++idx}`) }
      }
      if (req.body.routeFrom) { params.push(JSON.stringify(req.body.routeFrom)); setClauses.push(`route_from = $${++idx}`) }
      if (req.body.routeTo) { params.push(JSON.stringify(req.body.routeTo)); setClauses.push(`route_to = $${++idx}`) }

      if (setClauses.length === 0) throw new Error('没有可更新的字段')
      params.push(req.params.id); setClauses.push('updated_at = NOW()')
      await client.query(`UPDATE quotations SET ${setClauses.join(', ')} WHERE id = $${++idx}`, params)
    })
    res.json({ code: 200, message: '报价更新成功', data: null })
  } catch (error) {
    res.status(400).json({ code: 400, message: error.message, data: null })
  }
})

/**
 * 发送报价给客户
 */
router.post('/:id/send', async (req, res) => {
  try {
    await query(`UPDATE quotations SET status = 'SENT', updated_at = NOW() WHERE id = $1 AND status = 'DRAFT'`, [req.params.id])
    res.json({ code: 200, message: '报价已发送', data: null })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 客户接受报价
 */
router.post('/:id/accept', async (req, res) => {
  try {
    await withTransaction(async (client) => {
      const quo = await client.query(`SELECT * FROM quotations WHERE id = $1`, [req.params.id])
      if (quo.rows.length === 0) throw new Error('报价不存在')
      if (quo.rows[0].status !== 'SENT') throw new Error('仅已发送的报价可以接受')
      await client.query(`UPDATE quotations SET status = 'ACCEPTED', updated_at = NOW() WHERE id = $1`, [req.params.id])
      // 更新询价状态
      if (quo.rows[0].inquiry_id) {
        await client.query(`UPDATE inquiries SET status = 'ACCEPTED', updated_at = NOW() WHERE id = $1`, [quo.rows[0].inquiry_id])
      }
    })
    res.json({ code: 200, message: '报价已接受', data: null })
  } catch (error) {
    res.status(400).json({ code: 400, message: error.message, data: null })
  }
})

/**
 * 客户拒绝报价
 */
router.post('/:id/reject', async (req, res) => {
  try {
    await withTransaction(async (client) => {
      const quo = await client.query(`SELECT * FROM quotations WHERE id = $1`, [req.params.id])
      if (quo.rows.length === 0) throw new Error('报价不存在')
      await client.query(`UPDATE quotations SET status = 'REJECTED', updated_at = NOW() WHERE id = $1`, [req.params.id])
      if (quo.rows[0].inquiry_id) {
        await client.query(`UPDATE inquiries SET status = 'REJECTED', updated_at = NOW() WHERE id = $1`, [quo.rows[0].inquiry_id])
      }
    })
    res.json({ code: 200, message: '报价已拒绝', data: null })
  } catch (error) {
    res.status(400).json({ code: 400, message: error.message, data: null })
  }
})

/**
 * 创建新版本
 */
router.post('/:id/new-version', async (req, res) => {
  try {
    const newQuo = await withTransaction(async (client) => {
      const old = await client.query(`SELECT * FROM quotations WHERE id = $1`, [req.params.id])
      if (old.rows.length === 0) throw new Error('报价不存在')
      const prev = old.rows[0]
      const newVersion = prev.version + 1

      const doc = await documentEngine.createDocument(client, {
        docType: 'QUO', companyCode: 'DE01', postingDate: new Date(),
        headerText: `报价 V${newVersion}`, sourceDocType: 'QUO', sourceDocId: prev.document_id,
        createdBy: req.user.id
      })

      const result = await client.query(
        `INSERT INTO quotations
         (document_id, quotation_number, inquiry_id, client_id, version,
          route_from, route_to, business_type, transport_type,
          base_freight, surcharge, insurance_fee, total_price,
          currency, valid_until, status, remarks, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING *`,
        [doc.id, doc.docNumber, prev.inquiry_id, prev.client_id, newVersion,
         prev.route_from, prev.route_to, prev.business_type, prev.transport_type,
         req.body.baseFreight ?? prev.base_freight, req.body.surcharge ?? prev.surcharge,
         req.body.insuranceFee ?? prev.insurance_fee,
         req.body.totalPrice ?? prev.total_price,
         prev.currency, req.body.validUntil || prev.valid_until, 'DRAFT',
         req.body.remarks || prev.remarks, req.user.id]
      )
      // 标记旧版本为已过期
      await client.query(`UPDATE quotations SET status = 'EXPIRED' WHERE id = $1`, [req.params.id])
      return result.rows[0]
    })
    res.json({ code: 200, message: `新版本 V${newQuo.version} 创建成功`, data: newQuo })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 获取报价所有版本
 */
router.get('/:id/versions', async (req, res) => {
  try {
    // 先获取当前报价的 inquiry_id 和 client_id
    const current = await query(`SELECT inquiry_id, client_id, route_from, route_to FROM quotations WHERE id = $1`, [req.params.id])
    if (current.rows.length === 0) return res.status(404).json({ code: 404, message: '报价不存在', data: null })
    const { client_id, route_from, route_to } = current.rows[0]

    const result = await query(
      `SELECT id, quotation_number, version, total_price, currency, status, valid_until, created_at
       FROM quotations
       WHERE client_id = $1 AND route_from = $2 AND route_to = $3
       ORDER BY version DESC`,
      [client_id, route_from, route_to]
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取版本列表失败', data: null })
  }
})

/**
 * 报价转订单（一键下单）
 */
router.post('/:id/convert-order', async (req, res) => {
  try {
    const order = await withTransaction(async (client) => {
      const quo = await client.query(`SELECT * FROM quotations WHERE id = $1`, [req.params.id])
      if (quo.rows.length === 0) throw new Error('报价不存在')
      if (quo.rows[0].status !== 'ACCEPTED') throw new Error('仅已接受的报价可以转为订单')
      const q = quo.rows[0]

      const routeFrom = typeof q.route_from === 'string' ? JSON.parse(q.route_from) : q.route_from
      const routeTo = typeof q.route_to === 'string' ? JSON.parse(q.route_to) : q.route_to

      const order = await orderService.createOrder(client, {
        clientId: q.client_id,
        businessType: q.business_type,
        transportType: q.transport_type,
        pickupAddress: routeFrom,
        deliveryAddress: routeTo,
        clientPrice: parseFloat(q.total_price),
        currency: q.currency,
        quotationDocId: q.document_id,
        ...req.body  // 允许补充额外字段
      }, req.user.id)

      // 更新报价状态
      await client.query(`UPDATE quotations SET status = 'CONVERTED', updated_at = NOW() WHERE id = $1`, [req.params.id])

      return order
    })
    res.json({ code: 200, message: '订单创建成功', data: order })
  } catch (error) {
    console.error('报价转订单失败:', error)
    res.status(400).json({ code: 400, message: error.message, data: null })
  }
})

// 报价作废（软删除）: status -> CANCELLED
router.post('/:id/void', async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body || {}

    if (!reason || !reason.trim()) {
      return res.status(400).json({ code: 400, message: '请填写作废原因', data: null })
    }

    const current = await query('SELECT id, quotation_number, status FROM quotations WHERE id = $1', [id])
    if (current.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '报价不存在', data: null })
    }
    const old = current.rows[0]

    // 已接受/已转订单的报价不允许作废
    if (['ACCEPTED', 'CONVERTED'].includes(old.status)) {
      return res.status(400).json({
        code: 400,
        message: `报价状态为 ${old.status}，不可作废`,
        data: null,
      })
    }
    if (old.status === 'CANCELLED') {
      return res.status(400).json({ code: 400, message: '报价已作废', data: null })
    }

    await withTransaction(async (tx) => {
      await tx.query(
        `UPDATE quotations SET status = 'CANCELLED', void_reason = $1, updated_at = NOW() WHERE id = $2`,
        [reason.trim(), id]
      )
      await changeTracker.trackChanges(tx, {
        objectType: 'QUOTATION',
        objectId: id,
        changeType: 'UPDATE',
        transactionType: 'VOID_QUOTATION',
        tableName: 'quotations',
        oldData: { status: old.status },
        newData: { status: 'CANCELLED', void_reason: reason.trim() },
        trackedFields: [
          { name: 'status', label: '状态' },
          { name: 'void_reason', label: '作废原因' },
        ],
        changedBy: req.user.id,
      })
    })

    res.json({ code: 200, message: `报价 "${old.quotation_number}" 已作废`, data: null })
  } catch (error) {
    console.error('[Quotation] 作废失败:', error)
    res.status(500).json({ code: 500, message: error.message || '作废失败', data: null })
  }
})

export default router
