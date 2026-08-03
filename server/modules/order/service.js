/**
 * 订单业务逻辑服务
 * 通过 ERP 内核引擎执行所有业务操作
 *
 * 这是 ERP 架构的关键：业务逻辑不直接操作数据库，
 * 而是通过凭证引擎、信用管理、变更追踪等内核引擎来执行。
 */

import { documentEngine, creditManager, changeTracker, documentFlow, accountDetermination, notificationEngine, NOTIFICATION_TYPES } from '../../core/index.js'
import { getPool } from '../../core/db.js'
import orderModel, { ORDER_TRACKED_FIELDS } from './model.js'

/** 信用预警通知发给这些内部角色（P7：刻意不发客户） */
const CREDIT_ALERT_ROLES = ['finance', 'op_manager', 'sys_admin']

/**
 * 客户信用超额预警通知（P7 需求 6）
 *
 * ⚠️ 必须用独立连接（getPool），不能用 createOrder 的事务 client：
 *    BLOCKED 的时候 createOrder 会抛错让整个事务回滚，
 *    通知要是写在事务里就跟着一起没了 —— 而这正是最该报出来的一种。
 *
 * 通知发送失败不影响下单主流程，出错只记日志。
 *
 * @param {string} clientId - 客户 ID
 * @param {object} creditResult - creditManager.checkCredit 的返回值
 */
async function notifyCreditAlert(clientId, creditResult) {
  try {
    const pool = getPool()
    const clientRow = await pool.query(
      `SELECT company_name FROM clients WHERE id = $1`, [clientId]
    )
    const companyName = clientRow.rows[0]?.company_name || '未知客户'

    const userIds = await notificationEngine.getUserIdsByRoles(pool, CREDIT_ALERT_ROLES)
    if (userIds.length === 0) {
      console.warn('[信用预警] 没有找到财务/经理/管理员账号，预警未发出')
      return
    }

    const isBlocked = creditResult.status === 'BLOCKED'
    await notificationEngine.notify(pool, {
      userIds,
      type: NOTIFICATION_TYPES.CREDIT_ALERT,
      title: isBlocked
        ? `信用超额拦截：${companyName}`
        : `信用预警：${companyName}`,
      titleKey: isBlocked ? 'notify.creditBlockedTitle' : 'notify.creditWarningTitle',
      messageKey: 'notify.creditMessage',
      payload: { client: companyName, detail: creditResult.message },
      message: `${creditResult.message}\n\n处理入口：客户管理 → ${companyName} → 信用风控`,
      channel: 'AUTO'
    })
  } catch (error) {
    console.error('[信用预警] 通知发送失败:', error)
  }
}

/**
 * 服务类型（需求 1 三分类，2026-08-01 由 CURTAIN_SIDE/CONTAINER 改造而来）
 *   TRUCK_LTL      卡车派送 LTL —— 原篷布车运输
 *   TRUCK_FTL      卡车运输 FTL —— 原集装箱物流（带集装箱派送子状态）
 *   LOCAL_DELIVERY 本地派送     —— 全新业务，走简化流程
 */
export const BUSINESS_TYPES = {
  TRUCK_LTL: 'TRUCK_LTL',
  TRUCK_FTL: 'TRUCK_FTL',
  LOCAL_DELIVERY: 'LOCAL_DELIVERY'
}

// 卡车运输主状态机（LTL 和 FTL 共用）
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

/**
 * 本地派送状态机（简化流：待报价 → 待派送 → 派送中 → 已签收）
 *
 * 两个刻意的复用，不要改成新枚举值：
 *   - 派送中直接用 IN_TRANSIT，和卡车运输同义，列表筛选/统计不用加分支
 *   - 已签收直接用 COMPLETED，这样"订单完成自动开票"照常触发；
 *     如果另起一个 SIGNED 状态，本地派送的单子永远不会开票
 *   前端按业务类型显示不同文案（IN_TRANSIT → "派送中"，COMPLETED → "已签收"）
 */
const LOCAL_DELIVERY_STATUS_FLOW = {
  'PENDING_QUOTE': ['PENDING_DISPATCH', 'CANCELLED'],
  'PENDING_DISPATCH': ['IN_TRANSIT', 'CANCELLED'],
  'IN_TRANSIT': ['COMPLETED', 'EXCEPTION'],
  'EXCEPTION': ['IN_TRANSIT', 'CANCELLED'],
  'COMPLETED': [],
  'CANCELLED': []
}

// 集装箱派送子状态机（仅 TRUCK_FTL 使用，走 orders.delivery_status）
const CONTAINER_STATUS_FLOW = {
  'WAITING_ARRANGE': ['FLEET_CONFIRMED', 'EXCEPTION'],
  'FLEET_CONFIRMED': ['IN_TRANSIT', 'EXCEPTION'],
  'IN_TRANSIT': ['TRANSPORT_DONE', 'EXCEPTION'],
  'TRANSPORT_DONE': [],
  'EXCEPTION': ['WAITING_ARRANGE', 'FLEET_CONFIRMED', 'IN_TRANSIT']
}

// 按业务类型选主状态机
function getStatusFlow(businessType) {
  return businessType === BUSINESS_TYPES.LOCAL_DELIVERY
    ? LOCAL_DELIVERY_STATUS_FLOW
    : TRUCK_STATUS_FLOW
}

// 按业务类型定新建订单的初始状态
function getInitialStatus(businessType) {
  return businessType === BUSINESS_TYPES.LOCAL_DELIVERY ? 'PENDING_QUOTE' : 'PENDING_REVIEW'
}

// 业务范围（business_areas 表的外键，迁移 105 已补 LD）
const BUSINESS_AREA_MAP = {
  TRUCK_LTL: 'CS',
  TRUCK_FTL: 'CT',
  LOCAL_DELIVERY: 'LD'
}

/** 服务类型中文名（Excel 导出、通知文案统一从这里取） */
export const BUSINESS_TYPE_LABELS = {
  TRUCK_LTL: '卡车派送 LTL',
  TRUCK_FTL: '卡车运输 FTL',
  LOCAL_DELIVERY: '本地派送'
}

// 卡车运输的状态中文名
const TRUCK_STATUS_LABELS = {
  PENDING_REVIEW: '待审核', CONFIRMED: '已确认', PENDING_ASSIGN: '待派单',
  ASSIGNED: '已派单', IN_TRANSIT: '运输中', DELIVERED: '已送达',
  COMPLETED: '已完成', CANCELLED: '已取消', EXCEPTION: '异常'
}

// 本地派送复用了 IN_TRANSIT / COMPLETED，但叫法不同，要单独一套文案
const LOCAL_DELIVERY_STATUS_LABELS = {
  PENDING_QUOTE: '待报价', PENDING_DISPATCH: '待派送',
  IN_TRANSIT: '派送中', COMPLETED: '已签收',
  CANCELLED: '已取消', EXCEPTION: '异常'
}

/**
 * 取状态中文名
 * @param {string} businessType - 业务类型
 * @param {string} status - 状态值
 * @returns {string} 中文名，取不到时原样返回状态值
 */
export function getStatusLabel(businessType, status) {
  const labels = businessType === BUSINESS_TYPES.LOCAL_DELIVERY
    ? LOCAL_DELIVERY_STATUS_LABELS
    : TRUCK_STATUS_LABELS
  return labels[status] || status
}

export const orderService = {

  /**
   * 创建订单（核心流程，演示 ERP 内核的完整调用）
   */
  async createOrder(client, orderData, userId) {
    // 步骤 0：业务类型校验，防止旧值（CURTAIN_SIDE/CONTAINER）或非法值再进库
    if (!Object.values(BUSINESS_TYPES).includes(orderData.businessType)) {
      throw new Error(`无效的业务类型: ${orderData.businessType}，允许值: ${Object.values(BUSINESS_TYPES).join(' / ')}`)
    }

    // 步骤 1：信用检查
    if (orderData.clientPrice > 0) {
      const creditResult = await creditManager.checkCredit(
        client, orderData.clientId, orderData.clientPrice, 'ORDER_CREATE'
      )
      // WARNING / BLOCKED 都推一条内部预警（不发客户），发送走独立连接不受回滚影响
      if (creditResult.status !== 'PASSED') {
        await notifyCreditAlert(orderData.clientId, creditResult)
      }
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
    const initialStatus = getInitialStatus(orderData.businessType)
    const order = await orderModel.create(client, {
      ...orderData,
      documentId: doc.id,
      orderNumber: doc.docNumber,
      companyCode,
      businessArea: BUSINESS_AREA_MAP[orderData.businessType] || 'CS',
      status: initialStatus
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
    await orderModel.logStatusChange(client, order.id, null, initialStatus, userId, '创建订单')

    // 步骤 7：更新客户信用敞口
    if (orderData.clientPrice > 0) {
      await creditManager.updateExposure(client, orderData.clientId)
    }

    // 步骤 8：FTL（原集装箱）订单自动创建清关记录和船司放单记录
    //         LTL 和本地派送不涉及清关/放单
    if (orderData.businessType === BUSINESS_TYPES.TRUCK_FTL) {
      try {
        // 需要清关 → 自动创建清关记录
        if (orderData.needsClearance) {
          await client.query(
            `INSERT INTO customs_clearances (order_id, status) VALUES ($1, 'PENDING')
             ON CONFLICT (order_id) DO NOTHING`,
            [order.id]
          )
        }
        // 需要放单 → 自动创建放单记录
        if (orderData.needsRelease || orderData.releaseMethod) {
          const releaseStatus = orderData.releaseMethod === 'TELEX' ? 'PENDING_RELEASE' : 'ORIGINAL_PENDING'
          await client.query(
            `INSERT INTO shipping_releases (order_id, release_status) VALUES ($1, $2)
             ON CONFLICT (order_id) DO NOTHING`,
            [order.id, releaseStatus]
          )
        }
      } catch (autoErr) {
        console.warn('自动创建清关/放单记录失败（不影响主流程）:', autoErr.message)
      }
    }

    // 步骤 9：通知所有操作员有新订单
    try {
      const operators = await client.query(
        `SELECT id FROM users WHERE user_type = 'OPERATOR' AND is_active = true`
      )
      if (operators.rows.length > 0) {
        await notificationEngine.notify(client, {
          userIds: operators.rows.map(u => u.id),
          type: NOTIFICATION_TYPES.STATUS_UPDATE,
          title: `新订单 ${doc.docNumber}`,
          message: `新订单 ${doc.docNumber} 已创建，请及时审核`,
          titleKey: 'notify.newOrderTitle',
          messageKey: 'notify.newOrderMessage',
          payload: { orderNo: doc.docNumber },
          relatedOrderId: order.id
        })
      }
    } catch (notifyErr) {
      console.warn('创建订单通知发送失败（不影响主流程）:', notifyErr.message)
    }

    return order
  },

  /**
   * 更新订单主状态
   * 卡车运输（LTL/FTL）走 TRUCK_STATUS_FLOW，本地派送走简化流
   */
  async updateStatus(client, orderId, newStatus, userId, remarks) {
    const order = await orderModel.getById(client, orderId)
    if (!order) throw new Error('订单不存在')

    // 状态机校验：按业务类型选对应的流转规则
    const statusFlow = getStatusFlow(order.business_type)
    const allowedNext = statusFlow[order.status]
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

    // 状态变更通知
    try {
      if (newStatus === 'CONFIRMED' && order.client_id) {
        // 订单确认 -> 通知客户
        const users = await client.query(
          `SELECT id FROM users WHERE linked_entity_id = $1 AND user_type = 'CLIENT' AND is_active = true`,
          [order.client_id]
        )
        if (users.rows.length > 0) {
          await notificationEngine.notify(client, {
            userIds: users.rows.map(u => u.id),
            type: NOTIFICATION_TYPES.ORDER_CONFIRMED,
            title: `订单 ${order.order_number} 已确认`,
            message: `您的订单 ${order.order_number} 已通过审核`,
            titleKey: 'notify.orderConfirmedTitle',
            messageKey: 'notify.orderConfirmedMessage',
            payload: { orderNo: order.order_number },
            relatedOrderId: orderId
          })
        }
      } else if (newStatus === 'IN_TRANSIT' && order.client_id) {
        // 开始运输（承运商接单） -> 通知客户
        const users = await client.query(
          `SELECT id FROM users WHERE linked_entity_id = $1 AND user_type = 'CLIENT' AND is_active = true`,
          [order.client_id]
        )
        if (users.rows.length > 0) {
          await notificationEngine.notify(client, {
            userIds: users.rows.map(u => u.id),
            type: NOTIFICATION_TYPES.CARRIER_ACCEPTED,
            title: `订单 ${order.order_number} 已发运`,
            message: `您的订单 ${order.order_number} 承运商已接单，正在运输中`,
            titleKey: 'notify.orderShippedTitle',
            messageKey: 'notify.orderShippedMessage',
            payload: { orderNo: order.order_number },
            relatedOrderId: orderId
          })
        }
      } else if (newStatus === 'DELIVERED' && order.client_id) {
        // 已送达 -> 通知客户
        const users = await client.query(
          `SELECT id FROM users WHERE linked_entity_id = $1 AND user_type = 'CLIENT' AND is_active = true`,
          [order.client_id]
        )
        if (users.rows.length > 0) {
          await notificationEngine.notify(client, {
            userIds: users.rows.map(u => u.id),
            type: NOTIFICATION_TYPES.DELIVERED,
            title: `订单 ${order.order_number} 已送达`,
            message: `您的订单 ${order.order_number} 已成功送达目的地`,
            titleKey: 'notify.orderDeliveredTitle',
            messageKey: 'notify.orderDeliveredMessage',
            payload: { orderNo: order.order_number },
            relatedOrderId: orderId
          })
        }
      } else if (newStatus === 'EXCEPTION') {
        // 异常 -> 通知客户 + 操作员
        const notifyIds = []

        if (order.client_id) {
          const clientUsers = await client.query(
            `SELECT id FROM users WHERE linked_entity_id = $1 AND user_type = 'CLIENT' AND is_active = true`,
            [order.client_id]
          )
          notifyIds.push(...clientUsers.rows.map(u => u.id))
        }

        const operators = await client.query(
          `SELECT id FROM users WHERE user_type = 'OPERATOR' AND is_active = true`
        )
        notifyIds.push(...operators.rows.map(u => u.id))

        if (notifyIds.length > 0) {
          await notificationEngine.notify(client, {
            userIds: [...new Set(notifyIds)],
            type: NOTIFICATION_TYPES.EXCEPTION,
            title: `订单 ${order.order_number} 出现异常`,
            message: `订单 ${order.order_number} 出现异常：${remarks || '请及时处理'}`,
            titleKey: 'notify.orderExceptionTitle',
            // remarks 是运营填的原文，不翻译；没填时换成另一条不带变量的文案，
            // 这样渲染端不用为「变量是空」特判
            messageKey: remarks
              ? 'notify.orderExceptionMessage'
              : 'notify.orderExceptionMessageNoDetail',
            payload: { orderNo: order.order_number, detail: remarks || '' },
            relatedOrderId: orderId
          })
        }
      }
    } catch (notifyErr) {
      console.warn('订单状态变更通知发送失败（不影响主流程）:', notifyErr.message)
    }

    // 订单完成时自动创建财务记录（应收 + 应付）
    if (newStatus === 'COMPLETED') {
      try {
        const clientPrice = parseFloat(order.client_price) || 0
        const carrierCost = parseFloat(order.carrier_cost) || 0

        const DEFAULT_PAYMENT_TERMS = 30
        const toDueDate = (days) =>
          new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)

        // 应收到期日按客户约定账期算（clients.payment_terms，单位天），没配就用默认 30 天
        let clientPaymentTerms = DEFAULT_PAYMENT_TERMS
        if (order.client_id) {
          const clientRow = await client.query(
            `SELECT payment_terms FROM clients WHERE id = $1`, [order.client_id]
          )
          const days = parseInt(clientRow.rows[0]?.payment_terms, 10)
          if (Number.isInteger(days) && days >= 0) clientPaymentTerms = days
        }
        const clientDueDate = toDueDate(clientPaymentTerms)

        // 应付到期日：carriers 表暂无账期字段，统一用默认 30 天
        const carrierDueDate = toDueDate(DEFAULT_PAYMENT_TERMS)

        // 创建应收发票（客户报价）
        if (clientPrice > 0 && order.client_id) {
          const arDoc = await documentEngine.createDocument(client, {
            docType: 'FI_AR', companyCode: 'DE01', postingDate: new Date(),
            headerText: `应收 - 订单 ${order.order_number}`,
            sourceDocType: 'ORD', sourceDocId: order.document_id,
            createdBy: userId
          })
          await accountDetermination.createJournalEntries(client, {
            documentId: arDoc.id, transactionType: 'AR_INVOICE',
            businessType: order.business_type, amount: clientPrice,
            currency: order.currency || 'EUR', postingDate: new Date(), companyCode: 'DE01',
            subledgerType: 'CLIENT', subledgerId: order.client_id, orderId
          })
          await client.query(
            `INSERT INTO financial_records
             (document_id, record_number, order_id, type, counterparty_type, counterparty_id,
              amount, currency, payment_status, due_date, company_code, auto_generated)
             VALUES ($1, $2, $3, 'RECEIVABLE', 'CLIENT', $4, $5, $6, 'UNPAID', $7, 'DE01', true)`,
            [arDoc.id, arDoc.docNumber, orderId, order.client_id, clientPrice, order.currency || 'EUR', clientDueDate]
          )
        }

        // 创建应付记录（承运商成本）
        if (carrierCost > 0 && order.carrier_id) {
          const apDoc = await documentEngine.createDocument(client, {
            docType: 'FI_AP', companyCode: 'DE01', postingDate: new Date(),
            headerText: `应付 - 订单 ${order.order_number}`,
            sourceDocType: 'ORD', sourceDocId: order.document_id,
            createdBy: userId
          })
          await accountDetermination.createJournalEntries(client, {
            documentId: apDoc.id, transactionType: 'AP_INVOICE',
            businessType: order.business_type, amount: carrierCost,
            currency: order.currency || 'EUR', postingDate: new Date(), companyCode: 'DE01',
            subledgerType: 'CARRIER', subledgerId: order.carrier_id, orderId
          })
          await client.query(
            `INSERT INTO financial_records
             (document_id, record_number, order_id, type, counterparty_type, counterparty_id,
              amount, currency, payment_status, due_date, company_code, auto_generated)
             VALUES ($1, $2, $3, 'PAYABLE', 'CARRIER', $4, $5, $6, 'UNPAID', $7, 'DE01', true)`,
            [apDoc.id, apDoc.docNumber, orderId, order.carrier_id, carrierCost, order.currency || 'EUR', carrierDueDate]
          )
        }

        console.log(`[自动开票] 订单 ${order.order_number} 完成 → 应收 €${clientPrice} / 应付 €${carrierCost}`)
      } catch (finErr) {
        console.error('订单完成自动开票失败（不影响主流程）:', finErr.message)
      }
    }

    return { orderId, oldStatus: order.status, newStatus }
  },

  /**
   * 填写/修改跟踪号（本地派送用，运营手工填，客户门户可见）
   * 不走 editOrder：那里限 PENDING_REVIEW/CONFIRMED，本地派送流程根本没有这两个状态
   */
  async updateTrackingNumber(client, orderId, trackingNumber, userId) {
    const order = await orderModel.getById(client, orderId)
    if (!order) throw new Error('订单不存在')
    if (order.business_type !== BUSINESS_TYPES.LOCAL_DELIVERY) {
      throw new Error('仅本地派送订单支持填写跟踪号')
    }
    if (order.status === 'CANCELLED') {
      throw new Error('已取消的订单不能填写跟踪号')
    }

    const value = (trackingNumber || '').trim()
    if (value.length > 100) throw new Error('跟踪号不能超过 100 个字符')

    await orderModel.update(client, orderId, { tracking_number: value || null })

    await changeTracker.trackChanges(client, {
      objectType: 'ORDER',
      objectId: orderId,
      changeType: 'UPDATE',
      transactionType: 'ORDER_TRACKING_NUMBER',
      tableName: 'orders',
      oldData: { tracking_number: order.tracking_number },
      newData: { tracking_number: value || null },
      trackedFields: [{ name: 'tracking_number', label: '跟踪号' }],
      changedBy: userId
    })

    return { orderId, trackingNumber: value || null }
  },

  /**
   * 更新集装箱派送子状态（仅 TRUCK_FTL）
   */
  async updateDeliveryStatus(client, orderId, newStatus, userId, remarks) {
    const order = await orderModel.getById(client, orderId)
    if (!order) throw new Error('订单不存在')
    if (order.business_type !== BUSINESS_TYPES.TRUCK_FTL) {
      throw new Error('仅卡车运输 FTL 订单支持派送状态操作')
    }

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

    // 派单通知 -> 通知承运商
    try {
      const carrierUsers = await client.query(
        `SELECT id FROM users WHERE linked_entity_id = $1 AND user_type = 'CARRIER' AND is_active = true`,
        [carrierId]
      )
      if (carrierUsers.rows.length > 0) {
        await notificationEngine.notify(client, {
          userIds: carrierUsers.rows.map(u => u.id),
          type: NOTIFICATION_TYPES.STATUS_UPDATE,
          title: `新派单：订单 ${order.order_number}`,
          message: `您有新的运输任务，订单号 ${order.order_number}，请及时确认`,
          titleKey: 'notify.newAssignmentTitle',
          messageKey: 'notify.newAssignmentMessage',
          payload: { orderNo: order.order_number },
          relatedOrderId: orderId
        })
      }
    } catch (notifyErr) {
      console.warn('派单通知发送失败（不影响主流程）:', notifyErr.message)
    }

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

    // 本地派送没有待审核/已确认，改为报价/派送前可编辑
    const editableStatuses = order.business_type === BUSINESS_TYPES.LOCAL_DELIVERY
      ? ['PENDING_QUOTE', 'PENDING_DISPATCH']
      : ['PENDING_REVIEW', 'CONFIRMED']
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
