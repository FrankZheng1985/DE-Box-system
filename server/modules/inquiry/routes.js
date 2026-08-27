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
import { resolveLang, normalizeLang, t } from '../../utils/i18n.js'
import inquiryService from './service.js'
import importService from './import-service.js'
import ldImportService from './import-local-delivery.js'
import { TRANSPORT_TYPE_VALUES, VEHICLE_LENGTH_CODES, LOCAL_DELIVERY } from './constants.js'
import { CLIENT_HIDDEN_STATUSES } from '../quotation/service.js'

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

// ==================== 报价时效口径 ====================
//
// 时效 = 询价单创建 → 客户第一次拿到报价，单位「天」。
//
// 「拿到报价」取第一张【非草稿】报价的 created_at：
//   - 草稿是运营还在编的，客户门户「我的报价」页会把 DRAFT 过滤掉根本看不到，
//     算进来等于客户没收到价却显示"已报价 0 天"
//   - 系统没有单独的"发出时间"列（quotations 只有 created_at / updated_at，
//     updated_at 会被后续任何编辑覆盖），所以用非草稿报价的创建时间近似发出时间。
//     实际操作里运营是建完就发，误差在当天以内

/** 第一张非草稿报价的时间，挂 LATERAL 让下面几个表达式都能引用 fq.first_quoted_at */
const FIRST_QUOTE_JOIN = `
      LEFT JOIN LATERAL (
        SELECT MIN(q.created_at) AS first_quoted_at
        FROM quotations q
        WHERE q.inquiry_id = i.id AND q.status <> 'DRAFT'
      ) fq ON TRUE`

/** 建单 → 首次报价，天（小数）。同一天内报价会是 0.x，取整会全变 0 看不出差别 */
const RESPONSE_DAYS_EXPR = `(EXTRACT(EPOCH FROM (fq.first_quoted_at - i.created_at)) / 86400.0)`

/** 还没报价的单已经等了多久，天（小数）。只对仍在等报价的单有意义 */
const WAITING_DAYS_EXPR = `(EXTRACT(EPOCH FROM (NOW() - i.created_at)) / 86400.0)`

/** 只对 PENDING_QUOTE 算等待天数：已取消/已拒绝的单不该继续往上涨 */
const IS_STILL_WAITING = `(fq.first_quoted_at IS NULL AND i.status = '${INQUIRY_STATUS.PENDING_QUOTE}')`

/**
 * 天数保留 1 位小数
 * ::float8 是为了让 pg 直接返回数字 —— NUMERIC 回来是字符串，前端 .toFixed() 会炸（踩坑 002）
 */
function roundDays(expr) {
  return `ROUND((${expr})::numeric, 1)::float8`
}

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

/**
 * 把数据库里的枚举代码译成对应语言的名称
 *
 * t() 查不到 key 时会原样返回 key，那种情况退回数据库里的原始代码，
 * 免得导出的 Excel 里出现 "inquiryStatus.XXX" 这种没人看得懂的字符串。
 *
 * @param {string} section 语言包里的段名，如 'businessType' / 'inquiryStatus'
 * @param {string} code 数据库里的枚举值
 * @param {'zh'|'en'|'de'} lang
 */
function enumLabel(section, code, lang) {
  if (!code) return ''
  const label = t(lang, `${section}.${code}`)
  return label.startsWith(`${section}.`) ? code : label
}

/** 当前登录人是不是客户门户账号 */
function isClientUser(req) {
  return (req.user.userType || req.user.roleCode) === 'CLIENT'
}

/**
 * 客户不可见的报价状态拼进 SQL（草稿是运营还没发出来的价 —— 踩坑 054）
 * @returns {string} 客户身份返回 ` AND <前缀>status <> ALL($n::text[])`，其它身份返回空串
 */
function hideDraftQuotationSql(req, params, columnPrefix = '') {
  if (!isClientUser(req)) return ''
  params.push(CLIENT_HIDDEN_STATUSES)
  return ` AND ${columnPrefix}status <> ALL($${params.length}::text[])`
}

/**
 * 按登录身份强制收窄可见范围，并排除软删除的单
 *
 * ⚠️ 客户只能看自己公司的询价，这个边界必须在后端按 JWT 强制，
 *    不能信任前端传的 clientId（踩坑 016）
 *
 * 软删除过滤放在这里而不是各个 SQL 里手写：列表 / 统计 / 时效 / 导出四处都走这个函数，
 * 以后新加的查询只要照旧调它就自动带上，不会漏掉一处让已删的单又冒出来。
 * 单条详情不走这里，loadInquiryWithAccessCheck 里另有一份。
 */
function applyScopeFilter(req, sql, params) {
  const userType = req.user.userType || req.user.roleCode
  let idx = params.length
  sql += ` AND i.deleted_at IS NULL`
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
  // 主键是 UUID，非 UUID 扔给 pg 会抛类型转换错误、白白变成一个 500（踩坑 067）
  if (!UUID_RE.test(String(inquiryId))) {
    res.status(404).json({ code: 404, message: '询价不存在', data: null })
    return null
  }
  const result = await query(
    `SELECT i.*, c.company_name AS client_name
     FROM inquiries i LEFT JOIN clients c ON c.id = i.client_id
     WHERE i.id = $1 AND i.deleted_at IS NULL`,
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
    // 占位符要按它在 SQL 里出现的先后顺序入参：这一条在 SELECT 子查询里，
    // 排在所有 WHERE 条件之前，所以必须最先 push
    const params = []
    const hideDraftInCount = hideDraftQuotationSql(req, params, 'q.')
    let sql = `
      SELECT i.*, c.company_name AS client_name,
             (SELECT COUNT(*) FROM inquiry_cargo_items ci WHERE ci.inquiry_id = i.id)::int AS item_count,
             (SELECT COUNT(*) FROM quotations q
               WHERE q.inquiry_id = i.id${hideDraftInCount})::int AS quotation_count,
             fq.first_quoted_at,
             ${roundDays(RESPONSE_DAYS_EXPR)} AS quote_response_days,
             CASE WHEN ${IS_STILL_WAITING} THEN ${roundDays(WAITING_DAYS_EXPR)} END AS quote_waiting_days
      FROM inquiries i
      LEFT JOIN clients c ON c.id = i.client_id${FIRST_QUOTE_JOIN}
      WHERE 1=1`

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
 * 报价时效统计
 * GET /api/v1/inquiries/quote-sla
 *
 * 客户门户询价页顶部那排卡片的数据源。口径见文件上方「报价时效口径」。
 * 客户看到的只会是自己公司的单 —— applyScopeFilter 按 JWT 强制收窄（踩坑 016）。
 *
 * ⚠️ 必须注册在 /:id 之前（踩坑 001）
 */
router.get('/quote-sla', requirePermission('inquiry:view', 'portal:inquiry_manage'), async (req, res) => {
  try {
    let sql = `
      SELECT
        COUNT(*)::int                          AS total,
        COUNT(fq.first_quoted_at)::int         AS quoted_count,
        COUNT(*) FILTER (WHERE ${IS_STILL_WAITING})::int AS pending_count,
        ${roundDays(`AVG(${RESPONSE_DAYS_EXPR})`)} AS avg_days,
        ${roundDays(`MIN(${RESPONSE_DAYS_EXPR})`)} AS fastest_days,
        ${roundDays(`MAX(${RESPONSE_DAYS_EXPR})`)} AS slowest_days,
        ${roundDays(`MAX(${WAITING_DAYS_EXPR}) FILTER (WHERE ${IS_STILL_WAITING})`)} AS pending_max_wait_days
      FROM inquiries i${FIRST_QUOTE_JOIN}
      WHERE 1=1`
    const params = []
    sql = applyScopeFilter(req, sql, params)

    const result = await query(sql, params)
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    console.error('获取报价时效统计失败:', error)
    res.status(500).json({ code: 500, message: '获取报价时效统计失败', data: null })
  }
})

/**
 * 发给服务商的成品（复制摘要、导出 Excel）用哪种语言
 *
 * 这些东西是直接转给欧洲服务商的，不是给操作员看的界面，所以**默认英文**，
 * 不跟 Accept-Language（那是操作员的界面语言，多半是中文）走。
 * 需要中文/德文时前端显式传 ?lang=zh / ?lang=de。
 *
 * ⚠️ 不要拿它去渲染"导入模板"和导入报错——那两样是给操作员/客户自己看的，
 * 仍然该跟界面语言走，用 resolveLang()。
 */
function resolveCarrierDocLang(req) {
  return normalizeLang(req.query?.lang) || 'en'
}

/**
 * 批量复制摘要（需求 5.4）
 * POST /api/v1/inquiries/summary?lang=en   body: { ids: [...] }
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

    const summaryLang = resolveCarrierDocLang(req)
    const blocks = []
    for (const inquiry of rows) {
      const [items, deliveryOrders] = await Promise.all([
        inquiryService.getCargoItems(inquiry.id),
        inquiryService.getDeliveryOrders(inquiry.id),
      ])
      blocks.push(inquiryService.buildSummaryText(inquiry, items, summaryLang, deliveryOrders))
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
 * GET /api/v1/inquiries/export?ids=a,b,c&lang=en  不传 ids 则按当前筛选条件导出
 *
 * 一行一件货，表头字段在每行重复，方便服务商直接筛选排序。
 */
router.get('/export', requireUserType('OPERATOR'), requirePermission('inquiry:export'), async (req, res) => {
  // 这份 Excel 和复制摘要一样是转给服务商的，所以默认英文，不跟界面语言走
  const lang = resolveCarrierDocLang(req)
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
      { header: t(lang, 'excel.transportType'), key: 'transport_type', width: 12 },
      { header: t(lang, 'excel.vehicleLength'), key: 'vehicle_length', width: 14 },
      { header: t(lang, 'excel.status'), key: 'status', width: 10 },
      { header: t(lang, 'excel.fromCountry'), key: 'from_country', width: 10 },
      { header: t(lang, 'excel.fromZip'), key: 'from_zip', width: 10 },
      { header: t(lang, 'excel.fromCity'), key: 'from_city', width: 14 },
      { header: t(lang, 'excel.fromAddress'), key: 'from_address', width: 26 },
      // 发件人联系方式紧跟取件地址，收件人的紧跟派送地址 —— 两侧对称，不混成一组
      { header: t(lang, 'excel.senderContactName'), key: 'from_contact_name', width: 12 },
      { header: t(lang, 'excel.senderPhone'), key: 'from_contact_phone', width: 18 },
      { header: t(lang, 'excel.senderEmail'), key: 'from_contact_email', width: 24 },
      { header: t(lang, 'excel.toCountry'), key: 'to_country', width: 10 },
      { header: t(lang, 'excel.toZip'), key: 'to_zip', width: 10 },
      { header: t(lang, 'excel.toCity'), key: 'to_city', width: 14 },
      { header: t(lang, 'excel.toAddress'), key: 'to_address', width: 26 },
      { header: t(lang, 'excel.receiverContactName'), key: 'contact_name', width: 12 },
      { header: t(lang, 'excel.receiverPhone'), key: 'contact_phone', width: 18 },
      { header: t(lang, 'excel.receiverEmail'), key: 'contact_email', width: 24 },
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
      const base = buildExportHeaderCells(inquiry, lang)

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
      // 本地派送是「柜 → 子订单 → 件」三层，模板和其余两种服务完全不同（开发意见 #7）
      const localDelivery = isLocalDeliveryImport(req)
      const workbook = localDelivery
        ? ldImportService.buildTemplateWorkbook(lang)
        : importService.buildTemplateWorkbook(lang)
      const prefix = localDelivery ? 'local_delivery_import_template' : 'inquiry_import_template'
      const filename = `${prefix}_${new Date().toISOString().slice(0, 10)}.xlsx`
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

      if (isLocalDeliveryImport(req)) {
        const ldResult = await ldImportService.analyzeImportFile(req.file.buffer, lang)
        const ldDup = await ldImportService.markExistingContainers(
          { query }, clientId, ldResult.groups, lang
        )
        return res.json({
          code: 200,
          message: 'success',
          data: buildLocalDeliveryPreviewPayload(ldResult, ldDup),
        })
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

      // 本地派送走三层那套解析和落库，其余不变
      const localDelivery = isLocalDeliveryImport(req)
      const svc = localDelivery ? ldImportService : importService
      const result = await svc.analyzeImportFile(req.file.buffer, lang)
      const dupWarnings = localDelivery
        ? await ldImportService.markExistingContainers({ query }, clientId, result.groups, lang)
        : await importService.markExistingCustomerRefs({ query }, clientId, result.groups, lang)
      const payload = localDelivery
        ? buildLocalDeliveryPreviewPayload(result, dupWarnings)
        : buildPreviewPayload(result, dupWarnings)

      if (result.errors.length > 0 || result.groups.length === 0) {
        return res.status(400).json({
          code: 400,
          message: '导入文件有错误，请修正后重试',
          data: payload,
        })
      }

      const created = await withTransaction(async (client) =>
        svc.createInquiriesFromGroups(client, result.groups, {
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

    // 询价详情会把这张询价开出的报价一并带上，草稿同样要挡掉（踩坑 054）
    const quotationParams = [inquiry.id]
    const hideDraft = hideDraftQuotationSql(req, quotationParams)

    // 本地派送的件明细挂在子订单下，deliveryOrders 里已经带着各自的 cargoItems；
    // 顶层 cargoItems 对它是空数组，前端按 deliveryOrders 是否为空决定用哪套渲染
    const [items, deliveryOrders, quotations] = await Promise.all([
      inquiryService.getCargoItems(inquiry.id),
      inquiryService.getDeliveryOrders(inquiry.id),
      query(
        `SELECT id, quotation_number, version, total_price, currency, status, valid_until, created_at
         FROM quotations WHERE inquiry_id = $1${hideDraft} ORDER BY version DESC, created_at DESC`,
        quotationParams
      ),
    ])

    res.json({
      code: 200, message: 'success',
      data: {
        ...inquiry,
        // 三层结构下顶层不重复给一遍件明细，否则前端两处渲染同一批货、合计翻倍
        cargoItems: deliveryOrders.length > 0 ? [] : items,
        deliveryOrders,
        quotations: quotations.rows,
      },
    })
  } catch (error) {
    console.error('获取询价详情失败:', error)
    res.status(500).json({ code: 500, message: '获取询价详情失败', data: null })
  }
})

/**
 * 单张询价的复制摘要
 * GET /api/v1/inquiries/:id/summary?lang=en
 */
router.get('/:id/summary', requireUserType('OPERATOR'), requirePermission('inquiry:export'), async (req, res) => {
  try {
    const inquiry = await loadInquiryWithAccessCheck(req.params.id, req, res)
    if (!inquiry) return

    const [items, deliveryOrders] = await Promise.all([
      inquiryService.getCargoItems(inquiry.id),
      inquiryService.getDeliveryOrders(inquiry.id),
    ])
    res.json({
      code: 200, message: 'success',
      data: {
        text: inquiryService.buildSummaryText(
          inquiry, items, resolveCarrierDocLang(req), deliveryOrders
        ),
      },
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
    const enumError = validateTransportEnums(req.body)
    if (enumError) {
      return res.status(400).json({ code: 400, message: enumError, data: null })
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
    const enumError = validateTransportEnums(req.body)
    if (enumError) {
      return res.status(400).json({ code: 400, message: enumError, data: null })
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
        vehicleLengthCode: 'vehicle_length_code',
        containerNo: 'container_no',
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
      // 改成拼车（或本地派送）时，原来的车型必须一起清掉，
      // 否则库里会留下「拼车 + 13.6m 专车」这种自相矛盾的数据（建单时同样只在 FTL 下存）
      if (req.body.transportType !== undefined && req.body.transportType !== 'FTL'
          && req.body.vehicleLengthCode === undefined) {
        params.push(null)
        setClauses.push(`vehicle_length_code = $${++idx}`)
      }
      if (req.body.routeFrom) { params.push(JSON.stringify(req.body.routeFrom)); setClauses.push(`route_from = $${++idx}`) }
      if (req.body.routeTo) { params.push(JSON.stringify(req.body.routeTo)); setClauses.push(`route_to = $${++idx}`) }

      if (setClauses.length > 0) {
        params.push(req.params.id)
        setClauses.push('updated_at = NOW()')
        await client.query(`UPDATE inquiries SET ${setClauses.join(', ')} WHERE id = $${++idx}`, params)
      }

      // deliveryOrders / cargoItems 传了才整单替换；没传保持原样
      //（区分"清空明细"和"这次没改明细"）
      if (Array.isArray(req.body.deliveryOrders)) {
        await inquiryService.replaceDeliveryOrders(client, req.params.id, req.body.deliveryOrders)
      } else if (Array.isArray(req.body.cargoItems)) {
        // ⚠️ 三层结构的单只能整体用 deliveryOrders 更新：
        // replaceCargoItems 会把这张单的件明细全删再插一批不属于任何子订单的行，
        // 子订单会当场变成空壳且不报错 —— 与其静默毁数据，不如让这次保存失败
        const existing = await client.query(
          `SELECT COUNT(*)::int AS c FROM inquiry_delivery_orders WHERE inquiry_id = $1`,
          [req.params.id]
        )
        if (existing.rows[0].c > 0) {
          throw new Error('这张询价单有派送子订单，请用 deliveryOrders 整体提交，不能只传 cargoItems')
        }
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
 * 删除询价（软删除，仅待报价且尚无任何报价的单）
 * DELETE /api/v1/inquiries/:id
 *
 * 客户门户也能调（开发意见 #2）：批量导入时数据填错，客户要能自己把错单清掉，
 * 不用每次找运营。租户边界由 loadInquiryWithAccessCheck 按 JWT 校验（踩坑 016）。
 *
 * 两道守卫：
 *   1. 状态必须是 PENDING_QUOTE —— 已报价/已接受的单属于业务凭证链，只能走取消
 *   2. 运营还没在这张单上动过手 —— 「PENDING_QUOTE」不等于没人管：
 *      自 536bd5c 起建草稿不再推进询价状态，运营可能正编着草稿报价；
 *      发给服务商的询价（carrier_inquiries）也不改询价状态，邮件可能已经发出去了。
 *      这两种情况下删掉询价，下游就会挂着查不到上游的孤儿记录。
 *
 * 有了这道守卫，quotations / carrier_inquiries 的查询就不必再各自过滤已删询价 ——
 * 它们的外键永远指不到一张被删的单。
 *
 * 软删除而非物理删：删完还要能追溯谁在什么时候删了哪张单（迁移 127）。
 */
router.delete('/:id',
  requireUserType('OPERATOR', 'CLIENT'),
  requirePermission('inquiry:delete', 'portal:inquiry_manage'),
  async (req, res) => {
    try {
      const inquiry = await loadInquiryWithAccessCheck(req.params.id, req, res)
      if (!inquiry) return
      if (inquiry.status !== INQUIRY_STATUS.PENDING_QUOTE) {
        return res.status(400).json({ code: 400, message: '仅待报价状态的询价可以删除', data: null })
      }

      // 草稿报价也算：客户看不到草稿，但运营已经在这张单上干活了
      const inProgress = await query(
        `SELECT
           (SELECT COUNT(*) FROM quotations       WHERE inquiry_id = $1)::int AS quotation_count,
           (SELECT COUNT(*) FROM carrier_inquiries WHERE inquiry_id = $1)::int AS carrier_inquiry_count`,
        [req.params.id]
      )
      const { quotation_count, carrier_inquiry_count } = inProgress.rows[0]
      if (quotation_count > 0 || carrier_inquiry_count > 0) {
        return res.status(400).json({ code: 400, message: '该询价已在报价处理中，无法删除，请联系客服', data: null })
      }

      // 软删除：明细行 inquiry_cargo_items 原样留着，跟着主表一起被查询过滤掉
      await query(
        `UPDATE inquiries SET deleted_at = NOW(), deleted_by = $1, updated_at = NOW() WHERE id = $2`,
        [req.user.id, req.params.id]
      )
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
 * 本地派送导入的预览载荷（三层，开发意见 #7）
 *
 * 和两层那份分开写而不是加 if：字段口径整个不一样
 *（一行是一个柜、里面还有一层子订单），混在一起前端要猜自己拿到的是哪种。
 */
function buildLocalDeliveryPreviewPayload(result, dupWarnings = []) {
  return {
    businessType: LOCAL_DELIVERY,
    totalRows: result.totalRows,
    inquiryCount: result.groups.length,
    itemCount: result.groups.reduce(
      (sum, g) => sum + g.deliveryOrders.reduce((s, o) => s + o.cargoItems.length, 0), 0
    ),
    inquiries: result.groups.map((g) => ({
      containerNo: g.containerNo,
      customerRef: g.customerRef,
      routeFrom: g.routeFrom,
      orderCount: g.orderCount ?? g.deliveryOrders.length,
      itemCount: g.deliveryOrders.reduce((s, o) => s + o.cargoItems.length, 0),
      totalQuantity: g.totalQuantity ?? 0,
      totalWeightKg: g.totalWeightKg ?? 0,
      totalVolumeM3: g.totalVolumeM3 ?? 0,
      totalLdm: g.totalLdm ?? 0,
      rows: g.rowNumbers,
      duplicateOfExisting: g.duplicateOfExisting,
      deliveryOrders: g.deliveryOrders.map((o) => ({
        subRef: o.subRef,
        deliveryAddress: o.deliveryAddress,
        remarks: o.remarks,
        itemCount: o.cargoItems.length,
        totalQuantity: o.totalQuantity ?? 0,
        totalWeightKg: o.totalWeightKg ?? 0,
        totalLdm: o.totalLdm ?? 0,
      })),
    })),
    errors: result.errors,
    warnings: [...result.warnings, ...dupWarnings],
  }
}

/**
 * 这次导入走哪套解析
 *
 * 客户在界面上先选服务类型再上传（开发意见 #7 的前半句），
 * 选了本地派送就走三层那套，其余（含没传）一律走原来的两层，
 * 这样存量的模板和调用方一个字都不用改。
 */
function isLocalDeliveryImport(req) {
  const value = req.body?.businessType || req.query?.businessType
  return String(value || '').toUpperCase() === LOCAL_DELIVERY
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

/**
 * 校验「专车/拼车」和「车型」两个枚举（建单和编辑共用）
 *
 * 只校验**显式传了**的字段：编辑接口是增量更新，没传 ≠ 传了空值。
 * 空串和 null 都当"清空"放行，不然客户想把车型改回"不指定"就改不了。
 *
 * @returns {string|null} 错误消息；null 表示通过
 */
function validateTransportEnums(body) {
  if (body.transportType !== undefined && body.transportType !== null && body.transportType !== '') {
    if (!TRANSPORT_TYPE_VALUES.includes(body.transportType)) {
      return `无效的运输方式，允许值：${TRANSPORT_TYPE_VALUES.join(' / ')}`
    }
  }
  if (body.vehicleLengthCode !== undefined && body.vehicleLengthCode !== null && body.vehicleLengthCode !== '') {
    if (!VEHICLE_LENGTH_CODES.includes(body.vehicleLengthCode)) {
      return `无效的车型，允许值：${VEHICLE_LENGTH_CODES.join(' / ')}`
    }
  }
  return null
}

function buildExportHeaderCells(inquiry, lang = 'en') {
  const from = inquiryService.parseAddress(inquiry.route_from)
  const to = inquiryService.parseAddress(inquiry.route_to)
  return {
    inquiry_number: inquiry.inquiry_number || '',
    customer_ref: inquiry.customer_ref || '',
    client_name: inquiry.client_name || '',
    business_type: enumLabel('businessType', inquiry.business_type, lang),
    transport_type: inquiry.transport_type
      ? enumLabel('transportType', inquiry.transport_type, lang) : '',
    vehicle_length: inquiry.vehicle_length_code
      ? enumLabel('vehicleLength', inquiry.vehicle_length_code, lang) : '',
    status: enumLabel('inquiryStatus', inquiry.status, lang),
    from_country: from.country || '',
    from_zip: from.zipCode || '',
    from_city: from.city || '',
    from_address: from.address || '',
    from_contact_name: from.contactName || '',
    from_contact_phone: from.contactPhone || '',
    from_contact_email: from.contactEmail || '',
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
