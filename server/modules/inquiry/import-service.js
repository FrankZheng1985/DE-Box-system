/**
 * 询价批量导入（Excel）
 *
 * 表格约定：**一行 = 一件货**，按「客户单号」列分组 ——
 * 同一个客户单号的多行归为一张询价单的多件明细，不同单号生成多张单。
 * 所以一张表既能录「一票多件」，也能一次导入多票。
 *
 * 表头字段（服务类型 / 起运地 / 目的地 / 联系人）取该组**第一行**的值，
 * 后续行填得不一样只给警告，不阻断 —— 客户常把同一票的地址只写在第一行。
 *
 * 解析和校验全在这里，routes.js 只负责端点、权限和事务。
 */

import ExcelJS from 'exceljs'
import { t } from '../../utils/i18n.js'
import { calcUnitVolumeM3, calcLineLdm, createInquiryRecord } from './service.js'

/** 单次导入的上限，防止一份几万行的表把内存和事务撑爆 */
export const MAX_DATA_ROWS = 500
export const MAX_INQUIRIES = 200
/** 上传文件大小上限（字节） */
export const MAX_FILE_SIZE = 5 * 1024 * 1024

const VALID_BUSINESS_TYPES = ['TRUCK_LTL', 'TRUCK_FTL', 'LOCAL_DELIVERY']

/**
 * 模板列定义（顺序即模板里的列顺序）
 *
 * scope: 'header' = 询价单表头字段，取该组第一行；'item' = 逐行的货物明细字段
 */
export const IMPORT_COLUMNS = [
  { field: 'customerRef', labelKey: 'excel.customerRef', width: 18, scope: 'header', required: true },
  { field: 'businessType', labelKey: 'excel.serviceType', width: 18, scope: 'header', required: true },
  { field: 'fromCountry', labelKey: 'excel.fromCountry', width: 12, scope: 'header' },
  { field: 'fromZip', labelKey: 'excel.fromZip', width: 12, scope: 'header' },
  { field: 'fromCity', labelKey: 'excel.fromCity', width: 14, scope: 'header' },
  { field: 'fromAddress', labelKey: 'excel.fromAddress', width: 26, scope: 'header' },
  { field: 'toCountry', labelKey: 'excel.toCountry', width: 12, scope: 'header' },
  { field: 'toZip', labelKey: 'excel.toZip', width: 12, scope: 'header' },
  { field: 'toCity', labelKey: 'excel.toCity', width: 14, scope: 'header' },
  { field: 'toAddress', labelKey: 'excel.toAddress', width: 26, scope: 'header' },
  { field: 'contactName', labelKey: 'excel.contactName', width: 14, scope: 'header' },
  { field: 'contactPhone', labelKey: 'excel.phone', width: 18, scope: 'header' },
  { field: 'contactEmail', labelKey: 'excel.email', width: 24, scope: 'header' },
  { field: 'referenceNo', labelKey: 'excel.itemNo', width: 16, scope: 'item' },
  { field: 'description', labelKey: 'excel.cargoDescription', width: 22, scope: 'item' },
  { field: 'quantity', labelKey: 'excel.quantity', width: 10, scope: 'item', numeric: true },
  { field: 'lengthCm', labelKey: 'excel.lengthCm', width: 10, scope: 'item', numeric: true },
  { field: 'widthCm', labelKey: 'excel.widthCm', width: 10, scope: 'item', numeric: true },
  { field: 'heightCm', labelKey: 'excel.heightCm', width: 10, scope: 'item', numeric: true },
  { field: 'unitWeightKg', labelKey: 'excel.unitWeightKg', width: 16, scope: 'item', numeric: true },
  { field: 'remarks', labelKey: 'excel.remarks', width: 22, scope: 'item' },
]

/**
 * 表头之外还认的写法（客户自己改过表头、或者用旧表来导）
 * 键是规整后的文本，值是字段名
 */
const EXTRA_HEADER_ALIASES = {
  贵司单号: 'customerRef',
  客户参考号: 'customerRef',
  业务类型: 'businessType',
  运输类型: 'businessType',
  发货国家: 'fromCountry',
  发货邮编: 'fromZip',
  发货城市: 'fromCity',
  发货地址: 'fromAddress',
  收货国家: 'toCountry',
  收货邮编: 'toZip',
  收货城市: 'toCity',
  收货地址: 'toAddress',
  联系电话: 'contactPhone',
  联系邮箱: 'contactEmail',
  货物单号: 'referenceNo',
  件号: 'referenceNo',
  品名: 'description',
  数量: 'quantity',
  单件重量kg: 'unitWeightKg',
  单件重kg: 'unitWeightKg',
}

/**
 * 服务类型的可接受写法 → 标准代码
 * 代码本身、三语界面文案、以及 LTL/FTL 这类口头简称都收
 */
const BUSINESS_TYPE_ALIASES = {
  truckltl: 'TRUCK_LTL',
  ltl: 'TRUCK_LTL',
  卡车派送ltl: 'TRUCK_LTL',
  卡车派送: 'TRUCK_LTL',
  lkwteilladungltl: 'TRUCK_LTL',
  truckftl: 'TRUCK_FTL',
  ftl: 'TRUCK_FTL',
  卡车运输ftl: 'TRUCK_FTL',
  卡车运输: 'TRUCK_FTL',
  lkwkomplettladungftl: 'TRUCK_FTL',
  localdelivery: 'LOCAL_DELIVERY',
  local: 'LOCAL_DELIVERY',
  本地派送: 'LOCAL_DELIVERY',
  nahverkehr: 'LOCAL_DELIVERY',
}

// ==================== 模板 ====================

/**
 * 生成导入模板工作簿
 *
 * 两个 sheet：
 *   1. 数据页 —— **只有表头，不放示例行**。示例行放在数据页里客户十有八九会连着一起导进来。
 *   2. 填写说明 —— 规则 + 示例，看完就知道怎么填。
 *
 * @param {'zh'|'en'|'de'} lang
 * @returns {ExcelJS.Workbook}
 */
export function buildTemplateWorkbook(lang) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(t(lang, 'excel.sheetImportTemplate'))

  sheet.columns = IMPORT_COLUMNS.map((col) => ({
    header: col.required ? `${t(lang, col.labelKey)} *` : t(lang, col.labelKey),
    key: col.field,
    width: col.width,
  }))
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).alignment = { vertical: 'middle' }
  // 冻结表头，往下填几十行也看得见列名
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  // 服务类型列给个下拉，省得客户自己造词
  const btIndex = IMPORT_COLUMNS.findIndex((c) => c.field === 'businessType') + 1
  const btLetter = sheet.getColumn(btIndex).letter
  for (let row = 2; row <= MAX_DATA_ROWS + 1; row++) {
    sheet.getCell(`${btLetter}${row}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${VALID_BUSINESS_TYPES.join(',')}"`],
    }
  }

  buildGuideSheet(workbook, lang)
  return workbook
}

/** 填写说明页：规则 + 一份可以照抄的示例 */
function buildGuideSheet(workbook, lang) {
  const guide = workbook.addWorksheet(t(lang, 'excel.importGuideSheet'))
  guide.columns = [{ width: 4 }, { width: 110 }]

  const title = guide.getCell('B1')
  title.value = t(lang, 'excel.importGuideTitle')
  title.font = { bold: true, size: 12 }

  const rules = [
    'excel.importRuleGrouping',
    'excel.importRuleHeaderFirstRow',
    'excel.importRuleRequired',
    'excel.importRuleBusinessType',
    'excel.importRuleAutoCalc',
    'excel.importRuleLimit',
    'excel.importRulePreview',
  ]
  rules.forEach((key, i) => {
    const cell = guide.getCell(`B${i + 3}`)
    cell.value = `${i + 1}. ${t(lang, key, { maxRows: MAX_DATA_ROWS, maxInquiries: MAX_INQUIRIES })}`
    cell.alignment = { wrapText: true, vertical: 'top' }
  })

  // 示例：前两行同一个客户单号 = 一张单两件货，第三行另一个单号 = 另一张单
  const exampleStart = rules.length + 5
  const exampleTitle = guide.getCell(`B${exampleStart - 1}`)
  exampleTitle.value = t(lang, 'excel.importExampleTitle')
  exampleTitle.font = { bold: true }

  const sample = workbook.addWorksheet(t(lang, 'excel.importExampleSheet'))
  sample.columns = IMPORT_COLUMNS.map((col) => ({
    header: col.required ? `${t(lang, col.labelKey)} *` : t(lang, col.labelKey),
    key: col.field,
    width: col.width,
  }))
  sample.getRow(1).font = { bold: true }
  sample.addRow({
    customerRef: 'ABC-0001', businessType: 'TRUCK_LTL',
    fromCountry: 'DE', fromZip: '44532', fromCity: 'Lünen', fromAddress: 'Industriestr. 1',
    toCountry: 'ES', toZip: '28001', toCity: 'Madrid', toAddress: 'Calle Mayor 3',
    contactName: 'Max Mustermann', contactPhone: '+49 231 1234567', contactEmail: 'max@example.com',
    referenceNo: 'PKG-001', description: t(lang, 'excel.importExampleGoodsA'),
    quantity: 2, lengthCm: 120, widthCm: 80, heightCm: 100, unitWeightKg: 250, remarks: '',
  })
  sample.addRow({
    customerRef: 'ABC-0001',
    referenceNo: 'PKG-002', description: t(lang, 'excel.importExampleGoodsB'),
    quantity: 1, lengthCm: 100, widthCm: 60, heightCm: 80, unitWeightKg: 50, remarks: '',
  })
  sample.addRow({
    customerRef: 'ABC-0002', businessType: 'TRUCK_FTL',
    fromCountry: 'DE', fromZip: '40472', fromCity: 'Düsseldorf', fromAddress: 'Niederbeckstr. 35',
    toCountry: 'PL', toZip: '00-001', toCity: 'Warszawa', toAddress: 'ul. Prosta 5',
    contactName: 'Anna Kowalska', contactPhone: '+48 22 1234567', contactEmail: 'anna@example.com',
    referenceNo: 'PLT-01', description: t(lang, 'excel.importExampleGoodsC'),
    quantity: 10, lengthCm: 120, widthCm: 80, heightCm: 120, unitWeightKg: 300, remarks: '',
  })
}

// ==================== 解析 ====================

/**
 * 解析并校验上传的 Excel
 *
 * 只做解析校验，一个字都不写库 —— 预览和正式导入调的是同一个函数，
 * 保证「预览看到什么，导入进去就是什么」。
 *
 * @param {Buffer} buffer 上传的 xlsx
 * @param {'zh'|'en'|'de'} lang 错误提示语言
 * @returns {Promise<{groups: Array, errors: Array, warnings: Array, totalRows: number}>}
 */
export async function analyzeImportFile(buffer, lang) {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch {
    return fatal(t(lang, 'excel.importErrUnreadable'))
  }

  // 认第一个 sheet；客户另存为时 sheet 名常被改，认名字反而更容易失败
  const sheet = workbook.worksheets[0]
  if (!sheet) return fatal(t(lang, 'excel.importErrNoSheet'))

  const headerRow = sheet.getRow(1)
  const fieldByColumn = mapHeaderColumns(headerRow)

  const missing = IMPORT_COLUMNS.filter((c) => c.required && !Object.values(fieldByColumn).includes(c.field))
  if (missing.length > 0) {
    return fatal(t(lang, 'excel.importErrMissingColumns', {
      columns: missing.map((c) => t(lang, c.labelKey)).join(' / '),
    }))
  }

  const errors = []
  const warnings = []
  const rows = []

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const raw = {}
    let hasAnyValue = false
    for (const [colNumber, field] of Object.entries(fieldByColumn)) {
      const text = cellToString(row.getCell(Number(colNumber)).value)
      raw[field] = text
      if (text !== '') hasAnyValue = true
    }
    if (!hasAnyValue) return // 整行空白直接跳过，表格尾部常有空行
    rows.push({ rowNumber, raw })
  })

  if (rows.length === 0) return fatal(t(lang, 'excel.importErrNoData'))
  if (rows.length > MAX_DATA_ROWS) {
    return fatal(t(lang, 'excel.importErrTooManyRows', { max: MAX_DATA_ROWS, actual: rows.length }))
  }

  // ---- 逐行校验 + 分组 ----
  const groupMap = new Map()

  for (const { rowNumber, raw } of rows) {
    const customerRef = raw.customerRef?.trim() || ''
    if (!customerRef) {
      errors.push(rowError(rowNumber, lang, 'excel.customerRef', 'excel.importErrRequired'))
      continue
    }

    let group = groupMap.get(customerRef)
    if (!group) {
      group = createGroup(customerRef, rowNumber)
      groupMap.set(customerRef, group)
    }
    group.rowNumbers.push(rowNumber)

    applyHeaderFields(group, raw, rowNumber, lang, warnings)

    const item = parseCargoItem(raw, rowNumber, lang, errors)
    if (item) group.cargoItems.push(item)
  }

  if (groupMap.size > MAX_INQUIRIES) {
    return fatal(t(lang, 'excel.importErrTooManyInquiries', { max: MAX_INQUIRIES, actual: groupMap.size }))
  }

  // ---- 组级校验 ----
  const groups = [...groupMap.values()]
  for (const group of groups) {
    const firstRow = group.rowNumbers[0]

    if (!group.businessType) {
      errors.push(rowError(firstRow, lang, 'excel.serviceType', 'excel.importErrRequired'))
    }
    if (!group.routeFrom.country && !group.routeFrom.city) {
      errors.push(rowError(firstRow, lang, 'excel.fromCountry', 'excel.importErrRouteFrom'))
    }
    if (!group.routeTo.country && !group.routeTo.city) {
      errors.push(rowError(firstRow, lang, 'excel.toCountry', 'excel.importErrRouteTo'))
    }
    if (group.cargoItems.length === 0) {
      errors.push(rowError(firstRow, lang, 'excel.quantity', 'excel.importErrNoCargo'))
    }
    if (group.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(group.contactEmail)) {
      warnings.push(rowError(firstRow, lang, 'excel.email', 'excel.importWarnEmail'))
    }

    Object.assign(group, summarize(group.cargoItems))
  }

  return { groups, errors, warnings, totalRows: rows.length }
}

/**
 * 标出哪些客户单号在库里已经有同名询价单（重复导入的主要症状）
 *
 * 只警告不阻断 —— 同一个单号再询一次是正常业务，
 * 但客户点两次导入按钮也是这个症状，所以必须显眼地摆出来。
 *
 * @param {object} db 有 query 方法的连接池
 */
export async function markExistingCustomerRefs(db, clientId, groups, lang) {
  const refs = groups.map((g) => g.customerRef).filter(Boolean)
  if (refs.length === 0) return []

  const result = await db.query(
    `SELECT DISTINCT customer_ref FROM inquiries
     WHERE client_id = $1 AND customer_ref = ANY($2::text[])`,
    [clientId, refs]
  )
  const existing = new Set(result.rows.map((r) => r.customer_ref))

  const warnings = []
  for (const group of groups) {
    if (existing.has(group.customerRef)) {
      group.duplicateOfExisting = true
      warnings.push({
        row: group.rowNumbers[0],
        column: t(lang, 'excel.customerRef'),
        message: t(lang, 'excel.importWarnDuplicate', { ref: group.customerRef }),
      })
    }
  }
  return warnings
}

/**
 * 把分好组的数据写库
 *
 * ⚠️ 必须在同一个事务里调用：任何一张单失败就整批回滚，
 *    不允许出现「导入了一半」——客户没法知道该补哪几张。
 *
 * @returns {Promise<Array<{inquiryNumber: string, customerRef: string, itemCount: number}>>}
 */
export async function createInquiriesFromGroups(client, groups, { clientId, createdBy }) {
  const created = []
  for (const group of groups) {
    const inquiry = await createInquiryRecord(client, {
      clientId,
      createdBy,
      payload: {
        businessType: group.businessType,
        // 和门户单张新建保持一致：本地派送没有运输类型，其余按 LTL 落
        transportType: group.businessType === 'LOCAL_DELIVERY' ? null : 'LTL',
        customerRef: group.customerRef,
        routeFrom: group.routeFrom,
        routeTo: group.routeTo,
        contactName: group.contactName || null,
        contactPhone: group.contactPhone || null,
        contactEmail: group.contactEmail || null,
        cargoDescription: null,
        remarks: group.remarks || null,
        cargoItems: group.cargoItems,
      },
    })
    created.push({
      id: inquiry.id,
      inquiryNumber: inquiry.inquiry_number,
      customerRef: group.customerRef,
      itemCount: group.cargoItems.length,
    })
  }
  return created
}

// ==================== 内部工具 ====================

function createGroup(customerRef, firstRowNumber) {
  return {
    customerRef,
    businessType: null,
    routeFrom: { country: '', zipCode: '', city: '', address: '' },
    routeTo: { country: '', zipCode: '', city: '', address: '' },
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    remarks: '',
    cargoItems: [],
    rowNumbers: [],
    duplicateOfExisting: false,
    firstRowNumber,
  }
}

/**
 * 表头字段取该组第一个填了值的行；后面的行填了不一样的值只警告
 */
function applyHeaderFields(group, raw, rowNumber, lang, warnings) {
  const assign = (target, key, value, labelKey) => {
    const text = (value || '').trim()
    if (!text) return
    if (!target[key]) {
      target[key] = text
    } else if (target[key] !== text) {
      warnings.push({
        row: rowNumber,
        column: t(lang, labelKey),
        message: t(lang, 'excel.importWarnHeaderConflict', { kept: target[key], ignored: text }),
      })
    }
  }

  if (!group.businessType) {
    const code = parseBusinessType(raw.businessType)
    if (code) {
      group.businessType = code
    } else if ((raw.businessType || '').trim()) {
      warnings.push(rowError(rowNumber, lang, 'excel.serviceType', 'excel.importWarnBusinessType'))
    }
  }

  assign(group.routeFrom, 'country', raw.fromCountry, 'excel.fromCountry')
  assign(group.routeFrom, 'zipCode', raw.fromZip, 'excel.fromZip')
  assign(group.routeFrom, 'city', raw.fromCity, 'excel.fromCity')
  assign(group.routeFrom, 'address', raw.fromAddress, 'excel.fromAddress')
  assign(group.routeTo, 'country', raw.toCountry, 'excel.toCountry')
  assign(group.routeTo, 'zipCode', raw.toZip, 'excel.toZip')
  assign(group.routeTo, 'city', raw.toCity, 'excel.toCity')
  assign(group.routeTo, 'address', raw.toAddress, 'excel.toAddress')
  assign(group, 'contactName', raw.contactName, 'excel.contactName')
  assign(group, 'contactPhone', raw.contactPhone, 'excel.phone')
  assign(group, 'contactEmail', raw.contactEmail, 'excel.email')
}

/**
 * 解析一行货物明细
 * @returns {object|null} 该行没有任何货物信息时返回 null（只填了表头字段的行）
 */
function parseCargoItem(raw, rowNumber, lang, errors) {
  const hasCargoInfo = ['referenceNo', 'description', 'quantity', 'lengthCm', 'widthCm', 'heightCm', 'unitWeightKg']
    .some((f) => (raw[f] || '').trim() !== '')
  if (!hasCargoInfo) return null

  let invalid = false
  const num = (field, labelKey) => {
    const text = (raw[field] || '').trim()
    if (text === '') return null
    const value = parseNumber(text)
    if (value === null) {
      errors.push(rowError(rowNumber, lang, labelKey, 'excel.importErrNotNumber', { value: text }))
      invalid = true
      return null
    }
    if (value < 0) {
      errors.push(rowError(rowNumber, lang, labelKey, 'excel.importErrNegative', { value: text }))
      invalid = true
      return null
    }
    return value
  }

  const quantityRaw = (raw.quantity || '').trim()
  let quantity = 1
  if (quantityRaw !== '') {
    const parsed = parseNumber(quantityRaw)
    if (parsed === null || !Number.isInteger(parsed) || parsed < 1) {
      errors.push(rowError(rowNumber, lang, 'excel.quantity', 'excel.importErrQuantity', { value: quantityRaw }))
      invalid = true
    } else {
      quantity = parsed
    }
  }

  const lengthCm = num('lengthCm', 'excel.lengthCm')
  const widthCm = num('widthCm', 'excel.widthCm')
  const heightCm = num('heightCm', 'excel.heightCm')
  const unitWeightKg = num('unitWeightKg', 'excel.unitWeightKg')

  if (invalid) return null

  return {
    referenceNo: (raw.referenceNo || '').trim() || null,
    description: (raw.description || '').trim() || null,
    quantity,
    lengthCm,
    widthCm,
    heightCm,
    unitWeightKg,
    remarks: (raw.remarks || '').trim() || null,
  }
}

/**
 * 预览用的合计（口径和后端 recalcInquiryTotals 一致）
 */
function summarize(items) {
  let quantity = 0
  let weightKg = 0
  let volumeM3 = 0
  let ldm = 0
  for (const it of items) {
    quantity += it.quantity
    if (it.unitWeightKg !== null) weightKg += it.unitWeightKg * it.quantity
    const volume = calcUnitVolumeM3(it.lengthCm, it.widthCm, it.heightCm)
    if (volume !== null) volumeM3 += volume * it.quantity
    const lineLdm = calcLineLdm(it.lengthCm, it.widthCm, it.quantity)
    if (lineLdm !== null) ldm += lineLdm
  }
  return {
    totalQuantity: quantity,
    totalWeightKg: round(weightKg, 2),
    totalVolumeM3: round(volumeM3, 4),
    totalLdm: round(ldm, 2),
  }
}

/** 表头文本 → 字段名，认三种语言的模板表头 + 常见别名 */
function mapHeaderColumns(headerRow) {
  const dictionary = buildHeaderDictionary()
  const fieldByColumn = {}
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = normalizeKey(cellToString(cell.value))
    if (!key) return
    const field = dictionary[key]
    // 同一个字段被认出两次时以第一列为准，避免重复列互相覆盖
    if (field && !Object.values(fieldByColumn).includes(field)) {
      fieldByColumn[colNumber] = field
    }
  })
  return fieldByColumn
}

let headerDictionaryCache = null

function buildHeaderDictionary() {
  if (headerDictionaryCache) return headerDictionaryCache
  const dict = {}
  for (const col of IMPORT_COLUMNS) {
    dict[normalizeKey(col.field)] = col.field
    for (const lang of ['zh', 'en', 'de']) {
      // 模板里必填列表头带 "*"，规整时会被去掉，所以这里不用单独处理
      dict[normalizeKey(t(lang, col.labelKey))] = col.field
    }
  }
  for (const [alias, field] of Object.entries(EXTRA_HEADER_ALIASES)) {
    dict[normalizeKey(alias)] = field
  }
  headerDictionaryCache = dict
  return dict
}

/** 服务类型文本 → 标准代码，认不出来返回 null */
function parseBusinessType(text) {
  const raw = (text || '').trim()
  if (!raw) return null
  const upper = raw.toUpperCase()
  if (VALID_BUSINESS_TYPES.includes(upper)) return upper
  return BUSINESS_TYPE_ALIASES[normalizeKey(raw)] || null
}

/**
 * 规整成比对用的键：去掉大小写、空格、括号、单位符号等一切非字母数字汉字
 * 「长(cm)」「Length (cm)」「Länge (cm)」都能稳定命中
 */
function normalizeKey(text) {
  return String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * 单元格值转文本
 *
 * ExcelJS 的 cell.value 可能是数字/日期/富文本/公式对象，
 * 直接 String() 会得到 "[object Object]"，然后整列静默变成垃圾数据。
 */
function cellToString(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('').trim()
    if (value.text !== undefined) return String(value.text).trim()
    if (value.result !== undefined) return cellToString(value.result)
    if (value.hyperlink !== undefined) return String(value.hyperlink).trim()
  }
  return String(value).trim()
}

/**
 * 文本转数字
 *
 * 德语区习惯用逗号当小数点（"1,5"），千分位又常用点或空格，
 * 所以不能直接 Number()——那样 "1,5" 会变 NaN，"1.500" 会变 1.5。
 */
function parseNumber(text) {
  let s = String(text).trim().replace(/\s/g, '')
  if (s === '') return null

  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    // 两种符号都有：最后出现的那个是小数点，另一个是千分位
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '')
  } else if (hasComma) {
    // 只有逗号：出现多次或后面不是 3 位数就是小数点（"1,5" / "1,25"），否则是千分位（"1,500"）
    const parts = s.split(',')
    s = parts.length > 2 || parts[1].length !== 3 ? s.replace(',', '.') : s.replace(/,/g, '')
  }

  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function round(value, digits) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function rowError(row, lang, labelKey, messageKey, vars) {
  return {
    row,
    column: t(lang, labelKey),
    message: t(lang, messageKey, { field: t(lang, labelKey), ...vars }),
  }
}

/** 整份文件都没法用时的返回（比如缺必需列），不带任何分组 */
function fatal(message) {
  return { groups: [], errors: [{ row: null, column: null, message }], warnings: [], totalRows: 0 }
}

export default {
  MAX_DATA_ROWS,
  MAX_INQUIRIES,
  MAX_FILE_SIZE,
  IMPORT_COLUMNS,
  buildTemplateWorkbook,
  analyzeImportFile,
  markExistingCustomerRefs,
  createInquiriesFromGroups,
}
