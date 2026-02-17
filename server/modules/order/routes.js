/**
 * 订单管理模块路由
 * 
 * ERP标准优化：
 * - 事务处理确保数据一致性
 * - 输入验证增强数据准确性
 * - 审计日志记录关键操作
 */

import { Router } from 'express'
import { getDatabase, generateId, transaction } from '../../config/database.js'
import { authenticateToken, requirePermission } from '../../middleware/auth.js'
import { validateOrderCreate, validateOrderUpdate, validateOrderStatus } from '../../middleware/validators.js'
import { logAudit } from '../../middleware/auditLog.js'

const router = Router()

/**
 * 构建查询条件（安全的参数化查询构建器）
 */
function buildWhereClause(filters) {
  const conditions = ['1=1']
  const params = []
  
  if (filters.status) {
    params.push(filters.status)
    conditions.push(`o.status = $${params.length}`)
  }
  
  if (filters.search) {
    params.push(`%${filters.search}%`)
    conditions.push(`(o.order_no ILIKE $${params.length} OR o.customer_name ILIKE $${params.length})`)
  }
  
  if (filters.startDate) {
    params.push(filters.startDate)
    conditions.push(`o.create_time >= $${params.length}`)
  }
  
  if (filters.endDate) {
    params.push(filters.endDate)
    conditions.push(`o.create_time <= $${params.length}`)
  }
  
  if (filters.customerId) {
    params.push(filters.customerId)
    conditions.push(`o.customer_id = $${params.length}`)
  }
  
  // 业务类型筛选
  if (filters.businessType) {
    params.push(filters.businessType)
    conditions.push(`o.business_type = $${params.length}`)
  }
  
  // 放单状态筛选（旧字段，保留兼容）
  if (filters.releaseStatus) {
    params.push(filters.releaseStatus)
    conditions.push(`o.release_status = $${params.length}`)
  }
  
  // 船司放单状态筛选
  if (filters.carrierReleaseStatus) {
    params.push(filters.carrierReleaseStatus)
    conditions.push(`o.carrier_release_status = $${params.length}`)
  }
  
  // 清关状态筛选
  if (filters.customsClearanceStatus) {
    params.push(filters.customsClearanceStatus)
    conditions.push(`o.customs_clearance_status = $${params.length}`)
  }
  
  // 派送状态筛选
  if (filters.deliveryStatus) {
    params.push(filters.deliveryStatus)
    conditions.push(`o.delivery_status = $${params.length}`)
  }
  
  // 货物类型筛选
  if (filters.cargoType) {
    params.push(filters.cargoType)
    conditions.push(`o.cargo_type = $${params.length}`)
  }
  
  // 放单类型筛选
  if (filters.releaseType) {
    params.push(filters.releaseType)
    conditions.push(`o.release_type = $${params.length}`)
  }
  
  return { whereClause: conditions.join(' AND '), params }
}

/**
 * 构建排序子句
 */
function buildOrderClause(sortBy, sortOrder) {
  const validSortFields = {
    'createTime': 'o.create_time',
    'orderNo': 'o.order_no',
    'customerName': 'o.customer_name',
    'status': 'o.status',
    'carrierReleaseStatus': 'o.carrier_release_status',
    'customsClearanceStatus': 'o.customs_clearance_status',
    'deliveryStatus': 'o.delivery_status',
    'estimatedDeliveryTime': 'o.estimated_delivery_time'
  }
  
  const field = validSortFields[sortBy] || 'o.create_time'
  const order = sortOrder === 'asc' ? 'ASC' : 'DESC'
  
  return `${field} ${order}`
}

/**
 * 获取订单列表
 * GET /api/orders
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      pageSize = 20, 
      status, 
      search, 
      startDate, 
      endDate, 
      customerId, 
      businessType, 
      releaseStatus,
      carrierReleaseStatus,
      customsClearanceStatus,
      deliveryStatus,
      cargoType,
      releaseType,
      sortBy = 'createTime',
      sortOrder = 'desc'
    } = req.query
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    
    const db = getDatabase()
    const { whereClause, params } = buildWhereClause({ 
      status, search, startDate, endDate, customerId, businessType, releaseStatus,
      carrierReleaseStatus, customsClearanceStatus, deliveryStatus, cargoType, releaseType
    })
    const orderClause = buildOrderClause(sortBy, sortOrder)
    
    const countResult = await db.prepare(`
      SELECT COUNT(*) as total FROM orders o WHERE ${whereClause}
    `).get(...params)
    
    const list = await db.prepare(`
      SELECT o.id, o.order_no as "orderNo", o.customer_id as "customerId",
             o.customer_name as "customerName", o.status, o.total_amount as "totalAmount",
             o.currency, o.remark, o.operator_id as "operatorId",
             o.business_type as "businessType", o.release_status as "releaseStatus",
             -- 船司放单相关字段
             o.release_type as "releaseType",
             o.carrier_release_status as "carrierReleaseStatus",
             o.release_service_company_id as "releaseServiceCompanyId",
             o.release_mail_address as "releaseMailAddress",
             o.release_valid_until as "releaseValidUntil",
             o.release_confirmed_at as "releaseConfirmedAt",
             -- 清关放行相关字段
             o.customs_clearance_status as "customsClearanceStatus",
             o.customs_cleared_at as "customsClearedAt",
             -- 派送状态相关字段
             o.delivery_status as "deliveryStatus",
             o.delivery_service_provider_id as "deliveryServiceProviderId",
             o.estimated_delivery_time as "estimatedDeliveryTime",
             o.fleet_confirmed_at as "fleetConfirmedAt",
             o.pickup_at as "pickupAt",
             o.delivery_completed_at as "deliveryCompletedAt",
             o.delivery_abnormal_reason as "deliveryAbnormalReason",
             o.cmr_file_url as "cmrFileUrl",
             o.cmr_uploaded_at as "cmrUploadedAt",
             -- 货物类型和送仓地址
             o.cargo_type as "cargoType",
             o.warehouse_address as "warehouseAddress",
             -- 时间字段
             o.create_time as "createTime", o.update_time as "updateTime",
             -- 关联服务商信息
             rsc.name as "releaseServiceCompanyName",
             dsp.name as "deliveryServiceProviderName"
      FROM orders o
      LEFT JOIN release_service_companies rsc ON o.release_service_company_id = rsc.id
      LEFT JOIN delivery_service_providers dsp ON o.delivery_service_provider_id = dsp.id
      WHERE ${whereClause}
      ORDER BY ${orderClause}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `).all(...params, parseInt(pageSize), offset)
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: {
        list,
        total: parseInt(countResult.total),
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      },
    })
  } catch (error) {
    console.error('获取订单列表失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取订单列表失败',
      data: null,
    })
  }
})

/**
 * 获取订单详情
 * GET /api/orders/:id
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    const order = await db.prepare(`
      SELECT o.*, c.name as "customerName", c.phone as "customerPhone"
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ?
    `).get(id)
    
    if (!order) {
      return res.status(404).json({
        errCode: 404,
        msg: '订单不存在',
        data: null,
      })
    }
    
    // 获取订单商品
    const items = await db.prepare(`
      SELECT * FROM order_items WHERE order_id = ?
    `).all(id)
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: {
        ...order,
        items,
      },
    })
  } catch (error) {
    console.error('获取订单详情失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取订单详情失败',
      data: null,
    })
  }
})

/**
 * 创建订单
 * POST /api/orders
 * 
 * ERP标准：使用事务确保订单主表和明细表的数据一致性
 */
router.post('/', authenticateToken, requirePermission('bill:create'), validateOrderCreate, async (req, res) => {
  try {
    const { 
      customerId, 
      customerName, 
      items = [], 
      remark, 
      currency = 'EUR', 
      businessType = 'both', 
      releaseStatus,
      // 新增字段
      releaseType = 'not_required',
      cargoType = 'general',
      warehouseAddress
    } = req.body
    
    const db = getDatabase()
    const id = generateId('order')
    const orderNo = 'ORD' + Date.now()
    
    // 计算总金额
    const totalAmount = items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0
      const price = parseFloat(item.price) || 0
      return sum + (qty * price)
    }, 0)
    
    // 根据业务类型设置默认放单状态（旧字段，保留兼容）
    const finalReleaseStatus = releaseStatus || (businessType === 'transport' ? 'not_required' : 'pending')
    
    // 根据放单类型设置船司放单状态
    let carrierReleaseStatus = 'not_required'
    if (businessType !== 'transport' && releaseType !== 'not_required') {
      if (releaseType === 'original') {
        carrierReleaseStatus = 'pending_mail'  // 正本需要邮寄
      } else {
        carrierReleaseStatus = 'pending_release'  // 电放和Seaway直接待放行
      }
    }
    
    // 使用事务确保数据一致性
    const createOrderTx = db.transaction(async function() {
      // 插入订单主表
      await this.prepare(`
        INSERT INTO orders (
          id, order_no, customer_id, customer_name, status, total_amount, 
          currency, remark, operator_id, business_type, release_status,
          release_type, carrier_release_status, cargo_type, warehouse_address,
          customs_clearance_status, delivery_status,
          create_time, update_time
        )
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'waiting', NOW(), NOW())
      `).run(
        id, orderNo, customerId, customerName, totalAmount, currency, 
        remark || null, req.user.id, businessType, finalReleaseStatus,
        releaseType, carrierReleaseStatus, cargoType, warehouseAddress || null
      )
      
      // 插入订单明细
      for (const item of items) {
        const qty = parseFloat(item.quantity) || 0
        const price = parseFloat(item.price) || 0
        await this.prepare(`
          INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price, amount)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(generateId('item'), id, item.productId, item.productName, qty, price, qty * price)
      }
      
      return { id, orderNo, totalAmount }
    })
    
    const result = await createOrderTx()
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'ORDER_CREATE',
      targetType: 'order',
      targetId: id,
      details: { orderNo, customerId, totalAmount, itemCount: items.length, releaseType, cargoType },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '创建成功',
      data: result,
    })
  } catch (error) {
    console.error('创建订单失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '创建订单失败: ' + error.message,
      data: null,
    })
  }
})

/**
 * 更新订单状态
 * PUT /api/orders/:id/status
 * 
 * ERP标准：状态流转验证，防止非法状态变更
 */
router.put('/:id/status', authenticateToken, requirePermission('bill:edit'), validateOrderStatus, async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    
    const db = getDatabase()
    
    // 获取当前订单状态
    const order = await db.prepare(`SELECT id, order_no, status FROM orders WHERE id = ?`).get(id)
    
    if (!order) {
      return res.status(404).json({
        errCode: 404,
        msg: '订单不存在',
        data: null,
      })
    }
    
    // ERP标准：验证状态流转合法性
    const validTransitions = {
      'draft': ['pending', 'cancelled'],
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['processing', 'cancelled'],
      'processing': ['completed', 'cancelled'],
      'completed': [],
      'cancelled': []
    }
    
    const allowedNextStatus = validTransitions[order.status] || []
    if (!allowedNextStatus.includes(status)) {
      return res.json({
        errCode: 400,
        msg: `不能将订单状态从 "${order.status}" 变更为 "${status}"`,
        data: null,
      })
    }
    
    const oldStatus = order.status
    await db.prepare(`
      UPDATE orders SET status = ?, update_time = NOW() WHERE id = ?
    `).run(status, id)
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'ORDER_STATUS_CHANGE',
      targetType: 'order',
      targetId: id,
      details: { orderNo: order.order_no, oldStatus, newStatus: status },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '更新成功',
      data: null,
    })
  } catch (error) {
    console.error('更新订单状态失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '更新订单状态失败',
      data: null,
    })
  }
})

/**
 * 删除订单
 * DELETE /api/orders/:id
 * 
 * ERP标准：
 * - 仅允许删除草稿状态且无关联业务数据的订单
 * - 如果订单有关联的发票或运输单，禁止删除
 * - 非草稿状态的订单只能"作废"，不能删除
 */
router.delete('/:id', authenticateToken, requirePermission('bill:delete'), async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    // 检查订单是否存在及状态
    const order = await db.prepare(`SELECT id, order_no, status FROM orders WHERE id = ?`).get(id)
    
    if (!order) {
      return res.status(404).json({
        errCode: 404,
        msg: '订单不存在',
        data: null,
      })
    }
    
    // ERP标准：只允许删除草稿状态的订单
    if (order.status !== 'draft') {
      return res.json({
        errCode: 400,
        msg: '只能删除草稿状态的订单，其他状态请使用"作废"功能',
        data: null,
      })
    }
    
    // 检查是否有关联的运输单
    const hasShipment = await db.prepare(`
      SELECT 1 FROM tms_shipments WHERE order_id = ? LIMIT 1
    `).get(id)
    
    if (hasShipment) {
      return res.json({
        errCode: 400,
        msg: '该订单已关联运输单，无法删除',
        data: null,
      })
    }
    
    // 使用事务确保级联删除一致性
    const deleteOrderTx = db.transaction(async function() {
      await this.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(id)
      await this.prepare(`DELETE FROM orders WHERE id = ?`).run(id)
    })
    
    await deleteOrderTx()
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'ORDER_DELETE',
      targetType: 'order',
      targetId: id,
      details: { orderNo: order.order_no, status: order.status },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '删除成功',
      data: null,
    })
  } catch (error) {
    console.error('删除订单失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '删除订单失败',
      data: null,
    })
  }
})

/**
 * 作废订单
 * POST /api/orders/:id/void
 * 
 * ERP标准：
 * - 非草稿状态的订单不能删除，只能作废
 * - 作废需要填写原因
 * - 已完成的订单作废需要特殊权限
 */
router.post('/:id/void', authenticateToken, requirePermission('bill:delete'), async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body
    
    if (!reason || reason.trim().length < 2) {
      return res.json({
        errCode: 400,
        msg: '请填写作废原因（至少2个字符）',
        data: null,
      })
    }
    
    const db = getDatabase()
    
    // 检查订单是否存在及状态
    const order = await db.prepare(`SELECT id, order_no, status, void_time FROM orders WHERE id = ?`).get(id)
    
    if (!order) {
      return res.status(404).json({
        errCode: 404,
        msg: '订单不存在',
        data: null,
      })
    }
    
    // 已作废的订单不能再次作废
    if (order.void_time) {
      return res.json({
        errCode: 400,
        msg: '该订单已作废',
        data: null,
      })
    }
    
    // 草稿状态直接取消即可
    if (order.status === 'draft') {
      return res.json({
        errCode: 400,
        msg: '草稿状态的订单请直接删除，无需作废',
        data: null,
      })
    }
    
    // 检查是否有未完成的运输单
    const pendingShipment = await db.prepare(`
      SELECT 1 FROM tms_shipments WHERE order_id = ? AND status NOT IN ('completed', 'cancelled') LIMIT 1
    `).get(id)
    
    if (pendingShipment) {
      return res.json({
        errCode: 400,
        msg: '该订单存在进行中的运输单，请先处理运输单后再作废订单',
        data: null,
      })
    }
    
    // 执行作废
    await db.prepare(`
      UPDATE orders 
      SET status = 'void', void_time = NOW(), void_reason = ?, void_by = ?, update_time = NOW()
      WHERE id = ?
    `).run(reason.trim(), req.user.id, id)
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'ORDER_VOID',
      targetType: 'order',
      targetId: id,
      details: { orderNo: order.order_no, previousStatus: order.status, reason: reason.trim() },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '订单已作废',
      data: null,
    })
  } catch (error) {
    console.error('作废订单失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '作废订单失败',
      data: null,
    })
  }
})

/**
 * 更新船司放单状态
 * PUT /api/orders/:id/carrier-release
 */
router.put('/:id/carrier-release', authenticateToken, requirePermission('bill:edit'), async (req, res) => {
  try {
    const { id } = req.params
    const { 
      status, 
      releaseServiceCompanyId, 
      releaseMailAddress, 
      releaseValidUntil 
    } = req.body
    
    const db = getDatabase()
    
    // 获取当前订单
    const order = await db.prepare(`SELECT id, order_no, release_type, carrier_release_status FROM orders WHERE id = ?`).get(id)
    
    if (!order) {
      return res.status(404).json({ errCode: 404, msg: '订单不存在', data: null })
    }
    
    // 验证状态流转
    const validTransitions = {
      'not_required': [],
      'pending_mail': ['mailed'],
      'mailed': ['pending_release'],
      'pending_release': ['released'],
      'released': []
    }
    
    const currentStatus = order.carrier_release_status || 'not_required'
    const allowedStatus = validTransitions[currentStatus] || []
    
    if (!allowedStatus.includes(status)) {
      return res.json({ errCode: 400, msg: `不能将船司放单状态从 "${currentStatus}" 变更为 "${status}"`, data: null })
    }
    
    // 构建更新语句
    let updateFields = ['carrier_release_status = ?', 'update_time = NOW()']
    let updateParams = [status]
    
    if (status === 'mailed') {
      if (!releaseServiceCompanyId || !releaseMailAddress) {
        return res.json({ errCode: 400, msg: '邮寄正本需要选择服务公司和填写邮寄地址', data: null })
      }
      updateFields.push('release_service_company_id = ?', 'release_mail_address = ?')
      updateParams.push(releaseServiceCompanyId, releaseMailAddress)
    }
    
    if (status === 'released') {
      updateFields.push('release_confirmed_at = NOW()', 'release_confirmed_by = ?')
      updateParams.push(req.user.id)
      if (releaseValidUntil) {
        updateFields.push('release_valid_until = ?')
        updateParams.push(releaseValidUntil)
      }
    }
    
    updateParams.push(id)
    
    await db.prepare(`
      UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?
    `).run(...updateParams)
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'ORDER_CARRIER_RELEASE_UPDATE',
      targetType: 'order',
      targetId: id,
      details: { orderNo: order.order_no, oldStatus: currentStatus, newStatus: status },
      ip: req.ip
    })
    
    res.json({ errCode: 200, msg: '船司放单状态更新成功', data: null })
  } catch (error) {
    console.error('更新船司放单状态失败:', error)
    res.status(500).json({ errCode: 500, msg: '更新船司放单状态失败', data: null })
  }
})

/**
 * 更新清关状态
 * PUT /api/orders/:id/customs-clearance
 * 客户可调用此接口确认清关完成
 */
router.put('/:id/customs-clearance', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    
    const db = getDatabase()
    
    const order = await db.prepare(`SELECT id, order_no, customs_clearance_status FROM orders WHERE id = ?`).get(id)
    
    if (!order) {
      return res.status(404).json({ errCode: 404, msg: '订单不存在', data: null })
    }
    
    if (status !== 'cleared') {
      return res.json({ errCode: 400, msg: '无效的清关状态', data: null })
    }
    
    if (order.customs_clearance_status === 'cleared') {
      return res.json({ errCode: 400, msg: '该订单已完成清关', data: null })
    }
    
    await db.prepare(`
      UPDATE orders 
      SET customs_clearance_status = 'cleared', customs_cleared_at = NOW(), customs_cleared_by = ?, update_time = NOW()
      WHERE id = ?
    `).run(req.user.id, id)
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'ORDER_CUSTOMS_CLEARANCE',
      targetType: 'order',
      targetId: id,
      details: { orderNo: order.order_no, status: 'cleared' },
      ip: req.ip
    })
    
    res.json({ errCode: 200, msg: '清关状态更新成功', data: null })
  } catch (error) {
    console.error('更新清关状态失败:', error)
    res.status(500).json({ errCode: 500, msg: '更新清关状态失败', data: null })
  }
})

/**
 * 更新派送状态
 * PUT /api/orders/:id/delivery-status
 */
router.put('/:id/delivery-status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { 
      status, 
      deliveryServiceProviderId,
      estimatedDeliveryTime,
      abnormalReason 
    } = req.body
    
    const db = getDatabase()
    
    const order = await db.prepare(`SELECT id, order_no, delivery_status FROM orders WHERE id = ?`).get(id)
    
    if (!order) {
      return res.status(404).json({ errCode: 404, msg: '订单不存在', data: null })
    }
    
    // 验证状态流转
    const validTransitions = {
      'waiting': ['fleet_confirmed'],
      'fleet_confirmed': ['in_transit'],
      'in_transit': ['completed', 'abnormal'],
      'abnormal': ['completed'],
      'completed': ['cmr_received'],
      'cmr_received': []
    }
    
    const currentStatus = order.delivery_status || 'waiting'
    const allowedStatus = validTransitions[currentStatus] || []
    
    if (!allowedStatus.includes(status)) {
      return res.json({ errCode: 400, msg: `不能将派送状态从 "${currentStatus}" 变更为 "${status}"`, data: null })
    }
    
    // 构建更新语句
    let updateFields = ['delivery_status = ?', 'update_time = NOW()']
    let updateParams = [status]
    
    if (status === 'fleet_confirmed') {
      if (!deliveryServiceProviderId || !estimatedDeliveryTime) {
        return res.json({ errCode: 400, msg: '需要选择运输服务商和填写预计送仓时间', data: null })
      }
      updateFields.push('delivery_service_provider_id = ?', 'estimated_delivery_time = ?', 'fleet_confirmed_at = NOW()')
      updateParams.push(deliveryServiceProviderId, estimatedDeliveryTime)
    }
    
    if (status === 'in_transit') {
      updateFields.push('pickup_at = NOW()')
    }
    
    if (status === 'completed') {
      updateFields.push('delivery_completed_at = NOW()', 'delivery_completed_by = ?')
      updateParams.push(req.user.id)
    }
    
    if (status === 'abnormal') {
      if (!abnormalReason) {
        return res.json({ errCode: 400, msg: '请填写异常原因', data: null })
      }
      updateFields.push('delivery_abnormal_reason = ?')
      updateParams.push(abnormalReason)
    }
    
    updateParams.push(id)
    
    await db.prepare(`
      UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?
    `).run(...updateParams)
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'ORDER_DELIVERY_STATUS_UPDATE',
      targetType: 'order',
      targetId: id,
      details: { orderNo: order.order_no, oldStatus: currentStatus, newStatus: status },
      ip: req.ip
    })
    
    res.json({ errCode: 200, msg: '派送状态更新成功', data: null })
  } catch (error) {
    console.error('更新派送状态失败:', error)
    res.status(500).json({ errCode: 500, msg: '更新派送状态失败', data: null })
  }
})

/**
 * 上传CMR文件
 * POST /api/orders/:id/upload-cmr
 */
router.post('/:id/upload-cmr', authenticateToken, requirePermission('bill:edit'), async (req, res) => {
  try {
    const { id } = req.params
    const { cmrFileUrl } = req.body
    
    if (!cmrFileUrl) {
      return res.json({ errCode: 400, msg: '请提供CMR文件URL', data: null })
    }
    
    const db = getDatabase()
    
    const order = await db.prepare(`SELECT id, order_no, delivery_status FROM orders WHERE id = ?`).get(id)
    
    if (!order) {
      return res.status(404).json({ errCode: 404, msg: '订单不存在', data: null })
    }
    
    if (order.delivery_status !== 'completed') {
      return res.json({ errCode: 400, msg: '只有完成状态的订单才能上传CMR', data: null })
    }
    
    await db.prepare(`
      UPDATE orders 
      SET cmr_file_url = ?, cmr_uploaded_at = NOW(), delivery_status = 'cmr_received', update_time = NOW()
      WHERE id = ?
    `).run(cmrFileUrl, id)
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'ORDER_CMR_UPLOAD',
      targetType: 'order',
      targetId: id,
      details: { orderNo: order.order_no, cmrFileUrl },
      ip: req.ip
    })
    
    res.json({ errCode: 200, msg: 'CMR上传成功', data: null })
  } catch (error) {
    console.error('上传CMR失败:', error)
    res.status(500).json({ errCode: 500, msg: '上传CMR失败', data: null })
  }
})

// ==================== 放单服务公司管理 ====================

/**
 * 获取放单服务公司列表
 * GET /api/release-service-companies
 */
router.get('/release-service-companies', authenticateToken, async (req, res) => {
  try {
    const { status = 'active' } = req.query
    const db = getDatabase()
    
    let sql = `SELECT * FROM release_service_companies`
    const params = []
    
    if (status) {
      sql += ` WHERE status = ?`
      params.push(status)
    }
    
    sql += ` ORDER BY name ASC`
    
    const list = await db.prepare(sql).all(...params)
    
    res.json({ errCode: 200, msg: '获取成功', data: list })
  } catch (error) {
    console.error('获取放单服务公司列表失败:', error)
    res.status(500).json({ errCode: 500, msg: '获取失败', data: null })
  }
})

/**
 * 创建放单服务公司
 * POST /api/release-service-companies
 */
router.post('/release-service-companies', authenticateToken, requirePermission('basic:create'), async (req, res) => {
  try {
    const { code, name, address, contactPerson, phone, email, remark } = req.body
    
    if (!code || !name) {
      return res.json({ errCode: 400, msg: '编码和名称不能为空', data: null })
    }
    
    const db = getDatabase()
    const id = generateId('rsc')
    
    await db.prepare(`
      INSERT INTO release_service_companies (id, code, name, address, contact_person, phone, email, remark, status, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
    `).run(id, code, name, address || null, contactPerson || null, phone || null, email || null, remark || null)
    
    res.json({ errCode: 200, msg: '创建成功', data: { id } })
  } catch (error) {
    console.error('创建放单服务公司失败:', error)
    if (error.message.includes('UNIQUE constraint')) {
      return res.json({ errCode: 400, msg: '编码已存在', data: null })
    }
    res.status(500).json({ errCode: 500, msg: '创建失败', data: null })
  }
})

// ==================== 运输服务商管理 ====================

/**
 * 获取运输服务商列表
 * GET /api/delivery-service-providers
 */
router.get('/delivery-service-providers', authenticateToken, async (req, res) => {
  try {
    const { status = 'active' } = req.query
    const db = getDatabase()
    
    let sql = `SELECT * FROM delivery_service_providers`
    const params = []
    
    if (status) {
      sql += ` WHERE status = ?`
      params.push(status)
    }
    
    sql += ` ORDER BY name ASC`
    
    const list = await db.prepare(sql).all(...params)
    
    res.json({ errCode: 200, msg: '获取成功', data: list })
  } catch (error) {
    console.error('获取运输服务商列表失败:', error)
    res.status(500).json({ errCode: 500, msg: '获取失败', data: null })
  }
})

/**
 * 创建运输服务商
 * POST /api/delivery-service-providers
 */
router.post('/delivery-service-providers', authenticateToken, requirePermission('basic:create'), async (req, res) => {
  try {
    const { code, name, serviceArea, address, contactPerson, phone, email, remark } = req.body
    
    if (!code || !name) {
      return res.json({ errCode: 400, msg: '编码和名称不能为空', data: null })
    }
    
    const db = getDatabase()
    const id = generateId('dsp')
    
    await db.prepare(`
      INSERT INTO delivery_service_providers (id, code, name, service_area, address, contact_person, phone, email, remark, status, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
    `).run(id, code, name, serviceArea || null, address || null, contactPerson || null, phone || null, email || null, remark || null)
    
    res.json({ errCode: 200, msg: '创建成功', data: { id } })
  } catch (error) {
    console.error('创建运输服务商失败:', error)
    if (error.message.includes('UNIQUE constraint')) {
      return res.json({ errCode: 400, msg: '编码已存在', data: null })
    }
    res.status(500).json({ errCode: 500, msg: '创建失败', data: null })
  }
})

export default router
