/**
 * P8 开放 API 冒烟测试（需求 4 + 5.1 第三种来源）
 *
 * 覆盖：认证（缺头/坏钥匙/停用/IP 白名单）、按钥匙限速、字段校验、
 *       幂等重复推送、询价建单（含按件明细汇总）、直接下单（过 ERP 内核）、
 *       冻结客户信用拦截、请求留痕。
 *
 * ⚠️ 会写数据，**只能对测试库跑，不要连生产 RDS**：
 *   createdb eu_tms_p8_test
 *   for f in 100 101 102 103 104 105 106 107 108 109 110 111 112; do
 *     psql -d eu_tms_p8_test -f server/database/migrations/${f}_*.sql; done
 *   cd server && DATABASE_URL="postgresql://<用户>@localhost:5432/eu_tms_p8_test" \
 *     JWT_SECRET="test" node scripts/test-open-api.js
 *
 * 脚本自己造测试数据；测试库是一次性的，跑完直接 dropdb，不做清理。
 */
const log = (m = '') => process.stdout.write(m + '\n')
import express from 'express'
import { query } from '../core/db.js'
import { hashKey } from '../modules/open-api/service.js'

const openApiRoutes = (await import('../modules/open-api/routes.js')).default

const app = express()
app.use(express.json())
app.use('/api/open/v1', openApiRoutes)
const server = app.listen(3097)
const BASE = 'http://127.0.0.1:3097/api/open/v1'

let passed = 0
let failed = 0
function assert(name, cond, extra = '') {
  if (cond) { passed++; log(`  ✅ ${name}`) }
  else { failed++; log(`  ❌ ${name} ${extra}`) }
}

async function call(path, { method = 'GET', key, body, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'X-API-Key': key } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json() }
}

// ==================== 造测试数据 ====================

// 打开当月过账期间（生产由过账期间自动管理 cron 负责，测试库要自己开）
{
  const now = new Date()
  await query(
    `INSERT INTO posting_periods (company_code, fiscal_year, period_month, account_type, is_open)
     VALUES ('DE01', $1, $2, 'ALL', true)
     ON CONFLICT (company_code, fiscal_year, period_month, account_type)
     DO UPDATE SET is_open = true`,
    [now.getFullYear(), now.getMonth() + 1]
  )
}

// 在职 sys_admin（seed 里有就用现成的，没有就造一个）
let adminId
const adminRow = await query(
  `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
   WHERE r.role_code = 'sys_admin' AND u.is_active = true LIMIT 1`)
if (adminRow.rows.length > 0) {
  adminId = adminRow.rows[0].id
} else {
  const role = await query(`SELECT id FROM roles WHERE role_code = 'sys_admin'`)
  const u = await query(
    `INSERT INTO users (username, password_hash, user_type, role_id, is_active)
     VALUES ('p8_test_admin', 'x', 'OPERATOR', $1, true) RETURNING id`, [role.rows[0].id])
  adminId = u.rows[0].id
}

const client = await query(
  `INSERT INTO clients (client_code, company_name, status, credit_limit)
   VALUES ('P8TEST', 'P8 冒烟测试客户', 'ACTIVE', 0) RETURNING id`)
const clientId = client.rows[0].id

const frozenClient = await query(
  `INSERT INTO clients (client_code, company_name, status, credit_limit, credit_blocked)
   VALUES ('P8FROZEN', 'P8 冻结客户', 'ACTIVE', 1000, true) RETURNING id`)
const frozenClientId = frozenClient.rows[0].id

const GOOD_KEY = 'eutms_' + 'a'.repeat(48)
const DISABLED_KEY = 'eutms_' + 'b'.repeat(48)
const IPLOCK_KEY = 'eutms_' + 'c'.repeat(48)
const TINYRATE_KEY = 'eutms_' + 'd'.repeat(48)
const FROZEN_KEY = 'eutms_' + 'e'.repeat(48)

async function insertKey(code, name, cid, plain, { status = 'ACTIVE', rate = 100, ips = [] } = {}) {
  await query(
    `INSERT INTO api_keys (partner_code, partner_name, client_id, key_prefix, key_hash,
                           status, rate_limit_per_min, ip_whitelist, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [code, name, cid, plain.slice(0, 12), hashKey(plain), status, rate, JSON.stringify(ips), adminId])
}
await insertKey('P8GOOD', '冒烟-正常', clientId, GOOD_KEY)
await insertKey('P8OFF', '冒烟-停用', clientId, DISABLED_KEY, { status: 'DISABLED' })
await insertKey('P8IP', '冒烟-锁IP', clientId, IPLOCK_KEY, { ips: ['10.99.99.99'] })
await insertKey('P8RATE', '冒烟-限速', clientId, TINYRATE_KEY, { rate: 3 })
await insertKey('P8FRZ', '冒烟-冻结客户', frozenClientId, FROZEN_KEY)

// ==================== 1. 认证 ====================
log('\n【1】认证')
{
  const r1 = await call('/ping')
  assert('缺 X-API-Key → 401 AUTH_ERROR', r1.status === 401 && r1.json.data?.errorCode === 'AUTH_ERROR')

  const r2 = await call('/ping', { key: 'eutms_no_such_key_0000' })
  assert('坏钥匙 → 401', r2.status === 401)

  const r3 = await call('/ping', { key: GOOD_KEY })
  assert('好钥匙 ping → 200 + partnerCode', r3.status === 200 && r3.json.data?.partnerCode === 'P8GOOD')

  const r4 = await call('/ping', { key: DISABLED_KEY })
  assert('停用钥匙 → 403 FORBIDDEN', r4.status === 403 && r4.json.data?.errorCode === 'FORBIDDEN')

  const r5 = await call('/ping', { key: IPLOCK_KEY })
  assert('IP 不在白名单 → 403', r5.status === 403)

  const r6 = await call('/ping', { key: IPLOCK_KEY, headers: { 'X-Forwarded-For': '10.99.99.99' } })
  assert('白名单 IP（经 XFF）→ 200', r6.status === 200)
}

// ==================== 2. 限速 ====================
log('\n【2】按钥匙限速（限 3 次/分钟）')
{
  let last
  for (let i = 0; i < 4; i++) last = await call('/ping', { key: TINYRATE_KEY })
  assert('第 4 次 → 429 RATE_LIMITED', last.status === 429 && last.json.data?.errorCode === 'RATE_LIMITED')
}

// ==================== 3. 询价：校验 + 建单 + 幂等 ====================
log('\n【3】推送询价单')
const inquiryPayload = {
  externalOrderNo: 'YDD-2026-0001',
  businessType: 'TRUCK_LTL',
  customerRef: 'CUST-REF-01',
  routeFrom: { country: '德国', city: 'Hamburg', zipCode: '20095', address: 'Hafenstr. 1' },
  routeTo: { country: '法国', city: 'Paris', zipCode: '75001', address: 'Rue de Rivoli 2' },
  contactName: '张三', contactPhone: '+49 151 0000', contactEmail: 'test@example.com',
  cargoItems: [
    { referenceNo: 'PKG-1', quantity: 2, lengthCm: 120, widthCm: 80, heightCm: 100, unitWeightKg: 200 },
    { referenceNo: 'PKG-2', quantity: 1, lengthCm: 240, widthCm: 120, heightCm: 90, unitWeightKg: 350 },
  ],
}
{
  const bad = await call('/inquiries', { method: 'POST', key: GOOD_KEY, body: { businessType: 'X' } })
  assert('缺单号+坏类型 → 400 VALIDATION_ERROR', bad.status === 400 && bad.json.data?.errorCode === 'VALIDATION_ERROR')
  assert('校验信息含 externalOrderNo', /externalOrderNo/.test(bad.json.message))

  const noCargo = await call('/inquiries', {
    method: 'POST', key: GOOD_KEY,
    body: { ...inquiryPayload, externalOrderNo: 'YDD-EMPTY', cargoItems: [] },
  })
  assert('无明细且无汇总 → 400', noCargo.status === 400 && /货物信息不能为空/.test(noCargo.json.message))

  const ok = await call('/inquiries', { method: 'POST', key: GOOD_KEY, body: inquiryPayload })
  assert('正常推送 → 200 + 询价号', ok.status === 200 && !!ok.json.data?.inquiryNumber && ok.json.data.duplicated === false)

  const row = await query(
    `SELECT * FROM inquiries WHERE external_source = 'P8GOOD' AND external_ref = 'YDD-2026-0001'`)
  assert('落库带幂等键 + 挂靠钥匙绑定的客户', row.rows.length === 1 && row.rows[0].client_id === clientId)
  // 明细汇总回写：件数 3，LDM = 1.2×0.8/2.4×2 + 2.4×1.2/2.4×1 = 0.8 + 1.2 = 2.0
  assert('明细汇总回写表头（3 件 / LDM 2.0）',
    row.rows[0].cargo_quantity === 3 && Number(row.rows[0].ldm) === 2.0,
    `实际 ${row.rows[0].cargo_quantity} 件 / LDM ${row.rows[0].ldm}`)

  const dup = await call('/inquiries', { method: 'POST', key: GOOD_KEY, body: inquiryPayload })
  assert('同单号重推 → 200 duplicated=true 同一张', dup.status === 200 && dup.json.data?.duplicated === true
    && dup.json.data.inquiryNumber === ok.json.data.inquiryNumber)

  const cnt = await query(`SELECT COUNT(*)::int AS n FROM inquiries WHERE external_ref = 'YDD-2026-0001'`)
  assert('库里仍只有一张', cnt.rows[0].n === 1)
}

// ==================== 4. 直接下单：校验 + ERP 内核 + 幂等 + 信用拦截 ====================
log('\n【4】直接下单')
const orderPayload = {
  externalOrderNo: 'AOYI-C-8801',
  businessType: 'TRUCK_FTL',
  containerNo: 'MSKU1234567',
  containerType: '40HQ',
  blNumber: 'BL-TEST-01',
  shippingLine: 'Maersk',
  eta: '2026-08-20T08:00:00Z',
  pod: 'Hamburg',
  deliveryAddress: { country: '德国', city: 'München', zipCode: '80331', address: 'Teststr. 9' },
  cargoDescription: '家具', cargoWeightKg: 8000, cargoQuantity: 400,
  clientPrice: 1500, currency: 'EUR',
  needsClearance: true, needsRelease: true, releaseMethod: 'TELEX',
}
{
  const noCtn = await call('/orders', { method: 'POST', key: GOOD_KEY, body: { ...orderPayload, containerNo: '' } })
  assert('FTL 缺柜号 → 400', noCtn.status === 400 && /containerNo/.test(noCtn.json.message))

  const longSR = await call('/orders', {
    method: 'POST', key: GOOD_KEY,
    body: { ...orderPayload, externalOrderNo: 'AOYI-SR', specialRequirements: '长'.repeat(51) },
  })
  assert('specialRequirements 超 50 字 → 400', longSR.status === 400 && /specialRequirements/.test(longSR.json.message))

  const ok = await call('/orders', { method: 'POST', key: GOOD_KEY, body: orderPayload })
  assert('正常下单 → 200 + 订单号 + PENDING_REVIEW',
    ok.status === 200 && !!ok.json.data?.orderNumber && ok.json.data.status === 'PENDING_REVIEW')

  const row = await query(`SELECT * FROM orders WHERE external_source = 'P8GOOD' AND external_ref = 'AOYI-C-8801'`)
  const o = row.rows[0]
  assert('落库：幂等键 + FTL 派送子状态 + 客户挂靠',
    row.rows.length === 1 && o.delivery_status === 'WAITING_ARRANGE' && o.client_id === clientId)

  const doc = await query(`SELECT d.doc_number, d.doc_type FROM documents d WHERE d.id = $1`, [o.document_id])
  assert('凭证引擎生成 ORD 凭证', doc.rows.length === 1 && doc.rows[0].doc_type === 'ORD')

  const clearance = await query(`SELECT 1 FROM customs_clearances WHERE order_id = $1`, [o.id])
  const release = await query(`SELECT 1 FROM shipping_releases WHERE order_id = $1`, [o.id])
  assert('FTL 自动带出清关 + 放单记录', clearance.rows.length === 1 && release.rows.length === 1)

  const dup = await call('/orders', { method: 'POST', key: GOOD_KEY, body: orderPayload })
  assert('同单号重推 → duplicated=true 同一张', dup.status === 200 && dup.json.data?.duplicated === true
    && dup.json.data.orderNumber === ok.json.data.orderNumber)

  const frozen = await call('/orders', {
    method: 'POST', key: FROZEN_KEY,
    body: { ...orderPayload, externalOrderNo: 'FRZ-001' },
  })
  assert('冻结客户下单 → 422 BUSINESS_ERROR（信用拦截）',
    frozen.status === 422 && frozen.json.data?.errorCode === 'BUSINESS_ERROR' && /信用/.test(frozen.json.message))

  const frozenRow = await query(`SELECT 1 FROM orders WHERE external_ref = 'FRZ-001'`)
  assert('被拦订单没有落库', frozenRow.rows.length === 0)

  const frozenLog = await query(
    `SELECT 1 FROM credit_check_logs WHERE client_id = $1 AND check_result = 'BLOCKED'`, [frozenClientId])
  assert('BLOCKED 信用日志留痕（踩坑 027）', frozenLog.rows.length >= 1)

  const localOk = await call('/orders', {
    method: 'POST', key: GOOD_KEY,
    body: {
      externalOrderNo: 'YN-LOCAL-01', businessType: 'LOCAL_DELIVERY',
      deliveryAddress: { country: '德国', city: 'Berlin' }, cargoQuantity: 5,
    },
  })
  assert('本地派送下单 → 200（走系统统一初始状态）', localOk.status === 200 && !!localOk.json.data?.orderNumber)
}

// ==================== 4.5 状态回查 ====================
log('\n【4.5】状态回查')
{
  const inq1 = await call('/inquiries/YDD-2026-0001', { key: GOOD_KEY })
  assert('询价回查 → 200 + 待报价 + 尚无报价', inq1.status === 200
    && inq1.json.data.status === 'PENDING_QUOTE' && inq1.json.data.quotation === null)

  // 给这张询价插一版对客报价（带 carrier_cost，验证成本字段不外泄——踩坑 026 回归）
  const inqRow = await query(`SELECT id, client_id FROM inquiries WHERE external_ref = 'YDD-2026-0001'`)
  await query(
    `INSERT INTO quotations (quotation_number, inquiry_id, client_id, version, status,
                             total_price, carrier_cost, currency, valid_until)
     VALUES ('QUO-P8-TEST-1', $1, $2, 1, 'SENT', 1234.5, 999.99, 'EUR', '2026-12-31')`,
    [inqRow.rows[0].id, inqRow.rows[0].client_id]
  )
  const inq2 = await call('/inquiries/YDD-2026-0001', { key: GOOD_KEY })
  assert('已报价后回查 → 报价金额可见（NUMERIC 已转数字）', inq2.status === 200
    && inq2.json.data.quotation?.totalPrice === 1234.5
    && inq2.json.data.quotation?.status === 'SENT')
  const raw = JSON.stringify(inq2.json)
  assert('回查响应不含 carrier_cost / 成本值（踩坑 026）', !raw.includes('carrier') && !raw.includes('999.99'))

  const ord = await call('/orders/AOYI-C-8801', { key: GOOD_KEY })
  assert('订单回查 → 200 + 待审核 + 柜号', ord.status === 200
    && ord.json.data.status === 'PENDING_REVIEW'
    && ord.json.data.statusLabel === '待审核'
    && ord.json.data.containerNo === 'MSKU1234567')

  const miss = await call('/orders/NO-SUCH-REF', { key: GOOD_KEY })
  assert('查不存在的单号 → 404 NOT_FOUND', miss.status === 404 && miss.json.data?.errorCode === 'NOT_FOUND')

  // 租户隔离：别的合作方查同一个单号，必须是"不存在"而不是 403（架构规则 8）
  const cross = await call('/orders/AOYI-C-8801', { key: FROZEN_KEY })
  assert('跨合作方回查 → 404（不暴露单据存在性）', cross.status === 404)

  const noKey = await call('/orders/AOYI-C-8801')
  assert('回查也要钥匙 → 401', noKey.status === 401)
}

// ==================== 5. 请求留痕 ====================
log('\n【5】请求留痕')
{
  // 日志是 fire-and-forget，给独立连接一点落盘时间
  await new Promise((r) => setTimeout(r, 500))
  const authFail = await query(
    `SELECT 1 FROM api_request_logs WHERE result = 'AUTH_ERROR' AND api_key_id IS NULL`)
  assert('认证失败也留痕（api_key_id 为空）', authFail.rows.length >= 1)

  const success = await query(
    `SELECT 1 FROM api_request_logs
     WHERE partner_code = 'P8GOOD' AND result = 'SUCCESS' AND external_ref = 'AOYI-C-8801'`)
  assert('成功请求留痕（挂合作方 + 外部单号）', success.rows.length >= 1)

  const dupLog = await query(
    `SELECT 1 FROM api_request_logs WHERE partner_code = 'P8GOOD' AND result = 'DUPLICATE'`)
  assert('重复推送标记 DUPLICATE', dupLog.rows.length >= 1)

  const blocked = await query(
    `SELECT 1 FROM api_request_logs WHERE partner_code = 'P8FRZ' AND result = 'BUSINESS_ERROR'`)
  assert('业务拦截留痕（事务回滚了日志还在，踩坑 027）', blocked.rows.length >= 1)

  const rateLog = await query(
    `SELECT 1 FROM api_request_logs WHERE partner_code = 'P8RATE' AND result = 'RATE_LIMITED'`)
  assert('限速拦截留痕', rateLog.rows.length >= 1)

  const notFoundLog = await query(
    `SELECT 1 FROM api_request_logs WHERE result = 'NOT_FOUND' AND external_ref = 'NO-SUCH-REF'`)
  assert('回查未命中留痕（路径参数单号已记录）', notFoundLog.rows.length >= 1)
}

log(`\n═══════════ 结果：${passed} 通过 / ${failed} 失败 ═══════════`)
server.close()
process.exit(failed > 0 ? 1 : 0)
