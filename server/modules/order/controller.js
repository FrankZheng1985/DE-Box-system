/**
 * 订单控制器
 * 处理 HTTP 请求，调用 service 层执行业务逻辑
 * 所有数据库操作都在事务中执行（通过 withTransaction）
 */

import { withTransaction, query } from '../../core/db.js'
import { changeTracker, documentEngine } from '../../core/index.js'
import orderService from './service.js'
import orderModel from './model.js'

/**
 * 租户隔离（P5）
 *
 * 订单列表以前直接用 req.query.clientId 做筛选，谁传谁算数：
 * 客户门户的账号只要把 clientId 换成别家公司的，就能看到别人的订单和报价，
 * 不传参数更是直接看全部。这里改成按登录身份强制收窄，query 参数只对运营生效。
 *
 * @param {object} user req.user
 * @param {object} queryFilters 前端传来的筛选条件
 * @returns {object} 收窄后的筛选条件
 */
function scopeToTenant(user, queryFilters) {
  if (user?.userType === 'CLIENT') {
    return { ...queryFilters, clientId: user.linkedEntityId, carrierId: undefined }
  }
  if (user?.userType === 'CARRIER') {
    return { ...queryFilters, carrierId: user.linkedEntityId, clientId: undefined }
  }
  return queryFilters
}

/**
 * 校验某条订单是否属于当前登录方
 * @returns {boolean} true 表示可以看
 */
function canAccessOrder(user, order) {
  if (user?.userType === 'CLIENT') return order.client_id === user.linkedEntityId
  if (user?.userType === 'CARRIER') return order.carrier_id === user.linkedEntityId
  return true
}

export const orderController = {

  /**
   * 获取订单列表
   * GET /api/v1/orders
   */
  async list(req, res) {
    try {
      const filters = scopeToTenant(req.user, {
        businessType: req.query.businessType,
        status: req.query.status,
        deliveryStatus: req.query.deliveryStatus,
        clientId: req.query.clientId,
        carrierId: req.query.carrierId,
        search: req.query.search,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        page: parseInt(req.query.page) || 1,
        pageSize: parseInt(req.query.pageSize) || 20
      })

      const result = await withTransaction(async (client) => {
        return orderModel.list(client, filters)
      })

      res.json({ code: 200, message: 'success', ...result })
    } catch (error) {
      console.error('获取订单列表失败:', error)
      res.status(500).json({ code: 500, message: '获取订单列表失败', data: null })
    }
  },

  /**
   * 获取订单详情
   * GET /api/v1/orders/:id
   */
  async getById(req, res) {
    try {
      const result = await withTransaction(async (client) => {
        const order = await orderModel.getById(client, req.params.id)
        if (!order) return null

        // 不是自己家的订单，一律按"不存在"处理——
        // 回 403 等于告诉对方"这个 UUID 是有效订单"，反而泄露信息
        if (!canAccessOrder(req.user, order)) return null

        // 获取单据流
        let flow = null
        if (order.document_id) {
          flow = await documentEngine.getDocumentFlow(client, order.document_id)
        }

        // 获取状态变更日志
        const logs = await client.query(
          `SELECT osl.*, u.display_name as changed_by_name
           FROM order_status_logs osl
           LEFT JOIN users u ON u.id = osl.changed_by
           WHERE osl.order_id = $1
           ORDER BY osl.created_at DESC`,
          [req.params.id]
        )

        return { order, documentFlow: flow, statusLogs: logs.rows }
      })

      if (!result) {
        return res.status(404).json({ code: 404, message: '订单不存在', data: null })
      }

      res.json({ code: 200, message: 'success', data: result })
    } catch (error) {
      console.error('获取订单详情失败:', error)
      res.status(500).json({ code: 500, message: '获取订单详情失败', data: null })
    }
  },

  /**
   * 创建订单
   * POST /api/v1/orders
   */
  async create(req, res) {
    try {
      // 客户门户建单一律落在自己公司名下：clientId 取 JWT 的绑定，忽略前端传参。
      // 以前直接吃 req.body.clientId，客户门户账号改一下就能给别家公司造单
      // （和列表接口踩过的坑同族：踩坑 016 / 023）
      const payload = req.user?.userType === 'CLIENT'
        ? { ...req.body, clientId: req.user.linkedEntityId }
        : req.body

      const order = await withTransaction(async (client) => {
        return orderService.createOrder(client, payload, req.user.id)
      })

      res.json({ code: 200, message: '订单创建成功', data: order })
    } catch (error) {
      console.error('创建订单失败:', error)
      // 业务错误返回 400，系统错误返回 500
      const statusCode = error.message.includes('信用检查') ? 400 : 500
      res.status(statusCode).json({ code: statusCode, message: error.message, data: null })
    }
  },

  /**
   * 编辑订单
   * PUT /api/v1/orders/:id
   */
  async update(req, res) {
    try {
      await withTransaction(async (client) => {
        await orderService.editOrder(client, req.params.id, req.body, req.user.id)
      })
      res.json({ code: 200, message: '订单更新成功', data: null })
    } catch (error) {
      console.error('编辑订单失败:', error)
      res.status(400).json({ code: 400, message: error.message, data: null })
    }
  },

  /**
   * 更新篷布车订单状态
   * PUT /api/v1/orders/:id/status
   */
  async updateStatus(req, res) {
    try {
      const { status, remarks } = req.body
      const result = await withTransaction(async (client) => {
        return orderService.updateStatus(client, req.params.id, status, req.user.id, remarks)
      })
      res.json({ code: 200, message: '状态更新成功', data: result })
    } catch (error) {
      console.error('更新状态失败:', error)
      res.status(400).json({ code: 400, message: error.message, data: null })
    }
  },

  /**
   * 更新集装箱派送状态
   * PUT /api/v1/orders/:id/delivery-status
   */
  async updateDeliveryStatus(req, res) {
    try {
      const { status, remarks } = req.body
      const result = await withTransaction(async (client) => {
        return orderService.updateDeliveryStatus(client, req.params.id, status, req.user.id, remarks)
      })
      res.json({ code: 200, message: '派送状态更新成功', data: result })
    } catch (error) {
      console.error('更新派送状态失败:', error)
      res.status(400).json({ code: 400, message: error.message, data: null })
    }
  },

  /**
   * 填写/修改跟踪号（本地派送）
   * PUT /api/v1/orders/:id/tracking-number
   */
  async updateTrackingNumber(req, res) {
    try {
      const result = await withTransaction(async (client) => {
        return orderService.updateTrackingNumber(client, req.params.id, req.body.trackingNumber, req.user.id)
      })
      res.json({ code: 200, message: '跟踪号已保存', data: result })
    } catch (error) {
      console.error('保存跟踪号失败:', error)
      res.status(400).json({ code: 400, message: error.message, data: null })
    }
  },

  /**
   * 派单
   * POST /api/v1/orders/:id/assign
   */
  async assign(req, res) {
    try {
      const { carrierId, carrierCost } = req.body
      const result = await withTransaction(async (client) => {
        return orderService.assignCarrier(client, req.params.id, carrierId, carrierCost, req.user.id)
      })
      res.json({ code: 200, message: '派单成功', data: result })
    } catch (error) {
      console.error('派单失败:', error)
      res.status(400).json({ code: 400, message: error.message, data: null })
    }
  },

  /**
   * 承运商接单
   * POST /api/v1/orders/:id/accept
   */
  async accept(req, res) {
    try {
      const result = await withTransaction(async (client) => {
        return orderService.acceptOrder(client, req.params.id, req.user.id)
      })
      res.json({ code: 200, message: '接单成功', data: result })
    } catch (error) {
      console.error('接单失败:', error)
      res.status(400).json({ code: 400, message: error.message, data: null })
    }
  },

  /**
   * 承运商拒单
   * POST /api/v1/orders/:id/reject
   */
  async reject(req, res) {
    try {
      const { reason } = req.body
      const result = await withTransaction(async (client) => {
        return orderService.rejectOrder(client, req.params.id, req.user.id, reason)
      })
      res.json({ code: 200, message: '拒单已记录', data: result })
    } catch (error) {
      console.error('拒单失败:', error)
      res.status(400).json({ code: 400, message: error.message, data: null })
    }
  },

  /**
   * 取消订单
   * POST /api/v1/orders/:id/cancel
   */
  async cancel(req, res) {
    try {
      const { reason } = req.body
      await withTransaction(async (client) => {
        await orderService.cancelOrder(client, req.params.id, req.user.id, reason)
      })
      res.json({ code: 200, message: '订单已取消', data: null })
    } catch (error) {
      console.error('取消订单失败:', error)
      res.status(400).json({ code: 400, message: error.message, data: null })
    }
  },

  /**
   * 获取订单时间线
   * GET /api/v1/orders/:id/timeline
   */
  async getTimeline(req, res) {
    try {
      const result = await query(
        `SELECT osl.from_status, osl.to_status, osl.remarks, osl.created_at,
                u.display_name as changed_by_name
         FROM order_status_logs osl
         LEFT JOIN users u ON u.id = osl.changed_by
         WHERE osl.order_id = $1
         ORDER BY osl.created_at ASC`,
        [req.params.id]
      )
      res.json({ code: 200, message: 'success', data: result.rows })
    } catch (error) {
      console.error('获取时间线失败:', error)
      res.status(500).json({ code: 500, message: '获取时间线失败', data: null })
    }
  },

  /**
   * 获取订单变更历史
   * GET /api/v1/orders/:id/changes
   */
  async getChanges(req, res) {
    try {
      const result = await withTransaction(async (client) => {
        return changeTracker.getChangeHistory(client, 'ORDER', req.params.id)
      })
      res.json({ code: 200, message: 'success', data: result })
    } catch (error) {
      console.error('获取变更历史失败:', error)
      res.status(500).json({ code: 500, message: '获取变更历史失败', data: null })
    }
  },

  /**
   * 获取订单统计
   * GET /api/v1/orders/stats
   */
  async getStats(req, res) {
    try {
      const result = await withTransaction(async (client) => {
        return orderModel.getStats(client, req.user.companyCode)
      })
      res.json({ code: 200, message: 'success', data: result })
    } catch (error) {
      console.error('获取统计失败:', error)
      res.status(500).json({ code: 500, message: '获取统计失败', data: null })
    }
  }
}

export default orderController
