/**
 * 服务商询价邮件直发冒烟测试（2026-08-07）
 *
 * 覆盖：批量发起时邮件入队（多邮箱合并收件）、无邮箱服务商的如实报告、
 *       sendEmails=false 只登记不发、补发/重发接口的状态与权限约束。
 *
 * ⚠️ 会写数据，**只能对测试库跑，不要连生产 RDS**（建库方式同 test-carrier-inquiry.js）：
 *   cd server && DATABASE_URL="postgresql://localhost:5432/<测试库>" \
 *     JWT_SECRET="test" node scripts/test-carrier-inquiry-email.js
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
app.use('/api/v1/carrier-inquiries', carrierInquiryRoutes)

const server = app.listen(3097)
const BASE = 'http://127.0.0.1:3097/api/v1'

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

const manager = tokenFor({ id: adminId, username: 'mgr', userType: 'OPERATOR', roleCode: 'op_manager' })
const staff = tokenFor({ id: adminId, username: 'staff', userType: 'OPERATOR', roleCode: 'op_staff' })

/** 清掉上一次跑剩下的测试数据，保证脚本可以重复跑 */
async function cleanupTestData() {
  await query(`DELETE FROM notifications WHERE id IN
               (SELECT email_notification_id FROM carrier_inquiries WHERE inquiry_id IN
                (SELECT id FROM inquiries WHERE inquiry_number LIKE 'CIEM-INQ-TEST%'))`)
  await query(`DELETE FROM carrier_inquiries WHERE inquiry_id IN
               (SELECT id FROM inquiries WHERE inquiry_number LIKE 'CIEM-INQ-TEST%')`)
  await query(`DELETE FROM inquiries WHERE inquiry_number LIKE 'CIEM-INQ-TEST%'`)
  await query(`DELETE FROM carriers WHERE carrier_code IN ('CIEMA', 'CIEMB', 'CIEMC')`)
  await query(`DELETE FROM clients WHERE client_code = 'CIEMT'`)
}

await cleanupTestData()

const clientId = (await query(
  `INSERT INTO clients (client_code, company_name, country, status, company_code)
   VALUES ('CIEMT', 'CIEM 测试客户', 'DE', 'ACTIVE', 'DE01') RETURNING id`
)).rows[0].id

// A：登记了两个询价邮箱（还有联系邮箱，应被询价邮箱盖过）
const carrierA = (await query(
  `INSERT INTO carriers (carrier_code, company_name, country, status, company_code,
                         contact_email, inquiry_emails)
   VALUES ('CIEMA', 'CIEM 服务商 A', 'PL', 'ACTIVE', 'DE01',
           'fallback@a.test', '["dispo@a.test", "quote@a.test"]') RETURNING id`
)).rows[0].id
// B：只有联系邮箱 → 回退用它
const carrierB = (await query(
  `INSERT INTO carriers (carrier_code, company_name, country, status, company_code, contact_email)
   VALUES ('CIEMB', 'CIEM 服务商 B', 'DE', 'ACTIVE', 'DE01', 'office@b.test') RETURNING id`
)).rows[0].id
// C：一个邮箱都没有 → 记录照建，邮件发不了要如实报告
const carrierC = (await query(
  `INSERT INTO carriers (carrier_code, company_name, country, status, company_code)
   VALUES ('CIEMC', 'CIEM 服务商 C', 'CZ', 'ACTIVE', 'DE01') RETURNING id`
)).rows[0].id

const inquiryId = (await query(
  `INSERT INTO inquiries (inquiry_number, client_id, business_type, status,
                          route_from, route_to, cargo_description, cargo_weight_kg,
                          cargo_volume_m3, cargo_quantity, container_type)
   VALUES ('CIEM-INQ-TEST', $1, 'TRUCK_FTL', 'PENDING_QUOTE',
           '{"country":"DE","city":"Hamburg"}', '{"country":"PL","city":"Warszawa"}',
           'Furniture, palletized', 21500, 68, 33, '40HQ')
   RETURNING id`,
  [clientId]
)).rows[0].id

// ==================== 用例 ====================

log('\n【1】批量发起 = 建记录 + 邮件入队')
const batch = await call('/carrier-inquiries/batch', manager, 'POST', {
  inquiryId, carrierIds: [carrierA, carrierB, carrierC], requestRemarks: 'Tail lift needed',
})
check('三家发起 → 200 且建 3 条', batch.status === 200 && batch.json?.data?.length === 3,
  JSON.stringify(batch.json))
check('summary.email_queued = 2（A、B 有邮箱）', batch.json?.summary?.email_queued === 2,
  JSON.stringify(batch.json?.summary))
check('summary.no_email_carriers 点名 C',
  Array.isArray(batch.json?.summary?.no_email_carriers)
  && batch.json.summary.no_email_carriers.length === 1
  && batch.json.summary.no_email_carriers[0] === 'CIEM 服务商 C',
  JSON.stringify(batch.json?.summary))

const rowsResult = await query(
  `SELECT ci.*, n.email_to, n.email_status, n.email_template, n.email_payload
   FROM carrier_inquiries ci
   LEFT JOIN notifications n ON n.id = ci.email_notification_id
   WHERE ci.inquiry_id = $1`, [inquiryId]
)
const byCarrier = new Map(rowsResult.rows.map((r) => [r.carrier_id, r]))
const rowA = byCarrier.get(carrierA)
const rowB = byCarrier.get(carrierB)
const rowC = byCarrier.get(carrierC)

check('A 的收件人 = 两个询价邮箱合并（不含联系邮箱）',
  rowA?.email_to === 'dispo@a.test,quote@a.test', rowA?.email_to)
check('B 回退用联系邮箱', rowB?.email_to === 'office@b.test', rowB?.email_to)
check('C 没有邮件记录', rowC && rowC.email_notification_id === null)
check('邮件模板是 CARRIER_INQUIRY 且待发送',
  rowA?.email_template === 'CARRIER_INQUIRY' && rowA?.email_status === 'PENDING')
check('payload 带路线与单号',
  rowA?.email_payload?.route === 'DE Hamburg → PL Warszawa'
  && rowA?.email_payload?.carrierInquiryNumber === rowA?.carrier_inquiry_number,
  JSON.stringify(rowA?.email_payload))
check('payload 不含客户信息',
  !JSON.stringify(rowA?.email_payload || {}).includes('CIEM 测试客户'))
check('email_recipients 已回写到询价记录',
  Array.isArray(rowA?.email_recipients) && rowA.email_recipients.length === 2,
  JSON.stringify(rowA?.email_recipients))

log('\n【2】sendEmails=false 只登记不发')
const inquiryId2 = (await query(
  `INSERT INTO inquiries (inquiry_number, client_id, business_type, status, route_from, route_to)
   VALUES ('CIEM-INQ-TEST2', $1, 'TRUCK_LTL', 'PENDING_QUOTE', '{}', '{}') RETURNING id`,
  [clientId]
)).rows[0].id
const silent = await call('/carrier-inquiries/batch', manager, 'POST', {
  inquiryId: inquiryId2, carrierIds: [carrierA], sendEmails: false,
})
check('发起成功且 email_queued = 0',
  silent.status === 200 && silent.json?.summary?.email_queued === 0
  && silent.json?.summary?.email_enabled === false,
  JSON.stringify(silent.json?.summary))
const silentRow = (await query(
  `SELECT email_notification_id FROM carrier_inquiries WHERE inquiry_id = $1`, [inquiryId2]
)).rows[0]
check('库里确实没有邮件记录', silentRow.email_notification_id === null)

log('\n【3】补发/重发接口')
check('运营专员重发 → 403',
  (await call(`/carrier-inquiries/${rowC.id}/send-email`, staff, 'POST', {})).status === 403)
const resendC = await call(`/carrier-inquiries/${rowC.id}/send-email`, manager, 'POST', {})
check('C 没邮箱 → 400 明确提示', resendC.status === 400, JSON.stringify(resendC.json))

// 给 C 补上询价邮箱后就能补发
await query(`UPDATE carriers SET inquiry_emails = '["late@c.test"]' WHERE id = $1`, [carrierC])
const resendC2 = await call(`/carrier-inquiries/${rowC.id}/send-email`, manager, 'POST', {})
check('补上邮箱后补发 → 200 且返回收件人',
  resendC2.status === 200 && resendC2.json?.data?.recipients?.[0] === 'late@c.test',
  JSON.stringify(resendC2.json))
const rowC2 = (await query(
  `SELECT ci.email_recipients, n.email_status FROM carrier_inquiries ci
   LEFT JOIN notifications n ON n.id = ci.email_notification_id WHERE ci.id = $1`, [rowC.id]
)).rows[0]
check('补发后询价记录挂上邮件且待发送',
  rowC2.email_status === 'PENDING' && rowC2.email_recipients?.[0] === 'late@c.test')

// 已回价的不允许再发询价邮件
await call(`/carrier-inquiries/${rowA.id}/reply`, manager, 'PUT', { quotedCost: 900 })
const resendQuoted = await call(`/carrier-inquiries/${rowA.id}/send-email`, manager, 'POST', {})
check('已回价 → 400 拒绝重发', resendQuoted.status === 400, JSON.stringify(resendQuoted.json))

// ==================== 收尾 ====================

await cleanupTestData()
server.close()
log(`\n===== 通过 ${pass} 项，失败 ${fail} 项 =====`)
process.exit(fail > 0 ? 1 : 0)
