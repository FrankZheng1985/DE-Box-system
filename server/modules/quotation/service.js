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

/** 客户决策动作 */
export const DECISION_ACTIONS = {
  ACCEPT: 'ACCEPT',
  REJECT: 'REJECT',
  PENDING: 'PENDING',
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
}
