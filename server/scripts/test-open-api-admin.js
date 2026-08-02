/**
 * P8 第二阶段冒烟：admin 端开放 API 管理接口
 *
 * 覆盖：JWT 鉴权、open_api:manage 权限隔离（sys_admin/op_manager 可用、op_staff 403）、
 *       签发（明文只出现一次、重复合作方 400）、列表不含 key_hash、
 *       签发的钥匙对外真实可用、编辑（备注清空存 NULL）、停用/启用即时生效、
 *       换钥匙新旧交替、日志接口分页与筛选。
 *
 * ⚠️ 会写数据，**只能对测试库跑，不要连生产 RDS**：
 *   createdb eu_tms_p8b_test
 *   for f in 100 101 102 103 104 105 106 107 108 109 110 111 112 113; do
 *     psql -d eu_tms_p8b_test -f server/database/migrations/${f}_*.sql; done
 *   cd server && DATABASE_URL="postgresql://<用户>@localhost:5432/eu_tms_p8b_test" \
 *     JWT_SECRET="test" node scripts/test-open-api-admin.js
 *
 * 测试库是一次性的，跑完直接 dropdb。
 */
const log = (m = '') => process.stdout.write(m + '\n')
import express from 'express'
import jwt from 'jsonwebtoken'
import { query } from '../core/db.js'

const adminRoutes = (await import('../modules/open-api/admin-routes.js')).default
const openRoutes = (await import('../modules/open-api/routes.js')).default

const app = express()
app.use(express.json())
app.use('/api/v1/open-api', adminRoutes)
app.use('/api/open/v1', openRoutes)
const server = app.listen(3096)
const BASE = 'http://127.0.0.1:3096'

let passed = 0
let failed = 0
function assert(name, cond, extra = '') {
  if (cond) { passed++; log(`  ✅ ${name}`) }
  else { failed++; log(`  ❌ ${name} ${extra}`) }
}

const tokenFor = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' })

async function call(path, { token, apiKey, method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

// ==================== 造测试数据 ====================

const userRow = await query(
  `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
   WHERE r.role_code = 'sys_admin' AND u.is_active = true LIMIT 1`)
const adminId = userRow.rows[0].id

const client = await query(
  `INSERT INTO clients (client_code, company_name, status, credit_limit)
   VALUES ('P8BTEST', 'P8B 管理端测试客户', 'ACTIVE', 0) RETURNING id`)
const clientId = client.rows[0].id

const admin = tokenFor({ id: adminId, username: 'admin', userType: 'OPERATOR', roleCode: 'sys_admin' })
const manager = tokenFor({ id: adminId, username: 'mgr', userType: 'OPERATOR', roleCode: 'op_manager' })
const staff = tokenFor({ id: adminId, username: 'staff', userType: 'OPERATOR', roleCode: 'op_staff' })

// ==================== 1. 鉴权与权限隔离 ====================
log('\n【1】鉴权与权限隔离')
{
  const r1 = await call('/api/v1/open-api/keys')
  assert('无 token → 401', r1.status === 401)

  const r2 = await call('/api/v1/open-api/keys', { token: staff })
  assert('op_staff（无 open_api:manage）→ 403', r2.status === 403)

  const r3 = await call('/api/v1/open-api/keys', { token: manager })
  assert('op_manager → 200（迁移 113 默认分配生效）', r3.status === 200)

  const r4 = await call('/api/v1/open-api/keys', { token: admin })
  assert('sys_admin → 200', r4.status === 200)
}

// ==================== 2. 签发 ====================
log('\n【2】签发密钥')
let keyId, plainKey
{
  const bad = await call('/api/v1/open-api/keys', { token: admin, method: 'POST', body: { partnerCode: 'X' } })
  assert('缺名称/客户 → 400', bad.status === 400)

  const ok = await call('/api/v1/open-api/keys', {
    token: admin, method: 'POST',
    body: { partnerCode: 'p8b_demo', partnerName: 'P8B 演示合作方', clientId, rateLimitPerMin: 30, ipWhitelist: [' 1.2.3.4 ', ''], remarks: '冒烟' },
  })
  assert('签发 → 200 + 明文（eutms_ 前缀 54 位）', ok.status === 200
    && typeof ok.json.data?.plainKey === 'string'
    && ok.json.data.plainKey.startsWith('eutms_') && ok.json.data.plainKey.length === 54)
  keyId = ok.json.data.id
  plainKey = ok.json.data.plainKey

  const dup = await call('/api/v1/open-api/keys', {
    token: admin, method: 'POST',
    body: { partnerCode: 'P8B_DEMO', partnerName: '重复', clientId },
  })
  assert('同合作方代码（小写也算）重复签发 → 400', dup.status === 400)

  const list = await call('/api/v1/open-api/keys', { token: admin })
  const row = list.json.data.find((k) => k.id === keyId)
  assert('列表含新钥匙且 partner_code 已大写、IP 已清洗', !!row
    && row.partner_code === 'P8B_DEMO' && JSON.stringify(row.ip_whitelist) === '["1.2.3.4"]')
  assert('列表响应不含 key_hash（踩坑 026）', !JSON.stringify(list.json).includes('key_hash'))
}

// ==================== 3. 签发的钥匙对外真实可用 ====================
log('\n【3】对外可用性与 IP 白名单联动')
{
  const blocked = await call('/api/open/v1/ping', { apiKey: plainKey })
  assert('白名单外来源 → 403', blocked.status === 403)

  // 放开白名单再试
  await call(`/api/v1/open-api/keys/${keyId}`, { token: admin, method: 'PUT', body: { ipWhitelist: [] } })
  const ok = await call('/api/open/v1/ping', { apiKey: plainKey })
  assert('清空白名单后 ping → 200 且认出合作方', ok.status === 200 && ok.json.data?.partnerCode === 'P8B_DEMO')
}

// ==================== 4. 编辑 ====================
log('\n【4】编辑档案')
{
  const r = await call(`/api/v1/open-api/keys/${keyId}`, {
    token: admin, method: 'PUT', body: { rateLimitPerMin: 99, remarks: '  ' },
  })
  assert('编辑 → 200', r.status === 200)
  const row = await query(`SELECT rate_limit_per_min, remarks FROM api_keys WHERE id = $1`, [keyId])
  assert('限速已改 + 清空备注存 NULL（P7 遗留教训）',
    row.rows[0].rate_limit_per_min === 99 && row.rows[0].remarks === null)

  const empty = await call(`/api/v1/open-api/keys/${keyId}`, { token: admin, method: 'PUT', body: {} })
  assert('空更新 → 400', empty.status === 400)

  const notFound = await call('/api/v1/open-api/keys/00000000-0000-0000-0000-000000000000', {
    token: admin, method: 'PUT', body: { remarks: 'x' },
  })
  assert('不存在的 id → 404', notFound.status === 404)
}

// ==================== 5. 停用 / 启用 / 换钥匙 ====================
log('\n【5】停用 / 启用 / 换钥匙')
{
  await call(`/api/v1/open-api/keys/${keyId}/disable`, { token: admin, method: 'POST' })
  const off = await call('/api/open/v1/ping', { apiKey: plainKey })
  assert('停用后对外 → 403（即时生效）', off.status === 403)

  await call(`/api/v1/open-api/keys/${keyId}/enable`, { token: admin, method: 'POST' })
  const on = await call('/api/open/v1/ping', { apiKey: plainKey })
  assert('启用后对外恢复 → 200', on.status === 200)

  const rot = await call(`/api/v1/open-api/keys/${keyId}/rotate`, { token: admin, method: 'POST' })
  const newKey = rot.json.data?.plainKey
  assert('换钥匙 → 200 + 新明文', rot.status === 200 && typeof newKey === 'string' && newKey !== plainKey)

  const oldTry = await call('/api/open/v1/ping', { apiKey: plainKey })
  const newTry = await call('/api/open/v1/ping', { apiKey: newKey })
  assert('旧钥匙 401 / 新钥匙 200', oldTry.status === 401 && newTry.status === 200)
}

// ==================== 6. 日志接口 ====================
log('\n【6】日志接口')
{
  await new Promise((r) => setTimeout(r, 400)) // 留痕是 fire-and-forget，等落盘

  const all = await call('/api/v1/open-api/logs?page=1&pageSize=5', { token: admin })
  assert('日志列表 → 200 + 分页结构', all.status === 200
    && Array.isArray(all.json.data) && typeof all.json.pagination?.total === 'number')

  const authFail = await call('/api/v1/open-api/logs?result=AUTH_ERROR', { token: admin })
  assert('按结果筛选（旧钥匙 401 已留痕）', authFail.status === 200
    && authFail.json.data.length >= 1 && authFail.json.data.every((l) => l.result === 'AUTH_ERROR'))

  const byPartner = await call('/api/v1/open-api/logs?partnerCode=P8B_DEMO', { token: admin })
  assert('按合作方筛选', byPartner.status === 200 && byPartner.json.data.every((l) => l.partner_code === 'P8B_DEMO'))

  const staffTry = await call('/api/v1/open-api/logs', { token: staff })
  assert('op_staff 看日志 → 403', staffTry.status === 403)
}

// ==================== 7. Webhook 配置（P8 第四阶段） ====================
log('\n【7】Webhook 配置')
{
  const bad = await call(`/api/v1/open-api/keys/${keyId}`, {
    token: admin, method: 'PUT', body: { webhookUrl: '不是URL' },
  })
  assert('非法 Webhook 地址 → 400', bad.status === 400)

  const ok = await call(`/api/v1/open-api/keys/${keyId}`, {
    token: admin, method: 'PUT', body: { webhookUrl: 'https://partner.example.com/hook' },
  })
  assert('配置 Webhook 地址 → 200', ok.status === 200)

  const list = await call('/api/v1/open-api/keys', { token: admin })
  const row = list.json.data.find((k) => k.id === keyId)
  assert('列表回传 webhook_url + 自动生成的签名密钥（48 位 hex）',
    row.webhook_url === 'https://partner.example.com/hook'
    && /^[0-9a-f]{48}$/.test(row.webhook_secret || ''))
  assert('列表仍不含 key_hash', !JSON.stringify(list.json).includes('key_hash'))

  const firstSecret = row.webhook_secret
  await call(`/api/v1/open-api/keys/${keyId}`, {
    token: admin, method: 'PUT', body: { webhookUrl: 'https://partner.example.com/hook2' },
  })
  const list2 = await call('/api/v1/open-api/keys', { token: admin })
  const row2 = list2.json.data.find((k) => k.id === keyId)
  assert('改地址不会刷掉已交付合作方的签名密钥', row2.webhook_secret === firstSecret)

  const rot = await call(`/api/v1/open-api/keys/${keyId}/webhook-secret/rotate`, { token: admin, method: 'POST' })
  assert('换签名密钥 → 200 + 新密钥', rot.status === 200
    && /^[0-9a-f]{48}$/.test(rot.json.data?.webhookSecret || '')
    && rot.json.data.webhookSecret !== firstSecret)

  const clear = await call(`/api/v1/open-api/keys/${keyId}`, {
    token: admin, method: 'PUT', body: { webhookUrl: '' },
  })
  const list3 = await call('/api/v1/open-api/keys', { token: admin })
  assert('清空地址 → webhook_url 存 NULL（停止推送）', clear.status === 200
    && list3.json.data.find((k) => k.id === keyId).webhook_url === null)

  const deliveries = await call('/api/v1/open-api/webhook-deliveries', { token: admin })
  assert('投递记录接口 → 200 + 分页结构', deliveries.status === 200
    && Array.isArray(deliveries.json.data) && typeof deliveries.json.pagination?.total === 'number')

  const staffDeliveries = await call('/api/v1/open-api/webhook-deliveries', { token: staff })
  assert('op_staff 看投递记录 → 403', staffDeliveries.status === 403)
}

log(`\n═══════════ 结果：${passed} 通过 / ${failed} 失败 ═══════════`)
server.close()
process.exit(failed > 0 ? 1 : 0)
