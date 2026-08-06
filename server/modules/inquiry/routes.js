/**
 * 询价管理路由
 *
 * 三个来源：客户门户自助提交 / 运营代客户建单 / 开放 API（P8 再接）
 * 报价由 quotation 模块承接，这里只管询价单本身和按件货物明细。
 *
 * ⚠️ 路由顺序：/stats /export /summary 等固定路径必须在 /:id 之前（踩坑 001）
 */

import { Router } from 'express'
import ExcelJS from 'exceljs'
import multer from 'multer'
import { authenticateToken, requireUserType, requirePermission, requireTenantBinding } from '../../middleware/auth.js'
import { withTransaction, query } from '../../core/db.js'
import { resolveLang, t } from '../../utils/i18n.js'
import inquiryService from './service.js'
import importService from './import-service.js'

const router = Router()
router.use(authenticateToken)
// 门户账号必须绑定公司才能进来——绑定为空时各处的租户过滤条件会整个不加，
// 等于返回全部数据（失效方向必须是拒绝，不是放行）
router.use(requireTenantBinding)

/** 询价单状态（和库里存的值一致，全大写 —— 踩坑 004） */
const INQUIRY_STATUS = {
  PENDING_QUOTE: 'PENDING_QUOTE',
  QUOTED: 'QUOTED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
}

const VALID_BUSINESS_TYPES = ['TRUCK_LTL', 'TRUCK_FTL', 'LOCAL_DELIVERY']

/**
 * 批量导入的文件接收器
 *
 * 用内存存储：文件解析完就没用了，不落盘（落盘还要考虑清理和权限，
 * 而且这是纯解析场景，不像订单附件需要留存）。
 */
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: importService.MAX_FILE_SIZE, files: 1 },
})

const BUSINESS_TYPE_LABELS = {
  TRUCK_LTL: '卡车派送 LTL',
  TRUCK_FTL: '卡车运输 FTL',
  LOCAL_DELIVERY: '本地派送',
}

const STATUS_LABELS = {
  PENDING_QUOTE: '待报价',
  QUOTED: '已报价',
  ACCEPTED: '已接受',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
}

/**
 * 按登录身份强制收窄可见范围
 *
 * ⚠️ 客户只能看自己公司的询价，这个边界必须在后端按 JWT 强制，
 *    不能信任前端传的 clientId（踩坑 016）
 */
function applyScopeFilter(req, sql, params) {
  const userType = req.user.userType || req.user.roleCode
  let idx = params.length
  if (userType === 'CLIENT' && req.user.linkedEntityId) {
    params.push(req.user.linkedEntityId)
    sql += ` AND i.client_id = $${++idx}`
  } else if (req.query.clientId) {
    params.push(req.query.clientId)
    sql += ` AND i.client_id = $${++idx}`
  }
  return sql
}

/**
 * 取一张询价单并校验访问权限
 * @returns {Promise<object|null>} 无权或不存在时已写好响应并返回 null
 */
async function loadInquiryWithAccessCheck(inquiryId, req, res) {
  const result = await query(
    `SELECT i.*, c.company_name AS client_name
     FROM inquiries i LEFT JOIN clients c ON c.id = i.client_id
     WHERE i.id = $1`,
    [inquiryId]
  )
  if (result.rows.length === 0) {
    res.status(404).json({ code: 404, message: '询价不存在', data: null })
    return null
  }
  const inquiry = result.rows[0]
  const userType = req.user.userType || req.user.roleCode
  if (userType === 'CLIENT' && inquiry.client_id !== req.user.linkedEntityId) {
    res.status(403).json({ code: 403, message: '无权访问该询价单', data: null })
    return null
  }
  if (userType === 'CARRIER') {
    res.status(403).json({ code: 403, message: '无权访问该询价单', data: null })
    return null
  }
  return inquiry
}

/**
 * 询价列表
 * GET /api/v1/inquiries
 */
router.get('/', requirePermission('inquiry:view', 'portal:inquiry_manage'), async (req, res) => {
  try {
    const { status, businessType, search, page = 1, pageSize = 20 } = req.query
    let sql = `
      SELECT i.*, c.company_name AS client_name,
             (SELECT COUNT(*) FROM inquiry_cargo_items ci WHERE ci.inquiry_id = i.id)::int AS item_count,
             (SELECT COUNT(*) FROM quotations q WHERE q.inquiry_id = i.id)::int AS quotation_count
      FROM inquiries i
      LEFT JOIN clients c ON c.id = i.client_id
      WHERE 1=1`
    const params = []

    sql = applyScopeFilter(req, sql, params)
    let idx = params.length

    if (status) { params.push(status); sql += ` AND i.status = $${++idx}` }
    if (businessType) { params.push(businessType); sql += ` AND i.business_type = $${++idx}` }
    if (search) {
      params.push(`%${search}%`)
      sql += ` AND (i.inquiry_number ILIKE $${++idx} OR i.customer_ref ILIKE $${idx} OR c.company_name ILIKE $${idx})`
    }

    const countResult = await query(`SELECT COUNT(*) AS total FROM (${sql}) t`, params)
    sql += ` ORDER BY i.created_at DESC`
    params.push(parseInt(pageSize, 10)); sql += ` LIMIT $${++idx}`
    params.push((parseInt(page, 10) - 1) * parseInt(pageSize, 10)); sql += ` OFFSET $${++idx}`

    const result = await query(sql, params)
    res.json({
      code: 200, message: 'success', data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total, 10),
        page: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10),
      },
    })
  } catch (error) {
    console.error('获取询价列表失败:', error)
    res.status(500).json({ code: 500, message: '获取询价列表失败', data: null })
  }
})

/**
 * 询价统计
 * GET /api/v1/inquiries/stats
 */
router.get('/stats', requireUserType('OPERATOR'), requirePermission('inquiry:view'), async (req, res) => {
  try {
    let sql = `SELECT
        COUNT(*) FILTER (WHERE i.created_at >= date_trunc('month', CURRENT_DATE))::int AS month_total,
        COUNT(*) FILTER (WHERE i.status = 'PENDING_QUOTE')::int AS pending_quote,
        COUNT(*) FILTER (WHERE i.status = 'QUOTED')::int        AS quoted,
        COUNT(*) FILTER (WHERE i.status = 'ACCEPTED')::int      AS accepted
      FROM inquiries i WHERE 1=1`
    const params = []
    sql = applyScopeFilter(req, sql, params)

    const result = await query(sql, params)
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    console.error('获取询价统计失败:', error)
    res.status(500).json({ code: 500, message: '获取询价统计失败', data: null })
  }
})

/**
 * 批量复制摘要（需求 5.4）
 * POST /api/v1/inquiries/summary   body: { ids: [...] }
 *
 * 用 POST 而不是 GET，因为勾选的 id 可能很多，塞进 query string 会超长。
 */
router.post('/summary', requireUserType('OPERATOR'), requirePermission('inquiry:export'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : []
    if (ids.length === 0) {
      return res.status(400).json({ code: 400, message: '请先勾选询价单', data: null })
    }

    const rows = await loadInquiriesForExport(req, ids)
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '没有可复制的询价单', data: null })
    }

    const blocks = []
    for (const inquiry of rows) {
      const items = await inquiryService.getCargoItems(inquiry.id)
      blocks.push(inquiryService.buildSummaryText(inquiry, items))
    }
    // 多张单之间用分隔线隔开，粘到聊天窗口里一眼能分清
    const text = blocks.join('\n\n' + '─'.repeat(32) + '\n\n')

    res.json({ code: 200, message: 'success', data: { text, count: rows.length } })
  } catch (error) {
    console.error('生成询价摘要失败:', error)
    res.status(500).json({ code: 500, message: '生成询价摘要失败', data: null })
  }
})

/**
 * 导出 Excel（固定模板，需求 5.4）
 * GET /api/v1/inquiries/export?ids=a,b,c  不传 ids 则按当前筛选条件导出
 *
 * 一行一件货，表头字段在每行重复，方便服务商直接筛选排序。
 */
router.get('/export', requireUserType('OPERATOR'), requirePermission('inquiry:export'), async (req, res) => {
  // Excel 表头按请求语言渲染（P9）
  const lang = resolveLang(req)
  try {
    const ids = req.query.ids ? String(req.query.ids).split(',').filter(Boolean) : null
    const rows = await loadInquiriesForExport(req, ids)

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet(t(lang, 'excel.sheetInquiries'))

    sheet.columns = [
      { header: t(lang, 'excel.inquiryNo'), key: 'inquiry_number', width: 20 },
      { header: t(lang, 'excel.customerRef'), key: 'customer_ref', width: 16 },
      { header: t(lang, 'excel.client'), key: 'client_name', width: 20 },
      { header: t(lang, 'excel.serviceType'), key: 'business_type', width: 14 },
      { header: t(lang, 'excel.status'), key: 'status', width: 10 },
      { header: t(lang, 'excel.fromCountry'), key: 'from_country', width: 10 },
      { header: t(lang, 'excel.fromZip'), key: 'from_zip', width: 10 },
      { header: t(lang, 'excel.fromCity'), key: 'from_city', width: 14 },
      { header: t(lang, 'excel.fromAddress'), key: 'from_address', width: 26 },
      { header: t(lang, 'excel.toCountry'), key: 'to_country', width: 10 },
      { header: t(lang, 'excel.toZip'), key: 'to_zip', width: 10 },
      { header: t(lang, 'excel.toCity'), key: 'to_city', width: 14 },
      { header: t(lang, 'excel.toAddress'), key: 'to_address', width: 26 },
      { header: t(lang, 'excel.contactName'), key: 'contact_name', width: 12 },
      { header: t(lang, 'excel.phone'), key: 'contact_phone', width: 18 },
      { header: t(lang, 'excel.email'), key: 'contact_email', width: 24 },
      { header: t(lang, 'excel.lineNo'), key: 'line_number', width: 6 },
      { header: t(lang, 'excel.itemNo'), key: 'reference_no', width: 16 },
      { header: t(lang, 'excel.cargoDescription'), key: 'description', width: 20 },
      { header: t(lang, 'excel.quantity'), key: 'quantity', width: 8 },
      { header: t(lang, 'excel.lengthCm'), key: 'length_cm', width: 10 },
      { header: t(lang, 'excel.widthCm'), key: 'width_cm', width: 10 },
      { header: t(lang, 'excel.heightCm'), key: 'height_cm', width: 10 },
      { header: t(lang, 'excel.unitWeightKg'), key: 'unit_weight_kg', width: 14 },
      { header: t(lang, 'excel.unitVolumeM3'), key: 'unit_volume_m3', width: 14 },
      { header: 'LDM', key: 'ldm', width: 10 },
      { header: t(lang, 'excel.remarks'), key: 'remarks', width: 24 },
    ]
    sheet.getRow(1).font = { bold: true }

    for (const inquiry of rows) {
      const items = await inquiryService.getCargoItems(inquiry.id)
      const base = buildExportHeaderCells(inquiry)

      if (items.length === 0) {
        // 没录明细的单也要出现在导出里，否则服务商会以为漏了
        sheet.addRow({
          ...base,
          quantity: inquiry.cargo_quantity ?? null,
          unit_weight_kg: numeric(inquiry.cargo_weight_kg),
          unit_volume_m3: numeric(inquiry.cargo_volume_m3),
          ldm: numeric(inquiry.ldm),
          remarks: inquiry.remarks || '',
        })
        continue
      }

      for (const it of items) {
        sheet.addRow({
          ...base,
          line_number: it.line_number,
          reference_no: it.reference_no || '',
          description: it.description || '',
          quantity: it.quantity,
          length_cm: numeric(it.length_cm),
          width_cm: numeric(it.width_cm),
          height_cm: numeric(it.height_cm),
          unit_weight_kg: numeric(it.unit_weight_kg),
          unit_volume_m3: numeric(it.unit_volume_m3),
          ldm: numeric(it.ldm),
          remarks: it.remarks || '',
        })
      }
    }

    const filename = `inquiries_${new Date().toISOString().slice(0, 10)}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    await workbook.xlsx.write(res)
    res.end()
  } catch (error) {
    console.error('导出询价 Excel 失败:', error)
    res.status(500).json({ code: 500, message: '导出失败', data: null })
  }
})

/**
 * 下载批量导入模板
 * GET /api/v1/inquiries/import-template
 *
 * 表头按请求语言渲染（P9）；解析时三种语言的表头都认，所以德语同事下的模板
 * 中文同事也能拿来导。
 */
router.get('/import-template',
  requireUserType('OPERATOR', 'CLIENT'),
  requirePermission('inquiry:create', 'portal:inquiry_manage'),
  async (req, res) => {
    const lang = resolveLang(req)
    try {
      const workbook = importService.buildTemplateWorkbook(lang)
      const filename = `inquiry_import_template_${new Date().toISOString().slice(0, 10)}.xlsx`
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      await workbook.xlsx.write(res)
      res.end()
    } catch (error) {
      console.error('生成询价导入模板失败:', error)
      res.status(500).json({ code: 500, message: '生成导入模板失败', data: null })
    }
  })

/**
 * 批量导入预览（只解析校验，不写库）
 * POST /api/v1/inquiries/import/preview   multipart: file
 *
 * ⚠️ 必须在 /import 之前注册，否则 /import/preview 会先被 /import 之后的
 *    参数路由抢走（同踩坑 001 的套路）
 */
router.post('/import/preview',
  requireUserType('OPERATOR', 'CLIENT'),
  requirePermission('inquiry:create', 'portal:inquiry_manage'),
  importUpload.single('file'),
  async (req, res) => {
    const lang = resolveLang(req)
    try {
      const clientId = resolveImportClientId(req, res)
      if (!clientId) return
      if (!req.file) {
        return res.status(400).json({ code: 400, message: '请选择要导入的 Excel 文件', data: null })
      }

      const result = await importService.analyzeImportFile(req.file.buffer, lang)
      // 库里已有同名客户单号的，标出来提醒是不是重复导入
      const dupWarnings = await importService.markExistingCustomerRefs(
        { query }, clientId, result.groups, lang
      )

      res.json({
        code: 200,
        message: 'success',
        data: buildPreviewPayload(result, dupWarnings),
      })
    } catch (error) {
      console.error('解析询价导入文件失败:', error)
      res.status(500).json({ code: 500, message: '解析导入文件失败', data: null })
    }
  })

/**
 * 批量导入（解析 + 写库）
 * POST /api/v1/inquiries/import   multipart: file [, clientId]
 *
 * 用的是和预览完全相同的解析函数，所以「预览看到几张单，导进去就是几张」。
 * 有任何一条错误就整批不导 —— 导一半客户没法知道该补哪几张。
 */
router.post('/import',
  requireUserType('OPERATOR', 'CLIENT'),
  requirePermission('inquiry:create', 'portal:inquiry_manage'),
  importUpload.single('file'),
  async (req, res) => {
    const lang = resolveLang(req)
    try {
      const clientId = resolveImportClientId(req, res)
      if (!clientId) return
      if (!req.file) {
        return res.status(400).json({ code: 400, message: '请选择要导入的 Excel 文件', data: null })
      }

      const result = await importService.analyzeImportFile(req.file.buffer, lang)
      const dupWarnings = await importService.markExistingCustomerRefs(
        { query }, clientId, result.groups, lang
      )

      if (result.errors.length > 0 || result.groups.length === 0) {
        return res.status(400).json({
          code: 400,
          message: '导入文件有错误，请修正后重试',
          data: buildPreviewPayload(result, dupWarnings),
        })
      }

      const created = await withTransaction(async (client) =>
        importService.createInquiriesFromGroups(client, result.groups, {
          clientId,
          createdBy: req.user.id,
        })
      )

      res.json({
        code: 200,
        message: `成功导入 ${created.length} 张询价单`,
        data: { created, count: created.length },
      })
    } catch (error) {
      console.error('批量导入询价失败:', error)
      res.status(500).json({ code: 500, message: error.message, data: null })
    }
  })

/**
 * 询价详情（含按件明细 + 已开出的报价）
 * GET /api/v1/inquiries/:id
 */
router.get('/:id', requirePermission('inquiry:view', 'portal:inquiry_manage'), async (req, res) => {
  try {
    const inquiry = await loadInquiryWithAccessCheck(req.params.id, req, res)
    if (!inquiry) return

    const [items, quotations] = await Promise.all([
      inquiryService.getCargoItems(inquiry.id),
      query(
        `SELECT id, quotation_number, version, total_price, currency, status, valid_until, created_at
         FROM quotations WHERE inquiry_id = $1 ORDER BY version DESC, created_at DESC`,
        [inquiry.id]
      ),
    ])

    res.json({
      code: 200, message: 'success',
      data: { ...inquiry, cargoItems: items, quotations: quotations.rows },
    })
  } catch (error) {
    console.error('获取询价详情失败:', error)
    res.status(500).json({ code: 500, message: '获取询价详情失败', data: null })
  }
})

/**
 * 单张询价的复制摘要
 * GET /api/v1/inquiries/:id/summary
 */
router.get('/:id/summary', requireUserType('OPERATOR'), requirePermission('inquiry:export'), async (req, res) => {
  try {
    const inquiry = await loadInquiryWithAccessCheck(req.params.id, req, res)
    if (!inquiry) return

    const items = await inquiryService.getCargoItems(inquiry.id)
    res.json({
      code: 200, message: 'success',
      data: { text: inquiryService.buildSummaryText(inquiry, items) },
    })
  } catch (error) {
    console.error('生成询价摘要失败:', error)
    res.status(500).json({ code: 500, message: '生成询价摘要失败', data: null })
  }
})

/**
 * 创建询价
 * POST /api/v1/inquiries
 *
 * 两个来源共用这个端点：
 *   客户门户 —— clientId 一律取 JWT 里的 linkedEntityId，不信任前端传参
 *   运营代建 —— 必须显式传 clientId
 */
router.post('/', requireUserType('OPERATOR', 'CLIENT'), requirePermission('inquiry:create', 'portal:inquiry_manage'), async (req, res) => {
  try {
    const userType = req.user.userType || req.user.roleCode
    const clientId = userType === 'CLIENT' ? req.user.linkedEntityId : req.body.clientId
    if (!clientId) {
      return res.status(400).json({ code: 400, message: '缺少客户 clientId', data: null })
    }
    if (!VALID_BUSINESS_TYPES.includes(req.body.businessType)) {
      return res.status(400).json({
        code: 400,
        message: `无效的服务类型，允许值：${VALID_BUSINESS_TYPES.join(' / ')}`,
        data: null,
      })
    }

    // 建单逻辑收在 service 里，和批量导入共用同一条路径（两条 INSERT 迟早写岔）
    const inquiry = await withTransaction(async (client) =>
      inquiryService.createInquiryRecord(client, {
        clientId,
        createdBy: req.user.id,
        payload: req.body,
      })
    )

    res.json({ code: 200, message: '询价创建成功', data: inquiry })
  } catch (error) {
    console.error('创建询价失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

/**
 * 编辑询价（仅待报价状态）
 * PUT /api/v1/inquiries/:id
 */
router.put('/:id', requirePermission('inquiry:edit', 'portal:inquiry_manage'), async (req, res) => {
  try {
    const inquiry = await loadInquiryWithAccessCheck(req.params.id, req, res)
    if (!inquiry) return
    if (inquiry.status !== INQUIRY_STATUS.PENDING_QUOTE) {
      return res.status(400).json({ code: 400, message: '仅待报价状态的询价可以编辑', data: null })
    }
    if (req.body.businessType !== undefined && !VALID_BUSINESS_TYPES.includes(req.body.businessType)) {
      return res.status(400).json({
        code: 400,
        message: `无效的服务类型，允许值：${VALID_BUSINESS_TYPES.join(' / ')}`,
        data: null,
      })
    }

    await withTransaction(async (client) => {
      const map = {
        businessType: 'business_type', transportType: 'transport_type',
        cargoDescription: 'cargo_description', cargoWeightKg: 'cargo_weight_kg',
        cargoVolumeM3: 'cargo_volume_m3', cargoQuantity: 'cargo_quantity',
        specialRequirements: 'special_requirements', remarks: 'remarks',
        contactName: 'contact_name', contactPhone: 'contact_phone',
        contactEmail: 'contact_email', customerRef: 'customer_ref',
        pod: 'pod', containerType: 'container_type',
      }
      const setClauses = []
      const params = []
      let idx = 0
      for (const [camel, snake] of Object.entries(map)) {
        if (req.body[camel] !== undefined) {
          params.push(req.body[camel])
          setClauses.push(`${snake} = $${++idx}`)
        }
      }
      if (req.body.routeFrom) { params.push(JSON.stringify(req.body.routeFrom)); setClauses.push(`route_from = $${++idx}`) }
      if (req.body.routeTo) { params.push(JSON.stringify(req.body.routeTo)); setClauses.push(`route_to = $${++idx}`) }

      if (setClauses.length > 0) {
        params.push(req.params.id)
        setClauses.push('updated_at = NOW()')
        await client.query(`UPDATE inquiries SET ${setClauses.join(', ')} WHERE id = $${++idx}`, params)
      }

      // cargoItems 传了才整单替换；没传保持原样（区分"清空明细"和"这次没改明细"）
      if (Array.isArray(req.body.cargoItems)) {
        await inquiryService.replaceCargoItems(client, req.params.id, req.body.cargoItems)
      }
    })

    res.json({ code: 200, message: '询价更新成功', data: null })
  } catch (error) {
    console.error('更新询价失败:', error)
    res.status(400).json({ code: 400, message: error.message, data: null })
  }
})

/**
 * 删除询价（仅待报价状态）
 * DELETE /api/v1/inquiries/:id
 */
router.delete('/:id', requireUserType('OPERATOR'), requirePermission('inquiry:delete'), async (req, res) => {
  try {
    const inquiry = await loadInquiryWithAccessCheck(req.params.id, req, res)
    if (!inquiry) return
    if (inquiry.status !== INQUIRY_STATUS.PENDING_QUOTE) {
      return res.status(400).json({ code: 400, message: '仅待报价状态的询价可以删除', data: null })
    }
    // inquiry_cargo_items 有 ON DELETE CASCADE，明细行会跟着删掉
    await query(`DELETE FROM inquiries WHERE id = $1`, [req.params.id])
    res.json({ code: 200, message: '询价已删除', data: null })
  } catch (error) {
    console.error('删除询价失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

// ==================== 内部工具 ====================

/** UUID 粗校验：拿非 UUID 去查 uuid 列会直接抛库错，变成 500 而不是 400 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 批量导入归到哪个客户
 *
 * 门户账号一律取 JWT 里的绑定，忽略前端传参（踩坑 016）；
 * 运营端必须显式选客户 —— 猜错客户比导入失败严重得多。
 *
 * @returns {string|null} 返回 null 时响应已经写好了
 */
function resolveImportClientId(req, res) {
  const userType = req.user.userType || req.user.roleCode
  if (userType === 'CLIENT') return req.user.linkedEntityId

  const clientId = req.body?.clientId
  if (!clientId) {
    res.status(400).json({ code: 400, message: '请先选择要导入到哪个客户', data: null })
    return null
  }
  if (!UUID_RE.test(String(clientId))) {
    res.status(400).json({ code: 400, message: '客户 clientId 格式不正确', data: null })
    return null
  }
  return String(clientId)
}

/** 预览结果 → 前端要的结构（预览和导入失败共用，两边看到的一模一样） */
function buildPreviewPayload(result, dupWarnings = []) {
  return {
    totalRows: result.totalRows,
    inquiryCount: result.groups.length,
    itemCount: result.groups.reduce((sum, g) => sum + g.cargoItems.length, 0),
    inquiries: result.groups.map((g) => ({
      customerRef: g.customerRef,
      businessType: g.businessType,
      routeFrom: g.routeFrom,
      routeTo: g.routeTo,
      contactName: g.contactName,
      contactPhone: g.contactPhone,
      contactEmail: g.contactEmail,
      itemCount: g.cargoItems.length,
      totalQuantity: g.totalQuantity ?? 0,
      totalWeightKg: g.totalWeightKg ?? 0,
      totalVolumeM3: g.totalVolumeM3 ?? 0,
      totalLdm: g.totalLdm ?? 0,
      rows: g.rowNumbers,
      duplicateOfExisting: g.duplicateOfExisting,
    })),
    errors: result.errors,
    warnings: [...result.warnings, ...dupWarnings],
  }
}

/**
 * 按 id 列表（或当前筛选条件）取询价单，始终带上身份过滤
 */
async function loadInquiriesForExport(req, ids) {
  let sql = `
    SELECT i.*, c.company_name AS client_name
    FROM inquiries i
    LEFT JOIN clients c ON c.id = i.client_id
    WHERE 1=1`
  const params = []

  sql = applyScopeFilter(req, sql, params)
  let idx = params.length

  if (ids && ids.length > 0) {
    params.push(ids)
    sql += ` AND i.id = ANY($${++idx}::uuid[])`
  } else {
    if (req.query.status) { params.push(req.query.status); sql += ` AND i.status = $${++idx}` }
    if (req.query.businessType) { params.push(req.query.businessType); sql += ` AND i.business_type = $${++idx}` }
  }
  sql += ` ORDER BY i.created_at DESC`

  const result = await query(sql, params)
  return result.rows
}

function buildExportHeaderCells(inquiry) {
  const from = inquiryService.parseAddress(inquiry.route_from)
  const to = inquiryService.parseAddress(inquiry.route_to)
  return {
    inquiry_number: inquiry.inquiry_number || '',
    customer_ref: inquiry.customer_ref || '',
    client_name: inquiry.client_name || '',
    business_type: BUSINESS_TYPE_LABELS[inquiry.business_type] || inquiry.business_type || '',
    status: STATUS_LABELS[inquiry.status] || inquiry.status || '',
    from_country: from.country || '',
    from_zip: from.zipCode || '',
    from_city: from.city || '',
    from_address: from.address || '',
    to_country: to.country || '',
    to_zip: to.zipCode || '',
    to_city: to.city || '',
    to_address: to.address || '',
    contact_name: inquiry.contact_name || '',
    contact_phone: inquiry.contact_phone || '',
    contact_email: inquiry.contact_email || '',
  }
}

/** NUMERIC 回来是字符串，写进 Excel 前转成数字，否则单元格是文本没法求和（踩坑 002） */
function numeric(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export default router
