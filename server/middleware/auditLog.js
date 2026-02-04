/**
 * 审计日志中间件
 * 
 * ERP标准：记录所有关键业务操作，支持追溯和审计
 */

import { getDatabase, generateId } from '../config/database.js'

/**
 * 审计日志动作类型
 */
export const AuditActions = {
  // 用户相关
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DELETE: 'USER_DELETE',
  USER_PASSWORD_CHANGE: 'USER_PASSWORD_CHANGE',
  
  // 订单相关
  ORDER_CREATE: 'ORDER_CREATE',
  ORDER_UPDATE: 'ORDER_UPDATE',
  ORDER_DELETE: 'ORDER_DELETE',
  ORDER_STATUS_CHANGE: 'ORDER_STATUS_CHANGE',
  
  // 发票相关
  INVOICE_CREATE: 'INVOICE_CREATE',
  INVOICE_UPDATE: 'INVOICE_UPDATE',
  INVOICE_DELETE: 'INVOICE_DELETE',
  INVOICE_STATUS_CHANGE: 'INVOICE_STATUS_CHANGE',
  
  // 支付相关
  PAYMENT_CREATE: 'PAYMENT_CREATE',
  PAYMENT_UPDATE: 'PAYMENT_UPDATE',
  PAYMENT_DELETE: 'PAYMENT_DELETE',
  
  // 客户相关
  CUSTOMER_CREATE: 'CUSTOMER_CREATE',
  CUSTOMER_UPDATE: 'CUSTOMER_UPDATE',
  CUSTOMER_DELETE: 'CUSTOMER_DELETE',
  
  // 供应商相关
  SUPPLIER_CREATE: 'SUPPLIER_CREATE',
  SUPPLIER_UPDATE: 'SUPPLIER_UPDATE',
  SUPPLIER_DELETE: 'SUPPLIER_DELETE',
  
  // TMS相关
  SHIPMENT_CREATE: 'SHIPMENT_CREATE',
  SHIPMENT_UPDATE: 'SHIPMENT_UPDATE',
  SHIPMENT_DELETE: 'SHIPMENT_DELETE',
  SHIPMENT_STATUS_CHANGE: 'SHIPMENT_STATUS_CHANGE',
  
  // 系统相关
  SYSTEM_SETTING_CHANGE: 'SYSTEM_SETTING_CHANGE',
  ROLE_PERMISSION_CHANGE: 'ROLE_PERMISSION_CHANGE',
}

/**
 * 记录审计日志
 * 
 * @param {Object} options - 日志选项
 * @param {string} options.userId - 操作用户ID
 * @param {string} options.action - 操作类型
 * @param {string} options.targetType - 目标对象类型 (order, invoice, customer 等)
 * @param {string} options.targetId - 目标对象ID
 * @param {Object} options.details - 详细信息（JSON）
 * @param {string} options.ip - 请求IP地址
 */
export async function logAudit(options) {
  const { userId, action, targetType, targetId, details = {}, ip = '' } = options
  
  try {
    const db = getDatabase()
    const id = generateId('audit')
    
    await db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, ip_address, create_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `).run(
      id,
      userId || 'SYSTEM',
      action,
      targetType || null,
      targetId || null,
      JSON.stringify(details),
      ip || null
    )
    
    return id
  } catch (error) {
    // 审计日志失败不应该影响主业务流程，只记录错误
    console.error('审计日志记录失败:', error.message)
    return null
  }
}

/**
 * 审计日志查询
 * 
 * @param {Object} filters - 查询条件
 * @param {string} filters.userId - 用户ID
 * @param {string} filters.action - 操作类型
 * @param {string} filters.targetType - 目标类型
 * @param {string} filters.targetId - 目标ID
 * @param {string} filters.startDate - 开始日期
 * @param {string} filters.endDate - 结束日期
 * @param {number} filters.page - 页码
 * @param {number} filters.pageSize - 每页数量
 */
export async function queryAuditLogs(filters = {}) {
  const { 
    userId, action, targetType, targetId, 
    startDate, endDate, 
    page = 1, pageSize = 20 
  } = filters
  
  const db = getDatabase()
  const conditions = ['1=1']
  const params = []
  
  if (userId) {
    params.push(userId)
    conditions.push(`a.user_id = $${params.length}`)
  }
  
  if (action) {
    params.push(action)
    conditions.push(`a.action = $${params.length}`)
  }
  
  if (targetType) {
    params.push(targetType)
    conditions.push(`a.target_type = $${params.length}`)
  }
  
  if (targetId) {
    params.push(targetId)
    conditions.push(`a.target_id = $${params.length}`)
  }
  
  if (startDate) {
    params.push(startDate)
    conditions.push(`a.create_time >= $${params.length}`)
  }
  
  if (endDate) {
    params.push(endDate)
    conditions.push(`a.create_time <= $${params.length}`)
  }
  
  const whereClause = conditions.join(' AND ')
  const offset = (parseInt(page) - 1) * parseInt(pageSize)
  
  const countResult = await db.prepare(`
    SELECT COUNT(*) as total FROM audit_logs a WHERE ${whereClause}
  `).get(...params)
  
  const list = await db.prepare(`
    SELECT a.id, a.user_id as "userId", a.action, a.target_type as "targetType",
           a.target_id as "targetId", a.details, a.ip_address as "ipAddress",
           a.create_time as "createTime",
           u.username, u.name as "userName"
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE ${whereClause}
    ORDER BY a.create_time DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `).all(...params, parseInt(pageSize), offset)
  
  // 解析 details JSON
  const parsedList = list.map(item => ({
    ...item,
    details: item.details ? JSON.parse(item.details) : {}
  }))
  
  return {
    list: parsedList,
    total: parseInt(countResult.total),
    page: parseInt(page),
    pageSize: parseInt(pageSize),
  }
}

/**
 * 快捷记录函数 - 用户操作
 */
export function logUserAction(userId, action, details, ip) {
  return logAudit({ userId, action, targetType: 'user', targetId: userId, details, ip })
}

/**
 * 快捷记录函数 - 订单操作
 */
export function logOrderAction(userId, action, orderId, details, ip) {
  return logAudit({ userId, action, targetType: 'order', targetId: orderId, details, ip })
}

/**
 * 快捷记录函数 - 发票操作
 */
export function logInvoiceAction(userId, action, invoiceId, details, ip) {
  return logAudit({ userId, action, targetType: 'invoice', targetId: invoiceId, details, ip })
}

/**
 * 快捷记录函数 - 支付操作
 */
export function logPaymentAction(userId, action, paymentId, details, ip) {
  return logAudit({ userId, action, targetType: 'payment', targetId: paymentId, details, ip })
}

export default {
  AuditActions,
  logAudit,
  queryAuditLogs,
  logUserAction,
  logOrderAction,
  logInvoiceAction,
  logPaymentAction,
}
