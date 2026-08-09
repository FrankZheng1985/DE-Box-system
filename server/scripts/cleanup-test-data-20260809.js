/**
 * 测试数据清理脚本（2026-08-09 一次性使用）
 *
 * 背景：飞书《EU-TMS 开发意见表》第 6 条（苏凌 2026-08-07 提），8-06 正式运营初始化之后
 *       又积累了一批测试单据，需要再清一次。
 *
 * 保留（白名单，按业务编号定位，找不到直接中止）：
 *   - 订单 EU-20260808-0004 及其完整单据链上游：QUO-20260808-0003 ← INQ-20260807-0004
 *     （Frank 2026-08-09 决定：这条订单保留，上游一并保留，避免单据流断链）
 *   - 客户：翼能
 *   - 用户：admin、suling、duguirong、xiaoding
 *   - 全部系统配置：权限、角色、科目表、定价配置、过账期间、md_* 主数据字典、系统设置
 *
 * 清除：
 *   - 订单 EU-20260806-0001 / 0002、EU-20260807-0003 及其状态日志、附件、CMR
 *   - 询价单 6 张、报价单 2 张（保留白名单那两张）
 *   - 上述业务对应的 ERP 凭证与单据流
 *   - 承运商 SGF、Eurosped（全部清空）
 *   - 客户：安百
 *   - 用户：Kiu、speedtrans、siemens
 *   - 通知、代客登录票据、咨询、API 日志
 *   - 变更追踪：只删被清对象的（保留订单的审计链完整保留）
 *   - OSS 上属于被删订单的文件（--fix 时在事务提交后删除，不可回滚）
 *
 * 编号计数器：ORD/INQ/QUO/CLT 保持不动（都还有保留记录，归零会重号）；
 *             CMR、CAR 归零（对应数据已清空）
 *
 * 用法：
 *   node scripts/cleanup-test-data-20260809.js          # 检查模式：只统计，不改任何数据
 *   node scripts/cleanup-test-data-20260809.js --fix    # 执行（数据库单事务，出错整体回滚）
 *
 * 前置条件（--fix 前必须完成）：
 *   bash scripts/backup-db.sh
 */
import pg from 'pg'
import dotenv from 'dotenv'
import OSS from 'ali-oss'

dotenv.config()

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// CLI 脚本的进度输出统一走 stdout（规范只允许 console.error / console.warn）
const log = msg => process.stdout.write(msg + '\n')

const isFix = process.argv.includes('--fix')

// ============ 保留白名单 ============
const KEEP_ORDER_NUMBERS = ['EU-20260808-0004']
const KEEP_QUOTATION_NUMBERS = ['QUO-20260808-0003']
const KEEP_INQUIRY_NUMBERS = ['INQ-20260807-0004']
const KEEP_CLIENT_NAMES = ['翼能']
const KEEP_USERNAMES = ['admin', 'suling', 'duguirong', 'xiaoding']

// 编号计数器归零的对象类型（对应数据被清空的才归零）
const NUMBER_RANGES_TO_RESET = ['CMR', 'CAR']

/**
 * 按业务编号解析保留对象的主键与凭证 id，任何一条找不到都中止
 */
async function resolveKeepIds(client) {
  const orders = await client.query(
    `SELECT id, order_number, document_id FROM orders WHERE order_number = ANY($1)`,
    [KEEP_ORDER_NUMBERS]
  )
  const quotations = await client.query(
    `SELECT id, quotation_number, document_id FROM quotations WHERE quotation_number = ANY($1)`,
    [KEEP_QUOTATION_NUMBERS]
  )
  const inquiries = await client.query(
    `SELECT id, inquiry_number, document_id FROM inquiries WHERE inquiry_number = ANY($1)`,
    [KEEP_INQUIRY_NUMBERS]
  )
  const clients = await client.query(
    `SELECT id, company_name FROM clients WHERE company_name = ANY($1)`,
    [KEEP_CLIENT_NAMES]
  )
  const users = await client.query(
    `SELECT id, username FROM users WHERE username = ANY($1)`,
    [KEEP_USERNAMES]
  )

  const missing = []
  if (orders.rowCount !== KEEP_ORDER_NUMBERS.length) missing.push('订单')
  if (quotations.rowCount !== KEEP_QUOTATION_NUMBERS.length) missing.push('报价单')
  if (inquiries.rowCount !== KEEP_INQUIRY_NUMBERS.length) missing.push('询价单')
  if (clients.rowCount !== KEEP_CLIENT_NAMES.length) missing.push('客户')
  if (users.rowCount !== KEEP_USERNAMES.length) missing.push('用户')
  if (missing.length > 0) {
    throw new Error(
      `保留白名单里的${missing.join('、')}在库里找不到（或数量对不上），中止执行。` +
      `实际找到：订单 ${orders.rowCount}/${KEEP_ORDER_NUMBERS.length}、` +
      `报价 ${quotations.rowCount}/${KEEP_QUOTATION_NUMBERS.length}、` +
      `询价 ${inquiries.rowCount}/${KEEP_INQUIRY_NUMBERS.length}、` +
      `客户 ${clients.rowCount}/${KEEP_CLIENT_NAMES.length}、` +
      `用户 ${users.rowCount}/${KEEP_USERNAMES.length}`
    )
  }

  // 保留的凭证 = 保留的订单/报价/询价各自挂的那张
  const docIds = [
    ...orders.rows.map(r => r.document_id),
    ...quotations.rows.map(r => r.document_id),
    ...inquiries.rows.map(r => r.document_id)
  ].filter(Boolean)

  return {
    orderIds: orders.rows.map(r => r.id),
    quotationIds: quotations.rows.map(r => r.id),
    inquiryIds: inquiries.rows.map(r => r.id),
    clientIds: clients.rows.map(r => r.id),
    userIds: users.rows.map(r => r.id),
    docIds
  }
}

/**
 * 统计将被删除的行数（检查模式和执行前都会跑一遍）
 */
async function countTargets(client, keep) {
  const q = async (label, sql, params) => {
    const r = await client.query(sql, params)
    return { label, n: r.rows[0].n }
  }
  return Promise.all([
    q('订单 orders', `SELECT count(*)::int n FROM orders WHERE NOT (id = ANY($1))`, [keep.orderIds]),
    q('订单附件 order_files', `SELECT count(*)::int n FROM order_files WHERE NOT (order_id = ANY($1))`, [keep.orderIds]),
    q('订单状态日志 order_status_logs', `SELECT count(*)::int n FROM order_status_logs WHERE NOT (order_id = ANY($1))`, [keep.orderIds]),
    q('CMR cmr_documents', `SELECT count(*)::int n FROM cmr_documents WHERE NOT (order_id = ANY($1))`, [keep.orderIds]),
    q('GPS gps_tracking', `SELECT count(*)::int n FROM gps_tracking WHERE NOT (order_id = ANY($1))`, [keep.orderIds]),
    q('放单 shipping_releases', `SELECT count(*)::int n FROM shipping_releases WHERE NOT (order_id = ANY($1))`, [keep.orderIds]),
    q('清关 customs_clearances', `SELECT count(*)::int n FROM customs_clearances WHERE NOT (order_id = ANY($1))`, [keep.orderIds]),
    q('财务记录 financial_records', `SELECT count(*)::int n FROM financial_records WHERE NOT (order_id = ANY($1))`, [keep.orderIds]),
    q('日记账 journal_entries', `SELECT count(*)::int n FROM journal_entries WHERE NOT (order_id = ANY($1))`, [keep.orderIds]),
    q('报价单 quotations', `SELECT count(*)::int n FROM quotations WHERE NOT (id = ANY($1))`, [keep.quotationIds]),
    q('询价单 inquiries', `SELECT count(*)::int n FROM inquiries WHERE NOT (id = ANY($1))`, [keep.inquiryIds]),
    q('凭证 documents', `SELECT count(*)::int n FROM documents WHERE NOT (id = ANY($1))`, [keep.docIds]),
    q('单据流 document_flow', `SELECT count(*)::int n FROM document_flow WHERE NOT (preceding_doc_id = ANY($1) AND subsequent_doc_id = ANY($1))`, [keep.docIds]),
    q('变更追踪 change_documents', `SELECT count(*)::int n FROM change_documents WHERE NOT (object_id = ANY($1))`, [keepAuditObjectIds(keep)]),
    q('通知 notifications', `SELECT count(*)::int n FROM notifications`, []),
    q('代客登录票据 impersonation_sessions', `SELECT count(*)::int n FROM impersonation_sessions`, []),
    q('客户咨询 contact_inquiries', `SELECT count(*)::int n FROM contact_inquiries`, []),
    q('API 日志 api_request_logs', `SELECT count(*)::int n FROM api_request_logs`, []),
    q('承运商 carriers', `SELECT count(*)::int n FROM carriers`, []),
    q('客户 clients', `SELECT count(*)::int n FROM clients WHERE NOT (id = ANY($1))`, [keep.clientIds]),
    q('用户 users', `SELECT count(*)::int n FROM users WHERE NOT (id = ANY($1))`, [keep.userIds])
  ])
}

/**
 * 变更追踪保留哪些对象的审计记录：保留的订单和保留的凭证
 * （change_documents.object_id 是 varchar，存的是 UUID 字符串）
 */
function keepAuditObjectIds(keep) {
  return [...keep.orderIds, ...keep.docIds]
}

/**
 * 收集被删订单在 OSS 上的文件路径（必须在删库之前调用）
 */
async function collectOssPaths(client, keep) {
  const paths = []

  const files = await client.query(
    `SELECT oss_path, file_url FROM order_files WHERE NOT (order_id = ANY($1))`,
    [keep.orderIds]
  )
  for (const row of files.rows) {
    const p = row.oss_path || ossPathFromUrl(row.file_url)
    if (p) paths.push(p)
  }

  const cmrs = await client.query(
    `SELECT file_url FROM cmr_documents WHERE NOT (order_id = ANY($1))`,
    [keep.orderIds]
  )
  for (const row of cmrs.rows) {
    const p = ossPathFromUrl(row.file_url)
    if (p) paths.push(p)
  }

  return [...new Set(paths)]
}

/**
 * 从完整 URL 里取出 OSS object key（去掉协议和域名，去掉开头的斜杠）
 */
function ossPathFromUrl(url) {
  if (!url) return null
  try {
    return new URL(url).pathname.replace(/^\//, '')
  } catch {
    return null
  }
}

async function deleteFromOss(paths) {
  const { OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET, OSS_REGION } = process.env
  if (!OSS_ACCESS_KEY_ID || !OSS_ACCESS_KEY_SECRET || !OSS_BUCKET) {
    console.warn('[OSS] 未配置 OSS，跳过文件删除。以下路径需要人工处理：\n  ' + paths.join('\n  '))
    return
  }
  const oss = new OSS({
    region: OSS_REGION || 'oss-cn-hongkong',
    accessKeyId: OSS_ACCESS_KEY_ID,
    accessKeySecret: OSS_ACCESS_KEY_SECRET,
    bucket: OSS_BUCKET
  })
  for (const p of paths) {
    try {
      await oss.delete(p)
      log(`  已删除 OSS 文件 ${p}`)
    } catch (err) {
      // OSS 删除失败不影响已提交的数据库改动，留下孤儿文件人工清理即可
      console.error(`  OSS 文件删除失败 ${p}：${err.message}`)
    }
  }
}

async function main() {
  const client = await pool.connect()
  try {
    log(`模式：${isFix ? '执行清理（--fix）' : '检查（只读，不改数据）'}`)
    log('')

    const keep = await resolveKeepIds(client)
    log('== 保留白名单（已在库中核对到） ==')
    log(`  订单：${KEEP_ORDER_NUMBERS.join('、')}`)
    log(`  报价单：${KEEP_QUOTATION_NUMBERS.join('、')}`)
    log(`  询价单：${KEEP_INQUIRY_NUMBERS.join('、')}`)
    log(`  客户：${KEEP_CLIENT_NAMES.join('、')}`)
    log(`  用户：${KEEP_USERNAMES.join('、')}`)
    log(`  关联凭证：${keep.docIds.length} 张`)

    const targets = await countTargets(client, keep)
    log('')
    log('== 将删除的数据 ==')
    let total = 0
    for (const t of targets) {
      total += t.n
      if (t.n > 0) log(`  ${t.label}: ${t.n} 行`)
    }
    log(`  合计 ${total} 行`)

    const ossPaths = await collectOssPaths(client, keep)
    log('')
    log(`== 将删除的 OSS 文件（${ossPaths.length} 个） ==`)
    for (const p of ossPaths) log(`  ${p}`)

    const ranges = await client.query(
      `SELECT object_type, current_number FROM number_ranges
       WHERE object_type = ANY($1) AND current_number > 0 ORDER BY object_type`,
      [NUMBER_RANGES_TO_RESET]
    )
    log('')
    log('== 将归零的编号范围 ==')
    for (const r of ranges.rows) log(`  ${r.object_type}: ${r.current_number} → 0`)

    if (!isFix) {
      log('')
      log('检查完成。确认无误后：先 bash scripts/backup-db.sh 备份，再加 --fix 执行。')
      return
    }

    // ============ 执行清理（单事务） ============
    log('')
    log('== 开始清理（单事务） ==')
    await client.query('BEGIN')

    const del = async (label, sql, params) => {
      const r = await client.query(sql, params)
      if (r.rowCount > 0) log(`  已删除 ${label}（${r.rowCount} 行）`)
    }

    // 顺序按外键依赖：子表在前。CASCADE 的子表（order_status_logs、inquiry_cargo_items、
    // quotation_pricing_items、quotation_response_tokens、carrier_inquiries、
    // change_document_items、user_org_assignments、notification_preferences）随父表自动删除。
    await del('订单附件', `DELETE FROM order_files WHERE NOT (order_id = ANY($1))`, [keep.orderIds])
    await del('CMR', `DELETE FROM cmr_documents WHERE NOT (order_id = ANY($1))`, [keep.orderIds])
    await del('GPS 轨迹', `DELETE FROM gps_tracking WHERE NOT (order_id = ANY($1))`, [keep.orderIds])
    await del('放单', `DELETE FROM shipping_releases WHERE NOT (order_id = ANY($1))`, [keep.orderIds])
    await del('清关', `DELETE FROM customs_clearances WHERE NOT (order_id = ANY($1))`, [keep.orderIds])
    await del('财务记录', `DELETE FROM financial_records WHERE NOT (order_id = ANY($1))`, [keep.orderIds])
    await del('日记账', `DELETE FROM journal_entries WHERE NOT (order_id = ANY($1))`, [keep.orderIds])

    // quotations 引用 orders(converted_order_id) 和 inquiries，必须排在这两者前面
    await del('报价单', `DELETE FROM quotations WHERE NOT (id = ANY($1))`, [keep.quotationIds])
    await del('订单', `DELETE FROM orders WHERE NOT (id = ANY($1))`, [keep.orderIds])
    await del('询价单', `DELETE FROM inquiries WHERE NOT (id = ANY($1))`, [keep.inquiryIds])

    await del(
      '单据流',
      `DELETE FROM document_flow WHERE NOT (preceding_doc_id = ANY($1) AND subsequent_doc_id = ANY($1))`,
      [keep.docIds]
    )
    await del('凭证', `DELETE FROM documents WHERE NOT (id = ANY($1))`, [keep.docIds])

    await del('通知', `DELETE FROM notifications WHERE true`, [])
    await del('代客登录票据', `DELETE FROM impersonation_sessions WHERE true`, [])
    await del('客户咨询', `DELETE FROM contact_inquiries WHERE true`, [])
    await del('API 日志', `DELETE FROM api_request_logs WHERE true`, [])
    await del(
      '变更追踪',
      `DELETE FROM change_documents WHERE NOT (object_id = ANY($1))`,
      [keepAuditObjectIds(keep)]
    )

    await del('用户', `DELETE FROM users WHERE NOT (id = ANY($1))`, [keep.userIds])
    await del('承运商', `DELETE FROM carriers WHERE true`, [])
    await del('客户', `DELETE FROM clients WHERE NOT (id = ANY($1))`, [keep.clientIds])

    await client.query(
      `UPDATE number_ranges SET current_number = 0 WHERE object_type = ANY($1)`,
      [NUMBER_RANGES_TO_RESET]
    )
    log(`  编号范围已归零：${NUMBER_RANGES_TO_RESET.join(', ')}`)

    await client.query('COMMIT')
    log('事务已提交。')

    // ============ 删除 OSS 文件（不可回滚，放在事务之后） ============
    if (ossPaths.length > 0) {
      log('')
      log('== 删除 OSS 文件 ==')
      await deleteFromOss(ossPaths)
    }

    // ============ 核对结果 ============
    log('')
    log('== 核对 ==')
    let allOk = true
    const check = async (label, sql, params, expected) => {
      const r = await client.query(sql, params)
      const ok = r.rows[0].n === expected
      if (!ok) allOk = false
      log(`  ${ok ? '✓' : '✗ 不符!'} ${label}: ${r.rows[0].n}（期望 ${expected}）`)
    }
    await check('orders', `SELECT count(*)::int n FROM orders`, [], KEEP_ORDER_NUMBERS.length)
    await check('quotations', `SELECT count(*)::int n FROM quotations`, [], KEEP_QUOTATION_NUMBERS.length)
    await check('inquiries', `SELECT count(*)::int n FROM inquiries`, [], KEEP_INQUIRY_NUMBERS.length)
    await check('documents', `SELECT count(*)::int n FROM documents`, [], keep.docIds.length)
    await check('clients', `SELECT count(*)::int n FROM clients`, [], KEEP_CLIENT_NAMES.length)
    await check('users', `SELECT count(*)::int n FROM users`, [], KEEP_USERNAMES.length)
    await check('carriers', `SELECT count(*)::int n FROM carriers`, [], 0)
    await check('cmr_documents', `SELECT count(*)::int n FROM cmr_documents`, [], 0)

    // 保留订单的单据链必须完整：QUO → ORD 那条单据流还在
    await check(
      '保留订单的单据流',
      `SELECT count(*)::int n FROM document_flow WHERE subsequent_doc_id = ANY($1)`,
      [keep.docIds],
      1
    )

    log(allOk ? '全部核对通过 ✓' : '存在核对失败项，请人工检查！')
    process.exitCode = allOk ? 0 : 2
  } catch (err) {
    try { await client.query('ROLLBACK') } catch { /* 事务可能尚未开始 */ }
    console.error('执行失败，事务已回滚：', err.message)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
