/**
 * API 输入验证中间件
 * 
 * ERP标准：确保所有输入数据的准确性和完整性
 */

/**
 * 通用验证结果
 */
function validationError(res, message, field = null) {
  return res.json({
    errCode: 400,
    msg: message,
    data: field ? { field } : null,
  })
}

/**
 * 验证字符串字段
 */
function isValidString(value, minLength = 1, maxLength = 255) {
  return typeof value === 'string' && value.trim().length >= minLength && value.length <= maxLength
}

/**
 * 验证数字字段
 */
function isValidNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const num = parseFloat(value)
  return !isNaN(num) && num >= min && num <= max
}

/**
 * 验证数组字段
 */
function isValidArray(value, minLength = 0) {
  return Array.isArray(value) && value.length >= minLength
}

/**
 * 验证日期格式 (YYYY-MM-DD)
 */
function isValidDate(value) {
  if (!value) return false
  const regex = /^\d{4}-\d{2}-\d{2}$/
  if (!regex.test(value)) return false
  const date = new Date(value)
  return !isNaN(date.getTime())
}

/**
 * 验证邮箱格式
 */
function isValidEmail(value) {
  if (!value) return true // 可选字段
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return regex.test(value)
}

/**
 * 验证手机号格式
 */
function isValidPhone(value) {
  if (!value) return true // 可选字段
  const regex = /^[\d\s\-+()]{6,20}$/
  return regex.test(value)
}

// ==================== 订单验证 ====================

/**
 * 验证创建订单请求
 */
export function validateOrderCreate(req, res, next) {
  const { customerId, customerName, items } = req.body

  // 必填字段验证
  if (!customerId || !isValidString(customerId)) {
    return validationError(res, '客户ID不能为空', 'customerId')
  }

  if (!customerName || !isValidString(customerName, 1, 255)) {
    return validationError(res, '客户名称不能为空', 'customerName')
  }

  if (!isValidArray(items, 1)) {
    return validationError(res, '订单商品不能为空', 'items')
  }

  // 验证每个商品项
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    
    if (!item.productId || !isValidString(item.productId)) {
      return validationError(res, `第${i + 1}个商品的产品ID无效`, `items[${i}].productId`)
    }
    
    if (!item.productName || !isValidString(item.productName, 1, 255)) {
      return validationError(res, `第${i + 1}个商品的产品名称无效`, `items[${i}].productName`)
    }
    
    if (!isValidNumber(item.quantity, 0.0001, 9999999)) {
      return validationError(res, `第${i + 1}个商品的数量无效`, `items[${i}].quantity`)
    }
    
    if (!isValidNumber(item.price, 0, 99999999)) {
      return validationError(res, `第${i + 1}个商品的单价无效`, `items[${i}].price`)
    }
  }

  next()
}

/**
 * 验证更新订单请求
 */
export function validateOrderUpdate(req, res, next) {
  const { customerName, items } = req.body

  if (customerName !== undefined && !isValidString(customerName, 1, 255)) {
    return validationError(res, '客户名称格式无效', 'customerName')
  }

  if (items !== undefined) {
    if (!isValidArray(items, 1)) {
      return validationError(res, '订单商品不能为空', 'items')
    }
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      
      if (!isValidNumber(item.quantity, 0.0001, 9999999)) {
        return validationError(res, `第${i + 1}个商品的数量无效`, `items[${i}].quantity`)
      }
      
      if (!isValidNumber(item.price, 0, 99999999)) {
        return validationError(res, `第${i + 1}个商品的单价无效`, `items[${i}].price`)
      }
    }
  }

  next()
}

/**
 * 验证订单状态变更
 */
export function validateOrderStatus(req, res, next) {
  const { status } = req.body
  const validStatuses = ['draft', 'pending', 'confirmed', 'processing', 'completed', 'cancelled']

  if (!status || !validStatuses.includes(status)) {
    return validationError(res, `无效的订单状态，有效值: ${validStatuses.join(', ')}`, 'status')
  }

  next()
}

// ==================== 发票验证 ====================

/**
 * 验证创建发票请求
 */
export function validateInvoiceCreate(req, res, next) {
  const { customerId, customerName, invoiceDate, dueDate, items } = req.body

  if (!customerId || !isValidString(customerId)) {
    return validationError(res, '客户ID不能为空', 'customerId')
  }

  if (!customerName || !isValidString(customerName, 1, 255)) {
    return validationError(res, '客户名称不能为空', 'customerName')
  }

  if (invoiceDate && !isValidDate(invoiceDate)) {
    return validationError(res, '发票日期格式无效', 'invoiceDate')
  }

  if (dueDate && !isValidDate(dueDate)) {
    return validationError(res, '到期日期格式无效', 'dueDate')
  }

  if (!isValidArray(items, 1)) {
    return validationError(res, '发票明细不能为空', 'items')
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    
    if (!item.description || !isValidString(item.description, 1, 500)) {
      return validationError(res, `第${i + 1}项描述无效`, `items[${i}].description`)
    }
    
    if (!isValidNumber(item.quantity, 0.0001, 9999999)) {
      return validationError(res, `第${i + 1}项数量无效`, `items[${i}].quantity`)
    }
    
    if (!isValidNumber(item.unitPrice, 0, 99999999)) {
      return validationError(res, `第${i + 1}项单价无效`, `items[${i}].unitPrice`)
    }
  }

  next()
}

/**
 * 验证收款登记请求
 */
export function validatePaymentCreate(req, res, next) {
  const { invoiceId, amount, paymentDate } = req.body

  if (!invoiceId || !isValidString(invoiceId)) {
    return validationError(res, '发票ID不能为空', 'invoiceId')
  }

  if (!isValidNumber(amount, 0.01, 99999999999)) {
    return validationError(res, '收款金额无效', 'amount')
  }

  if (paymentDate && !isValidDate(paymentDate)) {
    return validationError(res, '收款日期格式无效', 'paymentDate')
  }

  next()
}

// ==================== 用户验证 ====================

/**
 * 验证创建用户请求
 */
export function validateUserCreate(req, res, next) {
  const { username, password, name, email, phone, role } = req.body

  if (!username || !isValidString(username, 3, 50)) {
    return validationError(res, '用户名需要3-50个字符', 'username')
  }

  // 用户名只能包含字母、数字、下划线
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return validationError(res, '用户名只能包含字母、数字和下划线', 'username')
  }

  if (!password || !isValidString(password, 6, 100)) {
    return validationError(res, '密码需要6-100个字符', 'password')
  }

  if (!name || !isValidString(name, 1, 100)) {
    return validationError(res, '姓名不能为空', 'name')
  }

  if (!isValidEmail(email)) {
    return validationError(res, '邮箱格式无效', 'email')
  }

  if (!isValidPhone(phone)) {
    return validationError(res, '电话格式无效', 'phone')
  }

  if (!role || !isValidString(role, 1, 50)) {
    return validationError(res, '角色不能为空', 'role')
  }

  next()
}

// ==================== 客户验证 ====================

/**
 * 验证创建客户请求
 */
export function validateCustomerCreate(req, res, next) {
  const { code, name, contactPerson, phone, email, creditLimit, paymentTerms } = req.body

  if (!code || !isValidString(code, 1, 50)) {
    return validationError(res, '客户编码不能为空', 'code')
  }

  if (!name || !isValidString(name, 1, 255)) {
    return validationError(res, '客户名称不能为空', 'name')
  }

  if (!isValidEmail(email)) {
    return validationError(res, '邮箱格式无效', 'email')
  }

  if (!isValidPhone(phone)) {
    return validationError(res, '电话格式无效', 'phone')
  }

  if (creditLimit !== undefined && !isValidNumber(creditLimit, 0, 99999999999)) {
    return validationError(res, '信用额度无效', 'creditLimit')
  }

  if (paymentTerms !== undefined && !isValidNumber(paymentTerms, 0, 365)) {
    return validationError(res, '付款期限无效（0-365天）', 'paymentTerms')
  }

  next()
}

// ==================== 供应商验证 ====================

/**
 * 验证创建供应商请求
 */
export function validateSupplierCreate(req, res, next) {
  const { code, name, contactPerson, phone, email, paymentTerms } = req.body

  if (!code || !isValidString(code, 1, 50)) {
    return validationError(res, '供应商编码不能为空', 'code')
  }

  if (!name || !isValidString(name, 1, 255)) {
    return validationError(res, '供应商名称不能为空', 'name')
  }

  if (!isValidEmail(email)) {
    return validationError(res, '邮箱格式无效', 'email')
  }

  if (!isValidPhone(phone)) {
    return validationError(res, '电话格式无效', 'phone')
  }

  if (paymentTerms !== undefined && !isValidNumber(paymentTerms, 0, 365)) {
    return validationError(res, '付款期限无效（0-365天）', 'paymentTerms')
  }

  next()
}

export default {
  validateOrderCreate,
  validateOrderUpdate,
  validateOrderStatus,
  validateInvoiceCreate,
  validatePaymentCreate,
  validateUserCreate,
  validateCustomerCreate,
  validateSupplierCreate,
}
