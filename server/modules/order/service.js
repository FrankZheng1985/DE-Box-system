/**
 * 订单业务逻辑服务
 * 通过 ERP 内核引擎执行所有业务操作
 *
 * 这是 ERP 架构的关键：业务逻辑不直接操作数据库，
 * 而是通过凭证引擎、信用管理、变更追踪等内核引擎来执行。
 */

import { documentEngine, creditManager, changeTracker, documentFlow } from '../../core/index.js'
import orderModel, { ORDER_TRACKED_FIELDS } from './model.js'

// 篷布车订单状态机：定义允许的状态流转
const TRUCK_STATUS_FLOW = {
  'PENDING_REVIEW': ['CONFIRMED', 'CANCELLED'],
  'CONFIRMED': ['PENDING_ASSIGN'],
  'PENDING_ASSIGN': ['ASSIGNED'],
  'ASSIGNED': ['IN_TRANSIT', 'PENDING_ASSIGN', 'EXCEPTION'],  // 拒单回到待派单
  'IN_TRANSIT': ['DELIVERED', 'EXCEPTION'],
  'DELIVERED': ['COMPLETED'],
  'EXCEPTION': ['IN_TRANSIT', 'CANCELLED'],
  'COMPLETED': [],
  'CANCELLED': []
}

// 集装箱派送状态机
const CONTAINER_STATUS_FLOW = {
  'WAITING_ARRANGE': ['FLEET_CONFIRMED', 'EXCEPTION'],
  'FLEET_CONFIRMED': ['IN_TRANSIT', 'EXCEPTION'],
  'IN_TRANSIT': ['TRANSPORT_DONE', 'EXCEPTION'],
  'TRANSPORT_DONE': [],
  'EXCEPTION': ['WAITING_ARRANGE', 'FLEET_CONFIRMED', 'IN_TRANSIT']
}

export const orderService = {

  /**
   * 创建订单（核心流程，演示 ERP 内核的完整调用）
   */
  async createOrder(client, orderData, userId) {
    // 步骤 1：信用检查
    if (orderData.clientPrice > 0) {
      const creditResult = await creditManager.checkCredit(
        client, orderData.clientId, orderData.clientPrice, 'ORDER_CREATE'
      )
      if (creditResult.status === 'BLOCKED') {
        throw new Error(`信用检查未通过: ${creditResult.message}`)
      }
      // WARNING 状态允许通过，但会记录日志
    }

    // 步骤 2：通过凭证引擎创建凭证
    const companyCode = orderData.companyCode || 'DE01'
    const doc = await documentEngine.createDocument(client, {
      docType: 'ORD',
      companyCode,
      postingDate: new Date(),
      headerText: `运输订单 - ${orderData.businessType}`,
      sourceDocType: orderData.quotationDocId ? 'QUO' : null,
      sourceDocId: orderData.quotationDocId || null,
      createdBy: userId
    })

    // 步骤 3：写入订单业务数据
    const order = await orderModel.create(client, {
      ...orderData,
      documentId: doc.id,
      orderNumber: doc.docNumber,
      companyCode,
      businessArea: orderData.businessType === 'CONTAINER' ? 'CT' : 'CS',
      status: 'PENDING_REVIEW'
    })

    // 步骤 4：如果来源于报价，更新单据流
    if (orderData.quotationDocId) {
      await documentFlow.createFlowLink(client, {
        precedingDocType: 'QUO',
        precedingDocId: orderData.quotationDocId,
        subsequentDocType: 'ORD',
        subsequentDocId: doc.id,
        flowType: 'QUOTATION_TO_ORDER',
        amount: orderData.clientPrice,
        currency: orderData.currency || 'EUR'
      })
    }

    // 步骤 5：记录变更日志
    await changeTracker.trackChanges(client, {
      objectType: 'ORDER',
      objectId: order.id,
      changeType: 'INSERT',
      transactionType: 'CREATE_ORDER',
      tableName: 'orders',
      newData: order,
      trackedFields: ORDER_TRACKED_FIELDS,
      changedBy: userId
    })

    // 步骤 6：记录状态日志
    await orderModel.logStatusChange(client, order.id, null, 'PENDING_REVIEW', userId, '创建订单')

    // 步骤 7：更新客户信用敞口
    if (orderData.clientPrice > 0) {
      await creditManager.updateExposure(client, orderData.clientId)
    }

    return order
  },

  /**
   * 更新订单状态（篷布车）
   */
  async updateStatus(client, orderId, newStatus, userId, remarks) {
    const order = await orderModel.getById(client, orderId)
    if (!order) throw new Error('订单不存在')

    // 状态机校验
    const allowedNext = TRUCK_STATUS_FLOW[order.status]
    if (!allowedNext || !allowedNext.includes(newStatus)) {
      throw new Error(`状态流转不允许: ${order.status} → ${newStatus}`)
    }

    const oldData = { status: order.status }
    const newData = { status: newStatus }

    // 更新订单状态
    await orderModel.update(client, orderId, { status: newStatus })

    // 记录状态变更日志
    await orderModel.logStatusChange(client, orderId, order.status, newStatus, userId, remarks)

    // 变更追踪
    await changeTracker.trackChanges(client, {
      objectType: 'ORDER',
      objectId: orderId,
      changeType: 'STATUS_CHANGE',
      transactionType: `ORDER_${newStatus}`,
      tableName: 'orders',
      oldData,
      newData,
      trackedFields: [{ name: 'status', label: '订单状态' }],
      changedBy: userId,
      changeReason: remarks
    })

    return { orderId, oldStatus: order.status, newStatus }
  },

  /**
   * 更新集装箱派送状态
   */
  async updateDeliveryStatus(client, orderId, newStatus, userId, remarks) {
    const order = await orderModel.getById(client, orderId)
    if (!order) throw new Error('订单不存在')
    if (order.business_type !== 'CONTAINER') throw new Error('仅集装箱订单支持此操作')

    const currentStatus = order.delivery_status || 'WAITING_ARRANGE'
    const allowedNext = CONTAINER_STATUS_FLOW[currentStatus]
    if (!allowedNext || !allowedNext.includes(newStatus)) {
      throw new Error(`派送状态流转不允许: ${currentStatus} → ${newStatus}`)
    }

    await orderModel.update(client, orderId, { delivery_status: newStatus })
    await orderModel.logStatusChange(client, orderId, currentStatus, newStatus, userId, remarks)

    await changeTracker.trackChanges(client, {
      objectType: 'ORDER',
      objectId: orderId,
      changeType: 'STATUS_CHANGE',
      transactionType: `DELIVERY_${newStatus}`,
      tableName: 'orders',
      oldData: { delivery_status: currentStatus },
      newData: { delivery_status: newStatus },
      trackedFields: [{ name: 'delivery_status', label: '派送状态' }],
      changedBy: userId,
      changeReason: remarks
    })

    return { orderId, oldStatus: currentStatus, newStatus }
  },

  /**
   * 派单（指派承运商）
   */
  async assignCarrier(client, orderId, carrierId, carrierCost, userId) {
    const order = await orderModel.getById(client, orderId)
    if (!order) throw new Error('订单不存在')
    if (order.status !== 'PENDING_ASSIGN') throw new Error('当前状态不允许派单')

    const oldData = { carrier_id: order.carrier_id, carrier_cost: order.carrier_cost, status: order.status }

    await orderModel.update(client, orderId, {
      carrier_id: carrierId,
      carrier_cost: carrierCost,
      status: 'ASSIGNED'
    })

    await orderModel.logStatusChange(client, orderId, 'PENDING_ASSIGN', 'ASSIGNED', userId, `派单给承运商`)

    await changeTracker.trackChanges(client, {
      objectType: 'ORDER',
      objectId: orderId,
      changeType: 'UPDATE',
      transactionType: 'ASSIGN_CARRIER',
      tableName: 'orders',
      oldData,
      newData: { carrier_id: carrierId, carrier_cost: carrierCost, status: 'ASSIGNED' },
      trackedFields: [
        { name: 'carrier_id', label: '承运商' },
        { name: 'carrier_cost', label: '承运商成本' },
        { name: 'status', label: '订单状态' }
      ],
      changedBy: userId
    })

    return { orderId, carrierId, newStatus: 'ASSIGNED' }
  },

  /**
   * 承运商接单
   */
  async acceptOrder(client, orderId, userId) {
    return this.updateStatus(client, orderId, 'IN_TRANSIT', userId, '承运商确认接单')
  },

  /**
   * 承运商拒单
   */
  async rejectOrder(client, orderId, userId, reason) {
    return this.updateStatus(client, orderId, 'PENDING_ASSIGN', userId, `承运商拒单: ${reason}`)
  },

  /**
   * 取消订单
   */
  async cancelOrder(client, orderId, userId, reason) {
    const order = await orderModel.getById(client, orderId)
    if (!order) throw new Error('订单不存在')

    const cancelableStatuses = ['PENDING_REVIEW', 'CONFIRMED', 'PENDING_ASSIGN', 'EXCEPTION']
    if (!cancelableStatuses.includes(order.status)) {
      throw new Error(`当前状态 ${order.status} 不允许取消`)
    }

    await this.updateStatus(client, orderId, 'CANCELLED', userId, `取消原因: ${reason}`)

    // 取消后恢复信用额度
    if (order.client_price > 0) {
      await creditManager.updateExposure(client, order.client_id)
    }
  },

  /**
   * 编辑订单（仅允许编辑待审核/已确认状态的订单）
   */
  async editOrder(client, orderId, updateData, userId) {
    const order = await orderModel.getById(client, orderId)
    if (!order) throw new Error('订单不存在')

    const editableStatuses = ['PENDING_REVIEW', 'CONFIRMED']
    if (!editableStatuses.includes(order.status)) {
      throw new Error(`当前状态 ${order.status} 不允许编辑`)
    }

    // 记录旧数据用于变更追踪
    const oldData = {}
    const newData = {}
    const dbFields = {}

    // 映射前端字段到数据库字段
    const fieldMap = {
      cargoDescription: 'cargo_description',
      cargoWeightKg: 'cargo_weight_kg',
      cargoVolumeM3: 'cargo_volume_m3',
      cargoQuantity: 'cargo_quantity',
      pickupDate: 'pickup_date',
      deliveryDate: 'delivery_date',
      specialRequirements: 'special_requirements',
      remarks: 'remarks',
      clientPrice: 'client_price',
      shippingLine: 'shipping_line',
      containerNo: 'container_no',
      blNumber: 'bl_number',
      eta: 'eta',
      cnee: 'cnee'
    }

    for (const [camelKey, dbKey] of Object.entries(fieldMap)) {
      if (updateData[camelKey] !== undefined) {
        oldData[dbKey] = order[dbKey]
        newData[dbKey] = updateData[camelKey]
        dbFields[dbKey] = updateData[camelKey]
      }
    }

    if (Object.keys(dbFields).length === 0) {
      throw new Error('没有可更新的字段')
    }

    await orderModel.update(client, orderId, dbFields)

    await changeTracker.trackChanges(client, {
      objectType: 'ORDER',
      objectId: orderId,
      changeType: 'UPDATE',
      transactionType: 'EDIT_ORDER',
      tableName: 'orders',
      oldData,
      newData,
      trackedFields: ORDER_TRACKED_FIELDS,
      changedBy: userId
    })
  }
}

export default orderService
