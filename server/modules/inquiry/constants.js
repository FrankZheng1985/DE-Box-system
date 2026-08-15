/**
 * 询价的枚举值域（唯一来源）
 *
 * 路由校验、Excel 导入解析都从这里取，不各自手抄一份 —— 踩坑 013 就是
 * 同一个概念在四个地方各写各的 map，值域一错就是静默失效。
 *
 * 三语显示名不在这里，走语言包 `transportType.*` / `vehicleLength.*`。
 */

/**
 * 运输方式（inquiries.transport_type）
 * 业务口径：FTL = 专车（整车），LTL = 拼车（零担）
 *
 * ⚠️ 别和 business_type 的 TRUCK_FTL / TRUCK_LTL 混：那是「服务类型」（业务线），
 *    这里是同一条服务线下「包一辆车还是拼一辆车」。踩坑 013 的原案发点。
 */
export const TRANSPORT_TYPES = {
  /** 专车 */
  FTL: 'FTL',
  /** 拼车 */
  LTL: 'LTL',
}

export const TRANSPORT_TYPE_VALUES = [TRANSPORT_TYPES.FTL, TRANSPORT_TYPES.LTL]

/**
 * 车型（车长）代号 —— 顺序即界面下拉的顺序，由短到长
 *
 * 和承运商的 vehicle_types（车厢类型：帘式 / 平板 / 冷藏…）是两个维度，
 * 前缀 TRUCK_ 就是为了一眼区分开（迁移 128 的说明）。
 */
export const VEHICLE_LENGTH_CODES = [
  'TRUCK_4M',
  'TRUCK_6_2M',
  'TRUCK_7_2M',
  'TRUCK_7_8M',
  'TRUCK_9M',
  'TRUCK_12M',
  'TRUCK_13_6M',
]

/**
 * Excel 里「专车 / 拼车」列能接受的写法 → 标准代码
 * 键是规整后（去空格、转小写）的文本
 */
export const TRANSPORT_TYPE_ALIASES = {
  ftl: 'FTL',
  专车: 'FTL',
  整车: 'FTL',
  komplettladung: 'FTL',
  dedicated: 'FTL',
  ltl: 'LTL',
  拼车: 'LTL',
  零担: 'LTL',
  teilladung: 'LTL',
  shared: 'LTL',
}

/**
 * Excel 里「车型」列能接受的写法 → 标准代码
 *
 * 客户十有八九直接写车长数字（"7.2"、"13.6m"、"9米"），所以数字写法全部收，
 * 区间型车长（7.2-7.45）按下界收。认不出来的按校验错误退回，不静默丢。
 */
export const VEHICLE_LENGTH_ALIASES = {
  truck4m: 'TRUCK_4M', '4': 'TRUCK_4M', '4m': 'TRUCK_4M', '4米': 'TRUCK_4M',
  truck62m: 'TRUCK_6_2M', '6.2': 'TRUCK_6_2M', '6.2m': 'TRUCK_6_2M', '6.2米': 'TRUCK_6_2M',
  truck72m: 'TRUCK_7_2M', '7.2': 'TRUCK_7_2M', '7.2m': 'TRUCK_7_2M', '7.2米': 'TRUCK_7_2M', '7.45': 'TRUCK_7_2M',
  truck78m: 'TRUCK_7_8M', '7.8': 'TRUCK_7_8M', '7.8m': 'TRUCK_7_8M', '7.8米': 'TRUCK_7_8M', '8.2': 'TRUCK_7_8M',
  truck9m: 'TRUCK_9M', '9': 'TRUCK_9M', '9m': 'TRUCK_9M', '9米': 'TRUCK_9M', '9.0': 'TRUCK_9M', '9.6': 'TRUCK_9M',
  truck12m: 'TRUCK_12M', '12': 'TRUCK_12M', '12m': 'TRUCK_12M', '12米': 'TRUCK_12M',
  truck136m: 'TRUCK_13_6M', '13.6': 'TRUCK_13_6M', '13.6m': 'TRUCK_13_6M', '13.6米': 'TRUCK_13_6M',
}

/**
 * 把用户写法归一成标准代号
 * @param {string} raw 原始文本
 * @param {Record<string,string>} aliases 别名表
 * @returns {string|null} 认不出返回 null（调用方决定报错还是忽略）
 */
export function normalizeCode(raw, aliases) {
  if (raw === null || raw === undefined) return null
  const key = String(raw).trim().toLowerCase().replace(/[\s_-]/g, '')
  if (!key) return null
  return aliases[key] || null
}

export default {
  TRANSPORT_TYPES,
  TRANSPORT_TYPE_VALUES,
  VEHICLE_LENGTH_CODES,
  TRANSPORT_TYPE_ALIASES,
  VEHICLE_LENGTH_ALIASES,
  normalizeCode,
}
