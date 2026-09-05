/**
 * 询价业务逻辑
 *
 * 按件货物明细的换算、汇总回写、以及给服务商用的"复制摘要"文本，
 * 都收在这里 —— routes.js 只负责端点，不放算法。
 */

import { query as poolQuery } from '../../core/db.js'
import { documentEngine, changeTracker } from '../../core/index.js'
import { t } from '../../utils/i18n.js'

/** 欧洲标准车厢内宽（米），LDM 换算的分母 */
const TRUCK_INNER_WIDTH_M = 2.4

/**
 * 单件体积（m³）= 长 × 宽 × 高 ÷ 1,000,000（长宽高单位是 cm）
 * 任一边缺失就返回 null，不猜 0 —— 0 会让汇总看起来"算过了"其实没数据
 */
export function calcUnitVolumeM3(lengthCm, widthCm, heightCm) {
  const l = toNumber(lengthCm)
  const w = toNumber(widthCm)
  const h = toNumber(heightCm)
  if (l === null || w === null || h === null) return null
  return round(l * w * h / 1_000_000, 4)
}

/**
 * 行级 LDM（装载米）= (长m × 宽m ÷ 2.4) × 件数
 * 长宽任一缺失返回 null
 */
export function calcLineLdm(lengthCm, widthCm, quantity) {
  const l = toNumber(lengthCm)
  const w = toNumber(widthCm)
  if (l === null || w === null) return null
  const qty = toNumber(quantity) ?? 1
  return round((l / 100) * (w / 100) / TRUCK_INNER_WIDTH_M * qty, 2)
}

/**
 * 把前端传来的一行明细规整成入库字段
 *
 * 体积和 LDM 默认自动算；前端显式传了 ldm 且标了 ldmManual，就保留人工值。
 * （Frank 2026-08-01 定：自动算但允许手改，特殊摆放方式要能调整）
 */
export function normalizeCargoItem(raw, lineNumber) {
  const quantity = Math.max(1, parseInt(raw.quantity, 10) || 1)
  const lengthCm = toNumber(raw.lengthCm)
  const widthCm = toNumber(raw.widthCm)
  const heightCm = toNumber(raw.heightCm)

  const autoVolume = calcUnitVolumeM3(lengthCm, widthCm, heightCm)
  const autoLdm = calcLineLdm(lengthCm, widthCm, quantity)

  // 人工值优先，但必须是能转成数字的有效输入，否则退回自动值
  const manualLdm = raw.ldmManual ? toNumber(raw.ldm) : null
  const ldmManual = manualLdm !== null

  return {
    lineNumber,
    referenceNo: raw.referenceNo || null,
    description: raw.description || null,
    quantity,
    lengthCm,
    widthCm,
    heightCm,
    unitWeightKg: toNumber(raw.unitWeightKg),
    unitVolumeM3: toNumber(raw.unitVolumeM3) ?? autoVolume,
    ldm: ldmManual ? manualLdm : autoLdm,
    ldmManual,
    stackable: raw.stackable !== false,
    remarks: raw.remarks || null,
  }
}

/**
 * 建一张询价单（含凭证 + 按件明细）
 *
 * 单张新建（POST /inquiries）和批量导入共用这一条路径 ——
 * 两边各写一条 20 字段的 INSERT 迟早会写岔（少一个字段就是一列静默丢数据）。
 *
 * ⚠️ 必须在事务里调用，凭证和询价单要么一起成功要么一起回滚。
 *
 * @param {object} client 事务客户端
 * @param {object} params
 * @param {string} params.clientId 客户 UUID（调用方按登录身份决定，不从 payload 取）
 * @param {string} params.createdBy 操作人 UUID
 * @param {object} params.payload 询价字段（camelCase，同 POST /inquiries 的 body）
 * @returns {Promise<object>} 入库后的询价单行
 */
export async function createInquiryRecord(client, { clientId, createdBy, payload }) {
  const doc = await documentEngine.createDocument(client, {
    docType: 'INQ',
    companyCode: 'DE01',
    postingDate: new Date(),
    headerText: `询价 - ${payload.businessType}`,
    createdBy,
  })

  const result = await client.query(
    `INSERT INTO inquiries
     (document_id, inquiry_number, client_id, business_type, transport_type,
      route_from, route_to, cargo_description, cargo_weight_kg,
      cargo_volume_m3, cargo_quantity, special_requirements,
      pod, container_type, remarks, status,
      contact_name, contact_phone, contact_email, customer_ref,
      vehicle_length_code, container_no, expected_arrival_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     RETURNING *`,
    [doc.id, doc.docNumber, clientId,
     payload.businessType, payload.transportType,
     JSON.stringify(payload.routeFrom || {}), JSON.stringify(payload.routeTo || {}),
     payload.cargoDescription, payload.cargoWeightKg,
     payload.cargoVolumeM3, payload.cargoQuantity,
     payload.specialRequirements, payload.pod, payload.containerType,
     payload.remarks, 'PENDING_QUOTE',
     payload.contactName, payload.contactPhone, payload.contactEmail,
     payload.customerRef,
     // 车型只在专车下有意义，拼车/本地派送传了也不存（避免留下自相矛盾的数据）
     payload.transportType === 'FTL' ? (payload.vehicleLengthCode || null) : null,
     // 柜号三种服务类型都存（迁移 136 放开）。原先这里硬判了本地派送，
     // 导致 LTL / FTL 就算前端传了柜号也被静默丢掉，客户只能挤在「贵司单号」里填
     payload.containerNo || null,
     // 预计到仓日期：只到日期不到钟点，车队据此排车（迁移 136）
     payload.expectedArrivalDate || null]
  )
  const created = result.rows[0]

  // 本地派送走三层（柜 → 子订单 → 件），其余服务走原来的两层（询价单 → 件）。
  // 两条路各自把合计汇总回写表头，覆盖上面写入的表头合计值。
  if (Array.isArray(payload.deliveryOrders) && payload.deliveryOrders.length > 0) {
    await replaceDeliveryOrders(client, created.id, payload.deliveryOrders)
    const refreshed = await client.query(`SELECT * FROM inquiries WHERE id = $1`, [created.id])
    return refreshed.rows[0]
  }
  if (Array.isArray(payload.cargoItems) && payload.cargoItems.length > 0) {
    await replaceCargoItems(client, created.id, payload.cargoItems)
    const refreshed = await client.query(`SELECT * FROM inquiries WHERE id = $1`, [created.id])
    return refreshed.rows[0]
  }
  return created
}

/**
 * 整单替换派送子订单及其件明细（本地派送专用，开发意见 #7）
 *
 * 一个柜下面挂 N 个子订单，每个子订单再挂自己的件明细。
 * 先删后插，删子订单时件明细跟着外键级联走（迁移 129 的 ON DELETE CASCADE）。
 *
 * 汇总口径是两级的：件 → 子订单 → 询价单表头，
 * 每一级都用下一级实算，不做二次估算，保证任何一层的数字都能对上。
 *
 * ⚠️ 必须在事务里调用。
 *
 * @param {object} client 事务客户端
 * @param {string} inquiryId
 * @param {Array} rawOrders 子订单数组，每个含 cargoItems
 * @returns {Promise<Array>} 入库后的子订单（含件明细）
 */
export async function replaceDeliveryOrders(client, inquiryId, rawOrders) {
  // 先清掉这张单上的一切明细：直接挂表头的（历史数据或服务类型改过）和挂子订单的都要清，
  // 否则改完之后会留下一批既不属于任何子订单、又会被汇总统计进去的孤儿行
  await client.query(`DELETE FROM inquiry_cargo_items WHERE inquiry_id = $1`, [inquiryId])
  await client.query(`DELETE FROM inquiry_delivery_orders WHERE inquiry_id = $1`, [inquiryId])

  const saved = []
  let lineNumber = 0
  // ⚠️ 件明细的行号必须在**整张询价单内**全局递增，不能每个子订单各自从 1 开始 ——
  // inquiry_cargo_items 上有 UNIQUE(inquiry_id, line_number)，各自从 1 编第二个子订单就撞约束。
  // 界面上「子订单内第几行」由前端按数组下标显示，不依赖这个值。
  let itemLineNumber = 0
  for (const raw of rawOrders || []) {
    lineNumber += 1
    const inserted = await client.query(
      `INSERT INTO inquiry_delivery_orders
       (inquiry_id, line_number, customer_sub_ref, delivery_address, remarks)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [inquiryId, lineNumber, raw.customerSubRef || null,
       JSON.stringify(raw.deliveryAddress || {}), raw.remarks || null]
    )
    const order = inserted.rows[0]

    // 件明细同时挂 inquiry_id 和 delivery_order_id：
    // 挂 inquiry_id 是为了让「整张单的件明细」这类查询不必先绕一圈子订单
    const items = (raw.cargoItems || []).map((it) => normalizeCargoItem(it, ++itemLineNumber))
    for (const it of items) {
      await client.query(
        `INSERT INTO inquiry_cargo_items
         (inquiry_id, delivery_order_id, line_number, reference_no, description, quantity,
          length_cm, width_cm, height_cm, unit_weight_kg, unit_volume_m3,
          ldm, ldm_manual, stackable, remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [inquiryId, order.id, it.lineNumber, it.referenceNo, it.description, it.quantity,
         it.lengthCm, it.widthCm, it.heightCm, it.unitWeightKg, it.unitVolumeM3,
         it.ldm, it.ldmManual, it.stackable, it.remarks]
      )
    }

    await recalcDeliveryOrderTotals(client, order.id)
    saved.push({ ...order, cargoItems: items })
  }

  await recalcInquiryTotals(client, inquiryId)
  return saved
}

/**
 * 用件明细汇总回写单个派送子订单的件数/实重/体积/LDM
 *
 * 和 recalcInquiryTotals 的区别：**没有明细时清零而不是跳过**。
 * 表头那边不清零是因为客户可能只填总重没录明细（那是他填的数据，不能抹）；
 * 子订单的数字从来只有汇总一个来源，没有明细就该是 0，留着旧值反而是脏数据。
 */
export async function recalcDeliveryOrderTotals(client, deliveryOrderId) {
  const agg = await client.query(
    `SELECT COALESCE(SUM(quantity), 0)::int               AS total_quantity,
            COALESCE(SUM(unit_weight_kg * quantity), 0)   AS total_weight_kg,
            COALESCE(SUM(unit_volume_m3 * quantity), 0)   AS total_volume_m3,
            COALESCE(SUM(ldm), 0)                         AS total_ldm
     FROM inquiry_cargo_items WHERE delivery_order_id = $1`,
    [deliveryOrderId]
  )
  const r = agg.rows[0]
  // NUMERIC 求和回来是字符串，写回前先转数字（踩坑 002）
  const totals = {
    quantity: r.total_quantity,
    weightKg: round(Number(r.total_weight_kg), 2),
    volumeM3: round(Number(r.total_volume_m3), 4),
    ldm: round(Number(r.total_ldm), 2),
  }
  await client.query(
    `UPDATE inquiry_delivery_orders
     SET quantity = $1, weight_kg = $2, volume_m3 = $3, ldm = $4, updated_at = NOW()
     WHERE id = $5`,
    [totals.quantity, totals.weightKg, totals.volumeM3, totals.ldm, deliveryOrderId]
  )
  return totals
}

/**
 * 读取一张询价单的派送子订单（含各自的件明细）
 * @param {string} inquiryId
 * @param {object} [client] 事务内调用时传入事务客户端，否则走连接池
 */
export async function getDeliveryOrders(inquiryId, client = null) {
  const run = (sql, params) => (client ? client.query(sql, params) : poolQuery(sql, params))

  const orders = await run(
    `SELECT * FROM inquiry_delivery_orders WHERE inquiry_id = $1 ORDER BY line_number`,
    [inquiryId]
  )
  if (orders.rows.length === 0) return []

  const items = await run(
    `SELECT * FROM inquiry_cargo_items
     WHERE delivery_order_id = ANY($1::uuid[])
     ORDER BY delivery_order_id, line_number`,
    [orders.rows.map((o) => o.id)]
  )

  // 一次查完再分组，避免 N 个子订单发 N 次查询
  const byOrder = new Map()
  for (const it of items.rows) {
    if (!byOrder.has(it.delivery_order_id)) byOrder.set(it.delivery_order_id, [])
    byOrder.get(it.delivery_order_id).push(it)
  }
  return orders.rows.map((o) => ({ ...o, cargoItems: byOrder.get(o.id) || [] }))
}

/**
 * 整单替换按件明细（先删后插），然后把合计回写询价单表头
 * @returns {Promise<Array>} 入库后的明细行
 */
export async function replaceCargoItems(client, inquiryId, rawItems) {
  await client.query(`DELETE FROM inquiry_cargo_items WHERE inquiry_id = $1`, [inquiryId])

  const items = (rawItems || []).map((raw, i) => normalizeCargoItem(raw, i + 1))
  for (const it of items) {
    await client.query(
      `INSERT INTO inquiry_cargo_items
       (inquiry_id, line_number, reference_no, description, quantity,
        length_cm, width_cm, height_cm, unit_weight_kg, unit_volume_m3,
        ldm, ldm_manual, stackable, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [inquiryId, it.lineNumber, it.referenceNo, it.description, it.quantity,
       it.lengthCm, it.widthCm, it.heightCm, it.unitWeightKg, it.unitVolumeM3,
       it.ldm, it.ldmManual, it.stackable, it.remarks]
    )
  }

  await recalcInquiryTotals(client, inquiryId)
  return items
}

/**
 * 用明细行汇总回写询价单表头的件数/实重/体积/LDM
 *
 * ⚠️ 没有明细行时直接返回，不清零表头 ——
 * 客户可能只填了总重没录明细，清零等于把他填的数据抹掉。
 */
export async function recalcInquiryTotals(client, inquiryId) {
  const agg = await client.query(
    `SELECT COUNT(*)::int                                    AS line_count,
            COALESCE(SUM(quantity), 0)::int                  AS total_quantity,
            COALESCE(SUM(unit_weight_kg * quantity), 0)      AS total_weight_kg,
            COALESCE(SUM(unit_volume_m3 * quantity), 0)      AS total_volume_m3,
            COALESCE(SUM(ldm), 0)                            AS total_ldm
     FROM inquiry_cargo_items WHERE inquiry_id = $1`,
    [inquiryId]
  )
  const r = agg.rows[0]
  if (r.line_count === 0) return null

  // pg 的 NUMERIC 求和回来是字符串，写回前先转数字（踩坑 002）
  const totals = {
    quantity: r.total_quantity,
    weightKg: round(Number(r.total_weight_kg), 2),
    volumeM3: round(Number(r.total_volume_m3), 4),
    ldm: round(Number(r.total_ldm), 2),
  }

  await client.query(
    `UPDATE inquiries
     SET cargo_quantity = $1, cargo_weight_kg = $2, cargo_volume_m3 = $3,
         ldm = $4, updated_at = NOW()
     WHERE id = $5`,
    [totals.quantity, totals.weightKg, totals.volumeM3, totals.ldm, inquiryId]
  )
  return totals
}

/**
 * 读取一张询价单的明细行（按行号）
 * @param {string} inquiryId
 * @param {object} [client] 事务内调用时传入事务客户端，否则走连接池
 */
export async function getCargoItems(inquiryId, client = null) {
  const sql = `SELECT * FROM inquiry_cargo_items WHERE inquiry_id = $1 ORDER BY line_number`
  const result = client ? await client.query(sql, [inquiryId]) : await poolQuery(sql, [inquiryId])
  return result.rows
}

/**
 * 生成"复制摘要"文本（需求 5.4，清平姐的重点痛点）
 *
 * 固定模板，直接可以粘给服务商询价，不需要再手工整理。
 * 字段缺失时显示 "-"，保持模板行数固定，服务商每次看到的格式一样。
 *
 * 语言：这份文本是给欧洲服务商看的，不是给自己人看的界面，
 * 所以默认英文，而不是跟着操作员的界面语言走。要中文/德文版本传 lang。
 *
 * @param {object} inquiry 询价主表行
 * @param {object[]} [items] 货物明细行（两层结构用；本地派送传空数组）
 * @param {'zh'|'en'|'de'} [lang='en'] 摘要文本语言
 * @param {object[]} [deliveryOrders] 派送子订单（含各自 cargoItems）。
 *        非空时走本地派送的三层排版，此时 items / route_to 不再单独输出
 */
export function buildSummaryText(inquiry, items = [], lang = 'en', deliveryOrders = []) {
  const from = parseAddress(inquiry.route_from)
  const to = parseAddress(inquiry.route_to)
  const p = PUNCTUATION[lang] || PUNCTUATION.en
  /** 「标签＋冒号＋值」一行，冒号中英文不一样，统一从这里出 */
  const field = (key, value) => `${t(lang, `inquirySummary.${key}`)}${p.colon}${value}`
  /** 【起运地】/ [ORIGIN] 这种小标题 */
  const section = (key) => `${p.sectionOpen}${t(lang, `inquirySummary.${key}`)}${p.sectionClose}`

  const lines = []
  lines.push(field('inquiryNo', inquiry.inquiry_number || '-'))
  if (inquiry.customer_ref) lines.push(field('customerRef', inquiry.customer_ref))
  // 刻意不输出「客户」和「服务类型」：这份摘要是直接粘给欧洲服务商询价的，
  // 客户名是我们自己的商业信息（等于把货主直接告诉承运商），服务类型是我们内部
  // 的渠道口径，服务商既看不懂也用不上。两者都要删（开发意见 #4）。
  //
  // 「专车/拼车」和车型反过来必须给：服务商就是按这个报价的（开发意见 #10）。
  if (inquiry.transport_type) {
    lines.push(field('transportType', t(lang, `transportType.${inquiry.transport_type}`)))
  }
  if (inquiry.vehicle_length_code) {
    lines.push(field('vehicleLength', t(lang, `vehicleLength.${inquiry.vehicle_length_code}`)))
  }
  // 本地派送的柜号：服务商是按柜接活的，没有柜号他没法跟码头/仓库对上（开发意见 #7）
  if (inquiry.container_no) {
    lines.push(field('containerNo', inquiry.container_no))
  }
  lines.push('')

  // 取件方成段，发货联系人跟着它走 ——
  // 服务商拿到摘要要打给发货人约提货时间，混在一个「联系人」段里等于没写
  lines.push(section('origin'))
  lines.push(...formatAddressLines(from, lang))
  lines.push(...formatContactLines({
    name: from.contactName, phone: from.contactPhone, email: from.contactEmail,
  }, lang, 'sender'))
  lines.push('')

  if (deliveryOrders.length > 0) {
    // 本地派送：一个柜派往多个地址，没有单一「目的地」可写，
    // 逐个子订单列出地址 + 收货人 + 汇总 + 件明细
    lines.push(`${section('deliveryOrders')}${p.inlineGap}${deliveryOrders.length}`)
    for (const order of deliveryOrders) {
      lines.push(...formatDeliveryOrderLines(order, lang))
    }
    lines.push('')
  } else {
    lines.push(section('destination'))
    lines.push(...formatAddressLines(to, lang))
    lines.push(...formatContactLines({
      name: inquiry.contact_name, phone: inquiry.contact_phone, email: inquiry.contact_email,
    }, lang, 'receiver'))
    lines.push('')

    if (items.length > 0) {
      lines.push(section('cargoItems'))
      for (const it of items) {
        lines.push(`${it.line_number}. ${formatCargoItemParts(it, lang).join(' | ')}`)
      }
      lines.push('')
    }
  }

  lines.push(section('totals'))
  // 合计件数的单位跟着语言走：英文标签已经是 "Total pieces"，再跟个 pcs 就重复了，
  // 所以英文包里这个单位是空串；中文「件数：9 件」、德文「Packstücke: 9 Stk.」照旧
  const totalQtyUnit = t(lang, 'inquirySummary.totalQuantityUnit')
  const totalQty = `${inquiry.cargo_quantity ?? '-'}${totalQtyUnit ? ' ' + totalQtyUnit : ''}`
  lines.push(field('totalQuantity', totalQty))
  lines.push(field('totalWeight', inquiry.cargo_weight_kg !== null && inquiry.cargo_weight_kg !== undefined ? trimNumber(inquiry.cargo_weight_kg) + ' kg' : '-'))
  lines.push(field('totalVolume', inquiry.cargo_volume_m3 !== null && inquiry.cargo_volume_m3 !== undefined ? trimNumber(inquiry.cargo_volume_m3) + ' m³' : '-'))
  lines.push(field('totalLdm', inquiry.ldm !== null && inquiry.ldm !== undefined ? trimNumber(inquiry.ldm) : '-'))

  if (inquiry.cargo_description) {
    lines.push('')
    lines.push(`${section('cargoDescription')}${p.inlineGap}${inquiry.cargo_description}`)
  }
  if (inquiry.special_requirements) {
    lines.push('')
    lines.push(`${section('specialRequirements')}${p.inlineGap}${inquiry.special_requirements}`)
  }
  if (inquiry.remarks) {
    lines.push('')
    lines.push(`${section('remarks')}${p.inlineGap}${inquiry.remarks}`)
  }

  return lines.join('\n')
}

/**
 * 摘要里的标点：中文用全角冒号和【】，英德用半角冒号和 []
 * （英文段落里出现【】会显得很突兀）
 */
const PUNCTUATION = {
  // inlineGap：小标题后面直接跟正文时的间隔，中文的【】自带视觉分隔不用空格
  zh: { colon: '：', sectionOpen: '【', sectionClose: '】', inlineGap: '' },
  en: { colon: ': ', sectionOpen: '[', sectionClose: ']', inlineGap: ' ' },
  de: { colon: ': ', sectionOpen: '[', sectionClose: ']', inlineGap: ' ' },
}

// ==================== 内部工具 ====================

/** JSONB 列可能是对象也可能是字符串，统一成对象 */
export function parseAddress(value) {
  if (!value) return {}
  if (typeof value === 'string') {
    try { return JSON.parse(value) || {} } catch { return {} }
  }
  return value
}

/**
 * 一行件明细的各段（件号 | 品名 | 件数 | 尺寸 | 单重 | 单体积 | LDM | 不可堆叠）
 *
 * 两层和三层排版共用，免得同一份格式写两遍、改一处忘一处。
 */
function formatCargoItemParts(it, lang) {
  const dims = [it.length_cm, it.width_cm, it.height_cm]
    .map((v) => (v === null || v === undefined ? '?' : trimNumber(v)))
    .join('×')
  return [
    it.reference_no ? `${t(lang, 'inquirySummary.itemRef')} ${it.reference_no}` : null,
    it.description || null,
    `${it.quantity} ${t(lang, 'inquirySummary.pieces')}`,
    `${dims} cm`,
    it.unit_weight_kg !== null ? `${t(lang, 'inquirySummary.perPiece')} ${trimNumber(it.unit_weight_kg)} kg` : null,
    it.unit_volume_m3 !== null ? `${t(lang, 'inquirySummary.perPiece')} ${trimNumber(it.unit_volume_m3)} m³` : null,
    it.ldm !== null ? `LDM ${trimNumber(it.ldm)}` : null,
    it.stackable === false ? t(lang, 'inquirySummary.notStackable') : null,
  ].filter(Boolean)
}

/**
 * 一个派送子订单的完整段落（本地派送专用）
 *
 * 排版是「一单一块」而不是表格：服务商多半在手机上看邮件，
 * 一行几十个字符的表格会被折行折烂，反而不如缩进的块状清楚。
 */
function formatDeliveryOrderLines(order, lang) {
  const p = PUNCTUATION[lang] || PUNCTUATION.en
  const addr = parseAddress(order.delivery_address)
  const lines = []

  // 标题行：序号 + 客户子单号（没有就只有序号）
  const title = order.customer_sub_ref
    ? `${order.line_number}. ${t(lang, 'inquirySummary.subRef')}${p.colon}${order.customer_sub_ref}`
    : `${order.line_number}.`
  lines.push(title)

  // 地址压成一行，字段之间用 · 分隔；公司名排在最前面，服务商找门牌先看公司
  const addrLine = [addr.companyName, addr.country, addr.zipCode, addr.city, addr.address]
    .filter(Boolean).join(' · ')
  lines.push(`   ${addrLine || '-'}`)

  const contact = [addr.contactName, addr.contactPhone, addr.contactEmail].filter(Boolean)
  if (contact.length > 0) {
    lines.push(`   ${t(lang, 'inquirySummary.contactNameReceiver')}${p.colon}${contact.join(' · ')}`)
  }

  // 这一单的汇总：件数 / 重量 / LDM
  const totalQtyUnit = t(lang, 'inquirySummary.totalQuantityUnit')
  const summary = [
    `${order.quantity ?? 0}${totalQtyUnit ? ' ' + totalQtyUnit : ' ' + t(lang, 'inquirySummary.pieces')}`,
    order.weight_kg !== null && order.weight_kg !== undefined ? `${trimNumber(order.weight_kg)} kg` : null,
    order.ldm !== null && order.ldm !== undefined ? `LDM ${trimNumber(order.ldm)}` : null,
  ].filter(Boolean)
  lines.push(`   ${summary.join(' | ')}`)

  for (const it of order.cargoItems || []) {
    lines.push(`     - ${formatCargoItemParts(it, lang).join(' | ')}`)
  }
  if (order.remarks) {
    // 用普通标签而不是 remarks——那个是段落标题（英文包里是全大写 REMARKS），
    // 放在缩进的子订单块里看着像另起了一段
    lines.push(`   ${t(lang, 'inquirySummary.orderRemarks')}${p.colon}${order.remarks}`)
  }
  return lines
}

/**
 * 一侧的联系人三行（姓名 / 电话 / 邮箱）
 *
 * 三个都没填就一行都不输出 —— 摘要里连着三行 "-" 只会让服务商以为是漏发了；
 * 填了一部分就把没填的显示成 "-"，让人看得出是「确实没有」而不是「忘了写」。
 *
 * @param {{name?: string, phone?: string, email?: string}} contact
 * @param {'zh'|'en'|'de'} lang
 * @param {'sender'|'receiver'} role 决定标签是「发货联系人」还是「收货联系人」
 */
function formatContactLines(contact, lang, role) {
  const name = (contact.name || '').trim()
  const phone = (contact.phone || '').trim()
  const email = (contact.email || '').trim()
  if (!name && !phone && !email) return []

  const p = PUNCTUATION[lang] || PUNCTUATION.en
  const line = (key, value) => `${t(lang, `inquirySummary.${key}`)}${p.colon}${value || '-'}`
  const cap = role === 'sender' ? 'Sender' : 'Receiver'
  return [
    line(`contactName${cap}`, name),
    line(`contactPhone${cap}`, phone),
    line(`contactEmail${cap}`, email),
  ]
}

function formatAddressLines(addr, lang = 'en') {
  const p = PUNCTUATION[lang] || PUNCTUATION.en
  const line = (key, value) => `${t(lang, `inquirySummary.${key}`)}${p.colon}${value || '-'}`
  return [
    line('country', addr.country),
    line('zipCode', addr.zipCode),
    line('city', addr.city),
    line('address', addr.address),
  ]
}

/**
 * 转数字，空值/非法值返回 null
 * ⚠️ 用 ?? 判空而不是 ||，否则合法的 0 会被当成"没填"（踩坑 011）
 */
function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function round(value, digits) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** NUMERIC 回来是字符串，去掉无意义的尾随零再显示 */
function trimNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return String(n)
}

/**
 * 已报价的询价退回「待报价」，并作废在途报价（开发意见 #12）
 *
 * 抽在 service 里而不是写在路由体内，是为了能脱开 HTTP 和登录态直接测 ——
 * 这是一次**逆向状态流转**，是本模块里最该被验证的一段。
 *
 * 调用方负责：状态必须是 QUOTED、租户校验、权限校验（见 routes.js）。
 * 这里只管事务内的数据变更，且必须在事务里调用。
 *
 * @param {object} client 事务客户端（必须，不能传连接池）
 * @param {string} inquiryId
 * @param {object} opts
 * @param {string} opts.fromStatus 退回前的询价状态，用于变更追踪留痕
 * @param {string} opts.reason     作废原因，会写进 quotations.void_reason
 * @param {string} opts.userId     操作人
 * @returns {Promise<{voidedCount: number}>}
 * @throws 有已接受 / 已转订单的报价时抛错，让整笔事务回滚
 */
export async function reopenForEdit(client, inquiryId, { fromStatus, reason, userId }) {
  // 行锁住这张单的全部报价，避免和运营那边的「发送 / 转订单」并发
  const quotations = await client.query(
    `SELECT id, quotation_number, status FROM quotations WHERE inquiry_id = $1 FOR UPDATE`,
    [inquiryId]
  )

  const locked = quotations.rows.filter((q) => ['ACCEPTED', 'CONVERTED'].includes(q.status))
  if (locked.length > 0) {
    // 抛错让整笔事务回滚，前端按 message 提示（不要静默跳过这几张）
    throw new Error(
      `报价 ${locked.map((q) => q.quotation_number).join('、')} 已被接受或已转订单，` +
      '这张询价单不能退回待报价，请联系我司处理'
    )
  }

  // 在途报价：草稿、已发送、待定、已过期。已作废的不用再作废一次
  const voidable = quotations.rows.filter((q) => q.status !== 'CANCELLED')
  for (const quo of voidable) {
    await client.query(
      `UPDATE quotations SET status = 'CANCELLED', void_reason = $1, updated_at = NOW() WHERE id = $2`,
      [reason, quo.id]
    )
    await changeTracker.trackChanges(client, {
      objectType: 'QUOTATION',
      objectId: quo.id,
      changeType: 'UPDATE',
      transactionType: 'VOID_QUOTATION',
      tableName: 'quotations',
      oldData: { status: quo.status },
      newData: { status: 'CANCELLED', void_reason: reason },
      trackedFields: [
        { name: 'status', label: '状态' },
        { name: 'void_reason', label: '作废原因' },
      ],
      changedBy: userId,
    })
  }

  await client.query(
    `UPDATE inquiries SET status = 'PENDING_QUOTE', updated_at = NOW() WHERE id = $1`,
    [inquiryId]
  )
  await changeTracker.trackChanges(client, {
    objectType: 'INQUIRY',
    objectId: inquiryId,
    changeType: 'UPDATE',
    transactionType: 'REOPEN_INQUIRY',
    tableName: 'inquiries',
    oldData: { status: fromStatus },
    newData: { status: 'PENDING_QUOTE' },
    trackedFields: [{ name: 'status', label: '状态' }],
    changedBy: userId,
  })

  return { voidedCount: voidable.length }
}

export default {
  calcUnitVolumeM3,
  calcLineLdm,
  normalizeCargoItem,
  createInquiryRecord,
  replaceCargoItems,
  replaceDeliveryOrders,
  recalcInquiryTotals,
  recalcDeliveryOrderTotals,
  getCargoItems,
  getDeliveryOrders,
  buildSummaryText,
  parseAddress,
  reopenForEdit,
}
