/**
 * 报价管理路由
 * 运营创建报价 → 发送给客户 → 客户接受/拒绝 → 一键转订单
 */

import { Router } from 'express'
import { authenticateToken, requireUserType } from '../../middleware/auth.js'
import { withTransaction, query } from '../../core/db.js'
import { documentEngine, documentFlow, pricingEngine, changeTracker } from '../../core/index.js'
import orderService, { BUSINESS_TYPES } from '../order/service.js'

const router = Router()
router.use(authenticateToken)

/**
 * 报价单状态
 *   DRAFT            草稿，运营还在编
 *   SENT             已发送给客户，等客户决策
 *   PENDING_DECISION 客户点了「待定」，还没拿定主意（需求 2，2026-08-01 新增）
 *   ACCEPTED         客户已接受
 *   CONVERTED        已生成订单（接受后自动建单成功即为此状态）
 *   REJECTED / EXPIRED / CANCELLED
 */
const QUOTATION_STATUS = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PENDING_DECISION: 'PENDING_DECISION',
  ACCEPTED: 'ACCEPTED',
  CONVERTED: 'CONVERTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
}

/** 客户可以做决策的状态：已发送、或之前点过待定 */
const CLIENT_DECIDABLE = [QUOTATION_STATUS.SENT, QUOTATION_STATUS.PENDING_DECISION]

/**
 * 取报价单并校验访问权限
 *
 * ⚠️ 改这里之前请先看踩坑 016：门户的数据边界必须后端按 JWT 强制。
 *    以前 accept / reject 只挂了 authenticateToken，**任何登录用户**
 *    （包括别家公司的客户账号、承运商账号）都能接受或拒绝任意一张报价。
 *
 * @returns {Promise<object|null>} 无权或不存在时已写好响应并返回 null
 */
async function loadQuotationWithAccessCheck(quotationId, req, res) {
  const result = await query(
    `SELECT q.*, c.company_name AS client_name
     FROM quotations q LEFT JOIN clients c ON c.id = q.client_id
     WHERE q.id = $1`,
    [quotationId]
  )
  if (result.rows.length === 0) {
    res.status(404).json({ code: 404, message: '报价不存在', data: null })
    return null
  }
  const quotation = result.rows[0]
  const userType = req.user.userType || req.user.roleCode
  if (userType === 'CLIENT' && quotation.client_id !== req.user.linkedEntityId) {
    res.status(403).json({ code: 403, message: '无权访问该报价单', data: null })
    return null
  }
  if (userType === 'CARRIER') {
    res.status(403).json({ code: 403, message: '无权访问该报价单', data: null })
    return null
  }
  return quotation
}

/**
 * 由报价单生成订单（需求 2 的核心）
 *
 * 报价里只有路线和金额，货物信息在询价单上，所以有 inquiry_id 时
 * 把询价的货物字段一并带过来，否则运营拿到的是一张空订单还得手工补。
 *
 * ⚠️ 信用超额（creditManager 返回 BLOCKED）时 createOrder 会抛错，
 *    调用方在事务里，整笔回滚 —— 报价状态不会变，符合 Frank 2026-08-01
 *    定的口径「拒绝建单，报价退回 SENT，让客户联系业务」。
 *
 * @returns {Promise<object>} 新建的订单
 */
async function createOrderFromQuotation(client, quotation, userId, extra = {}) {
  const routeFrom = parseJsonColumn(quotation.route_from)
  const routeTo = parseJsonColumn(quotation.route_to)

  // 询价单上的货物信息带进订单
  let inquiryData = {}
  if (quotation.inquiry_id) {
    const inq = await client.query(
      `SELECT cargo_description, cargo_weight_kg, cargo_volume_m3, cargo_quantity,
              special_requirements, pod, container_type, remarks
       FROM inquiries WHERE id = $1`,
      [quotation.inquiry_id]
    )
    if (inq.rows.length > 0) {
      const i = inq.rows[0]
      inquiryData = {
        cargoDescription: i.cargo_description,
        cargoWeightKg: i.cargo_weight_kg,
        cargoVolumeM3: i.cargo_volume_m3,
        cargoQuantity: i.cargo_quantity,
        specialRequirements: i.special_requirements,
        pod: i.pod,
        containerType: i.container_type,
        remarks: i.remarks,
      }
    }
  }

  const order = await orderService.createOrder(client, {
    ...inquiryData,
    clientId: quotation.client_id,
    businessType: quotation.business_type,
    transportType: quotation.transport_type,
    pickupAddress: routeFrom,
    deliveryAddress: routeTo,
    clientPrice: parseFloat(quotation.total_price),
    currency: quotation.currency,
    quotationDocId: quotation.document_id,   // createOrder 据此建 QUOTATION_TO_ORDER 单据流
    ...extra,
  }, userId)

  // 本地派送的初始状态是 PENDING_QUOTE（待报价），但报价已经被接受了，
  // 停在"待报价"是自相矛盾的 —— 推进一格到待派送。
  // 卡车 LTL/FTL 的初始状态就是 PENDING_REVIEW（待审核），正是需求 2 要的，不动。
  if (quotation.business_type === BUSINESS_TYPES.LOCAL_DELIVERY) {
    await orderService.updateStatus(
      client, order.id, 'PENDING_DISPATCH', userId, '客户接受报价，自动建单'
    )
  }

  await client.query(
    `UPDATE quotations
     SET status = $1, converted_order_id = $2, updated_at = NOW()
     WHERE id = $3`,
    [QUOTATION_STATUS.CONVERTED, order.id, quotation.id]
  )

  return order
}

/** JSONB 列可能是对象也可能是字符串，统一成对象 */
function parseJsonColumn(value) {
  if (!value) return {}
  if (typeof value === 'string') {
    try { return JSON.parse(value) || {} } catch { return {} }
  }
  return value
}

/**
 * 报价列表
 */
router.get('/', async (req, res) => {
  try {
    const { status, clientId, businessType, inquiryId, search, page = 1, pageSize = 20 } = req.query
    let sql = `
      SELECT q.*, c.company_name as client_name,
             u.display_name as created_by_name,
             i.inquiry_number, i.customer_ref,
             o.order_number as converted_order_number
      FROM quotations q
      LEFT JOIN clients c ON c.id = q.client_id
      LEFT JOIN users u ON u.id = q.created_by
      LEFT JOIN inquiries i ON i.id = q.inquiry_id
      LEFT JOIN orders o ON o.id = q.converted_order_id
      WHERE 1=1`
    const params = []; let idx = 0

    if (req.user.userType === 'CLIENT' && req.user.linkedEntityId) {
      params.push(req.user.linkedEntityId); sql += ` AND q.client_id = $${++idx}`
    } else if (clientId) {
      params.push(clientId); sql += ` AND q.client_id = $${++idx}`
    }
    if (status) { params.push(status); sql += ` AND q.status = $${++idx}` }
    if (businessType) { params.push(businessType); sql += ` AND q.business_type = $${++idx}` }
    if (inquiryId) { params.push(inquiryId); sql += ` AND q.inquiry_id = $${++idx}` }
    if (search) {
      params.push(`%${search}%`)
      sql += ` AND (q.quotation_number ILIKE $${++idx} OR c.company_name ILIKE $${idx} OR i.inquiry_number ILIKE $${idx})`
    }

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
    // ::int 让 pg 直接返回数字，省掉前端一层 parseInt（踩坑 002）
    let sql = `
      SELECT
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE))::int AS month_total,
        COUNT(*) FILTER (WHERE status = 'SENT')::int             AS pending_response,
        COUNT(*) FILTER (WHERE status = 'PENDING_DECISION')::int AS pending_decision,
        COUNT(*) FILTER (WHERE status IN ('ACCEPTED', 'CONVERTED'))::int AS accepted,
        COUNT(*) FILTER (WHERE status = 'REJECTED')::int         AS rejected
      FROM quotations WHERE 1=1`
    const params = []

    // 客户门户只统计自己公司的（踩坑 016）
    if (req.user.userType === 'CLIENT' && req.user.linkedEntityId) {
      params.push(req.user.linkedEntityId)
      sql += ` AND client_id = $1`
    }

    const result = await query(sql, params)
    const r = result.rows[0]
    const decided = r.accepted + r.rejected

    res.json({
      code: 200,
      message: 'success',
      // 一律 snake_case，和其它接口保持一致
      //（旧版这里混了个 camelCase 的 conversionRate，前端读 conversion_rate 永远是 undefined）
      data: {
        ...r,
        conversion_rate: decided > 0 ? Number((r.accepted / decided * 100).toFixed(1)) : 0,
      },
    })
  } catch (error) {
    console.error('获取报价统计失败:', error)
    res.status(500).json({ code: 500, message: '获取统计失败', data: null })
  }
})

/**
 * 自动定价计算
 * POST /api/v1/quotations/calculate-price
 * 使用定价引擎根据业务类型和输入数据计算价格
 */
router.post('/calculate-price', requireUserType('OPERATOR'), async (req, res) => {
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
    const quotation = await loadQuotationWithAccessCheck(req.params.id, req, res)
    if (!quotation) return

    // 定价明细 + 来源询价单 + 自动建出的订单
    const [items, inquiry, order] = await Promise.all([
      query(`SELECT * FROM quotation_pricing_items WHERE quotation_id = $1 ORDER BY sort_order`, [req.params.id]),
      quotation.inquiry_id
        ? query(`SELECT id, inquiry_number, customer_ref, contact_name, contact_phone, contact_email
                 FROM inquiries WHERE id = $1`, [quotation.inquiry_id])
        : Promise.resolve({ rows: [] }),
      quotation.converted_order_id
        ? query(`SELECT id, order_number, status FROM orders WHERE id = $1`, [quotation.converted_order_id])
        : Promise.resolve({ rows: [] }),
    ])

    res.json({
      code: 200, message: 'success',
      data: {
        ...quotation,
        pricingItems: items.rows,
        inquiry: inquiry.rows[0] || null,
        convertedOrder: order.rows[0] || null,
      },
    })
  } catch (error) {
    console.error('获取报价详情失败:', error)
    res.status(500).json({ code: 500, message: '获取报价详情失败', data: null })
  }
})

/**
 * 创建报价（通过定价引擎计算）
 * POST /api/v1/quotations
 */
router.post('/', requireUserType('OPERATOR'), async (req, res) => {
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
        // 迁移 105 已把 pricing_procedures.procedure_code 改成与业务类型同名，
        // 所以直接用 businessType；传了不认识的值就退回 LTL，避免取不到定价过程报错
        const VALID_PROCEDURES = ['TRUCK_LTL', 'TRUCK_FTL', 'LOCAL_DELIVERY']
        const procedureCode = VALID_PROCEDURES.includes(req.body.businessType)
          ? req.body.businessType
          : 'TRUCK_LTL'
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
router.put('/:id', requireUserType('OPERATOR'), async (req, res) => {
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
 * POST /api/v1/quotations/:id/send
 *
 * 发送后客户门户「我的报价」页才看得到并能做决策。
 * 邮件通知在 P4 接上（这里先只改状态）。
 */
router.post('/:id/send', requireUserType('OPERATOR'), async (req, res) => {
  try {
    // 旧版无条件 UPDATE ... WHERE status='DRAFT'，非草稿时影响 0 行却照样回
    // "报价已发送"，运营以为发出去了其实没有。改成按影响行数如实反馈。
    const result = await query(
      `UPDATE quotations SET status = $1, updated_at = NOW()
       WHERE id = $2 AND status = $3
       RETURNING id`,
      [QUOTATION_STATUS.SENT, req.params.id, QUOTATION_STATUS.DRAFT]
    )
    if (result.rowCount === 0) {
      const current = await query(`SELECT status FROM quotations WHERE id = $1`, [req.params.id])
      if (current.rows.length === 0) {
        return res.status(404).json({ code: 404, message: '报价不存在', data: null })
      }
      return res.status(400).json({
        code: 400,
        message: `报价当前状态为 ${current.rows[0].status}，仅草稿可以发送`,
        data: null,
      })
    }
    res.json({ code: 200, message: '报价已发送', data: null })
  } catch (error) {
    console.error('发送报价失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 客户接受报价 —— 自动生成订单（需求 2 核心）
 * POST /api/v1/quotations/:id/accept
 *
 * 老流程是「客户接受」和「运营手工点一键下单」两步，中间经常断档。
 * 现在接受即建单：卡车 LTL/FTL 落 PENDING_REVIEW（待审核）交运营审，
 * 本地派送落 PENDING_DISPATCH（待派送）。
 *
 * 手工的 convert-order 端点保留，用于历史上已 ACCEPTED 但没建单的存量报价。
 */
router.post('/:id/accept', requireUserType('OPERATOR', 'CLIENT'), async (req, res) => {
  try {
    const quotation = await loadQuotationWithAccessCheck(req.params.id, req, res)
    if (!quotation) return
    if (!CLIENT_DECIDABLE.includes(quotation.status)) {
      return res.status(400).json({
        code: 400,
        message: `报价当前状态为 ${quotation.status}，仅「已发送」或「待定」的报价可以接受`,
        data: null,
      })
    }

    const order = await withTransaction(async (client) => {
      // 行锁：防止客户在两个浏览器标签同时点接受，建出两张订单
      const locked = await client.query(
        `SELECT * FROM quotations WHERE id = $1 FOR UPDATE`, [req.params.id]
      )
      const quo = locked.rows[0]
      if (!CLIENT_DECIDABLE.includes(quo.status)) {
        throw new Error(`报价当前状态为 ${quo.status}，不能重复接受`)
      }

      await client.query(
        `UPDATE quotations
         SET status = $1, client_response_at = NOW(), client_response_by = $2,
             client_response_note = $3, updated_at = NOW()
         WHERE id = $4`,
        [QUOTATION_STATUS.ACCEPTED, req.user.id, req.body?.note || null, req.params.id]
      )

      if (quo.inquiry_id) {
        await client.query(
          `UPDATE inquiries SET status = 'ACCEPTED', updated_at = NOW() WHERE id = $1`,
          [quo.inquiry_id]
        )
      }

      // 建单失败（信用超额等）会抛错 → 整笔事务回滚 → 报价退回原状态
      return await createOrderFromQuotation(
        client, { ...quo, client_name: quotation.client_name }, req.user.id, req.body?.orderOverrides || {}
      )
    })

    res.json({
      code: 200,
      message: `报价已接受，订单 ${order.order_number} 已自动创建`,
      data: { orderId: order.id, orderNumber: order.order_number, status: order.status },
    })
  } catch (error) {
    console.error('接受报价失败:', error)
    // 信用超额是业务上的正常拒绝，给客户一句能看懂的话，而不是内核引擎的原文
    const isCreditBlock = String(error.message).includes('信用检查未通过')
    res.status(400).json({
      code: 400,
      message: isCreditBlock
        ? `${error.message}。报价未接受，请联系业务人员处理信用额度后再确认。`
        : error.message,
      data: null,
    })
  }
})

/**
 * 客户标记「待定」（需求 2）
 * POST /api/v1/quotations/:id/pending
 *
 * 客户看过报价但还没拿定主意。报价停在 PENDING_DECISION，
 * 运营在列表里能一眼挑出需要跟进的单；客户之后仍可改成接受或拒绝。
 */
router.post('/:id/pending', requireUserType('OPERATOR', 'CLIENT'), async (req, res) => {
  try {
    const quotation = await loadQuotationWithAccessCheck(req.params.id, req, res)
    if (!quotation) return
    if (quotation.status !== QUOTATION_STATUS.SENT) {
      return res.status(400).json({
        code: 400,
        message: `报价当前状态为 ${quotation.status}，仅「已发送」的报价可以标记待定`,
        data: null,
      })
    }

    await query(
      `UPDATE quotations
       SET status = $1, client_response_at = NOW(), client_response_by = $2,
           client_response_note = $3, updated_at = NOW()
       WHERE id = $4`,
      [QUOTATION_STATUS.PENDING_DECISION, req.user.id, req.body?.note || null, req.params.id]
    )
    res.json({ code: 200, message: '已标记为待定', data: null })
  } catch (error) {
    console.error('标记待定失败:', error)
    res.status(400).json({ code: 400, message: error.message, data: null })
  }
})

/**
 * 客户拒绝报价
 * POST /api/v1/quotations/:id/reject
 */
router.post('/:id/reject', requireUserType('OPERATOR', 'CLIENT'), async (req, res) => {
  try {
    const quotation = await loadQuotationWithAccessCheck(req.params.id, req, res)
    if (!quotation) return
    if (!CLIENT_DECIDABLE.includes(quotation.status)) {
      return res.status(400).json({
        code: 400,
        message: `报价当前状态为 ${quotation.status}，仅「已发送」或「待定」的报价可以拒绝`,
        data: null,
      })
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE quotations
         SET status = $1, client_response_at = NOW(), client_response_by = $2,
             client_response_note = $3, updated_at = NOW()
         WHERE id = $4`,
        [QUOTATION_STATUS.REJECTED, req.user.id, req.body?.note || req.body?.reason || null, req.params.id]
      )
      if (quotation.inquiry_id) {
        await client.query(
          `UPDATE inquiries SET status = 'REJECTED', updated_at = NOW() WHERE id = $1`,
          [quotation.inquiry_id]
        )
      }
    })
    res.json({ code: 200, message: '报价已拒绝', data: null })
  } catch (error) {
    console.error('拒绝报价失败:', error)
    res.status(400).json({ code: 400, message: error.message, data: null })
  }
})

/**
 * 创建新版本
 */
router.post('/:id/new-version', requireUserType('OPERATOR'), async (req, res) => {
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
    const current = await loadQuotationWithAccessCheck(req.params.id, req, res)
    if (!current) return
    const { client_id, route_from, route_to } = current

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
 * 报价转订单（一键下单，运营手工触发）
 * POST /api/v1/quotations/:id/convert-order
 *
 * 需求 2 上线后，客户点接受就自动建单了，这个端点只剩两个用途：
 *   1. 历史上已 ACCEPTED 但从没建过单的存量报价
 *   2. 自动建单因信用超额失败、运营处理完额度后补建
 * 因此保留，但收紧为仅运营可调。
 */
router.post('/:id/convert-order', requireUserType('OPERATOR'), async (req, res) => {
  try {
    const order = await withTransaction(async (client) => {
      const locked = await client.query(`SELECT * FROM quotations WHERE id = $1 FOR UPDATE`, [req.params.id])
      if (locked.rows.length === 0) throw new Error('报价不存在')
      const q = locked.rows[0]

      if (q.status === QUOTATION_STATUS.CONVERTED || q.converted_order_id) {
        throw new Error('该报价已经生成过订单，不能重复下单')
      }
      if (q.status !== QUOTATION_STATUS.ACCEPTED) {
        throw new Error('仅已接受的报价可以转为订单')
      }

      // 和自动建单走同一条路径，避免两处逻辑漂移
      return await createOrderFromQuotation(client, q, req.user.id, req.body || {})
    })
    res.json({ code: 200, message: '订单创建成功', data: order })
  } catch (error) {
    console.error('报价转订单失败:', error)
    res.status(400).json({ code: 400, message: error.message, data: null })
  }
})

// 报价作废（软删除）: status -> CANCELLED
router.post('/:id/void', requireUserType('OPERATOR'), async (req, res) => {
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
