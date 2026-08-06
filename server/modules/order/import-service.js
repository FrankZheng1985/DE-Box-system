/**
 * 订单批量导入（Excel）
 *
 * 表格约定：**一行 = 一张订单**。订单没有按件明细子表（货物是 orders 上的
 * 描述/重量/体积/件数四个聚合字段），所以不像询价那样要按客户单号分组。
 *
 * 模板按运输产品分三份 —— 三个产品要填的字段差别很大（集装箱要提单号/柜号/
 * 港口，卡车要装卸地址），混在一张表里空列比填的还多，客户十有八九填错列。
 * 所以下载模板和上传导入都必须带 businessType。
 *
 * 解析和校验全在这里，routes.js 只负责端点、权限和事务。
 */

import ExcelJS from 'exceljs'
import { t } from '../../utils/i18n.js'
import { normalizeKey, cellToString, parseNumber, parseDateString } from '../../utils/excel-cell.js'

/** 单次导入的上限，防止一份几千行的表把内存和事务撑爆 */
export const MAX_DATA_ROWS = 200
/** 上传文件大小上限（字节） */
export const MAX_FILE_SIZE = 5 * 1024 * 1024

export const IMPORT_BUSINESS_TYPES = ['TRUCK_LTL', 'TRUCK_FTL', 'LOCAL_DELIVERY']

// ==================== 列定义 ====================

/**
 * 货物信息（三个产品都有）
 *
 * 集装箱单的货物描述不强制 —— 整柜常常就是一句「一般货物」，
 * 真正的识别靠柜号和提单号。
 */
const CARGO_COLUMNS = [
  { field: 'cargoDescription', labelKey: 'excel.cargoDescription', width: 24, kind: 'text' },
  { field: 'cargoQuantity', labelKey: 'excel.quantity', width: 10, kind: 'int' },
  { field: 'cargoWeightKg', labelKey: 'excel.weightKg', width: 12, kind: 'number' },
  { field: 'cargoVolumeM3', labelKey: 'excel.volumeM3', width: 12, kind: 'number' },
]

const REMARKS_COLUMN = { field: 'remarks', labelKey: 'excel.remarks', width: 24, kind: 'text' }

/** 装卸货地址 + 联系人（卡车派送 LTL / 本地派送） */
const GROUND_ADDRESS_COLUMNS = [
  { field: 'pickupCountry', labelKey: 'excel.pickupCountry', width: 12, kind: 'text', required: true },
  { field: 'pickupZipCode', labelKey: 'excel.pickupZip', width: 12, kind: 'text' },
  { field: 'pickupCity', labelKey: 'excel.pickupCity', width: 14, kind: 'text', required: true },
  { field: 'pickupAddressLine', labelKey: 'excel.pickupAddress', width: 26, kind: 'text' },
  { field: 'pickupContact', labelKey: 'excel.pickupContact', width: 14, kind: 'text' },
  { field: 'pickupPhone', labelKey: 'excel.pickupPhone', width: 18, kind: 'text' },
  { field: 'deliveryCountry', labelKey: 'excel.deliveryCountry', width: 12, kind: 'text', required: true },
  { field: 'deliveryZipCode', labelKey: 'excel.deliveryZip', width: 12, kind: 'text' },
  { field: 'deliveryCity', labelKey: 'excel.deliveryCity', width: 14, kind: 'text', required: true },
  { field: 'deliveryAddressLine', labelKey: 'excel.deliveryAddress', width: 26, kind: 'text' },
  { field: 'deliveryContact', labelKey: 'excel.deliveryContact', width: 14, kind: 'text' },
  { field: 'deliveryPhone', labelKey: 'excel.deliveryPhone', width: 18, kind: 'text' },
]

const GROUND_DATE_COLUMNS = [
  { field: 'pickupDate', labelKey: 'excel.pickupDate', width: 14, kind: 'date' },
  { field: 'deliveryDate', labelKey: 'excel.deliveryDate', width: 14, kind: 'date' },
]

/** special_requirements 是 VARCHAR(50)，超长会被数据库直接拒掉，这里先拦住给出人话提示 */
const SPECIAL_REQUIREMENTS_COLUMN = {
  field: 'specialRequirements', labelKey: 'excel.specialRequirements', width: 20, kind: 'text', maxLength: 50,
}

/**
 * 各运输产品的模板列（顺序即模板里的列顺序）
 *
 * ⚠️ 改这里等于改客户手上的模板：只加列不改已有列的语义，
 *    删列或改字段名会让客户存着的旧模板静默丢数据。
 */
export const IMPORT_COLUMNS_BY_TYPE = {
  TRUCK_LTL: [
    { field: 'transportType', labelKey: 'excel.transportType', width: 14, kind: 'enum', enumValues: ['FTL', 'LTL'] },
    ...GROUND_ADDRESS_COLUMNS,
    ...GROUND_DATE_COLUMNS,
    ...CARGO_COLUMNS,
    SPECIAL_REQUIREMENTS_COLUMN,
    REMARKS_COLUMN,
  ],

  LOCAL_DELIVERY: [
    // 本地派送没有 FTL/LTL 之分，所以没有运输类型列
    ...GROUND_ADDRESS_COLUMNS,
    ...GROUND_DATE_COLUMNS,
    ...CARGO_COLUMNS,
    SPECIAL_REQUIREMENTS_COLUMN,
    REMARKS_COLUMN,
  ],

  TRUCK_FTL: [
    { field: 'shippingLine', labelKey: 'excel.shippingLine', width: 16, kind: 'text' },
    { field: 'blNumber', labelKey: 'excel.blNumber', width: 18, kind: 'text', required: true },
    { field: 'eta', labelKey: 'excel.eta', width: 14, kind: 'date' },
    { field: 'cnee', labelKey: 'excel.cnee', width: 20, kind: 'text' },
    { field: 'containerNo', labelKey: 'excel.containerNo', width: 16, kind: 'text', required: true },
    { field: 'containerType', labelKey: 'excel.containerType', width: 12, kind: 'text' },
    { field: 'sealNo', labelKey: 'excel.sealNo', width: 14, kind: 'text' },
    { field: 'pod', labelKey: 'excel.pod', width: 14, kind: 'text', required: true },
    { field: 'finalDestination', labelKey: 'excel.finalDestination', width: 16, kind: 'text', required: true },
    { field: 'finalDestAddress', labelKey: 'excel.finalDestAddress', width: 28, kind: 'text' },
    { field: 'expectedDeliveryDate', labelKey: 'excel.expectedDeliveryDate', width: 16, kind: 'date' },
    { field: 'deliveryContact', labelKey: 'excel.deliveryContact', width: 14, kind: 'text' },
    { field: 'deliveryPhone', labelKey: 'excel.deliveryPhone', width: 18, kind: 'text' },
    { field: 'releaseMethod', labelKey: 'excel.releaseMethod', width: 14, kind: 'enum', enumValues: ['TELEX', 'ORIGINAL'] },
    { field: 'needsClearance', labelKey: 'excel.needsClearance', width: 12, kind: 'bool' },
    ...CARGO_COLUMNS,
    REMARKS_COLUMN,
  ],
}

/**
 * 表头之外还认的写法（客户自己改过表头，或拿旧表来导）
 * 键会经 normalizeKey 规整，所以这里不用管大小写和空格
 */
const EXTRA_HEADER_ALIASES = {
  运输类型: 'transportType',
  业务类型: 'transportType',
  发货国家: 'pickupCountry',
  发货邮编: 'pickupZipCode',
  发货城市: 'pickupCity',
  发货地址: 'pickupAddressLine',
  起运国家: 'pickupCountry',
  起运邮编: 'pickupZipCode',
  起运城市: 'pickupCity',
  起运地址: 'pickupAddressLine',
  收货国家: 'deliveryCountry',
  收货邮编: 'deliveryZipCode',
  收货城市: 'deliveryCity',
  收货地址: 'deliveryAddressLine',
  目的国家: 'deliveryCountry',
  目的邮编: 'deliveryZipCode',
  目的城市: 'deliveryCity',
  目的地址: 'deliveryAddressLine',
  提货日期: 'pickupDate',
  送货日期: 'deliveryDate',
  交货日期: 'deliveryDate',
  品名: 'cargoDescription',
  货名: 'cargoDescription',
  数量: 'cargoQuantity',
  件数: 'cargoQuantity',
  总重量: 'cargoWeightKg',
  重量: 'cargoWeightKg',
  体积: 'cargoVolumeM3',
  柜号: 'containerNo',
  箱号: 'containerNo',
  柜型: 'containerType',
  箱型: 'containerType',
  提单号: 'blNumber',
  船公司: 'shippingLine',
  船司: 'shippingLine',
  铅封号: 'sealNo',
  封号: 'sealNo',
  卸货港: 'pod',
  目的港: 'pod',
  最终目的地: 'finalDestination',
  收货人: 'cnee',
  放单方式: 'releaseMethod',
  是否清关: 'needsClearance',
  需要清关: 'needsClearance',
}

/** 是/否的各种写法 */
const TRUE_WORDS = ['是', 'y', 'yes', 'true', '1', 'ja', '需要', '要']
const FALSE_WORDS = ['否', 'n', 'no', 'false', '0', 'nein', '不需要', '不要', '无']

/** 放单方式的口语写法 */
const RELEASE_METHOD_ALIASES = {
  电放: 'TELEX',
  telexrelease: 'TELEX',
  telex: 'TELEX',
  正本: 'ORIGINAL',
  正本提单: 'ORIGINAL',
  original: 'ORIGINAL',
  originalbl: 'ORIGINAL',
}

/** 运输类型的口语写法 */
const TRANSPORT_TYPE_ALIASES = {
  整车: 'FTL',
  整箱: 'FTL',
  ftl: 'FTL',
  拼车: 'LTL',
  零担: 'LTL',
  ltl: 'LTL',
}

export function getImportColumns(businessType) {
  return IMPORT_COLUMNS_BY_TYPE[businessType] || null
}

// ==================== 模板 ====================

/**
 * 生成某个运输产品的导入模板
 *
 * 两个 sheet：
 *   1. 数据页 —— **只有表头，不放示例行**。示例行放数据页里客户十有八九会连着导进来。
 *   2. 填写说明 —— 规则 + 一份可以照抄的示例。
 *
 * @param {'TRUCK_LTL'|'TRUCK_FTL'|'LOCAL_DELIVERY'} businessType
 * @param {'zh'|'en'|'de'} lang
 * @returns {ExcelJS.Workbook}
 */
export function buildTemplateWorkbook(businessType, lang) {
  const columns = getImportColumns(businessType)
  if (!columns) throw new Error(`无效的运输产品: ${businessType}`)

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(t(lang, 'excel.orderImportSheet'))

  sheet.columns = columns.map((col) => ({
    header: headerText(col, lang),
    key: col.field,
    width: col.width,
  }))
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).alignment = { vertical: 'middle' }
  // 冻结表头，往下填几十行也看得见列名
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  // 枚举列给下拉，省得客户自己造词
  columns.forEach((col, index) => {
    const values = col.kind === 'bool'
      ? [t(lang, 'common.yes'), t(lang, 'common.no')]
      : col.enumValues
    if (!values) return
    const letter = sheet.getColumn(index + 1).letter
    for (let row = 2; row <= MAX_DATA_ROWS + 1; row++) {
      sheet.getCell(`${letter}${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${values.join(',')}"`],
      }
    }
  })

  buildGuideSheet(workbook, businessType, columns, lang)
  return workbook
}

function headerText(col, lang) {
  const label = t(lang, col.labelKey)
  return col.required ? `${label} *` : label
}

/** 填写说明页：规则 + 一份可以照抄的示例 */
function buildGuideSheet(workbook, businessType, columns, lang) {
  const guide = workbook.addWorksheet(t(lang, 'excel.importGuideSheet'))
  guide.columns = [{ width: 4 }, { width: 110 }]

  const title = guide.getCell('B1')
  title.value = t(lang, 'excel.orderImportGuideTitle', {
    product: t(lang, `businessType.${businessType}`),
  })
  title.font = { bold: true, size: 12 }

  const requiredLabels = columns.filter((c) => c.required).map((c) => t(lang, c.labelKey)).join(' / ')
  const rules = [
    t(lang, 'excel.orderImportRuleOneRow'),
    t(lang, 'excel.orderImportRuleProduct', { product: t(lang, `businessType.${businessType}`) }),
    t(lang, 'excel.orderImportRuleRequired', { columns: requiredLabels }),
    t(lang, 'excel.orderImportRuleDate'),
    t(lang, 'excel.orderImportRuleNumber'),
    t(lang, 'excel.orderImportRuleLimit', { maxRows: MAX_DATA_ROWS }),
    t(lang, 'excel.orderImportRulePreview'),
    t(lang, 'excel.orderImportRuleStatus'),
  ]
  rules.forEach((text, i) => {
    const cell = guide.getCell(`B${i + 3}`)
    cell.value = `${i + 1}. ${text}`
    cell.alignment = { wrapText: true, vertical: 'top' }
  })

  const sample = workbook.addWorksheet(t(lang, 'excel.importExampleSheet'))
  sample.columns = columns.map((col) => ({ header: headerText(col, lang), key: col.field, width: col.width }))
  sample.getRow(1).font = { bold: true }
  sample.addRow(buildExampleRow(businessType, lang))
}

function buildExampleRow(businessType, lang) {
  if (businessType === 'TRUCK_FTL') {
    return {
      shippingLine: 'MSC',
      blNumber: 'MSCU1234567',
      eta: '2026-09-01',
      cnee: 'Siemens AG',
      containerNo: 'MSCU7654321',
      containerType: '40HQ',
      sealNo: 'SL123456',
      pod: 'Hamburg',
      finalDestination: 'München',
      finalDestAddress: 'Werkstr. 12, 80331 München',
      expectedDeliveryDate: '2026-09-05',
      deliveryContact: 'Max Mustermann',
      deliveryPhone: '+49 89 1234567',
      releaseMethod: 'TELEX',
      needsClearance: t(lang, 'common.yes'),
      cargoDescription: t(lang, 'excel.importExampleGoodsC'),
      cargoQuantity: 20,
      cargoWeightKg: 18000,
      cargoVolumeM3: 60,
      remarks: '',
    }
  }

  const base = {
    pickupCountry: 'DE',
    pickupZipCode: '44532',
    pickupCity: 'Lünen',
    pickupAddressLine: 'Industriestr. 1',
    pickupContact: 'Max Mustermann',
    pickupPhone: '+49 231 1234567',
    deliveryCountry: businessType === 'LOCAL_DELIVERY' ? 'DE' : 'ES',
    deliveryZipCode: businessType === 'LOCAL_DELIVERY' ? '40472' : '28001',
    deliveryCity: businessType === 'LOCAL_DELIVERY' ? 'Düsseldorf' : 'Madrid',
    deliveryAddressLine: businessType === 'LOCAL_DELIVERY' ? 'Niederbeckstr. 35' : 'Calle Mayor 3',
    deliveryContact: 'Anna Kowalska',
    deliveryPhone: '+49 211 1234567',
    pickupDate: '2026-09-01',
    deliveryDate: '2026-09-03',
    cargoDescription: t(lang, 'excel.importExampleGoodsA'),
    cargoQuantity: 4,
    cargoWeightKg: 1200,
    cargoVolumeM3: 6.5,
    specialRequirements: '',
    remarks: '',
  }
  if (businessType === 'TRUCK_LTL') base.transportType = 'LTL'
  return base
}

// ==================== 解析 ====================

/**
 * 解析并校验上传的 Excel
 *
 * 只做解析校验，一个字都不写库 —— 预览和正式导入调的是同一个函数，
 * 保证「预览看到什么，导入进去就是什么」。
 *
 * @param {Buffer} buffer 上传的 xlsx
 * @param {string} businessType 本次导入的运输产品（决定用哪套列）
 * @param {'zh'|'en'|'de'} lang 错误提示语言
 * @returns {Promise<{orders: Array, errors: Array, warnings: Array, totalRows: number}>}
 */
export async function analyzeImportFile(buffer, businessType, lang) {
  const columns = getImportColumns(businessType)
  if (!columns) return fatal(t(lang, 'excel.orderImportErrBusinessType'))

  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch {
    return fatal(t(lang, 'excel.importErrUnreadable'))
  }

  // 认第一个 sheet；客户另存为时 sheet 名常被改，认名字反而更容易失败
  const sheet = workbook.worksheets[0]
  if (!sheet) return fatal(t(lang, 'excel.importErrNoSheet'))

  const fieldByColumn = mapHeaderColumns(sheet.getRow(1), columns)
  const mapped = Object.values(fieldByColumn)
  const missing = columns.filter((c) => c.required && !mapped.includes(c.field))
  if (missing.length > 0) {
    return fatal(t(lang, 'excel.importErrMissingColumns', {
      columns: missing.map((c) => t(lang, c.labelKey)).join(' / '),
    }))
  }

  const rawRows = []
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
    rawRows.push({ rowNumber, raw })
  })

  if (rawRows.length === 0) return fatal(t(lang, 'excel.importErrNoData'))
  if (rawRows.length > MAX_DATA_ROWS) {
    return fatal(t(lang, 'excel.importErrTooManyRows', { max: MAX_DATA_ROWS, actual: rawRows.length }))
  }

  const errors = []
  const warnings = []
  const orders = []

  for (const { rowNumber, raw } of rawRows) {
    const values = parseRowValues(raw, columns, rowNumber, lang, errors)
    if (!values) continue
    orders.push({ rowNumber, payload: buildOrderPayload(values, businessType) })
  }

  // 同一份表里柜号重复，八成是复制粘贴时忘了改
  if (businessType === 'TRUCK_FTL') {
    collectDuplicateWarnings(orders, 'containerNo', 'excel.containerNo', lang, warnings)
  }

  return { orders, errors, warnings, totalRows: rawRows.length }
}

/**
 * 逐列解析一行
 * @returns {object|null} 该行有错时返回 null（错误已进 errors）
 */
function parseRowValues(raw, columns, rowNumber, lang, errors) {
  const values = {}
  let invalid = false

  for (const col of columns) {
    const text = (raw[col.field] || '').trim()

    if (text === '') {
      if (col.required) {
        errors.push(rowError(rowNumber, lang, col.labelKey, 'excel.importErrRequired'))
        invalid = true
      }
      values[col.field] = null
      continue
    }

    switch (col.kind) {
      case 'number':
      case 'int': {
        const num = parseNumber(text)
        if (num === null) {
          errors.push(rowError(rowNumber, lang, col.labelKey, 'excel.importErrNotNumber', { value: text }))
          invalid = true
        } else if (num < 0) {
          errors.push(rowError(rowNumber, lang, col.labelKey, 'excel.importErrNegative', { value: text }))
          invalid = true
        } else if (col.kind === 'int' && !Number.isInteger(num)) {
          errors.push(rowError(rowNumber, lang, col.labelKey, 'excel.orderImportErrInteger', { value: text }))
          invalid = true
        } else {
          values[col.field] = num
        }
        break
      }
      case 'date': {
        const date = parseDateString(text)
        if (!date) {
          errors.push(rowError(rowNumber, lang, col.labelKey, 'excel.orderImportErrDate', { value: text }))
          invalid = true
        } else {
          values[col.field] = date
        }
        break
      }
      case 'bool': {
        const bool = parseBool(text)
        if (bool === null) {
          errors.push(rowError(rowNumber, lang, col.labelKey, 'excel.orderImportErrBool', { value: text }))
          invalid = true
        } else {
          values[col.field] = bool
        }
        break
      }
      case 'enum': {
        const code = parseEnum(col.field, text, col.enumValues)
        if (!code) {
          errors.push(rowError(rowNumber, lang, col.labelKey, 'excel.orderImportErrEnum', {
            value: text,
            allowed: col.enumValues.join(' / '),
          }))
          invalid = true
        } else {
          values[col.field] = code
        }
        break
      }
      default: {
        if (col.maxLength && text.length > col.maxLength) {
          errors.push(rowError(rowNumber, lang, col.labelKey, 'excel.orderImportErrTooLong', {
            max: col.maxLength, actual: text.length,
          }))
          invalid = true
        } else {
          values[col.field] = text
        }
      }
    }
  }

  return invalid ? null : values
}

/**
 * 一行的值 → createOrder 能直接吃的 payload
 *
 * 联系人并进地址的 JSONB 里 —— orders 表没有联系人列，
 * 平铺传 pickupContact 会被 model 直接忽略（填了等于没填）。
 */
function buildOrderPayload(v, businessType) {
  const common = {
    businessType,
    cargoDescription: v.cargoDescription || null,
    cargoQuantity: v.cargoQuantity ?? null,
    cargoWeightKg: v.cargoWeightKg ?? null,
    cargoVolumeM3: v.cargoVolumeM3 ?? null,
    remarks: v.remarks || null,
    currency: 'EUR',
  }

  if (businessType === 'TRUCK_FTL') {
    return {
      ...common,
      transportType: 'FTL',
      shippingLine: v.shippingLine || null,
      blNumber: v.blNumber,
      eta: v.eta || null,
      cnee: v.cnee || null,
      containerNo: v.containerNo,
      containerType: v.containerType || null,
      sealNo: v.sealNo || null,
      pod: v.pod,
      finalDestination: v.finalDestination,
      finalDestAddress: v.finalDestAddress || null,
      expectedDeliveryDate: v.expectedDeliveryDate || null,
      deliveryAddress: buildAddress({
        city: v.finalDestination,
        address: v.finalDestAddress,
        contactName: v.deliveryContact,
        contactPhone: v.deliveryPhone,
      }),
      releaseMethod: v.releaseMethod || null,
      needsClearance: v.needsClearance ?? false,
      needsRelease: Boolean(v.releaseMethod),
    }
  }

  return {
    ...common,
    // 本地派送没有 FTL/LTL 之分；LTL 模板没填时按 LTL 落
    transportType: businessType === 'LOCAL_DELIVERY' ? null : (v.transportType || 'LTL'),
    pickupAddress: buildAddress({
      country: v.pickupCountry,
      zipCode: v.pickupZipCode,
      city: v.pickupCity,
      address: v.pickupAddressLine,
      contactName: v.pickupContact,
      contactPhone: v.pickupPhone,
    }),
    deliveryAddress: buildAddress({
      country: v.deliveryCountry,
      zipCode: v.deliveryZipCode,
      city: v.deliveryCity,
      address: v.deliveryAddressLine,
      contactName: v.deliveryContact,
      contactPhone: v.deliveryPhone,
    }),
    pickupDate: v.pickupDate || null,
    deliveryDate: v.deliveryDate || null,
    specialRequirements: v.specialRequirements || null,
  }
}

/** 只保留填了值的键，避免整片 null 塞进 JSONB */
function buildAddress(fields) {
  const address = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      address[key] = String(value).trim()
    }
  }
  return Object.keys(address).length > 0 ? address : null
}

/**
 * 把解析好的行写库
 *
 * ⚠️ 必须在同一个事务里调用：任何一行失败就整批回滚，
 *    不允许出现「导入了一半」—— 客户没法知道该补哪几张单。
 *
 * 逐单的「新订单」站内通知在这里统一关掉，最后由调用方发一条汇总 ——
 * 200 单就是 200 条通知乘以每个操作员，通知中心会被刷爆。
 *
 * @returns {Promise<Array<{rowNumber: number, id: string, orderNumber: string}>>}
 */
export async function createOrdersFromRows(client, rows, { clientId, userId, createOrder }) {
  const created = []
  for (const { rowNumber, payload } of rows) {
    const order = await createOrder(client, { ...payload, clientId }, userId, { skipNewOrderNotify: true })
    created.push({
      rowNumber,
      id: order.id,
      orderNumber: order.order_number,
      businessType: order.business_type,
    })
  }
  return created
}

// ==================== 内部工具 ====================

/** 表头文本 → 字段名，认三种语言的模板表头 + 常见别名 */
function mapHeaderColumns(headerRow, columns) {
  const dictionary = buildHeaderDictionary(columns)
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

function buildHeaderDictionary(columns) {
  const dict = {}
  for (const col of columns) {
    dict[normalizeKey(col.field)] = col.field
    for (const lang of ['zh', 'en', 'de']) {
      // 模板里必填列表头带 "*"，normalizeKey 会去掉，所以不用单独处理
      dict[normalizeKey(t(lang, col.labelKey))] = col.field
    }
  }
  // 别名只在该产品确实有这一列时才认，免得把别的产品的列硬塞进来
  const ownFields = new Set(columns.map((c) => c.field))
  for (const [alias, field] of Object.entries(EXTRA_HEADER_ALIASES)) {
    if (ownFields.has(field)) dict[normalizeKey(alias)] = field
  }
  return dict
}

function parseBool(text) {
  const key = normalizeKey(text)
  if (TRUE_WORDS.some((w) => normalizeKey(w) === key)) return true
  if (FALSE_WORDS.some((w) => normalizeKey(w) === key)) return false
  return null
}

function parseEnum(field, text, allowed) {
  const upper = text.trim().toUpperCase()
  if (allowed.includes(upper)) return upper
  const aliases = field === 'releaseMethod' ? RELEASE_METHOD_ALIASES : TRANSPORT_TYPE_ALIASES
  const code = aliases[normalizeKey(text)]
  return code && allowed.includes(code) ? code : null
}

/** 同一份表里某个字段重复时给警告（不阻断，同一柜分两单是有的） */
function collectDuplicateWarnings(orders, field, labelKey, lang, warnings) {
  const seen = new Map()
  for (const { rowNumber, payload } of orders) {
    const value = payload[field]
    if (!value) continue
    const key = String(value).trim().toUpperCase()
    if (seen.has(key)) {
      warnings.push({
        row: rowNumber,
        column: t(lang, labelKey),
        message: t(lang, 'excel.orderImportWarnDuplicate', { value, row: seen.get(key) }),
      })
    } else {
      seen.set(key, rowNumber)
    }
  }
}

function rowError(row, lang, labelKey, messageKey, vars) {
  return {
    row,
    column: t(lang, labelKey),
    message: t(lang, messageKey, { field: t(lang, labelKey), ...vars }),
  }
}

/** 整份文件都没法用时的返回（比如缺必需列），不带任何数据行 */
function fatal(message) {
  return { orders: [], errors: [{ row: null, column: null, message }], warnings: [], totalRows: 0 }
}

export default {
  MAX_DATA_ROWS,
  MAX_FILE_SIZE,
  IMPORT_BUSINESS_TYPES,
  IMPORT_COLUMNS_BY_TYPE,
  getImportColumns,
  buildTemplateWorkbook,
  analyzeImportFile,
  createOrdersFromRows,
}
