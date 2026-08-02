/**
 * P8 第四阶段冒烟：Webhook 状态推送
 *
 * 覆盖：订单状态变更入队与投递、HMAC 签名可验证、载荷字段、事件去重、
 *       报价事件（成本字段不外泄）、失败退避排期、重试耗尽判 FAILED、
 *       钥匙停用后不再投递、未配置 Webhook 的合作方不入队。
 *
 * 脚本内自起一个接收端（3095 端口）当合作方系统，按需切换成功/失败。
 *
 * ⚠️ 会写数据，**只能对测试库跑，不要连生产 RDS**：
 *   createdb eu_tms_p8w_test
 *   for f in 100 101 102 103 104 105 106 107 108 109 110 111 112 113 114; do
 *     psql -d eu_tms_p8w_test -f server/database/migrations/${f}_*.sql; done
 *   cd server && DATABASE_URL="postgresql://<用户>@localhost:5432/eu_tms_p8w_test" \
 *     JWT_SECRET="test" node scripts/test-open-api-webhook.js
 */
const log = (m = '') => process.stdout.write(m + '\n')
import express from 'express'
import crypto from 'node:crypto'
import { query } from '../core/db.js'
import { hashKey } from '../modules/open-api/service.js'
import { runWebhookCycle, buildSignatureHeader } from '../modules/open-api/webhook-service.js'

let passed = 0
let failed = 0
function assert(name, cond, extra = '') {
  if (cond) { passed++; log(`  ✅ ${name}`) }
  else { failed++; log(`  ❌ ${name} ${extra}`) }
}

// ==================== 模拟合作方接收端 ====================

const received = []
let respondWith = 200

const receiver = express()
receiver.use(express.raw({ type: '*/*' }))   // 拿原始字节验签，不能用 express.json（会重新序列化）
receiver.post('/hook', (req, res) => {
  received.push({
    rawBody: req.body.toString('utf8'),
    signature: req.get('X-EUTMS-Signature'),
    event: req.get('X-EUTMS-Event'),
    deliveryId: req.get('X-EUTMS-Delivery-Id'),
  })
  res.status(respondWith).send(respondWith === 200 ? 'ok' : 'boom')
})
const receiverServer = receiver.listen(3095)
const HOOK_URL = 'http://127.0.0.1:3095/hook'

/** 按文档描述的方式验签（合作方就该这么写） */
function verifySignature(secret, rawBody, header) {
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')))
  const expected = crypto.createHmac('sha256', secret)
    .update(`${parts.t}.${rawBody}`, 'utf8').digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
}

// ==================== 造测试数据 ====================

const adminRow = await query(
  `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
   WHERE r.role_code = 'sys_admin' AND u.is_active = true LIMIT 1`)
const adminId = adminRow.rows[0].id

const client = await query(
  `INSERT INTO clients (client_code, company_name, status, credit_limit)
   VALUES ('P8WTEST', 'P8W Webhook 测试客户', 'ACTIVE', 0) RETURNING id`)
const clientId = client.rows[0].id

// 测试用签名密钥每次运行随机生成，不写死任何常量（避免被当成真凭据）
const SECRET = crypto.randomBytes(24).toString('hex')
const hookKey = await query(
  `INSERT INTO api_keys (partner_code, partner_name, client_id, key_prefix, key_hash,
                         status, webhook_url, webhook_secret, created_by)
   VALUES ('P8WHOOK','带Webhook合作方',$1,'eutms_wwwwww',$2,'ACTIVE',$3,$4,$5) RETURNING id`,
  [clientId, hashKey('eutms_' + 'w'.repeat(48)), HOOK_URL, SECRET, adminId])
const hookKeyId = hookKey.rows[0].id

// 对照组：同客户但没配 Webhook，其单据不应入队
const plainKey = await query(
  `INSERT INTO api_keys (partner_code, partner_name, client_id, key_prefix, key_hash,
                         status, created_by)
   VALUES ('P8WPLAIN','无Webhook合作方',$1,'eutms_pppppp',$2,'ACTIVE',$3) RETURNING id`,
  [clientId, hashKey('eutms_' + 'p'.repeat(48)), adminId])

// 两张 API 来源的订单（绕开凭证引擎，直接造数据——本测试只关心 webhook 链路）
async function makeOrder(num, source, ref) {
  const r = await query(
    `INSERT INTO orders (order_number, client_id, business_type, status,
                         external_source, external_ref, container_no)
     VALUES ($1,$2,'TRUCK_FTL','PENDING_REVIEW',$3,$4,'MSKU0000001') RETURNING id`,
    [num, clientId, source, ref])
  return r.rows[0].id
}
const orderId = await makeOrder('EU-P8W-0001', 'P8WHOOK', 'HOOK-REF-001')
const plainOrderId = await makeOrder('EU-P8W-0002', 'P8WPLAIN', 'PLAIN-REF-001')

// ==================== 1. 订单状态变更 → 入队 → 投递 ====================
log('\n【1】订单状态变更推送')
{
  await query(
    `INSERT INTO order_status_logs (order_id, from_status, to_status, changed_by, remarks)
     VALUES ($1,'PENDING_REVIEW','CONFIRMED',$2,'冒烟')`, [orderId, adminId])
  await query(
    `INSERT INTO order_status_logs (order_id, from_status, to_status, changed_by, remarks)
     VALUES ($1,'PENDING_REVIEW','CONFIRMED',$2,'对照组不应推送')`, [plainOrderId, adminId])

  const r1 = await runWebhookCycle()
  assert('本轮入队 1 条（未配 Webhook 的合作方不入队）', r1.enqueued === 1, JSON.stringify(r1))
  assert('本轮投递成功 1 条', r1.sent === 1, JSON.stringify(r1))
  assert('接收端收到 1 个请求', received.length === 1)

  const got = received[0]
  assert('签名可用文档所述方式验证通过', verifySignature(SECRET, got.rawBody, got.signature))
  assert('签名对篡改的报文验不过', !verifySignature(SECRET, got.rawBody + 'x', got.signature))

  const body = JSON.parse(got.rawBody)
  assert('事件类型与请求头一致', body.event === 'ORDER_STATUS_CHANGED' && got.event === 'ORDER_STATUS_CHANGED')
  assert('载荷含外部单号/订单号/新状态/中文名',
    body.data.externalOrderNo === 'HOOK-REF-001' && body.data.orderNumber === 'EU-P8W-0001'
    && body.data.toStatus === 'CONFIRMED' && body.data.statusLabel === '已确认',
    JSON.stringify(body.data))

  const dbRow = await query(`SELECT status, attempts, last_status_code FROM api_webhook_deliveries WHERE external_ref = 'HOOK-REF-001'`)
  assert('投递记录标记 SENT + 200', dbRow.rows[0].status === 'SENT' && dbRow.rows[0].last_status_code === 200)

  // 再跑一轮：同一条状态日志不应重复入队（游标回看窗口内会再扫到，靠唯一约束挡住）
  const r2 = await runWebhookCycle()
  assert('重复扫描不重复入队（去重键生效）', r2.enqueued === 0 && received.length === 1, JSON.stringify(r2))
}

// ==================== 2. 报价事件 + 成本不外泄 ====================
log('\n【2】报价事件推送')
{
  const inq = await query(
    `INSERT INTO inquiries (inquiry_number, client_id, business_type, status,
                            external_source, external_ref)
     VALUES ('INQ-P8W-1',$1,'TRUCK_LTL','QUOTED','P8WHOOK','HOOK-INQ-001') RETURNING id`,
    [clientId])
  await query(
    `INSERT INTO quotations (quotation_number, inquiry_id, client_id, version, status,
                             total_price, carrier_cost, currency, valid_until, updated_at)
     VALUES ('QUO-P8W-1',$1,$2,1,'SENT',2000.5,1500.25,'EUR','2026-12-31',NOW())`,
    [inq.rows[0].id, clientId])

  const r = await runWebhookCycle()
  assert('报价发送事件入队并投递', r.enqueued === 1 && r.sent === 1, JSON.stringify(r))

  const body = JSON.parse(received[received.length - 1].rawBody)
  assert('事件类型 INQUIRY_QUOTED + 金额已转数字',
    body.event === 'INQUIRY_QUOTED' && body.data.totalPrice === 2000.5)
  const raw = received[received.length - 1].rawBody
  assert('载荷不含 carrier_cost / 成本值（踩坑 026）', !raw.includes('carrier') && !raw.includes('1500.25'))
}

// ==================== 3. 失败退避与重试耗尽 ====================
log('\n【3】投递失败的退避与重试')
{
  respondWith = 500
  await query(
    `INSERT INTO order_status_logs (order_id, from_status, to_status, changed_by)
     VALUES ($1,'CONFIRMED','IN_TRANSIT',$2)`, [orderId, adminId])

  const before = received.length
  const r = await runWebhookCycle()
  assert('失败投递不计入 sent', r.sent === 0 && received.length === before + 1, JSON.stringify(r))

  const row = await query(
    `SELECT status, attempts, last_status_code, last_error,
            next_attempt_at > NOW() + INTERVAL '30 seconds' AS backed_off
     FROM api_webhook_deliveries WHERE payload->>'toStatus' = 'IN_TRANSIT'`)
  assert('回到 PENDING + attempts=1 + 记录 500 + 排到 1 分钟后',
    row.rows[0].status === 'PENDING' && row.rows[0].attempts === 1
    && row.rows[0].last_status_code === 500 && row.rows[0].backed_off === true,
    JSON.stringify(row.rows[0]))

  const notYet = await runWebhookCycle()
  assert('未到重试时间不会重投', notYet.claimed === 0)

  // 把重试时间拨到现在，连投到耗尽（共 6 次尝试：首投 + 5 次重试）
  const deliveryId = (await query(
    `SELECT id FROM api_webhook_deliveries WHERE payload->>'toStatus' = 'IN_TRANSIT'`)).rows[0].id
  for (let i = 0; i < 5; i++) {
    await query(`UPDATE api_webhook_deliveries SET next_attempt_at = NOW() WHERE id = $1`, [deliveryId])
    await runWebhookCycle()
  }
  const final = await query(
    `SELECT status, attempts FROM api_webhook_deliveries WHERE id = $1`, [deliveryId])
  assert('重试耗尽后判 FAILED（共 6 次尝试）',
    final.rows[0].status === 'FAILED' && final.rows[0].attempts === 6,
    JSON.stringify(final.rows[0]))
  respondWith = 200
}

// ==================== 4. 钥匙停用后不再投递 ====================
log('\n【4】钥匙停用')
{
  await query(`UPDATE api_keys SET status = 'DISABLED' WHERE id = $1`, [hookKeyId])
  await query(
    `INSERT INTO order_status_logs (order_id, from_status, to_status, changed_by)
     VALUES ($1,'IN_TRANSIT','DELIVERED',$2)`, [orderId, adminId])

  const before = received.length
  const r = await runWebhookCycle()
  assert('停用钥匙的事件不入队、不投递',
    (r.skipped === true || (r.enqueued === 0 && r.sent === 0)) && received.length === before,
    JSON.stringify(r))
}

log(`\n═══════════ 结果：${passed} 通过 / ${failed} 失败 ═══════════`)
receiverServer.close()
process.exit(failed > 0 ? 1 : 0)
