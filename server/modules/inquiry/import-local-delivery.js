/**
 * 本地派送的批量导入（Excel）——「柜 → 派送子订单 → 件」三层（开发意见 #7）
 *
 * 和 import-service.js 的区别是**分组是两级的**：
 *   一行 = 一件货；先按「柜号」分成询价单，柜内再按「子单号」分成派送子订单。
 * 所以同一个柜的几十票货写在一张表里，取件地址和柜号只需要在第一行填一次。
 *
 * 单独成文件而不是塞进 import-service.js：那份已经 760 行，
 * 两套分组逻辑混在一起谁也读不懂，而且它们除了取值工具外没有共用逻辑。
 *
 * 表头字段（柜级 / 子订单级）都取该组**第一行**的值，后续行填得不一样只给警告不阻断
 * —— 客户常把同一个柜、同一票的信息只写在第一行。
 */

import ExcelJS from 'exceljs'
import { t } from '../../utils/i18n.js'
import { calcUnitVolumeM3, calcLineLdm, createInquiryRecord } from './service.js'
import { LOCAL_DELIVERY } from './constants.js'

/** 单次导入的上限。一个柜几十票、每票几件，500 行够用，再多多半是填错了 */
export const MAX_DATA_ROWS = 500
/** 一次最多导几个柜 */
export const MAX_CONTAINERS = 20
export const MAX_FILE_SIZE = 5 * 1024 * 1024

/**
 * 模板列定义（顺序即模板里的列顺序）
 *
 * scope: 'container' = 柜级，取该柜第一行；'order' = 子订单级，取该子订单第一行；
 *        'item' = 逐行的件明细
 */
export const LOCAL_DELIVERY_COLUMNS = [
  // ---- 柜级 ----
  { field: 'containerNo', labelKey: 'excel.containerNo', width: 18, scope: 'container', required: true },
  { field: 'customerRef', labelKey: 'excel.customerRef', width: 16, scope: 'container' },
  { field: 'fromCountry', labelKey: 'excel.fromCountry', width: 12, scope: 'container' },
  { field: 'fromZip', labelKey: 'excel.fromZip', width: 12, scope: 'container' },
  { field: 'fromCity', labelKey: 'excel.fromCity', width: 14, scope: 'container' },
  { field: 'fromAddress', labelKey: 'excel.fromAddress', width: 24, scope: 'container' },
  { field: 'fromContactName', labelKey: 'excel.senderContactName', width: 14, scope: 'container' },
  { field: 'fromContactPhone', labelKey: 'excel.senderPhone', width: 16, scope: 'container' },
  { field: 'fromContactEmail', labelKey: 'excel.senderEmail', width: 22, scope: 'container' },
  // ---- 子订单级 ----
  { field: 'subRef', labelKey: 'excel.subOrderRef', width: 16, scope: 'order', required: true },
  { field: 'toCompanyName', labelKey: 'excel.toCompanyName', width: 20, scope: 'order' },
  { field: 'toCountry', labelKey: 'excel.toCountry', width: 12, scope: 'order' },
  { field: 'toZip', labelKey: 'excel.toZip', width: 12, scope: 'order' },
  { field: 'toCity', labelKey: 'excel.toCity', width: 14, scope: 'order' },
  { field: 'toAddress', labelKey: 'excel.toAddress', width: 24, scope: 'order' },
  { field: 'toContactName', labelKey: 'excel.receiverContactName', width: 14, scope: 'order' },
  { field: 'toContactPhone', labelKey: 'excel.receiverPhone', width: 16, scope: 'order' },
  { field: 'toContactEmail', labelKey: 'excel.receiverEmail', width: 22, scope: 'order' },
  { field: 'orderRemarks', labelKey: 'excel.subOrderRemarks', width: 20, scope: 'order' },
  // ---- 件级 ----
  { field: 'referenceNo', labelKey: 'excel.itemNo', width: 14, scope: 'item' },
  { field: 'description', labelKey: 'excel.cargoDescription', width: 20, scope: 'item' },
  { field: 'quantity', labelKey: 'excel.quantity', width: 10, scope: 'item', numeric: true },
  { field: 'lengthCm', labelKey: 'excel.lengthCm', width: 10, scope: 'item', numeric: true },
  { field: 'widthCm', labelKey: 'excel.widthCm', width: 10, scope: 'item', numeric: true },
  { field: 'heightCm', labelKey: 'excel.heightCm', width: 10, scope: 'item', numeric: true },
  { field: 'unitWeightKg', labelKey: 'excel.unitWeightKg', width: 14, scope: 'item', numeric: true },
  { field: 'remarks', labelKey: 'excel.remarks', width: 18, scope: 'item' },
]

/** 客户改过表头、或用别的叫法时也认 */
const EXTRA_HEADER_ALIASES = {
  柜号: 'containerNo',
  箱号: 'containerNo',
  containerno: 'containerNo',
  container: 'containerNo',
  子单号: 'subRef',
  子订单号: 'subRef',
  订单号: 'subRef',
  派送单号: 'subRef',
  公司名: 'toCompanyName',
  收货公司: 'toCompanyName',
  派送国家: 'toCountry',
  派送邮编: 'toZip',
  派送城市: 'toCity',
  派送地址: 'toAddress',
  收件人: 'toContactName',
  收货联系人: 'toContactName',
  收件电话: 'toContactPhone',
  收件邮箱: 'toContactEmail',
  取件国家: 'fromCountry',
  取件邮编: 'fromZip',
  取件城市: 'fromCity',
  取件地址: 'fromAddress',
  发货联系人: 'fromContactName',
  发件人: 'fromContactName',
  发货电话: 'fromContactPhone',
  发货邮箱: 'fromContactEmail',
  品名: 'description',
  数量: 'quantity',
  单件重量kg: 'unitWeightKg',
  单件重kg: 'unitWeightKg',
}

// ==================== 模板 ====================

/**
 * 生成本地派送导入模板
 *
 * 两个 sheet：数据页（只有表头，不放示例行，否则客户会连着一起导进来）
 * + 填写说明页（规则 + 一份可以照抄的示例）。
 *
 * @param {'zh'|'en'|'de'} lang
 */
export function buildTemplateWorkbook(lang) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(t(lang, 'excel.sheetImportTemplate'))

  sheet.columns = LOCAL_DELIVERY_COLUMNS.map((col) => ({
    header: col.required ? `${t(lang, col.labelKey)} *` : t(lang, col.labelKey),
    key: col.field,
    width: col.width,
  }))
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).alignment = { vertical: 'middle' }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  buildGuideSheet(workbook, lang)
  return workbook
}

function buildGuideSheet(workbook, lang) {
  const guide = workbook.addWorksheet(t(lang, 'excel.importGuideSheet'))
  guide.columns = [{ width: 4 }, { width: 110 }]

  const title = guide.getCell('B1')
  title.value = t(lang, 'excel.ldImportGuideTitle')
  title.font = { bold: true, size: 12 }

  const rules = [
    'excel.ldRuleGrouping',
    'excel.ldRuleHeaderFirstRow',
    'excel.ldRuleRequired',
    'excel.ldRuleAutoCalc',
    'excel.ldRuleLimit',
    'excel.importRulePreview',
  ]
  rules.forEach((key, i) => {
    const cell = guide.getCell(`B${i + 3}`)
    cell.value = `${i + 1}. ${t(lang, key, { maxRows: MAX_DATA_ROWS, maxContainers: MAX_CONTAINERS })}`
    cell.alignment = { wrapText: true, vertical: 'top' }
  })

  const exampleTitle = guide.getCell(`B${rules.length + 4}`)
  exampleTitle.value = t(lang, 'excel.importExampleTitle')
  exampleTitle.font = { bold: true }

  // 示例：同一个柜（TEMU1234567）下两票货，第一票两件、第二票一件
  const sample = workbook.addWorksheet(t(lang, 'excel.importExampleSheet'))
  sample.columns = LOCAL_DELIVERY_COLUMNS.map((col) => ({
    header: col.required ? `${t(lang, col.labelKey)} *` : t(lang, col.labelKey),
    key: col.field,
    width: col.width,
  }))
  sample.getRow(1).font = { bold: true }
  sample.addRow({
    containerNo: 'TEMU1234567', customerRef: 'ABC-0001',
    fromCountry: 'DE', fromZip: '40472', fromCity: 'Düsseldorf', fromAddress: 'Niederbeckstr. 35',
    fromContactName: 'Erika Musterfrau', fromContactPhone: '+49 211 7654321', fromContactEmail: 'erika@example.com',
    subRef: 'SUB-001', toCompanyName: 'Muster GmbH',
    toCountry: 'DE', toZip: '50667', toCity: 'Köln', toAddress: 'Domstr. 1',
    toContactName: 'Herr Klein', toContactPhone: '+49 221 1234567', toContactEmail: 'klein@example.com',
    referenceNo: 'PKG-001', description: t(lang, 'excel.importExampleGoodsA'),
    quantity: 2, lengthCm: 120, widthCm: 80, heightCm: 100, unitWeightKg: 50,
  })
  // 同一票的第二件：柜级和子订单级都不用再填
  sample.addRow({
    referenceNo: 'PKG-002', description: t(lang, 'excel.importExampleGoodsB'),
    containerNo: 'TEMU1234567', subRef: 'SUB-001',
    quantity: 1, lengthCm: 100, widthCm: 80, heightCm: 80, unitWeightKg: 30,
  })
  // 同一个柜的第二票：柜级不用再填，子订单级要填
  sample.addRow({
    containerNo: 'TEMU1234567',
    subRef: 'SUB-002', toCompanyName: 'Beispiel AG',
    toCountry: 'DE', toZip: '60311', toCity: 'Frankfurt', toAddress: 'Zeil 5',
    toContactName: 'Frau Groß', toContactPhone: '+49 69 1234567',
    referenceNo: 'PKG-003', description: t(lang, 'excel.importExampleGoodsC'),
    quantity: 3, lengthCm: 120, widthCm: 100, heightCm: 90, unitWeightKg: 40,
  })
}

// ==================== 解析 ====================

/**
 * 解析并校验上传的本地派送 Excel
 *
 * 只做解析校验，一个字都不写库 —— 预览和正式导入调的是同一个函数，
 * 保证「预览看到什么，导入进去就是什么」。
 *
 * @param {Buffer} buffer
 * @param {'zh'|'en'|'de'} lang
 * @returns {Promise<{groups: Array, errors: Array, warnings: Array, totalRows: number}>}
 */
export async function analyzeImportFile(buffer, lang) {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch {
    return fatal(t(lang, 'excel.importErrUnreadable'))
  }

  const sheet = workbook.worksheets[0]
  if (!sheet) return fatal(t(lang, 'excel.importErrNoSheet'))

  const fieldByColumn = mapHeaderColumns(sheet.getRow(1))
  const missing = LOCAL_DELIVERY_COLUMNS
    .filter((c) => c.required && !Object.values(fieldByColumn).includes(c.field))
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
    if (!hasAnyValue) return
    rows.push({ rowNumber, raw })
  })

  if (rows.length === 0) return fatal(t(lang, 'excel.importErrNoData'))
  if (rows.length > MAX_DATA_ROWS) {
    return fatal(t(lang, 'excel.importErrTooManyRows', { max: MAX_DATA_ROWS, actual: rows.length }))
  }

  // ---- 两级分组：柜号 → 子单号 ----
  const containerMap = new Map()

  for (const { rowNumber, raw } of rows) {
    const containerNo = (raw.containerNo || '').trim()
    if (!containerNo) {
      errors.push(rowError(rowNumber, lang, 'excel.containerNo', 'excel.importErrRequired'))
      continue
    }
    const subRef = (raw.subRef || '').trim()
    if (!subRef) {
      errors.push(rowError(rowNumber, lang, 'excel.subOrderRef', 'excel.importErrRequired'))
      continue
    }

    let container = containerMap.get(containerNo)
    if (!container) {
      container = createContainer(containerNo, rowNumber)
      containerMap.set(containerNo, container)
    }
    container.rowNumbers.push(rowNumber)
    applyContainerFields(container, raw, rowNumber, lang, warnings)

    let order = container.orderMap.get(subRef)
    if (!order) {
      order = createDeliveryOrder(subRef, rowNumber)
      container.orderMap.set(subRef, order)
    }
    order.rowNumbers.push(rowNumber)
    applyOrderFields(order, raw, rowNumber, lang, warnings)

    const item = parseCargoItem(raw, rowNumber, lang, errors)
    if (item) order.cargoItems.push(item)
  }

  if (containerMap.size > MAX_CONTAINERS) {
    return fatal(t(lang, 'excel.ldErrTooManyContainers', {
      max: MAX_CONTAINERS, actual: containerMap.size,
    }))
  }

  // ---- 组级校验 + 汇总 ----
  const groups = [...containerMap.values()]
  for (const container of groups) {
    const firstRow = container.rowNumbers[0]

    if (!container.routeFrom.country && !container.routeFrom.city) {
      errors.push(rowError(firstRow, lang, 'excel.fromCountry', 'excel.importErrRouteFrom'))
    }
    if (container.fromContactEmail && !isEmailLike(container.fromContactEmail)) {
      warnings.push(rowError(firstRow, lang, 'excel.senderEmail', 'excel.importWarnEmail'))
    }

    container.deliveryOrders = [...container.orderMap.values()]
    delete container.orderMap

    for (const order of container.deliveryOrders) {
      const orderRow = order.rowNumbers[0]
      if (!order.deliveryAddress.country && !order.deliveryAddress.city) {
        errors.push(rowError(orderRow, lang, 'excel.toCountry', 'excel.importErrRouteTo'))
      }
      if (order.cargoItems.length === 0) {
        errors.push(rowError(orderRow, lang, 'excel.quantity', 'excel.importErrNoCargo'))
      }
      if (order.deliveryAddress.contactEmail && !isEmailLike(order.deliveryAddress.contactEmail)) {
        warnings.push(rowError(orderRow, lang, 'excel.receiverEmail', 'excel.importWarnEmail'))
      }
      Object.assign(order, summarize(order.cargoItems))
    }

    // 柜级合计 = 各子订单之和，和入库后 recalcInquiryTotals 的口径一致
    Object.assign(container, summarize(container.deliveryOrders.flatMap((o) => o.cargoItems)))
    container.orderCount = container.deliveryOrders.length
  }

  return { groups, errors, warnings, totalRows: rows.length }
}

/**
 * 标出哪些柜号在库里已经有询价单（重复导入的主要症状）
 * 只警告不阻断 —— 同一个柜再询一次是正常业务，但点两次导入按钮也是这个症状
 */
export async function markExistingContainers(db, clientId, groups, lang) {
  const warnings = []
  const numbers = groups.map((g) => g.containerNo).filter(Boolean)
  if (numbers.length === 0) return warnings

  const existing = await db.query(
    `SELECT DISTINCT container_no FROM inquiries
     WHERE client_id = $1 AND container_no = ANY($2::text[]) AND deleted_at IS NULL`,
    [clientId, numbers]
  )
  const hit = new Set(existing.rows.map((r) => r.container_no))
  for (const group of groups) {
    if (hit.has(group.containerNo)) {
      group.duplicateOfExisting = true
      warnings.push({
        row: group.firstRowNumber,
        column: t(lang, 'excel.containerNo'),
        message: t(lang, 'excel.ldWarnDuplicateContainer', { no: group.containerNo }),
      })
    }
  }
  return warnings
}

/**
 * 把分好组的数据写库：一个柜一张询价单，柜下挂派送子订单
 *
 * ⚠️ 必须在同一个事务里调用：任何一个柜失败就整批回滚，
 *    不允许出现「导入了一半」——客户没法知道该补哪几个柜。
 */
export async function createInquiriesFromGroups(client, groups, { clientId, createdBy }) {
  const created = []
  for (const group of groups) {
    const inquiry = await createInquiryRecord(client, {
      clientId,
      createdBy,
      payload: {
        businessType: LOCAL_DELIVERY,
        // 本地派送没有整车/拼车之分，也没有车型
        transportType: null,
        containerNo: group.containerNo,
        customerRef: group.customerRef || null,
        routeFrom: mergeSenderContact(group),
        // 三层结构下派送地址在各个子订单上，表头的 route_to 留空
        routeTo: {},
        remarks: null,
        deliveryOrders: group.deliveryOrders.map((o) => ({
          customerSubRef: o.subRef,
          deliveryAddress: o.deliveryAddress,
          remarks: o.remarks || null,
          cargoItems: o.cargoItems,
        })),
      },
    })
    created.push({
      id: inquiry.id,
      inquiryNumber: inquiry.inquiry_number,
      containerNo: group.containerNo,
      orderCount: group.deliveryOrders.length,
      itemCount: group.deliveryOrders.reduce((sum, o) => sum + o.cargoItems.length, 0),
    })
  }
  return created
}

// ==================== 内部工具 ====================

function createContainer(containerNo, firstRowNumber) {
  return {
    containerNo,
    customerRef: '',
    routeFrom: { country: '', zipCode: '', city: '', address: '' },
    fromContactName: '',
    fromContactPhone: '',
    fromContactEmail: '',
    orderMap: new Map(),
    deliveryOrders: [],
    rowNumbers: [],
    duplicateOfExisting: false,
    firstRowNumber,
  }
}

function createDeliveryOrder(subRef, firstRowNumber) {
  return {
    subRef,
    deliveryAddress: {
      companyName: '', country: '', zipCode: '', city: '', address: '',
      contactName: '', contactPhone: '', contactEmail: '',
    },
    remarks: '',
    cargoItems: [],
    rowNumbers: [],
    firstRowNumber,
  }
}

/**
 * 表头字段取该组第一个填了值的行；后面的行填了不一样的值只警告
 * 柜级和子订单级共用这一个赋值器
 */
function assignFirstWins(target, key, value, labelKey, rowNumber, lang, warnings) {
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

function applyContainerFields(container, raw, rowNumber, lang, warnings) {
  const a = (target, key, value, labelKey) =>
    assignFirstWins(target, key, value, labelKey, rowNumber, lang, warnings)

  a(container, 'customerRef', raw.customerRef, 'excel.customerRef')
  a(container.routeFrom, 'country', raw.fromCountry, 'excel.fromCountry')
  a(container.routeFrom, 'zipCode', raw.fromZip, 'excel.fromZip')
  a(container.routeFrom, 'city', raw.fromCity, 'excel.fromCity')
  a(container.routeFrom, 'address', raw.fromAddress, 'excel.fromAddress')
  a(container, 'fromContactName', raw.fromContactName, 'excel.senderContactName')
  a(container, 'fromContactPhone', raw.fromContactPhone, 'excel.senderPhone')
  a(container, 'fromContactEmail', raw.fromContactEmail, 'excel.senderEmail')
}

function applyOrderFields(order, raw, rowNumber, lang, warnings) {
  const a = (target, key, value, labelKey) =>
    assignFirstWins(target, key, value, labelKey, rowNumber, lang, warnings)

  a(order.deliveryAddress, 'companyName', raw.toCompanyName, 'excel.toCompanyName')
  a(order.deliveryAddress, 'country', raw.toCountry, 'excel.toCountry')
  a(order.deliveryAddress, 'zipCode', raw.toZip, 'excel.toZip')
  a(order.deliveryAddress, 'city', raw.toCity, 'excel.toCity')
  a(order.deliveryAddress, 'address', raw.toAddress, 'excel.toAddress')
  a(order.deliveryAddress, 'contactName', raw.toContactName, 'excel.receiverContactName')
  a(order.deliveryAddress, 'contactPhone', raw.toContactPhone, 'excel.receiverPhone')
  a(order.deliveryAddress, 'contactEmail', raw.toContactEmail, 'excel.receiverEmail')
  a(order, 'remarks', raw.orderRemarks, 'excel.subOrderRemarks')
}

/**
 * 解析一行件明细
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

/** 预览用的合计（口径和后端 recalcInquiryTotals / recalcDeliveryOrderTotals 一致） */
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

/** 发货联系人并进取件地址（表里没有这几列，当顶层字段传后端不接——踩坑 047） */
function mergeSenderContact(group) {
  const name = (group.fromContactName || '').trim()
  const phone = (group.fromContactPhone || '').trim()
  const email = (group.fromContactEmail || '').trim()
  if (!name && !phone && !email) return group.routeFrom
  return {
    ...group.routeFrom,
    ...(name ? { contactName: name } : {}),
    ...(phone ? { contactPhone: phone } : {}),
    ...(email ? { contactEmail: email } : {}),
  }
}

function isEmailLike(text) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
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
  for (const col of LOCAL_DELIVERY_COLUMNS) {
    dict[normalizeKey(col.field)] = col.field
    for (const lang of ['zh', 'en', 'de']) {
      dict[normalizeKey(t(lang, col.labelKey))] = col.field
    }
  }
  for (const [alias, field] of Object.entries(EXTRA_HEADER_ALIASES)) {
    dict[normalizeKey(alias)] = field
  }
  headerDictionaryCache = dict
  return dict
}

/** 规整成比对用的键：去掉大小写、空格、括号、单位符号等一切非字母数字汉字 */
function normalizeKey(text) {
  return String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * 单元格值转文本
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
 * 德语区习惯用逗号当小数点（"1,5"），千分位又常用点或空格，
 * 所以不能直接 Number()——那样 "1,5" 会变 NaN，"1.500" 会变 1.5。
 */
function parseNumber(text) {
  let s = String(text).trim().replace(/\s/g, '')
  if (s === '') return null

  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '')
  } else if (hasComma) {
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

function fatal(message) {
  return { groups: [], errors: [{ row: null, column: null, message }], warnings: [], totalRows: 0 }
}

export default {
  MAX_DATA_ROWS,
  MAX_CONTAINERS,
  MAX_FILE_SIZE,
  LOCAL_DELIVERY_COLUMNS,
  buildTemplateWorkbook,
  analyzeImportFile,
  markExistingContainers,
  createInquiriesFromGroups,
}
