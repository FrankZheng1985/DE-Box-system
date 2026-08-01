/**
 * system_settings 读取工具
 *
 * system_settings 是一张 key-value 表（001_init 就建好了），
 * setting_value 一律是 TEXT，setting_type 标注它该被当成什么类型用。
 * 各处自己 `SELECT setting_value` 再手工 parse 很容易出错
 * （'false' 是个非空字符串，直接当布尔用永远是 true），统一收在这里。
 */

import { query } from '../core/db.js'

/**
 * 取一个布尔配置
 * @param {string} key
 * @param {boolean} fallback 取不到或值非法时的默认
 */
export async function getBoolSetting(key, fallback = false) {
  const raw = await getRawSetting(key)
  if (raw === null) return fallback
  const v = String(raw).trim().toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(v)) return true
  if (['false', '0', 'no', 'off'].includes(v)) return false
  return fallback
}

/**
 * 取一个数字配置
 * @param {string} key
 * @param {number} fallback
 */
export async function getNumberSetting(key, fallback = 0) {
  const raw = await getRawSetting(key)
  if (raw === null) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

/** 取原始字符串，不存在返回 null */
export async function getRawSetting(key) {
  try {
    const result = await query(
      `SELECT setting_value FROM system_settings WHERE setting_key = $1`, [key]
    )
    if (result.rows.length === 0) return null
    // 值可以是空字符串（合法），所以用 ?? 判空而不是 ||
    return result.rows[0].setting_value ?? null
  } catch (err) {
    // 配置读不到不该拖垮业务，退回默认值并留下痕迹
    console.error(`[系统配置] 读取 ${key} 失败: ${err.message}`)
    return null
  }
}

export default { getBoolSetting, getNumberSetting, getRawSetting }
