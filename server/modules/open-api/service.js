/**
 * 开放 API 业务逻辑（P8，需求 4 + 5.1 第三种来源）
 *
 * 易抵达/傲翼/翼能等外部系统直推询价单和订单。
 * 密钥校验、限速、幂等、字段校验都收在这里，routes.js 只管端点。
 *
 * 安全约定：
 *   - 库里只存密钥 SHA-256，明文只在生成脚本里出现一次
 *   - 查 api_keys 一律点名列，key_hash 绝不跟着结果外流（踩坑 026 同类思路）
 *   - 请求日志走独立池连接，业务事务回滚时留痕不丢（踩坑 027）
 */

import crypto from 'node:crypto'
import { query, withTransaction } from '../../core/db.js'
import { documentEngine } from '../../core/index.js'
import { orderService, getStatusLabel } from '../order/service.js'
import inquiryService from '../inquiry/service.js'

/** 服务类型允许值（和 order/service.js 的 BUSINESS_TYPES 一致） */
export const VALID_BUSINESS_TYPES = ['TRUCK_LTL', 'TRUCK_FTL', 'LOCAL_DELIVERY']

/** 服务类型 → 运输类型（对外契约不单独收 transportType，由服务类型推导） */
const TRANSPORT_TYPE_MAP = { TRUCK_LTL: 'LTL', TRUCK_FTL: 'FTL', LOCAL_DELIVERY: null }

// ==================== 密钥 ====================

export function hashKey(plainKey) {
  return crypto.createHash('sha256').update(plainKey, 'utf8').digest('hex')
}

/** 生成新密钥明文：eutms_ + 48 位十六进制（24 字节随机数）。签发脚本和 admin 接口共用。 */
export function generateKey() {
  return 'eutms_' + crypto.randomBytes(24).toString('hex')
}

/**
 * 按请求头里的明文密钥找档案。
 * 点名列查询：key_hash 不进结果，也就永远不会跟着日志/响应漏出去。
 */
export async function findKeyByPresented(plainKey) {
  const result = await query(
    `SELECT id, partner_code, partner_name, client_id, status,
            rate_limit_per_min, ip_whitelist, last_used_at, created_by
     FROM api_keys WHERE key_hash = $1`,
    [hashKey(plainKey)]
  )
  return result.rows[0] || null
}

/**
 * 刷新最近使用时间。限频写库（距上次超过 60 秒才写），失败只警告不影响请求。
 */
export function touchLastUsed(keyRow) {
  const last = keyRow.last_used_at ? new Date(keyRow.last_used_at).getTime() : 0
  if (Date.now() - last < 60_000) return
  query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [keyRow.id])
    .catch((err) => console.warn('[open-api] 更新 last_used_at 失败:', err.message))
}

// ==================== 限速（按钥匙，内存滑窗） ====================

// ⚠️ PM2 以 2 个实例跑生产，这个计数是"每实例"的——实际放行量最多是配置值的实例数倍。
//    对防滥用足够；要精确全局限速得上 Redis，当前体量不值得引入新依赖。
const rateBuckets = new Map()

export function consumeRateLimit(keyRow) {
  const now = Date.now()
  let bucket = rateBuckets.get(keyRow.id)
  if (!bucket || now - bucket.windowStart >= 60_000) {
    bucket = { count: 0, windowStart: now }
    rateBuckets.set(keyRow.id, bucket)
  }
  bucket.count += 1
  return bucket.count <= (keyRow.rate_limit_per_min || 60)
}

// ==================== 请求日志（独立池连接，踩坑 027） ====================

/**
 * 写一条请求留痕。fire-and-forget：日志失败绝不拖垮业务请求。
 */
export function logRequest({ apiKeyId, partnerCode, method, path, externalRef,
                             statusCode, result, errorMessage, requestBody, ip, durationMs }) {
  let body = null
  if (requestBody && typeof requestBody === 'object') {
    const text = JSON.stringify(requestBody)
    // 超长请求体只留个记号，别把日志表撑爆
    body = text.length > 20000 ? JSON.stringify({ _truncated: true, _bytes: text.length }) : text
  }
  query(
    `INSERT INTO api_request_logs
     (api_key_id, partner_code, method, path, external_ref,
      status_code, result, error_message, request_body, ip, duration_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [apiKeyId, partnerCode, method, (path || '').slice(0, 200), externalRef,
     statusCode, result, errorMessage, body, ip, durationMs]
  ).catch((err) => console.warn('[open-api] 写请求日志失败:', err.message))
}

// ==================== 免登录场景的操作人（踩坑 019） ====================

/**
 * API 建单以谁的身份过凭证引擎：建钥匙的运营 → 任意在职 sys_admin → 抛错。
 * 不伪造身份、不放开 NOT NULL，和报价确认链接（quotation/service.js）同一套规矩。
 */
/**
 * 把「特殊要求」归一成 code（迁移 120 起数据库存的是 code，不再是中文名）
 *
 * 合作方推过来的可能是：
 *   - code（'ADR'）—— 直接用
 *   - 中文名（'危险品 ADR'）—— 老对接方一直这么传，按 name_zh 查出 code
 *   - 英文名（'ADR Dangerous Goods'）—— 顺手也认
 *   - 库里根本没有的自由文本 —— 原样保留，不硬塞也不清空
 *
 * 认不出来就原样存，是刻意的：合作方的业务信息不能因为我们的字典没收录就丢掉。
 */
async function normalizeSpecialRequirement(client, input) {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) return null
  const r = await client.query(
    `SELECT code FROM md_special_requirements
     WHERE upper(code) = upper($1) OR name_zh = $1 OR name_en = $1
     LIMIT 1`,
    [raw]
  )
  return r.rows[0]?.code || raw
}

async function resolveActingUser(client, apiKey) {
  if (apiKey.created_by) {
    const owner = await client.query(
      `SELECT id FROM users WHERE id = $1 AND is_active = true`, [apiKey.created_by]
    )
    if (owner.rows.length > 0) return owner.rows[0].id
  }
  const admin = await client.query(
    `SELECT u.id FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.role_code = 'sys_admin' AND u.is_active = true
     ORDER BY u.created_at LIMIT 1`
  )
  if (admin.rows.length > 0) return admin.rows[0].id
  throw new Error('系统没有可用的操作人账号，无法受理 API 推单，请联系运营')
}

// ==================== 字段校验 ====================

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function checkStr(errors, value, field, maxLen, required = false) {
  if (value === null || value === undefined || value === '') {
    if (required) errors.push(`${field} 必填`)
    return
  }
  if (typeof value !== 'string') { errors.push(`${field} 必须是字符串`); return }
  if (value.length > maxLen) errors.push(`${field} 超长（最多 ${maxLen} 字符）`)
}

function checkNum(errors, value, field, { required = false, integer = false, min = 0 } = {}) {
  if (value === null || value === undefined || value === '') {
    if (required) errors.push(`${field} 必填`)
    return
  }
  const n = Number(value)
  if (!Number.isFinite(n)) { errors.push(`${field} 必须是数字`); return }
  if (integer && !Number.isInteger(n)) errors.push(`${field} 必须是整数`)
  if (n < min) errors.push(`${field} 不能小于 ${min}`)
}

function checkDate(errors, value, field) {
  if (value === null || value === undefined || value === '') return
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(Date.parse(value))) {
    errors.push(`${field} 格式应为 YYYY-MM-DD`)
  }
}

function checkAddress(errors, addr, field, countryRequired) {
  if (addr === null || addr === undefined) {
    if (countryRequired) errors.push(`${field}.country 必填`)
    return
  }
  if (typeof addr !== 'object' || Array.isArray(addr)) {
    errors.push(`${field} 必须是对象 { country, city, zipCode, address }`)
    return
  }
  checkStr(errors, addr.country, `${field}.country`, 100, countryRequired)
  checkStr(errors, addr.city, `${field}.city`, 100)
  checkStr(errors, addr.zipCode, `${field}.zipCode`, 20)
  checkStr(errors, addr.address, `${field}.address`, 500)
}

/** 询价推送的字段校验，返回错误列表（空数组 = 通过） */
export function validateInquiryPayload(body) {
  const errors = []
  checkStr(errors, body.externalOrderNo, 'externalOrderNo', 100, true)
  if (!VALID_BUSINESS_TYPES.includes(body.businessType)) {
    errors.push(`businessType 无效，允许值：${VALID_BUSINESS_TYPES.join(' / ')}`)
  }
  checkAddress(errors, body.routeFrom, 'routeFrom', true)
  checkAddress(errors, body.routeTo, 'routeTo', true)
  checkStr(errors, body.customerRef, 'customerRef', 100)
  checkStr(errors, body.contactName, 'contactName', 100)
  checkStr(errors, body.contactPhone, 'contactPhone', 50)
  checkStr(errors, body.contactEmail, 'contactEmail', 100)
  if (body.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactEmail)) {
    errors.push('contactEmail 格式不正确')
  }
  checkStr(errors, body.pod, 'pod', 100)
  checkStr(errors, body.containerType, 'containerType', 10)

  const hasItems = Array.isArray(body.cargoItems) && body.cargoItems.length > 0
  if (hasItems) {
    if (body.cargoItems.length > 200) errors.push('cargoItems 最多 200 行')
    body.cargoItems.forEach((it, i) => {
      const p = `cargoItems[${i}]`
      if (typeof it !== 'object' || it === null) { errors.push(`${p} 必须是对象`); return }
      checkNum(errors, it.quantity, `${p}.quantity`, { required: true, integer: true, min: 1 })
      checkNum(errors, it.lengthCm, `${p}.lengthCm`)
      checkNum(errors, it.widthCm, `${p}.widthCm`)
      checkNum(errors, it.heightCm, `${p}.heightCm`)
      checkNum(errors, it.unitWeightKg, `${p}.unitWeightKg`)
      checkNum(errors, it.ldm, `${p}.ldm`)
      checkStr(errors, it.referenceNo, `${p}.referenceNo`, 100)
      checkStr(errors, it.description, `${p}.description`, 255)
    })
  } else {
    // 没有按件明细就必须给汇总，两头全空的询价没法报价
    const anyTotal = [body.cargoQuantity, body.cargoWeightKg, body.cargoVolumeM3, body.ldm]
      .some((v) => toNumber(v) !== null)
    if (!anyTotal) {
      errors.push('货物信息不能为空：cargoItems 至少一行，或提供 cargoQuantity / cargoWeightKg / cargoVolumeM3 / ldm 之一')
    }
  }
  checkNum(errors, body.cargoQuantity, 'cargoQuantity', { integer: true })
  checkNum(errors, body.cargoWeightKg, 'cargoWeightKg')
  checkNum(errors, body.cargoVolumeM3, 'cargoVolumeM3')
  checkNum(errors, body.ldm, 'ldm')
  return errors
}

/** 直接下单的字段校验 */
export function validateOrderPayload(body) {
  const errors = []
  checkStr(errors, body.externalOrderNo, 'externalOrderNo', 100, true)
  if (!VALID_BUSINESS_TYPES.includes(body.businessType)) {
    errors.push(`businessType 无效，允许值：${VALID_BUSINESS_TYPES.join(' / ')}`)
  }
  // 需求 4：固定价客户按柜号维度直推订单，FTL 没柜号等于没法跟踪
  if (body.businessType === 'TRUCK_FTL') {
    checkStr(errors, body.containerNo, 'containerNo', 30, true)
  } else {
    checkStr(errors, body.containerNo, 'containerNo', 30)
  }
  checkAddress(errors, body.pickupAddress, 'pickupAddress', false)
  checkAddress(errors, body.deliveryAddress, 'deliveryAddress', true)
  // orders.special_requirements 是 VARCHAR(50)，超长会直接炸库（踩坑 010 同类：先拦在门口）
  checkStr(errors, body.specialRequirements, 'specialRequirements', 50)
  checkStr(errors, body.containerType, 'containerType', 10)
  checkStr(errors, body.sealNo, 'sealNo', 30)
  checkStr(errors, body.blNumber, 'blNumber', 50)
  checkStr(errors, body.shippingLine, 'shippingLine', 100)
  checkStr(errors, body.cnee, 'cnee', 200)
  checkStr(errors, body.pod, 'pod', 100)
  checkStr(errors, body.currency, 'currency', 3)
  checkNum(errors, body.cargoQuantity, 'cargoQuantity', { integer: true })
  checkNum(errors, body.cargoWeightKg, 'cargoWeightKg')
  checkNum(errors, body.cargoVolumeM3, 'cargoVolumeM3')
  checkNum(errors, body.clientPrice, 'clientPrice')
  checkDate(errors, body.pickupDate, 'pickupDate')
  checkDate(errors, body.deliveryDate, 'deliveryDate')
  checkDate(errors, body.expectedDeliveryDate, 'expectedDeliveryDate')
  if (body.eta && Number.isNaN(Date.parse(body.eta))) errors.push('eta 不是可解析的时间')
  if (body.releaseMethod && !['TELEX', 'ORIGINAL'].includes(body.releaseMethod)) {
    errors.push('releaseMethod 允许值：TELEX / ORIGINAL')
  }
  return errors
}

// ==================== 状态回查（P8 第三阶段） ====================

/** 询价状态中文名（与 inquiry 模块的 STATUS_LABELS 一致） */
const INQUIRY_STATUS_LABELS = {
  PENDING_QUOTE: '待报价', QUOTED: '已报价', ACCEPTED: '已接受',
  REJECTED: '已拒绝', CANCELLED: '已取消',
}

/** 报价状态中文名（合作方视角只描述客户可见的几种） */
const QUOTATION_STATUS_LABELS = {
  SENT: '已报价待确认', PENDING_DECISION: '待定',
  ACCEPTED: '已接受', CONVERTED: '已转订单',
  REJECTED: '已拒绝', EXPIRED: '已过期',
}

/**
 * 按合作方 + 外部单号回查询价状态。
 * 查不到返回 null（对外 404）——单号属不属于这把钥匙，用"不存在"语义回答，
 * 不区分"没有这单"和"这单是别人的"（架构规则 8）。
 *
 * 报价只回客户可见字段：点名列查询，carrier_cost 这类成本字段永不出现（踩坑 026）。
 */
export async function getInquiryStatusForApi(apiKey, externalRef) {
  const inq = await query(
    `SELECT id, inquiry_number, status, business_type, customer_ref, created_at, updated_at
     FROM inquiries WHERE external_source = $1 AND external_ref = $2`,
    [apiKey.partner_code, externalRef]
  )
  if (inq.rows.length === 0) return null
  const inquiry = inq.rows[0]

  // 最新一版对客报价（草稿/已作废不算数）
  const quo = await query(
    `SELECT quotation_number, status, total_price, currency, valid_until, converted_order_id
     FROM quotations
     WHERE inquiry_id = $1 AND status NOT IN ('DRAFT', 'CANCELLED')
     ORDER BY version DESC, created_at DESC
     LIMIT 1`,
    [inquiry.id]
  )

  let quotation = null
  let order = null
  if (quo.rows.length > 0) {
    const q = quo.rows[0]
    quotation = {
      quotationNumber: q.quotation_number,
      status: q.status,
      statusLabel: QUOTATION_STATUS_LABELS[q.status] || q.status,
      // NUMERIC 回来是字符串（踩坑 002），出门前转数字
      totalPrice: q.total_price === null ? null : Number(q.total_price),
      currency: q.currency,
      validUntil: q.valid_until,
    }
    if (q.converted_order_id) {
      const ord = await query(
        `SELECT order_number, status FROM orders WHERE id = $1`, [q.converted_order_id]
      )
      if (ord.rows.length > 0) {
        order = { orderNumber: ord.rows[0].order_number, status: ord.rows[0].status }
      }
    }
  }

  return {
    externalOrderNo: externalRef,
    inquiryNumber: inquiry.inquiry_number,
    status: inquiry.status,
    statusLabel: INQUIRY_STATUS_LABELS[inquiry.status] || inquiry.status,
    businessType: inquiry.business_type,
    customerRef: inquiry.customer_ref,
    createdAt: inquiry.created_at,
    updatedAt: inquiry.updated_at,
    quotation,
    order,
  }
}

/**
 * 按合作方 + 外部单号回查订单状态。查不到返回 null（对外 404）。
 */
export async function getOrderStatusForApi(apiKey, externalRef) {
  const result = await query(
    `SELECT order_number, status, delivery_status, business_type, tracking_number,
            container_no, pickup_date, delivery_date, expected_delivery_date,
            created_at, updated_at
     FROM orders WHERE external_source = $1 AND external_ref = $2`,
    [apiKey.partner_code, externalRef]
  )
  if (result.rows.length === 0) return null
  const o = result.rows[0]
  return {
    externalOrderNo: externalRef,
    orderNumber: o.order_number,
    status: o.status,
    statusLabel: getStatusLabel(o.business_type, o.status),
    deliveryStatus: o.delivery_status,
    businessType: o.business_type,
    trackingNumber: o.tracking_number,
    containerNo: o.container_no,
    pickupDate: o.pickup_date,
    deliveryDate: o.delivery_date,
    expectedDeliveryDate: o.expected_delivery_date,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  }
}

// ==================== 幂等建询价 / 建订单 ====================

/**
 * API 推询价单。同 partner_code + externalOrderNo 重复推时返回已存在的那张
 * （duplicated: true），不报错 —— 对方重试不该收到失败。
 *
 * 幂等实现是"事务内先查后插 + 捕获 23505"，不用 ON CONFLICT：
 * 幂等索引是部分唯一索引，裸 ON CONFLICT 推断不出来（踩坑 020）。
 */
export async function createInquiryFromApi(apiKey, body) {
  try {
    return await withTransaction(async (client) => {
      const dup = await client.query(
        `SELECT id, inquiry_number, status, created_at FROM inquiries
         WHERE external_source = $1 AND external_ref = $2`,
        [apiKey.partner_code, body.externalOrderNo]
      )
      if (dup.rows.length > 0) return { duplicated: true, inquiry: dup.rows[0] }

      const actingUserId = await resolveActingUser(client, apiKey)
      const doc = await documentEngine.createDocument(client, {
        docType: 'INQ',
        companyCode: 'DE01',
        postingDate: new Date(),
        headerText: `询价 - ${body.businessType}（${apiKey.partner_name} API 推送）`,
        createdBy: actingUserId,
      })

      const result = await client.query(
        `INSERT INTO inquiries
         (document_id, inquiry_number, client_id, business_type, transport_type,
          route_from, route_to, cargo_description, cargo_weight_kg,
          cargo_volume_m3, cargo_quantity, ldm, special_requirements,
          pod, container_type, remarks, status,
          contact_name, contact_phone, contact_email, customer_ref,
          external_source, external_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         RETURNING id, inquiry_number, status, created_at`,
        [doc.id, doc.docNumber, apiKey.client_id,
         body.businessType, TRANSPORT_TYPE_MAP[body.businessType],
         JSON.stringify(body.routeFrom || {}), JSON.stringify(body.routeTo || {}),
         body.cargoDescription || null, toNumber(body.cargoWeightKg),
         toNumber(body.cargoVolumeM3), toNumber(body.cargoQuantity), toNumber(body.ldm),
         await normalizeSpecialRequirement(client, body.specialRequirements),
         body.pod || null, body.containerType || null,
         body.remarks || null, 'PENDING_QUOTE',
         body.contactName || null, body.contactPhone || null, body.contactEmail || null,
         body.customerRef || null,
         apiKey.partner_code, body.externalOrderNo]
      )
      const inquiry = result.rows[0]

      // 有按件明细就入库，服务里会自动算体积/LDM 并把合计回写表头
      if (Array.isArray(body.cargoItems) && body.cargoItems.length > 0) {
        await inquiryService.replaceCargoItems(client, inquiry.id, body.cargoItems)
      }
      return { duplicated: false, inquiry }
    })
  } catch (err) {
    // 并发同单号：两个请求同时过了先查后插，晚提交的撞幂等索引整笔回滚，这里补查后按重复返回
    if (err.code === '23505' && err.constraint === 'uq_inquiries_external') {
      const dup = await query(
        `SELECT id, inquiry_number, status, created_at FROM inquiries
         WHERE external_source = $1 AND external_ref = $2`,
        [apiKey.partner_code, body.externalOrderNo]
      )
      if (dup.rows.length > 0) return { duplicated: true, inquiry: dup.rows[0] }
    }
    throw err
  }
}

/**
 * API 直接下单（固定价客户，落 PENDING_REVIEW 进审核派单流程；
 * 本地派送按系统统一初始状态处理）。幂等语义同上。
 *
 * 走 orderService.createOrder 完整过 ERP 内核（凭证/信用/变更追踪/通知），
 * 不绕开引擎直插 orders 表。
 */
export async function createOrderFromApi(apiKey, body) {
  try {
    return await withTransaction(async (client) => {
      const dup = await client.query(
        `SELECT id, order_number, status, created_at FROM orders
         WHERE external_source = $1 AND external_ref = $2`,
        [apiKey.partner_code, body.externalOrderNo]
      )
      if (dup.rows.length > 0) return { duplicated: true, order: dup.rows[0] }

      const actingUserId = await resolveActingUser(client, apiKey)
      const order = await orderService.createOrder(client, {
        clientId: apiKey.client_id,
        businessType: body.businessType,
        transportType: TRANSPORT_TYPE_MAP[body.businessType],
        cargoDescription: body.cargoDescription || null,
        cargoWeightKg: toNumber(body.cargoWeightKg),
        cargoVolumeM3: toNumber(body.cargoVolumeM3),
        cargoQuantity: toNumber(body.cargoQuantity),
        pickupAddress: body.pickupAddress || {},
        deliveryAddress: body.deliveryAddress || {},
        pickupDate: body.pickupDate || null,
        deliveryDate: body.deliveryDate || null,
        specialRequirements: body.specialRequirements || null,
        remarks: body.remarks || null,
        eta: body.eta || null,
        shippingLine: body.shippingLine || null,
        cnee: body.cnee || null,
        containerNo: body.containerNo || null,
        containerType: body.containerType || null,
        sealNo: body.sealNo || null,
        blNumber: body.blNumber || null,
        pod: body.pod || null,
        finalDestination: body.finalDestination || null,
        finalDestAddress: body.finalDestAddress || null,
        expectedDeliveryDate: body.expectedDeliveryDate || null,
        releaseMethod: body.releaseMethod || null,
        needsClearance: body.needsClearance === true,
        needsRelease: body.needsRelease === true,
        // 成本字段不对外：carrier_cost 是内部数据，接口不收（踩坑 026 的教训反着用）
        clientPrice: toNumber(body.clientPrice),
        currency: body.currency || 'EUR',
      }, actingUserId)

      // orderModel.create 不认识幂等字段，建完在同一事务里补写；
      // 并发撞索引会让整笔回滚（订单一起消失），由外层捕获 23505 转成"重复"应答
      await client.query(
        `UPDATE orders SET external_source = $1, external_ref = $2 WHERE id = $3`,
        [apiKey.partner_code, body.externalOrderNo, order.id]
      )
      return {
        duplicated: false,
        order: { id: order.id, order_number: order.order_number, status: order.status, created_at: order.created_at },
      }
    })
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'uq_orders_external') {
      const dup = await query(
        `SELECT id, order_number, status, created_at FROM orders
         WHERE external_source = $1 AND external_ref = $2`,
        [apiKey.partner_code, body.externalOrderNo]
      )
      if (dup.rows.length > 0) return { duplicated: true, order: dup.rows[0] }
    }
    throw err
  }
}

export default {
  VALID_BUSINESS_TYPES,
  hashKey,
  generateKey,
  findKeyByPresented,
  touchLastUsed,
  consumeRateLimit,
  logRequest,
  validateInquiryPayload,
  validateOrderPayload,
  createInquiryFromApi,
  createOrderFromApi,
  getInquiryStatusForApi,
  getOrderStatusForApi,
}
