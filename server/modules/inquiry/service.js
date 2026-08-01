/**
 * 询价业务逻辑
 *
 * 按件货物明细的换算、汇总回写、以及给服务商用的"复制摘要"文本，
 * 都收在这里 —— routes.js 只负责端点，不放算法。
 */

import { query as poolQuery } from '../../core/db.js'

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
 */
export function buildSummaryText(inquiry, items = []) {
  const from = parseAddress(inquiry.route_from)
  const to = parseAddress(inquiry.route_to)

  const lines = []
  lines.push(`询价单号：${inquiry.inquiry_number || '-'}`)
  if (inquiry.customer_ref) lines.push(`客户单号：${inquiry.customer_ref}`)
  lines.push(`客户：${inquiry.client_name || '-'}`)
  lines.push(`服务类型：${BUSINESS_TYPE_LABELS[inquiry.business_type] || inquiry.business_type || '-'}`)
  lines.push('')

  lines.push('【起运地】')
  lines.push(...formatAddressLines(from))
  lines.push('')

  lines.push('【目的地】')
  lines.push(...formatAddressLines(to))
  lines.push('')

  lines.push('【联系人】')
  lines.push(`姓名：${inquiry.contact_name || '-'}`)
  lines.push(`电话：${inquiry.contact_phone || '-'}`)
  lines.push(`邮箱：${inquiry.contact_email || '-'}`)
  lines.push('')

  if (items.length > 0) {
    lines.push('【货物明细】')
    for (const it of items) {
      const dims = [it.length_cm, it.width_cm, it.height_cm]
        .map((v) => (v === null || v === undefined ? '?' : trimNumber(v)))
        .join('×')
      const parts = [
        it.reference_no ? `单号 ${it.reference_no}` : null,
        it.description || null,
        `${it.quantity} 件`,
        `${dims} cm`,
        it.unit_weight_kg !== null ? `单件 ${trimNumber(it.unit_weight_kg)} kg` : null,
        it.unit_volume_m3 !== null ? `单件 ${trimNumber(it.unit_volume_m3)} m³` : null,
        it.ldm !== null ? `LDM ${trimNumber(it.ldm)}` : null,
        it.stackable === false ? '不可堆叠' : null,
      ].filter(Boolean)
      lines.push(`${it.line_number}. ${parts.join(' | ')}`)
    }
    lines.push('')
  }

  lines.push('【合计】')
  lines.push(`件数：${inquiry.cargo_quantity ?? '-'} 件`)
  lines.push(`实重：${inquiry.cargo_weight_kg !== null && inquiry.cargo_weight_kg !== undefined ? trimNumber(inquiry.cargo_weight_kg) + ' kg' : '-'}`)
  lines.push(`体积：${inquiry.cargo_volume_m3 !== null && inquiry.cargo_volume_m3 !== undefined ? trimNumber(inquiry.cargo_volume_m3) + ' m³' : '-'}`)
  lines.push(`LDM：${inquiry.ldm !== null && inquiry.ldm !== undefined ? trimNumber(inquiry.ldm) : '-'}`)

  if (inquiry.cargo_description) {
    lines.push('')
    lines.push(`【货物描述】${inquiry.cargo_description}`)
  }
  if (inquiry.special_requirements) {
    lines.push('')
    lines.push(`【特殊要求】${inquiry.special_requirements}`)
  }
  if (inquiry.remarks) {
    lines.push('')
    lines.push(`【备注】${inquiry.remarks}`)
  }

  return lines.join('\n')
}

/** 服务类型中文名（和 order/service.js 的 BUSINESS_TYPE_LABELS 保持一致） */
const BUSINESS_TYPE_LABELS = {
  TRUCK_LTL: '卡车派送 LTL',
  TRUCK_FTL: '卡车运输 FTL',
  LOCAL_DELIVERY: '本地派送',
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

function formatAddressLines(addr) {
  return [
    `国家：${addr.country || '-'}`,
    `邮编：${addr.zipCode || '-'}`,
    `城市：${addr.city || '-'}`,
    `地址：${addr.address || '-'}`,
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
  replaceCargoItems,
  recalcInquiryTotals,
  getCargoItems,
  buildSummaryText,
  parseAddress,
}
