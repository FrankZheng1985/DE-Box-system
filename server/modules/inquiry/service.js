/**
 * 询价业务逻辑
 *
 * 按件货物明细的换算、汇总回写、以及给服务商用的"复制摘要"文本，
 * 都收在这里 —— routes.js 只负责端点，不放算法。
 */

import { query as poolQuery } from '../../core/db.js'
import { documentEngine } from '../../core/index.js'
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
      contact_name, contact_phone, contact_email, customer_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [doc.id, doc.docNumber, clientId,
     payload.businessType, payload.transportType,
     JSON.stringify(payload.routeFrom || {}), JSON.stringify(payload.routeTo || {}),
     payload.cargoDescription, payload.cargoWeightKg,
     payload.cargoVolumeM3, payload.cargoQuantity,
     payload.specialRequirements, payload.pod, payload.containerType,
     payload.remarks, 'PENDING_QUOTE',
     payload.contactName, payload.contactPhone, payload.contactEmail,
     payload.customerRef]
  )
  const created = result.rows[0]

  // 有按件明细就入库，并把合计汇总回写表头（覆盖上面写入的表头合计值）
  if (Array.isArray(payload.cargoItems) && payload.cargoItems.length > 0) {
    await replaceCargoItems(client, created.id, payload.cargoItems)
    const refreshed = await client.query(`SELECT * FROM inquiries WHERE id = $1`, [created.id])
    return refreshed.rows[0]
  }
  return created
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
 * @param {object[]} [items] 货物明细行
 * @param {'zh'|'en'|'de'} [lang='en'] 摘要文本语言
 */
export function buildSummaryText(inquiry, items = [], lang = 'en') {
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
  lines.push(field('client', inquiry.client_name || '-'))
  lines.push(field('serviceType', businessTypeLabel(inquiry.business_type, lang)))
  lines.push('')

  lines.push(section('origin'))
  lines.push(...formatAddressLines(from, lang))
  lines.push('')

  lines.push(section('destination'))
  lines.push(...formatAddressLines(to, lang))
  lines.push('')

  lines.push(section('contact'))
  lines.push(field('contactName', inquiry.contact_name || '-'))
  lines.push(field('contactPhone', inquiry.contact_phone || '-'))
  lines.push(field('contactEmail', inquiry.contact_email || '-'))
  lines.push('')

  if (items.length > 0) {
    lines.push(section('cargoItems'))
    for (const it of items) {
      const dims = [it.length_cm, it.width_cm, it.height_cm]
        .map((v) => (v === null || v === undefined ? '?' : trimNumber(v)))
        .join('×')
      const parts = [
        it.reference_no ? `${t(lang, 'inquirySummary.itemRef')} ${it.reference_no}` : null,
        it.description || null,
        `${it.quantity} ${t(lang, 'inquirySummary.pieces')}`,
        `${dims} cm`,
        it.unit_weight_kg !== null ? `${t(lang, 'inquirySummary.perPiece')} ${trimNumber(it.unit_weight_kg)} kg` : null,
        it.unit_volume_m3 !== null ? `${t(lang, 'inquirySummary.perPiece')} ${trimNumber(it.unit_volume_m3)} m³` : null,
        it.ldm !== null ? `LDM ${trimNumber(it.ldm)}` : null,
        it.stackable === false ? t(lang, 'inquirySummary.notStackable') : null,
      ].filter(Boolean)
      lines.push(`${it.line_number}. ${parts.join(' | ')}`)
    }
    lines.push('')
  }

  lines.push(section('totals'))
  lines.push(field('totalQuantity', `${inquiry.cargo_quantity ?? '-'} ${t(lang, 'inquirySummary.pieces')}`))
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

/**
 * 服务类型的多语言名称
 * t() 查不到 key 时会把 key 原样返回，那种情况退回数据库里的原始代码，
 * 免得摘要里出现 "businessType.XXX" 这种给服务商看不懂的东西
 */
function businessTypeLabel(businessType, lang) {
  if (!businessType) return '-'
  const label = t(lang, `businessType.${businessType}`)
  return label.startsWith('businessType.') ? businessType : label
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

export default {
  calcUnitVolumeM3,
  calcLineLdm,
  normalizeCargoItem,
  createInquiryRecord,
  replaceCargoItems,
  recalcInquiryTotals,
  getCargoItems,
  buildSummaryText,
  parseAddress,
}
