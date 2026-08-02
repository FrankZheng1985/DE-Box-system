/**
 * 服务商询价路由（需求 5.3）
 *
 * 一张客户询价单可以同时向多家服务商问成本，回价填进来后对比，选用其中一家，
 * 成本再带到报价单上算毛利。
 *
 * ⚠️ 成本是敏感信息：整个模块限运营端，且逐接口挂 carrier_inquiry:view / :manage，
 *    普通运营专员（op_staff）没有这两个权限码，接口和前端区块都看不到（需求 5.3 的信息隔离）
 *
 * ⚠️ 路由顺序：/batch 等固定路径必须在 /:id 之前（踩坑 001）
 */

import { Router } from 'express'
import { authenticateToken, requireUserType, requirePermission } from '../../middleware/auth.js'
import { withTransaction, query } from '../../core/db.js'
import carrierInquiryService, {
  CARRIER_INQUIRY_STATUS, ACTIVE_STATUSES,
} from './service.js'

const router = Router()
router.use(authenticateToken)
// 服务商成本只对运营端开放，客户和承运商账号一律挡在门外
router.use(requireUserType('OPERATOR'))

/** 列表/详情统一的查询主体，带上服务商名称和客户询价号 */
const BASE_SELECT = `
  SELECT ci.*,
         c.company_name   AS carrier_name,
         c.carrier_code,
         c.contact_name   AS carrier_contact_name,
         c.contact_phone  AS carrier_contact_phone,
         c.contact_email  AS carrier_contact_email,
         i.inquiry_number,
         i.business_type,
         u.display_name   AS created_by_name
  FROM carrier_inquiries ci
  LEFT JOIN carriers c ON c.id = ci.carrier_id
  LEFT JOIN inquiries i ON i.id = ci.inquiry_id
  LEFT JOIN users u ON u.id = ci.created_by`

/**
 * 服务商询价列表
 * GET /api/v1/carrier-inquiries?inquiryId=&carrierId=&status=
 *
 * 不传 inquiryId 就是全量列表（服务商管理岗用来看所有在询的单）
 */
router.get('/', requirePermission('carrier_inquiry:view'), async (req, res) => {
  try {
    const { inquiryId, carrierId, status, page = 1, pageSize = 50 } = req.query
    let sql = `${BASE_SELECT} WHERE 1=1`
    const params = []
    let idx = 0

    if (inquiryId) { params.push(inquiryId); sql += ` AND ci.inquiry_id = $${++idx}` }
    if (carrierId) { params.push(carrierId); sql += ` AND ci.carrier_id = $${++idx}` }
    if (status) { params.push(status); sql += ` AND ci.status = $${++idx}` }

    const countResult = await query(`SELECT COUNT(*) AS total FROM (${sql}) t`, params)
    sql += ` ORDER BY ci.created_at DESC`
    params.push(parseInt(pageSize, 10)); sql += ` LIMIT $${++idx}`
    params.push((parseInt(page, 10) - 1) * parseInt(pageSize, 10)); sql += ` OFFSET $${++idx}`

    const result = await query(sql, params)
    const { lowestId, lowestCost } = carrierInquiryService.findLowestCost(result.rows)

    res.json({
      code: 200, message: 'success', data: result.rows,
      // 最低价标记交给后端算，前端不用各自实现一遍比价逻辑
      summary: { lowest_id: lowestId, lowest_cost: lowestCost },
      pagination: {
        total: parseInt(countResult.rows[0].total, 10),
        page: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10),
      },
    })
  } catch (error) {
    console.error('获取服务商询价列表失败:', error)
    res.status(500).json({ code: 500, message: '获取服务商询价列表失败', data: null })
  }
})

/**
 * 批量发起服务商询价
 * POST /api/v1/carrier-inquiries/batch
 * body: { inquiryId, carrierIds: [], requestRemarks }
 *
 * 本阶段只在系统内建记录，实际询价内容由运营用询价详情页的「复制摘要」
 * 粘给服务商（Frank 2026-08-02 定：不自动发邮件、服务商也不在门户自助回价）
 */
router.post('/batch', requirePermission('carrier_inquiry:manage'), async (req, res) => {
  try {
    const inquiryId = req.body.inquiryId
    const carrierIds = Array.isArray(req.body.carrierIds) ? req.body.carrierIds.filter(Boolean) : []
    if (!inquiryId) {
      return res.status(400).json({ code: 400, message: '缺少询价单 inquiryId', data: null })
    }
    if (carrierIds.length === 0) {
      return res.status(400).json({ code: 400, message: '请至少选择一家服务商', data: null })
    }

    const inquiry = await query(`SELECT id FROM inquiries WHERE id = $1`, [inquiryId])
    if (inquiry.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '询价单不存在', data: null })
    }

    const created = await withTransaction(async (client) => {
      // 已经在询的服务商不重复发起（同一家可以再询，但必须先取消上一轮）
      const existing = await client.query(
        `SELECT carrier_id FROM carrier_inquiries
         WHERE inquiry_id = $1 AND carrier_id = ANY($2::uuid[]) AND status = ANY($3)`,
        [inquiryId, carrierIds, ACTIVE_STATUSES]
      )
      const skip = new Set(existing.rows.map((r) => r.carrier_id))

      const rows = []
      for (const carrierId of carrierIds) {
        if (skip.has(carrierId)) continue
        const number = await carrierInquiryService.nextCarrierInquiryNumber(client)
        const result = await client.query(
          `INSERT INTO carrier_inquiries
           (carrier_inquiry_number, inquiry_id, carrier_id, status, request_remarks, created_by)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING *`,
          [number, inquiryId, carrierId, CARRIER_INQUIRY_STATUS.PENDING,
           req.body.requestRemarks || null, req.user.id]
        )
        rows.push(result.rows[0])
      }
      return { rows, skipped: skip.size }
    })

    res.json({
      code: 200,
      message: created.skipped > 0
        ? `已发起 ${created.rows.length} 家，${created.skipped} 家已在询价中已跳过`
        : `已发起 ${created.rows.length} 家服务商询价`,
      data: created.rows,
    })
  } catch (error) {
    console.error('发起服务商询价失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 服务商询价详情
 * GET /api/v1/carrier-inquiries/:id
 */
router.get('/:id', requirePermission('carrier_inquiry:view'), async (req, res) => {
  try {
    const result = await query(`${BASE_SELECT} WHERE ci.id = $1`, [req.params.id])
    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '服务商询价不存在', data: null })
    }
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    console.error('获取服务商询价详情失败:', error)
    res.status(500).json({ code: 500, message: '获取服务商询价详情失败', data: null })
  }
})

/**
 * 回填服务商报来的成本
 * PUT /api/v1/carrier-inquiries/:id/reply
 * body: { quotedCost, currency, transitDays, validUntil, replyRemarks }
 */
router.put('/:id/reply', requirePermission('carrier_inquiry:manage'), async (req, res) => {
  try {
    const current = await loadOrRespond(req.params.id, res)
    if (!current) return

    if (current.status === CARRIER_INQUIRY_STATUS.CANCELLED) {
      return res.status(400).json({ code: 400, message: '已取消的询价不能回填报价', data: null })
    }

    const invalid = carrierInquiryService.validateReply(req.body)
    if (invalid) {
      return res.status(400).json({ code: 400, message: invalid, data: null })
    }

    // 已选用的那家改价后保持 SELECTED，不要退回 QUOTED 把选用结果冲掉
    const nextStatus = current.status === CARRIER_INQUIRY_STATUS.SELECTED
      ? CARRIER_INQUIRY_STATUS.SELECTED
      : CARRIER_INQUIRY_STATUS.QUOTED

    const result = await query(
      `UPDATE carrier_inquiries
       SET quoted_cost = $1, currency = $2, transit_days = $3, valid_until = $4,
           reply_remarks = $5, status = $6, replied_at = NOW(), updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [carrierInquiryService.toNumber(req.body.quotedCost),
       req.body.currency || 'EUR',
       carrierInquiryService.toNumber(req.body.transitDays),
       req.body.validUntil || null,
       req.body.replyRemarks || null,
       nextStatus,
       req.params.id]
    )

    res.json({ code: 200, message: '服务商报价已记录', data: result.rows[0] })
  } catch (error) {
    console.error('回填服务商报价失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 选用这家服务商
 * POST /api/v1/carrier-inquiries/:id/select
 *
 * 一张客户询价最多选用一家：库里有部分唯一索引兜底，这里先把原来选用的降回已回价。
 */
router.post('/:id/select', requirePermission('carrier_inquiry:manage'), async (req, res) => {
  try {
    const current = await loadOrRespond(req.params.id, res)
    if (!current) return

    if (current.status !== CARRIER_INQUIRY_STATUS.QUOTED) {
      return res.status(400).json({
        code: 400,
        message: current.status === CARRIER_INQUIRY_STATUS.SELECTED
          ? '这家服务商已经是选用状态'
          : '只有已回价的服务商可以选用，请先回填成本',
        data: null,
      })
    }

    const updated = await withTransaction(async (client) => {
      await client.query(
        `UPDATE carrier_inquiries
         SET status = $1, selected_at = NULL, updated_at = NOW()
         WHERE inquiry_id = $2 AND status = $3 AND id <> $4`,
        [CARRIER_INQUIRY_STATUS.QUOTED, current.inquiry_id, CARRIER_INQUIRY_STATUS.SELECTED, current.id]
      )
      const result = await client.query(
        `UPDATE carrier_inquiries
         SET status = $1, selected_at = NOW(), updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [CARRIER_INQUIRY_STATUS.SELECTED, current.id]
      )
      return result.rows[0]
    })

    res.json({ code: 200, message: '已选用该服务商', data: updated })
  } catch (error) {
    console.error('选用服务商失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 服务商不报价
 * POST /api/v1/carrier-inquiries/:id/decline
 */
router.post('/:id/decline', requirePermission('carrier_inquiry:manage'), async (req, res) => {
  try {
    const current = await loadOrRespond(req.params.id, res)
    if (!current) return
    if (current.status === CARRIER_INQUIRY_STATUS.SELECTED) {
      return res.status(400).json({ code: 400, message: '已选用的服务商不能标记为不报价，请先改选其他家', data: null })
    }

    const result = await query(
      `UPDATE carrier_inquiries
       SET status = $1, reply_remarks = COALESCE($2, reply_remarks), replied_at = NOW(), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [CARRIER_INQUIRY_STATUS.DECLINED, req.body?.replyRemarks || null, req.params.id]
    )
    res.json({ code: 200, message: '已标记为不报价', data: result.rows[0] })
  } catch (error) {
    console.error('标记不报价失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 取消这次服务商询价
 * POST /api/v1/carrier-inquiries/:id/cancel
 */
router.post('/:id/cancel', requirePermission('carrier_inquiry:manage'), async (req, res) => {
  try {
    const current = await loadOrRespond(req.params.id, res)
    if (!current) return
    if (current.status === CARRIER_INQUIRY_STATUS.SELECTED) {
      return res.status(400).json({ code: 400, message: '已选用的服务商询价不能取消，请先改选其他家', data: null })
    }

    const result = await query(
      `UPDATE carrier_inquiries SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [CARRIER_INQUIRY_STATUS.CANCELLED, req.params.id]
    )
    res.json({ code: 200, message: '服务商询价已取消', data: result.rows[0] })
  } catch (error) {
    console.error('取消服务商询价失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 删除服务商询价（仅待回价/已取消，发错了才用）
 * DELETE /api/v1/carrier-inquiries/:id
 */
router.delete('/:id', requirePermission('carrier_inquiry:manage'), async (req, res) => {
  try {
    const current = await loadOrRespond(req.params.id, res)
    if (!current) return
    if (![CARRIER_INQUIRY_STATUS.PENDING, CARRIER_INQUIRY_STATUS.CANCELLED].includes(current.status)) {
      return res.status(400).json({ code: 400, message: '只有待回价或已取消的记录可以删除', data: null })
    }
    // 报价单可能引用了这条成本来源，先断开引用再删，避免外键报错
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE quotations SET carrier_cost_source_id = NULL WHERE carrier_cost_source_id = $1`,
        [req.params.id]
      )
      await client.query(`DELETE FROM carrier_inquiries WHERE id = $1`, [req.params.id])
    })
    res.json({ code: 200, message: '服务商询价已删除', data: null })
  } catch (error) {
    console.error('删除服务商询价失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

// ==================== 内部工具 ====================

/**
 * 取一条服务商询价，不存在时已写好响应
 * @returns {Promise<object|null>}
 */
async function loadOrRespond(id, res) {
  const result = await query(`SELECT * FROM carrier_inquiries WHERE id = $1`, [id])
  if (result.rows.length === 0) {
    res.status(404).json({ code: 404, message: '服务商询价不存在', data: null })
    return null
  }
  return result.rows[0]
}

export default router
