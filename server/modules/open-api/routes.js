/**
 * 开放 API 路由（P8，需求 4 + 5.1 第三种来源）
 *
 * 挂载前缀 /api/open/v1，与 /api/v1 的 JWT 体系完全隔离。
 * 认证方式：请求头 X-API-Key（密钥由运营用 scripts/create-api-key.js 签发）。
 *
 * 两类端点分开设计（需求表 PDF 明确要求）：
 *   POST /inquiries —— 按订单号维度推询价单（走询价→报价流程）
 *   POST /orders    —— 按柜号维度直接下单（固定价客户，落库即进审核派单流程）
 *
 * 全部是固定路径，没有 /:id 参数路由（踩坑 001 不适用，但留意后续别加错顺序）。
 * 对外契约文档：docs/对外API/EU-TMS开放API对接文档.md
 */

import { Router } from 'express'
import { apiRequestLogger, apiKeyAuth, apiFail } from './middleware.js'
import {
  validateInquiryPayload, validateOrderPayload,
  createInquiryFromApi, createOrderFromApi,
} from './service.js'

const router = Router()

// 留痕在认证前面：被拦下的请求也要记（谁、何时、为什么被拦）
router.use(apiRequestLogger)
router.use(apiKeyAuth)

/**
 * 连通性自检
 * GET /api/open/v1/ping
 * 对接联调第一步：确认密钥有效、网络可达。不动任何业务数据。
 */
router.get('/ping', (req, res) => {
  res.json({
    code: 200,
    message: 'success',
    data: {
      partnerCode: req.apiPartner.partner_code,
      partnerName: req.apiPartner.partner_name,
      serverTime: new Date().toISOString(),
    },
  })
})

/**
 * 推送询价单（按订单号维度）
 * POST /api/open/v1/inquiries
 *
 * 幂等：同一合作方同一 externalOrderNo 重复推送，返回第一次创建的询价单，
 * duplicated=true，HTTP 仍是 200 —— 重试不该收到失败。
 */
router.post('/inquiries', async (req, res) => {
  try {
    const errors = validateInquiryPayload(req.body || {})
    if (errors.length > 0) {
      return apiFail(req, res, 400, 'VALIDATION_ERROR', `字段校验不通过：${errors.join('；')}`)
    }

    const result = await createInquiryFromApi(req.apiPartner, req.body)
    if (result.duplicated) req.apiResult = 'DUPLICATE'

    res.json({
      code: 200,
      message: result.duplicated ? '该单号已推送过，返回已存在的询价单' : '询价单创建成功',
      data: {
        duplicated: result.duplicated,
        inquiryId: result.inquiry.id,
        inquiryNumber: result.inquiry.inquiry_number,
        status: result.inquiry.status,
        createdAt: result.inquiry.created_at,
      },
    })
  } catch (error) {
    console.error('[open-api] 推送询价失败:', error)
    // pg 错误带 code（库层面炸了）算服务器错误；引擎抛的业务规则错误给 422
    if (error.code) {
      return apiFail(req, res, 500, 'SERVER_ERROR', '服务器内部错误，请稍后重试或联系运营')
    }
    return apiFail(req, res, 422, 'BUSINESS_ERROR', error.message)
  }
})

/**
 * 直接下单（按柜号维度，固定价客户）
 * POST /api/open/v1/orders
 *
 * 完整过 ERP 内核：凭证、信用检查、变更追踪、运营通知。
 * 信用超额被拦（BLOCKED）返回 422 BUSINESS_ERROR，订单不会落库。
 * 幂等语义与 /inquiries 相同。
 */
router.post('/orders', async (req, res) => {
  try {
    const errors = validateOrderPayload(req.body || {})
    if (errors.length > 0) {
      return apiFail(req, res, 400, 'VALIDATION_ERROR', `字段校验不通过：${errors.join('；')}`)
    }

    const result = await createOrderFromApi(req.apiPartner, req.body)
    if (result.duplicated) req.apiResult = 'DUPLICATE'

    res.json({
      code: 200,
      message: result.duplicated ? '该单号已推送过，返回已存在的订单' : '订单创建成功，已进入审核流程',
      data: {
        duplicated: result.duplicated,
        orderId: result.order.id,
        orderNumber: result.order.order_number,
        status: result.order.status,
        createdAt: result.order.created_at,
      },
    })
  } catch (error) {
    console.error('[open-api] 直接下单失败:', error)
    if (error.code) {
      return apiFail(req, res, 500, 'SERVER_ERROR', '服务器内部错误，请稍后重试或联系运营')
    }
    return apiFail(req, res, 422, 'BUSINESS_ERROR', error.message)
  }
})

export default router
