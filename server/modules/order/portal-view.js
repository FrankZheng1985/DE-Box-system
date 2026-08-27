/**
 * 订单数据的「门户可见字段」白名单
 *
 * 为什么需要这层：订单列表和详情是三端共用同一个接口的
 * （CAN_VIEW_ORDER = order:view / portal:order_view / carrier_portal:task_view），
 * 而 model.getById 是 `SELECT o.*`、model.list 明写了 `o.carrier_cost` ——
 * 也就是说客户门户拿到的响应里一直带着**付给承运商的成本价**，
 * 以及承运商评分、客户信用等级这些内部字段。
 * 前端没渲染不等于没发出去，浏览器 F12 就能看到（同根因见踩坑 054）。
 *
 * 用白名单而不是「删掉这几个字段」的黑名单：orders 表还留着 V1 时期的一批列
 * （void_by / release_confirmed_by / cost_center …），以后再加列时黑名单会静默漏掉。
 * 白名单漏字段的后果是详情页少显示一项（看得见的失败），
 * 黑名单漏字段的后果是把内部数据发出去（看不见的失败）——失效方向必须是后者不可能发生。
 *
 * ⚠️ 给门户新增要显示的字段时，改这里的数组，别去动 model 的 SELECT。
 */

/**
 * 客户门户可见字段
 *
 * 含 client_price（就是报给这家客户的价，本来就该看见）和 carrier_name
 * （运输追踪页 Tracking.tsx 一直在显示承运商名，是既有的业务口径）。
 * 不含 carrier_cost / carrier_score / credit_level / 凭证与公司代码等内部字段。
 */
const CLIENT_FIELDS = [
  // 标识
  'id', 'order_number', 'customer_ref',
  // 分类与状态
  'business_type', 'transport_type', 'service_channel', 'status', 'delivery_status',
  // 地址与路线（列表里的 pickup_city / delivery_city 是 JSONB 取出来的派生列）
  'pickup_address', 'delivery_address', 'pickup_city', 'delivery_city',
  'pod', 'final_destination', 'final_dest_address', 'cnee',
  // 货物
  'cargo_description', 'cargo_weight_kg', 'cargo_volume_m3', 'cargo_quantity',
  'special_requirements',
  // 集装箱
  'container_no', 'container_type', 'seal_no', 'bl_number', 'shipping_line', 'eta',
  // 时间
  'pickup_date', 'delivery_date', 'expected_delivery_date', 'created_at', 'updated_at',
  // 清关 / 放单 / 追踪
  'needs_clearance', 'needs_release', 'release_method', 'release_status',
  'clearance_status', 'tracking_number',
  // 金额（给客户的价）
  'client_price', 'currency',
  // 承运方名称
  'carrier_name',
  // 备注（客户自己下单时填的）
  'remarks',
]

/**
 * 承运商门户可见字段
 *
 * 含 carrier_cost（我们付给他的运费，是他该知道的），
 * 不含 client_price / 客户名 / 客户信用等级 —— 那是我们的售价和客户资料。
 */
const CARRIER_FIELDS = [
  'id', 'order_number',
  'business_type', 'transport_type', 'status', 'delivery_status',
  'pickup_address', 'delivery_address', 'pickup_city', 'delivery_city',
  'pod', 'final_destination', 'final_dest_address',
  'cargo_description', 'cargo_weight_kg', 'cargo_volume_m3', 'cargo_quantity',
  'special_requirements',
  'container_no', 'container_type', 'seal_no', 'bl_number', 'shipping_line', 'eta',
  'pickup_date', 'delivery_date', 'expected_delivery_date', 'created_at', 'updated_at',
  'needs_clearance', 'needs_release', 'tracking_number',
  'carrier_cost', 'currency',
  'remarks',
]

/**
 * 状态时间线里门户可见的字段
 *
 * 去掉 changed_by_name（我们内部员工的姓名）和 remarks（可能是内部处理说明），
 * 只留「什么时候从哪个状态变成了哪个状态」。
 */
const TIMELINE_FIELDS = ['from_status', 'to_status', 'created_at']

/**
 * 解析登录身份
 *
 * 口径与 controller.js 的 canAccessOrder / scopeToTenant 完全一致，
 * 三处必须同时改：那两处判成运营却在这里判成客户（或反过来）就会出怪事。
 * users.user_type 是 NOT NULL DEFAULT 'OPERATOR'，不存在第三种取值。
 */
function resolveViewer(user) {
  const userType = user?.userType || user?.roleCode
  if (userType === 'CLIENT') return 'CLIENT'
  if (userType === 'CARRIER') return 'CARRIER'
  return 'OPERATOR'
}

/** 按白名单挑字段，行里没有的键不会造出 undefined 项 */
function pick(row, fields) {
  const out = {}
  for (const key of fields) {
    if (Object.prototype.hasOwnProperty.call(row, key)) out[key] = row[key]
  }
  return out
}

/**
 * 收窄单条订单
 * @param {object} user req.user
 * @param {object|null} row 订单行（model.getById / model.list 的一行）
 * @returns {object|null} 运营原样返回，门户按白名单收窄
 */
export function scrubOrder(user, row) {
  if (!row) return row
  const viewer = resolveViewer(user)
  if (viewer === 'OPERATOR') return row
  return pick(row, viewer === 'CLIENT' ? CLIENT_FIELDS : CARRIER_FIELDS)
}

/** 收窄订单列表 */
export function scrubOrders(user, rows) {
  if (!Array.isArray(rows)) return rows
  const viewer = resolveViewer(user)
  if (viewer === 'OPERATOR') return rows
  const fields = viewer === 'CLIENT' ? CLIENT_FIELDS : CARRIER_FIELDS
  return rows.map((row) => pick(row, fields))
}

/** 收窄状态时间线 */
export function scrubTimeline(user, rows) {
  if (!Array.isArray(rows)) return rows
  if (resolveViewer(user) === 'OPERATOR') return rows
  return rows.map((row) => pick(row, TIMELINE_FIELDS))
}

export default { scrubOrder, scrubOrders, scrubTimeline }
