/**
 * 报价业务逻辑
 *
 * 客户的「接受 / 拒绝 / 待定」有两个入口：
 *   1. 客户门户「我的报价」页（登录后操作）
 *   2. 报价邮件里的三个确认链接（免登录，凭一次性 token）
 *
 * 两条路必须走同一段逻辑，否则迟早漂移成两套行为
 * （踩坑 017 就是"同一件事两个写入方"埋的雷）。
 */

import orderService, { BUSINESS_TYPES } from '../order/service.js'

/**
 * 报价单状态
 *   DRAFT            草稿，运营还在编
 *   SENT             已发送给客户，等客户决策
 *   PENDING_DECISION 客户点了「待定」，还没拿定主意
 *   ACCEPTED         客户已接受
 *   CONVERTED        已生成订单（接受后自动建单成功即为此状态）
 *   REJECTED / EXPIRED / CANCELLED
 */
export const QUOTATION_STATUS = {
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
export const CLIENT_DECIDABLE = [QUOTATION_STATUS.SENT, QUOTATION_STATUS.PENDING_DECISION]

/**
 * 客户门户看不到的报价状态
 *
 * 草稿 = 运营还在编、尚未点「发送」的价，客户不该看到里面的金额。
 * ⚠️ 这个过滤必须在后端 SQL 里做（踩坑 054）：以前只有客户门户页面用
 *    `.filter(q => q.status !== 'DRAFT')` 把草稿藏起来，接口照样把
 *    total_price 返回给客户，带自己的 token 直接调接口就能看到。
 */
export const CLIENT_HIDDEN_STATUSES = [QUOTATION_STATUS.DRAFT]

/** 客户决策动作 */
export const DECISION_ACTIONS = {
  ACCEPT: 'ACCEPT',
  REJECT: 'REJECT',
  PENDING: 'PENDING',
}

/**
 * 整版替换本地派送的逐票报价行，并把合计回写 quotations.total_price
 *
 * 报价是按版本走的（改价 = 新开一版），所以每一版都有自己完整的一套行，
 * 先删后插即可，不必做增量比对。
 *
 * ⚠️ 必须在事务里调用。
 *
 * @param {object} client 事务客户端
 * @param {string} quotationId
 * @param {Array<{deliveryOrderId: string, price: number|string, remarks?: string}>} rawLines
 * @param {string} [currency='EUR']
 * @returns {Promise<{lines: Array, total: number}>}
 */
export async function replaceDeliveryLines(client, quotationId, rawLines, currency = 'EUR') {
  await client.query(`DELETE FROM quotation_delivery_lines WHERE quotation_id = $1`, [quotationId])

  const lines = []
  for (const raw of rawLines || []) {
    if (!raw?.deliveryOrderId) continue
    // 价格按 0 兜底而不是跳过：某一票免费送也是有效报价，
    // 跳过会让这一票在报价单上凭空消失，客户以为我们漏报了
    const price = toAmount(raw.price)
    const inserted = await client.query(
      `INSERT INTO quotation_delivery_lines
       (quotation_id, delivery_order_id, price, currency, remarks)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [quotationId, raw.deliveryOrderId, price, currency, raw.remarks || null]
    )
    lines.push(inserted.rows[0])
  }

  const total = await recalcQuotationTotalFromLines(client, quotationId)
  return { lines, total }
}

/**
 * 用逐票行汇总回写报价总价
 *
 * 一行都没有时**不动 total_price** —— 那是两层结构的报价（卡派 LTL / 卡车 FTL），
 * 它的总价来自定价引擎或运营手填，清零等于把价格抹掉。
 *
 * @returns {Promise<number|null>} 回写后的合计；没有行时返回 null
 */
export async function recalcQuotationTotalFromLines(client, quotationId) {
  const agg = await client.query(
    `SELECT COUNT(*)::int AS line_count, COALESCE(SUM(price), 0) AS total
     FROM quotation_delivery_lines WHERE quotation_id = $1`,
    [quotationId]
  )
  const { line_count, total } = agg.rows[0]
  if (line_count === 0) return null

  // NUMERIC 求和回来是字符串，写回前先转数字（踩坑 002）
  const amount = Math.round(Number(total) * 100) / 100
  await client.query(
    `UPDATE quotations
     SET total_price = $1, base_freight = $1, surcharge = 0, insurance_fee = 0, updated_at = NOW()
     WHERE id = $2`,
    [amount, quotationId]
  )
  return amount
}

/**
 * 读取一版报价的逐票明细，并带上对应那一票的派送信息
 *
 * 带派送信息是必需的：报价单和邮件上要显示「送到哪、多少件、多重」，
 * 只给一个 delivery_order_id 前端还得再查一遍询价。
 *
 * @param {string} quotationId
 * @param {object} db 有 query 方法的对象（连接池或事务客户端）
 */
export async function getDeliveryLines(quotationId, db) {
  const result = await db.query(
    `SELECT l.*,
            d.line_number, d.customer_sub_ref, d.delivery_address,
            d.quantity, d.weight_kg, d.volume_m3, d.ldm
     FROM quotation_delivery_lines l
     JOIN inquiry_delivery_orders d ON d.id = l.delivery_order_id
     WHERE l.quotation_id = $1
     ORDER BY d.line_number`,
    [quotationId]
  )
  return result.rows
}

/** 金额转数字；空值和非法值一律按 0，不返回 null（NOT NULL 列） */
function toAmount(value) {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

/** JSONB 列可能是对象也可能是字符串，统一成对象 */
export function parseJsonColumn(value) {
  if (!value) return {}
  if (typeof value === 'string') {
    try { return JSON.parse(value) || {} } catch { return {} }
  }
  return value
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
export async function createOrderFromQuotation(client, quotation, userId, extra = {}) {
  // 本地派送的三层单（柜 → 多票派送）转成 **N 张订单**，一票一张（开发意见 #7 第 3 步）
  if (quotation.inquiry_id) {
    const drops = await loadDeliveryOrdersForConversion(client, quotation)
    if (drops.length > 0) {
      return createOrdersFromDeliveryOrders(client, quotation, drops, userId, extra)
    }
  }

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
    quotationDocId: quotation.document_id,   // createOrder 据此建报价→订单单据流
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

/**
 * 取这张报价对应的派送票（本地派送三层单专用）
 *
 * 价格取**这一版报价**的逐票行；某一票没有报价行时按 0 算 ——
 * 那说明运营漏报了这一票，但已经被客户接受了，
 * 建单时静默跳过会让这票的货没人管，宁可建一张 0 元订单让人看见。
 *
 * @returns {Promise<Array>} 空数组 = 不是三层单，走原来的单张路径
 */
async function loadDeliveryOrdersForConversion(client, quotation) {
  const result = await client.query(
    `SELECT d.id, d.line_number, d.customer_sub_ref, d.delivery_address,
            d.quantity, d.weight_kg, d.volume_m3, d.remarks,
            COALESCE(l.price, 0) AS price
     FROM inquiry_delivery_orders d
     LEFT JOIN quotation_delivery_lines l
       ON l.delivery_order_id = d.id AND l.quotation_id = $2
     WHERE d.inquiry_id = $1
     ORDER BY d.line_number`,
    [quotation.inquiry_id, quotation.id]
  )
  return result.rows
}

/**
 * 一个柜转成 N 张订单，一票派送一张（开发意见 #7 第 3 步）
 *
 * 每张订单：取件地址是柜的（N 张相同），派送地址是这一票的，
 * 金额是这一票的报价，货量是这一票的汇总，柜号写进 orders.container_no
 * —— 订单列表按柜号搜索就能把一个柜的 N 张单一次筛出来。
 *
 * ⚠️ 全程在**同一个事务**里：任何一票失败（信用超额、编号取号失败…）
 *    整批回滚，报价退回原状态。绝不允许「转了一半」——
 *    订单是已过账凭证，只能冲销不能删，半批订单没法自动收拾。
 *
 * ⚠️ 逐单的「新订单」站内通知全部跳过，最后由调用方发一条汇总：
 *    一个柜三十票就是三十条通知，会把每个运营的通知中心刷爆。
 *
 * @returns {Promise<object>} 第一张订单，并挂上 `siblingOrders`（全部 N 张的编号）
 */
async function createOrdersFromDeliveryOrders(client, quotation, drops, userId, extra = {}) {
  const routeFrom = parseJsonColumn(quotation.route_from)

  // 柜级信息：柜号和特殊要求跟着每一张订单走
  const inq = await client.query(
    `SELECT container_no, special_requirements, remarks FROM inquiries WHERE id = $1`,
    [quotation.inquiry_id]
  )
  const container = inq.rows[0] || {}

  const orders = []
  for (const drop of drops) {
    const deliveryAddress = parseJsonColumn(drop.delivery_address)
    // 这一票的备注优先，没有就用柜级的
    const remarks = drop.remarks || container.remarks || null

    const order = await orderService.createOrder(client, {
      clientId: quotation.client_id,
      businessType: quotation.business_type,
      transportType: quotation.transport_type,
      pickupAddress: routeFrom,
      deliveryAddress,
      // 这一票的货量，不是整柜的
      cargoQuantity: drop.quantity,
      cargoWeightKg: drop.weight_kg,
      cargoVolumeM3: drop.volume_m3,
      cargoDescription: drop.customer_sub_ref
        ? `${container.container_no || ''} / ${drop.customer_sub_ref}`.trim()
        : container.container_no || null,
      specialRequirements: container.special_requirements,
      remarks,
      containerNo: container.container_no || null,
      clientPrice: parseFloat(drop.price) || 0,
      currency: quotation.currency,
      quotationDocId: quotation.document_id,  // createOrder 据此建报价→订单单据流
      sourceQuotationId: quotation.id,        // 迁移 131：N 张订单靠它反查同一张报价
      ...extra,
    }, userId, { skipNewOrderNotify: true })

    // 本地派送的初始状态是 PENDING_QUOTE（待报价），报价已被接受，
    // 停在「待报价」是自相矛盾的 —— 推进一格到待派送
    await orderService.updateStatus(
      client, order.id, 'PENDING_DISPATCH', userId,
      `客户接受报价，按票自动建单（${drop.customer_sub_ref || '#' + drop.line_number}）`
    )
    orders.push(order)
  }

  // converted_order_id 上有部分唯一索引，只装得下一张 —— 记第一张，
  // 前端「跳转到订单」的既有逻辑不用改；N 张靠 orders.source_quotation_id 反查
  await client.query(
    `UPDATE quotations
     SET status = $1, converted_order_id = $2, updated_at = NOW()
     WHERE id = $3`,
    [QUOTATION_STATUS.CONVERTED, orders[0].id, quotation.id]
  )

  // 返回第一张，但把这一批的编号一并带上，调用方要拿它提示客户「生成了 N 张」
  return {
    ...orders[0],
    siblingOrders: orders.map((o) => ({ id: o.id, order_number: o.order_number })),
  }
}

/**
 * 决定免登录场景下以谁的身份建单
 *
 * 顺序：开这张报价的运营 → 任意在职系统管理员。
 * 两者都没有就抛错 —— 与其伪造一个身份，不如让这次确认失败并留下明确错误，
 * 客户还可以登录门户完成确认。
 */
async function resolveActingUser(client, quotation) {
  if (quotation.created_by) {
    const owner = await client.query(
      `SELECT id FROM users WHERE id = $1 AND is_active = true`, [quotation.created_by]
    )
    if (owner.rows.length > 0) return owner.rows[0].id
  }

  const admin = await client.query(
    `SELECT u.id FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.role_code = 'sys_admin' AND u.is_active = true
     ORDER BY u.created_at
     LIMIT 1`
  )
  if (admin.rows.length > 0) return admin.rows[0].id

  throw new Error('系统没有可用的操作人账号，无法自动建单，请登录客户门户确认或联系业务人员')
}

/**
 * 应用客户对报价的决策（接受 / 拒绝 / 待定）
 *
 * 必须在事务里调用。接受时会连带建单，任一步失败整笔回滚，
 * 报价保持原状态。
 *
 * @param {object} client       事务客户端
 * @param {string} quotationId  报价 ID
 * @param {string} action       DECISION_ACTIONS 之一
 * @param {object} opts
 * @param {string} [opts.userId] 操作人（邮件链接场景没有登录用户，传 null）
 * @param {string} [opts.note]   客户填写的说明
 * @returns {Promise<{ status: string, order: object|null, quotation: object }>}
 */
export async function applyClientDecision(client, quotationId, action, { userId = null, note = null } = {}) {
  // 行锁：防止客户在两个标签页 / 邮件链接与门户同时操作，建出两张订单
  const locked = await client.query(
    `SELECT * FROM quotations WHERE id = $1 FOR UPDATE`, [quotationId]
  )
  if (locked.rows.length === 0) throw new Error('报价不存在')
  const quo = locked.rows[0]

  if (action === DECISION_ACTIONS.PENDING) {
    // 待定只允许从「已发送」进入，已经待定过就不用再标一次
    if (quo.status !== QUOTATION_STATUS.SENT) {
      throw new Error(`报价当前状态为 ${quo.status}，仅「已发送」的报价可以标记待定`)
    }
  } else if (!CLIENT_DECIDABLE.includes(quo.status)) {
    throw new Error(`报价当前状态为 ${quo.status}，仅「已发送」或「待定」的报价可以确认`)
  }

  const nextStatus = {
    [DECISION_ACTIONS.ACCEPT]: QUOTATION_STATUS.ACCEPTED,
    [DECISION_ACTIONS.REJECT]: QUOTATION_STATUS.REJECTED,
    [DECISION_ACTIONS.PENDING]: QUOTATION_STATUS.PENDING_DECISION,
  }[action]
  if (!nextStatus) throw new Error(`未知的决策动作: ${action}`)

  await client.query(
    `UPDATE quotations
     SET status = $1, client_response_at = NOW(), client_response_by = $2,
         client_response_note = $3, updated_at = NOW()
     WHERE id = $4`,
    [nextStatus, userId, note, quotationId]
  )

  // 同步询价单状态（待定不动询价，它还在"已报价"阶段）
  if (quo.inquiry_id && action !== DECISION_ACTIONS.PENDING) {
    await client.query(
      `UPDATE inquiries SET status = $1, updated_at = NOW() WHERE id = $2`,
      [action === DECISION_ACTIONS.ACCEPT ? 'ACCEPTED' : 'REJECTED', quo.inquiry_id]
    )
  }

  let order = null
  if (action === DECISION_ACTIONS.ACCEPT) {
    // ⚠️ 客户从邮件链接确认时没有登录用户（userId 为 null），
    //    但 documents.created_by 是 NOT NULL —— 直接传 null 会让建单在
    //    凭证引擎里炸掉。以"开这张报价的运营"作为建单人：他是真实用户、
    //    可追溯，也符合"业务上这单是他跟的"。
    //    客户本人的动作另有留痕：quotations.client_response_at 和
    //    quotation_response_tokens 的 used_ip / used_action。
    const actingUserId = userId || await resolveActingUser(client, quo)
    // 建单失败（信用超额等）会抛错 → 整笔事务回滚 → 报价退回原状态
    order = await createOrderFromQuotation(client, quo, actingUserId)
  }

  return { status: order ? QUOTATION_STATUS.CONVERTED : nextStatus, order, quotation: quo }
}

export default {
  QUOTATION_STATUS,
  CLIENT_DECIDABLE,
  DECISION_ACTIONS,
  parseJsonColumn,
  createOrderFromQuotation,
  applyClientDecision,
  replaceDeliveryLines,
  recalcQuotationTotalFromLines,
  getDeliveryLines,
}
