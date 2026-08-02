/**
 * P6 服务商询价冒烟测试（需求 5.3）
 *
 * 覆盖：权限隔离（op_staff 看不到成本）、批量发起与去重、回价校验、
 *       选用互斥、报价单成本字段的按权限剥离。
 *
 * ⚠️ 会写数据，**只能对测试库跑，不要连生产 RDS**：
 *   createdb eu_tms_p6_test
 *   for f in 100 101 102 103 104 105 106 107 108 109 110; do
 *     psql -d eu_tms_p6_test -f server/database/migrations/${f}_*.sql; done
 *   cd server && DATABASE_URL="postgresql://<用户>@localhost:5432/eu_tms_p6_test" \
 *     JWT_SECRET="test" node scripts/test-carrier-inquiry.js
 *
 * 脚本自己造测试数据，跑完清理，可以重复跑。
 */
const log = (m = '') => process.stdout.write(m + '\n')
import express from 'express'
import jwt from 'jsonwebtoken'
import { query } from '../core/db.js'

const app = express()
app.use(express.json())

const carrierInquiryRoutes = (await import('../modules/carrier-inquiry/routes.js')).default
const quotationRoutes = (await import('../modules/quotation/routes.js')).default

app.use('/api/v1/carrier-inquiries', carrierInquiryRoutes)
app.use('/api/v1/quotations', quotationRoutes)

const server = app.listen(3098)
const BASE = 'http://127.0.0.1:3098/api/v1'

function tokenFor(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' })
}

async function call(path, token, method = 'GET', body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

let pass = 0
let fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; log(`  ✅ ${name}`) }
  else { fail++; log(`  ❌ ${name} ${extra}`) }
}

// ==================== 造数据 ====================

const adminRow = await query(`SELECT id FROM users WHERE username = 'admin'`)
const adminId = adminRow.rows[0].id

// 报价要走凭证引擎，当月过账期间必须是打开的，否则 createDocument 直接抛错
await query(
  `INSERT INTO posting_periods (company_code, fiscal_year, period_month, account_type, is_open)
   VALUES ('DE01', EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM CURRENT_DATE)::int, 'ALL', true)
   ON CONFLICT (company_code, fiscal_year, period_month, account_type)
   DO UPDATE SET is_open = true`
)

const admin = tokenFor({ id: adminId, username: 'admin', userType: 'OPERATOR', roleCode: 'sys_admin' })
const manager = tokenFor({ id: adminId, username: 'mgr', userType: 'OPERATOR', roleCode: 'op_manager' })
const staff = tokenFor({ id: adminId, username: 'staff', userType: 'OPERATOR', roleCode: 'op_staff' })

/** 清掉上一次跑剩下的测试数据，保证脚本可以重复跑（中途失败也不会卡住下一次） */
async function cleanupTestData() {
  // 顺序要紧：quotations.carrier_cost_source_id 指向 carrier_inquiries，
  // 先删服务商询价会被外键挡住，所以先断引用、再删报价、最后删询价
  await query(`UPDATE quotations SET carrier_cost_source_id = NULL
               WHERE carrier_cost_source_id IN
               (SELECT id FROM carrier_inquiries WHERE inquiry_id IN
                (SELECT id FROM inquiries WHERE inquiry_number LIKE 'P6-INQ-TEST%'))`)
  await query(`DELETE FROM carrier_inquiries WHERE inquiry_id IN
               (SELECT id FROM inquiries WHERE inquiry_number LIKE 'P6-INQ-TEST%')`)
  await query(`DELETE FROM quotation_pricing_items WHERE quotation_id IN
               (SELECT id FROM quotations WHERE client_id IN
                (SELECT id FROM clients WHERE client_code = 'P6TEST'))`)
  await query(`DELETE FROM quotations WHERE client_id IN
               (SELECT id FROM clients WHERE client_code = 'P6TEST')`)
  await query(`DELETE FROM inquiries WHERE inquiry_number LIKE 'P6-INQ-TEST%'`)
  await query(`DELETE FROM carriers WHERE carrier_code IN ('P6CA', 'P6CB')`)
  await query(`DELETE FROM clients WHERE client_code = 'P6TEST'`)
}

await cleanupTestData()

// op_staff 的权限勾选会被 test-permissions.js 改掉且不还原，
// 这里先恢复成迁移 109 的默认值，保证两个脚本谁先跑都不影响对方
const OP_STAFF_DEFAULT = [
  'dashboard:view',
  'order:view', 'order:create', 'order:edit', 'order:assign', 'order:status',
  'order:file_upload', 'order:export',
  'inquiry:view', 'inquiry:create', 'inquiry:edit', 'inquiry:export',
  'quotation:view', 'quotation:create', 'quotation:edit', 'quotation:send',
  'cmr:view', 'cmr:upload', 'cmr:edit',
  'shipping_release:view', 'shipping_release:manage',
  'customs:view', 'customs:manage',
  'gps:view', 'gps:manage',
  'client:view', 'carrier:view',
  'contact:view', 'contact:manage',
  'notification:view',
]
await query(
  `DELETE FROM role_permissions rp USING roles r
   WHERE r.id = rp.role_id AND r.role_code = 'op_staff'`
)
await query(
  `INSERT INTO role_permissions (role_id, perm_code)
   SELECT r.id, p.perm_code FROM roles r CROSS JOIN permissions p
   WHERE r.role_code = 'op_staff' AND p.perm_code = ANY($1)`,
  [OP_STAFF_DEFAULT]
)

const clientRow = await query(
  `INSERT INTO clients (client_code, company_name, country, status, company_code)
   VALUES ('P6TEST', 'P6 测试客户', 'DE', 'ACTIVE', 'DE01')
   RETURNING id`
)
const clientId = clientRow.rows[0].id

const clientUser = tokenFor({
  id: adminId, username: 'cu', userType: 'CLIENT', roleCode: 'client_user', linkedEntityId: clientId,
})
const driver = tokenFor({
  id: adminId, username: 'drv', userType: 'CARRIER', roleCode: 'carrier_driver',
  linkedEntityId: '22222222-2222-2222-2222-222222222222',
})

const carrierA = (await query(
  `INSERT INTO carriers (carrier_code, company_name, country, status, company_code)
   VALUES ('P6CA', 'P6 服务商 A', 'PL', 'ACTIVE', 'DE01') RETURNING id`
)).rows[0].id
const carrierB = (await query(
  `INSERT INTO carriers (carrier_code, company_name, country, status, company_code)
   VALUES ('P6CB', 'P6 服务商 B', 'DE', 'ACTIVE', 'DE01') RETURNING id`
)).rows[0].id

const inquiryId = (await query(
  `INSERT INTO inquiries (inquiry_number, client_id, business_type, status, route_from, route_to)
   VALUES ('P6-INQ-TEST', $1, 'TRUCK_LTL', 'PENDING_QUOTE', '{}', '{}')
   RETURNING id`,
  [clientId]
)).rows[0].id

// ==================== 用例 ====================

log('\n【1】权限隔离：成本只给服务商管理岗')
check('未登录 → 401', (await call('/carrier-inquiries', null)).status === 401)
check('运营专员(无 carrier_inquiry:view) → 403', (await call('/carrier-inquiries', staff)).status === 403)
check('客户账号 → 403', (await call('/carrier-inquiries', clientUser)).status === 403)
check('司机账号 → 403', (await call('/carrier-inquiries', driver)).status === 403)
check('运营经理(有 carrier_inquiry:view) → 200', (await call('/carrier-inquiries', manager)).status === 200)

log('\n【2】批量发起')
const batch = await call('/carrier-inquiries/batch', manager, 'POST', {
  inquiryId, carrierIds: [carrierA, carrierB], requestRemarks: '需要带尾板',
})
check('对两家服务商发起 → 200 且建 2 条', batch.status === 200 && batch.json?.data?.length === 2,
  JSON.stringify(batch.json))
check('单号形如 CINQ-YYYYMMDD-0001',
  /^CINQ-\d{8}-\d{4}$/.test(batch.json?.data?.[0]?.carrier_inquiry_number || ''),
  batch.json?.data?.[0]?.carrier_inquiry_number)

const again = await call('/carrier-inquiries/batch', manager, 'POST', {
  inquiryId, carrierIds: [carrierA], requestRemarks: '重复发起',
})
check('同一家在询价中不重复发起', again.status === 200 && again.json?.data?.length === 0,
  JSON.stringify(again.json))
check('运营专员发起 → 403',
  (await call('/carrier-inquiries/batch', staff, 'POST', { inquiryId, carrierIds: [carrierA] })).status === 403)
check('不传服务商 → 400',
  (await call('/carrier-inquiries/batch', manager, 'POST', { inquiryId, carrierIds: [] })).status === 400)

const idA = batch.json.data.find(r => r.carrier_id === carrierA).id
const idB = batch.json.data.find(r => r.carrier_id === carrierB).id

log('\n【3】回价')
check('缺金额 → 400',
  (await call(`/carrier-inquiries/${idA}/reply`, manager, 'PUT', { currency: 'EUR' })).status === 400)
check('负数金额 → 400',
  (await call(`/carrier-inquiries/${idA}/reply`, manager, 'PUT', { quotedCost: -5 })).status === 400)

const replyA = await call(`/carrier-inquiries/${idA}/reply`, manager, 'PUT', {
  quotedCost: 850.5, currency: 'EUR', transitDays: 3, replyRemarks: '含税不含装卸',
})
check('回价 → 200 且状态转 QUOTED',
  replyA.status === 200 && replyA.json?.data?.status === 'QUOTED', JSON.stringify(replyA.json))
check('成本按 NUMERIC 存回来是字符串 850.50', replyA.json?.data?.quoted_cost === '850.50',
  String(replyA.json?.data?.quoted_cost))

await call(`/carrier-inquiries/${idB}/reply`, manager, 'PUT', { quotedCost: 780, currency: 'EUR', transitDays: 5 })

const list = await call(`/carrier-inquiries?inquiryId=${inquiryId}`, manager)
check('列表标出最低价是 B（780 < 850.5）', list.json?.summary?.lowest_id === idB,
  JSON.stringify(list.json?.summary))

log('\n【4】选用互斥')
const selectB = await call(`/carrier-inquiries/${idB}/select`, manager, 'POST', {})
check('选用已回价的 B → 200', selectB.status === 200 && selectB.json?.data?.status === 'SELECTED',
  JSON.stringify(selectB.json))
const selectA = await call(`/carrier-inquiries/${idA}/select`, manager, 'POST', {})
check('改选 A → 200（B 自动降回已回价）', selectA.status === 200 && selectA.json?.data?.status === 'SELECTED',
  JSON.stringify(selectA.json))
const afterSwitch = await query(`SELECT status FROM carrier_inquiries WHERE id = $1`, [idB])
check('B 已回落到 QUOTED', afterSwitch.rows[0].status === 'QUOTED', afterSwitch.rows[0].status)
const selectedCount = await query(
  `SELECT COUNT(*)::int AS n FROM carrier_inquiries WHERE inquiry_id = $1 AND status = 'SELECTED'`, [inquiryId]
)
check('同一张询价最多一家 SELECTED', selectedCount.rows[0].n === 1, String(selectedCount.rows[0].n))
check('已选用的不能取消', (await call(`/carrier-inquiries/${idA}/cancel`, manager, 'POST', {})).status === 400)
check('已选用的不能标记不报价', (await call(`/carrier-inquiries/${idA}/decline`, manager, 'POST', {})).status === 400)
check('已回价的不能删除', (await call(`/carrier-inquiries/${idB}`, manager, 'DELETE')).status === 400)

log('\n【5】未回价直接选用')
const fresh = await call('/carrier-inquiries/batch', manager, 'POST', {
  inquiryId, carrierIds: [carrierB],
})
// B 上一轮还在 QUOTED，属于活动状态，所以这里应该被跳过
check('B 仍在询价中，重复发起被跳过', fresh.json?.data?.length === 0, JSON.stringify(fresh.json))

const inquiry2 = (await query(
  `INSERT INTO inquiries (inquiry_number, client_id, business_type, status, route_from, route_to)
   VALUES ('P6-INQ-TEST-2', $1, 'TRUCK_FTL', 'PENDING_QUOTE', '{}', '{}') RETURNING id`, [clientId]
)).rows[0].id
const batch2 = await call('/carrier-inquiries/batch', manager, 'POST', {
  inquiryId: inquiry2, carrierIds: [carrierA],
})
const pendingId = batch2.json.data[0].id
check('待回价的不能直接选用',
  (await call(`/carrier-inquiries/${pendingId}/select`, manager, 'POST', {})).status === 400)
check('待回价的可以删除', (await call(`/carrier-inquiries/${pendingId}`, manager, 'DELETE')).status === 200)

log('\n【6】报价单上的成本按权限剥离')
const quo = await call('/quotations', manager, 'POST', {
  inquiryId, clientId, businessType: 'TRUCK_LTL', transportType: 'LTL',
  routeFrom: { country: 'DE' }, routeTo: { country: 'PL' },
  baseFreight: 1200, currency: 'EUR',
  carrierCost: 850.5, carrierCostSourceId: idA,
})
check('运营经理创建报价带成本 → 200', quo.status === 200, JSON.stringify(quo.json))
const quoId = quo.json?.data?.id
const stored = await query(`SELECT carrier_cost, carrier_cost_source_id FROM quotations WHERE id = $1`, [quoId])
check('成本已入库', stored.rows[0].carrier_cost === '850.50', String(stored.rows[0].carrier_cost))

const mgrDetail = await call(`/quotations/${quoId}`, manager)
check('运营经理读详情能看到 carrier_cost', mgrDetail.json?.data?.carrier_cost === '850.50',
  String(mgrDetail.json?.data?.carrier_cost))

const staffDetail = await call(`/quotations/${quoId}`, staff)
check('运营专员读详情看不到 carrier_cost',
  staffDetail.status === 200 && !('carrier_cost' in (staffDetail.json?.data || {})),
  JSON.stringify(Object.keys(staffDetail.json?.data || {})))

const clientDetail = await call(`/quotations/${quoId}`, clientUser)
check('客户读详情看不到 carrier_cost',
  clientDetail.status === 200 && !('carrier_cost' in (clientDetail.json?.data || {})),
  `${clientDetail.status} ${JSON.stringify(Object.keys(clientDetail.json?.data || {}))}`)

const staffList = await call('/quotations', staff)
check('运营专员列表也不含 carrier_cost',
  Array.isArray(staffList.json?.data) && staffList.json.data.every(r => !('carrier_cost' in r)))

const staffQuo = await call('/quotations', staff, 'POST', {
  inquiryId, clientId, businessType: 'TRUCK_LTL', transportType: 'LTL',
  routeFrom: { country: 'DE' }, routeTo: { country: 'PL' },
  baseFreight: 900, currency: 'EUR', carrierCost: 111, carrierCostSourceId: idA,
})
const staffStored = await query(
  `SELECT carrier_cost FROM quotations WHERE id = $1`, [staffQuo.json?.data?.id]
)
check('运营专员传的成本不入库（后端忽略）', staffStored.rows[0].carrier_cost === null,
  String(staffStored.rows[0].carrier_cost))

log('\n【7】删除服务商询价时断开报价引用')
// 先把 A 改回可删除状态，验证删除不会被报价的外键卡住
await query(`UPDATE carrier_inquiries SET status = 'PENDING' WHERE id = $1`, [idA])
const delA = await call(`/carrier-inquiries/${idA}`, manager, 'DELETE')
check('删除被报价引用的服务商询价 → 200', delA.status === 200, JSON.stringify(delA.json))
const afterDel = await query(`SELECT carrier_cost_source_id FROM quotations WHERE id = $1`, [quoId])
check('报价的成本来源已置空', afterDel.rows[0].carrier_cost_source_id === null)

// ==================== 清理 ====================

await cleanupTestData()

log(`\n===== 通过 ${pass} 项，失败 ${fail} 项 =====\n`)
server.close()
process.exit(fail === 0 ? 0 : 1)
