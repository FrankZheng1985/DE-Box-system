/**
 * 服务商询价业务逻辑（需求 5.3）
 *
 * 状态流转、编号生成、成本对比这些算法收在这里，routes.js 只负责端点。
 */

import { numberRange } from '../../core/index.js'

/** 服务商询价状态（和库里存的值一致，全大写 —— 踩坑 004） */
export const CARRIER_INQUIRY_STATUS = {
  PENDING: 'PENDING',
  QUOTED: 'QUOTED',
  SELECTED: 'SELECTED',
  DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED',
}

export const CARRIER_INQUIRY_STATUS_LABELS = {
  PENDING: '待回价',
  QUOTED: '已回价',
  SELECTED: '已选用',
  DECLINED: '不报价',
  CANCELLED: '已取消',
}

/** 还在等服务商结果的状态，用来判断"这家已经在询了" */
export const ACTIVE_STATUSES = [
  CARRIER_INQUIRY_STATUS.PENDING,
  CARRIER_INQUIRY_STATUS.QUOTED,
  CARRIER_INQUIRY_STATUS.SELECTED,
]

/**
 * 生成服务商询价单号（CINQ-YYYYMMDD-0001）
 *
 * 走编号范围引擎的行锁，并发发起也不会撞号。
 * 刻意不建 documents 凭证：服务商询价是内部询价动作，不是对外凭证。
 *
 * @param {object} client 事务客户端（必须在事务中调用）
 */
export async function nextCarrierInquiryNumber(client) {
  const { docNumber } = await numberRange.getNextNumber(client, 'CINQ', 'DE01')
  return docNumber
}

/**
 * 校验回价内容
 * @returns {string|null} 错误信息，null 表示通过
 */
export function validateReply(body) {
  const cost = toNumber(body.quotedCost)
  if (cost === null) return '请填写服务商报来的成本金额'
  if (cost < 0) return '成本金额不能为负数'

  if (body.transitDays !== undefined && body.transitDays !== null && body.transitDays !== '') {
    const days = Number(body.transitDays)
    if (!Number.isFinite(days) || days < 0) return '时效天数必须是不小于 0 的数字'
  }
  if (body.currency && String(body.currency).length !== 3) {
    return '币种必须是 3 位代码，例如 EUR'
  }
  return null
}

/**
 * 把一组服务商询价按成本排序，标出最低价
 *
 * ⚠️ NUMERIC 回来是字符串，比大小前必须 Number()（踩坑 002）
 * 币种不同的不做换算，只在同币种内比较——乱换算会给出错误的"最低价"。
 *
 * @returns {{ lowestId: string|null, lowestCost: number|null }}
 */
export function findLowestCost(rows) {
  let lowestId = null
  let lowestCost = null
  for (const row of rows) {
    if (row.status !== CARRIER_INQUIRY_STATUS.QUOTED && row.status !== CARRIER_INQUIRY_STATUS.SELECTED) continue
    const cost = toNumber(row.quoted_cost)
    if (cost === null) continue
    if (lowestCost === null || cost < lowestCost) {
      lowestCost = cost
      lowestId = row.id
    }
  }
  return { lowestId, lowestCost }
}

/**
 * 转数字，空值/非法值返回 null
 * ⚠️ 用显式判空而不是 ||，否则合法的 0 会被当成"没填"（踩坑 011）
 */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export default {
  CARRIER_INQUIRY_STATUS,
  CARRIER_INQUIRY_STATUS_LABELS,
  ACTIVE_STATUSES,
  nextCarrierInquiryNumber,
  validateReply,
  findLowestCost,
  toNumber,
}
