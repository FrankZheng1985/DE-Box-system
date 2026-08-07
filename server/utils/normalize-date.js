/**
 * 日期字段归一化
 *
 * 背景（踩坑 059）：`<input type="date">` 留空时提交的是**空字符串** `''`，
 * 不是 null。Postgres 的 `date` / `timestamp` 列拒收 `''`，会报
 * `invalid input syntax for type date: ""`。
 *
 * 危险的不是日期没存上，而是**整条语句失败**——这些写入都在事务里，
 * 于是同一次提交的其它字段（车型、服务国家、金额……）跟着一起回滚，
 * 用户看到的是「我改的 A 没存上」，根本联想不到是某个日期字段的锅。
 *
 * 所以统一在**后端入口**兜住：前端各页面（三端 + Open API + 未来新页面）
 * 就不用每个都记得写 `|| null`。carrier 当初出事，正是因为它的前端
 * 恰好是唯一没写那句兜底的。
 */

/**
 * 把 body 里指定字段的空字符串转成 null（原地修改并返回 body）。
 *
 * 只处理「字符串且去空格后为空」的情况：
 * - `undefined` 保持不变——调用方普遍用 `!== undefined` 判断「这次要不要更新这一列」，
 *   转成 null 会把「没传」误当成「要清空」。
 * - 已经是 `null` 的保持不变。
 * - 有值的字符串原样交给 pg 驱动，格式对不对由 Postgres 判断。
 *
 * @param {object} body 请求体（req.body 或 service 层的 updateData）
 * @param {string[]} fields 需要处理的字段名（驼峰，和前端传的一致）
 * @returns {object} 同一个 body 对象
 */
export function normalizeDateFields(body, fields) {
  if (!body || typeof body !== 'object') return body
  for (const field of fields) {
    if (typeof body[field] === 'string' && body[field].trim() === '') {
      body[field] = null
    }
  }
  return body
}

export default normalizeDateFields
