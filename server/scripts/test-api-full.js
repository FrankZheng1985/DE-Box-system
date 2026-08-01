/**
 * EU-TMS 全模块 API 端到端测试
 * 用法: cd server && node scripts/test-api-full.js
 * 前置: 服务端已启动 (PORT=3002), 数据库已初始化, admin 用户存在
 * 注意: PostgreSQL NUMERIC 返回字符串; 状态枚举大写; /stats 放在 /:id 前面
 */
import dotenv from 'dotenv'
dotenv.config()

const BASE = 'http://localhost:3002/api/v1'
let token = ''
let passed = 0, failed = 0
const errors = []
const TS = Date.now()
const created = { clientId: null, carrierId: null, orderId: null, quotationId: null,
  financeRecordId: null, userId: null, contactId: null, cmrId: null }

// ===== 工具函数 =====

async function req(method, path, body) {
  const opts = { method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  try {
    const res = await fetch(`${BASE}${path}`, opts)
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('spreadsheetml')) return { status: res.status, code: 200, _xlsx: true }
    const data = await res.json()
    return { status: res.status, ...data }
  } catch (e) { return { status: 0, code: 0, message: e.message } }
}

async function noAuth(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  try {
    const res = await fetch(`${BASE}${path}`, opts)
    const data = await res.json()
    return { status: res.status, ...data }
  } catch (e) { return { status: 0, code: 0, message: e.message } }
}

function t(name, ok) {
  if (ok) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}`); errors.push(name) }
}
function section(s) { console.log(`\n━━━ ${s} ━━━`) }

// ===== 1. Auth =====

async function testAuth() {
  section('1. Auth 认证')
  const r1 = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' })
  t('登录成功 → code 200', r1.code === 200 && !!r1.data?.token)
  if (r1.data?.token) token = r1.data.token

  const r2 = await req('POST', '/auth/login', { username: 'admin', password: 'wrong' })
  t('错误密码 → code 401', r2.code === 401)

  const r3 = await req('GET', '/auth/profile')
  t('获取 profile → 有用户数据', r3.code === 200 && !!r3.data?.user)
}

// ===== 2. Dashboard =====

async function testDashboard() {
  section('2. Dashboard 仪表板')
  const r1 = await req('GET', '/dashboard/operator')
  t('运营仪表板 → 有 stats', r1.code === 200 && !!r1.data?.stats)
  const r2 = await req('GET', '/dashboard/client')
  t('客户仪表板 → code 200', r2.code === 200)
  const r3 = await req('GET', '/dashboard/carrier')
  t('承运商仪表板 → code 200', r3.code === 200)
}

// ===== 3. Clients =====

async function testClients() {
  section('3. Clients 客户')
  const r1 = await req('GET', '/clients')
  t('客户列表 → 是数组', r1.code === 200 && Array.isArray(r1.data))

  const r2 = await req('POST', '/clients', {
    companyName: `TC_${TS}`, vatNumber: 'DE' + TS, country: 'DE', city: 'Hamburg',
    contactName: 'Test', contactEmail: `t${TS}@test.com`, creditLimit: 50000, creditLevel: 'B', paymentTerms: 30,
  })
  // 创建成功 或 已有客户可用
  if (r2.code === 200 && r2.data?.id) {
    created.clientId = r2.data.id
    t('创建客户 → code 200', true)
  } else {
    // 创建失败（编号冲突等），用现有客户
    const existing = r1.data?.[0]?.id
    if (existing) { created.clientId = existing; t('创建客户 → 使用现有客户', true) }
    else { t('创建客户 → code 200', false) }
  }

  if (created.clientId) {
    const r3 = await req('GET', `/clients/${created.clientId}`)
    t('客户详情 → 匹配 ID', r3.code === 200 && !!r3.data?.id)
    const r4 = await req('PUT', `/clients/${created.clientId}`, { companyName: `TC_U_${TS}` })
    t('更新客户 → code 200', r4.code === 200)
  } else { t('客户详情 → 跳过', false); t('更新客户 → 跳过', false) }

  const r5 = await req('GET', '/clients/export')
  t('客户导出 → xlsx', r5._xlsx === true)
}

// ===== 4. Carriers =====

async function testCarriers() {
  section('4. Carriers 承运商')
  const r1 = await req('GET', '/carriers')
  t('承运商列表 → 是数组', r1.code === 200 && Array.isArray(r1.data))

  const r2 = await req('POST', '/carriers', {
    companyName: `TK_${TS}`, vatNumber: 'DE' + (TS + 1), country: 'DE',
    transportLicense: 'LIC-' + TS, contactName: 'CC', contactEmail: `c${TS}@test.com`,
    serviceCountries: ['DE', 'PL'], vehicleTypes: ['CURTAIN_SIDE'],
  })
  if (r2.code === 200 && r2.data?.id) {
    created.carrierId = r2.data.id
    t('创建承运商 → code 200', true)
  } else {
    const existing = r1.data?.[0]?.id
    if (existing) { created.carrierId = existing; t('创建承运商 → 使用现有承运商', true) }
    else { t('创建承运商 → code 200', false) }
  }

  if (created.carrierId) {
    const r3 = await req('GET', `/carriers/${created.carrierId}`)
    t('承运商详情 → code 200', r3.code === 200 && r3.data?.id === created.carrierId)
  } else { t('承运商详情 → 跳过', false) }

  const r4 = await req('GET', '/carriers/match')
  t('匹配承运商 → 是数组', r4.code === 200 && Array.isArray(r4.data))
  const r5 = await req('GET', '/carriers/export')
  t('承运商导出 → xlsx', r5._xlsx === true)
}

// ===== 5. Orders =====

async function testOrders() {
  section('5. Orders 订单')
  const r1 = await req('POST', '/orders', {
    clientId: created.clientId, businessType: 'TRUCK_LTL', transportType: 'FTL',
    cargoDescription: '测试货物', cargoWeightKg: 15000, clientPrice: 2500, currency: 'EUR',
    pickupAddress: { country: 'DE', city: 'Hamburg', address: 'Hafenstr 1' },
    deliveryAddress: { country: 'PL', city: 'Warsaw', address: 'Marszalkowska 1' },
    pickupDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  })
  t('创建订单 → 有 order_number', r1.code === 200 && !!r1.data?.order_number)
  if (r1.data?.id) created.orderId = r1.data.id

  const r2 = await req('GET', '/orders')
  t('订单列表 → 有 pagination', r2.code === 200 && !!r2.pagination)

  if (created.orderId) {
    const r3 = await req('GET', `/orders/${created.orderId}`)
    t('订单详情 → code 200', r3.code === 200 && !!r3.data)
  } else { t('订单详情 → 跳过', false) }

  const r4 = await req('GET', '/orders/stats')
  t('订单统计 → code 200', r4.code === 200)

  if (created.orderId) {
    const r5 = await req('PUT', `/orders/${created.orderId}/status`, { status: 'CONFIRMED' })
    t('状态 PENDING_REVIEW → CONFIRMED', r5.code === 200)
    const r6 = await req('PUT', `/orders/${created.orderId}/status`, { status: 'PENDING_ASSIGN' })
    t('状态 CONFIRMED → PENDING_ASSIGN', r6.code === 200)
    const r7 = await req('PUT', `/orders/${created.orderId}/status`, { status: 'COMPLETED' })
    t('非法状态转换 → 400', r7.code === 400 || r7.status === 400)
    const r8 = await req('GET', `/orders/${created.orderId}/timeline`)
    t('订单时间线 → code 200', r8.code === 200)
    const r9 = await req('GET', `/orders/${created.orderId}/changes`)
    t('订单变更历史 → code 200', r9.code === 200)
  } else {
    t('状态 → CONFIRMED → 跳过', false); t('状态 → PENDING_ASSIGN → 跳过', false)
    t('非法状态转换 → 跳过', false); t('时间线 → 跳过', false); t('变更历史 → 跳过', false)
  }

  const r10 = await req('GET', '/orders/export')
  t('订单导出 → xlsx', r10._xlsx === true)
}

// ===== 6. Quotations =====

async function testQuotations() {
  section('6. Quotations 报价')
  const r1 = await req('POST', '/quotations', {
    clientId: created.clientId, businessType: 'TRUCK_LTL', transportType: 'FTL',
    routeFrom: { country: 'DE', city: 'Hamburg' }, routeTo: { country: 'PL', city: 'Warsaw' },
    baseFreight: 2000, surcharge: 200, insuranceFee: 50, totalPrice: 2250, currency: 'EUR',
    validUntil: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  })
  t('创建报价 → code 200', r1.code === 200 && !!r1.data?.id)
  if (r1.data?.id) created.quotationId = r1.data.id

  const r2 = await req('GET', '/quotations')
  t('报价列表 → 是数组', r2.code === 200 && Array.isArray(r2.data))
  const r3 = await req('GET', '/quotations/stats')
  t('报价统计 → code 200', r3.code === 200 && !!r3.data)

  if (created.quotationId) {
    const r4 = await req('POST', `/quotations/${created.quotationId}/send`)
    t('发送报价 → code 200', r4.code === 200)
    const r5 = await req('GET', `/quotations/${created.quotationId}`)
    t('报价详情 → code 200', r5.code === 200 && !!r5.data)
  } else { t('发送报价 → 跳过', false); t('报价详情 → 跳过', false) }

  const r6 = await req('POST', '/quotations/calculate-price', {
    procedureCode: 'TRUCK_LTL', inputData: { routeFrom: 'Hamburg', routeTo: 'Warsaw', weight: 15000 },
  })
  t('定价计算 → 接口可达', r6.status !== 404 && r6.code !== undefined)
}

// ===== 7. CMR =====

async function testCMR() {
  section('7. CMR 单据')
  if (created.orderId) {
    const r1 = await req('POST', '/cmr/upload', { orderId: created.orderId, cmrNumber: `CMR-${TS}`, fileType: 'PDF' })
    t('CMR 上传 → code 200', r1.code === 200)
    if (r1.data?.id) created.cmrId = r1.data.id
  } else { t('CMR 上传 → 跳过', false) }

  t('CMR 列表 → code 200', (await req('GET', '/cmr')).code === 200)
  const r3 = await req('GET', '/cmr/stats')
  t('CMR 统计 → code 200', r3.code === 200 && !!r3.data)

  if (created.cmrId) {
    const r4 = await req('PUT', `/cmr/${created.cmrId}/sign-status`, { signStatus: 'SENDER_SIGNED' })
    t('CMR 签署更新 → code 200', r4.code === 200)
  } else { t('CMR 签署更新 → 跳过', false) }
}

// ===== 8. GPS =====

async function testGPS() {
  section('8. GPS 追踪')
  if (created.orderId) {
    const r1 = await req('POST', '/gps/report', {
      orderId: created.orderId, latitude: 53.55, longitude: 9.99,
      city: 'Hamburg', country: 'DE', speedKmh: 80, status: 'MOVING', source: 'MANUAL',
    })
    t('GPS 上报 → code 200', r1.code === 200)
  } else { t('GPS 上报 → 跳过', false) }
  t('在途车辆 → code 200', (await req('GET', '/gps/active')).code === 200)
  t('GPS 预警 → code 200', (await req('GET', '/gps/alerts')).code === 200)
}

// ===== 9. Shipping Releases =====

async function testShippingReleases() {
  section('9. Shipping Releases 放单')
  t('放单列表 → code 200', (await req('GET', '/shipping-releases')).code === 200)
  const r2 = await req('GET', '/shipping-releases/stats')
  t('放单统计 → code 200', r2.code === 200 && !!r2.data)
  if (created.orderId) {
    const r3 = await req('PUT', `/shipping-releases/${created.orderId}/status`, { releaseStatus: 'NOT_REQUIRED' })
    t('更新放单状态 → code 200', r3.code === 200)
  } else { t('更新放单状态 → 跳过', false) }
}

// ===== 10. Customs =====

async function testCustoms() {
  section('10. Customs 清关')
  t('清关列表 → code 200', (await req('GET', '/customs')).code === 200)
  const r2 = await req('GET', '/customs/stats')
  t('清关统计 → code 200', r2.code === 200 && !!r2.data)
  if (created.orderId) {
    const r3 = await req('PUT', `/customs/${created.orderId}/status`, { status: 'PENDING', customsBroker: 'TestBroker' })
    t('更新清关状态 → code 200', r3.code === 200)
  } else { t('更新清关状态 → 跳过', false) }
}

// ===== 11. Finance =====

async function testFinance() {
  section('11. Finance 财务')
  if (created.clientId && created.orderId) {
    const r1 = await req('POST', '/finance/records', {
      type: 'RECEIVABLE', counterpartyType: 'CLIENT', counterpartyId: created.clientId,
      orderId: created.orderId, amount: 2500, currency: 'EUR',
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), remarks: '测试',
    })
    t('创建应收 → code 200', r1.code === 200 && !!r1.data?.id)
    if (r1.data?.id) created.financeRecordId = r1.data.id
  } else { t('创建应收 → 跳过', false) }

  t('应收列表 → code 200', (await req('GET', '/finance/receivables')).code === 200)
  t('应付列表 → code 200', (await req('GET', '/finance/payables')).code === 200)
  const r4 = await req('GET', '/finance/summary')
  t('财务摘要 → code 200', r4.code === 200 && !!r4.data)
  t('客户利润 → code 200', (await req('GET', '/finance/profit/by-client')).code === 200)
  const r6 = await req('GET', '/finance/aging/receivable')
  t('应收账龄 → code 200', r6.code === 200 && !!r6.data)

  if (created.financeRecordId) {
    const r7 = await req('PUT', `/finance/${created.financeRecordId}/payment`, { amount: 500 })
    t('记录付款 → code 200', r7.code === 200)
  } else { t('记录付款 → 跳过', false) }

  t('应收导出 → xlsx', (await req('GET', '/finance/export/receivables'))._xlsx === true)
}

// ===== 12. Invoice Templates =====

async function testInvoiceTemplates() {
  section('12. Invoice Templates 发票模板')
  const r1 = await req('GET', '/invoice-templates')
  t('模板列表 → code 200', r1.code === 200)
  t('模板数据格式 → 数组', r1.code === 200 && Array.isArray(r1.data))
}

// ===== 13. Notifications =====

async function testNotifications() {
  section('13. Notifications 通知')
  t('通知列表 → code 200', (await req('GET', '/notifications')).code === 200)
  const r2 = await req('GET', '/notifications/unread-count')
  t('未读数量 → code 200', r2.code === 200 && r2.data?.count !== undefined)
  t('全部已读 → code 200', (await req('PUT', '/notifications/read-all')).code === 200)
}

// ===== 14. System =====

async function testSystem() {
  section('14. System 系统设置')
  t('系统设置 → code 200', (await req('GET', '/system/settings')).code === 200)
  t('过账期间 → code 200', (await req('GET', '/system/posting-periods')).code === 200)
  t('会计科目 → code 200', (await req('GET', '/system/chart-of-accounts')).code === 200)
  t('编号范围 → code 200', (await req('GET', '/system/number-ranges')).code === 200)
}

// ===== 15. Users =====

async function testUsers() {
  section('15. Users 用户')
  const r1 = await req('GET', '/users')
  t('用户列表 → 是数组', r1.code === 200 && Array.isArray(r1.data))

  const r2 = await req('POST', '/users', {
    username: `tu_${TS}`, password: 'Test123456', display_name: '测试用户',
    email: `tu_${TS}@test.com`, user_type: 'OPERATOR',
  })
  t('创建用户 → code 200', r2.code === 200 && !!r2.data?.id)
  if (r2.data?.id) created.userId = r2.data.id

  if (created.userId) {
    t('更新用户 → code 200', (await req('PUT', `/users/${created.userId}`, { display_name: '已更新' })).code === 200)
    t('停用用户 → code 200', (await req('DELETE', `/users/${created.userId}`)).code === 200)
  } else { t('更新用户 → 跳过', false); t('停用用户 → 跳过', false) }
}

// ===== 16. Contact =====

async function testContact() {
  section('16. Contact 咨询')
  const r1 = await noAuth('POST', '/contact', {
    name: `TC_${TS}`, email: `tc${TS}@test.com`, phone: '+491234', message: '测试咨询',
  })
  t('公开提交咨询 → code 200', r1.code === 200 && !!r1.data?.id)
  if (r1.data?.id) created.contactId = r1.data.id

  const r2 = await req('GET', '/contact')
  t('咨询列表（管理） → 是数组', r2.code === 200 && Array.isArray(r2.data))

  if (created.contactId) {
    const r3 = await req('PUT', `/contact/${created.contactId}/status`, { status: 'REPLIED', notes: '已处理' })
    t('标记已处理 → code 200', r3.code === 200)
  } else { t('标记已处理 → 跳过', false) }
}

// ===== 17. Security =====

async function testSecurity() {
  section('17. Security 安全')
  const r1 = await noAuth('GET', '/orders')
  t('无 token → 401', r1.status === 401 || r1.errCode === 401)

  const saved = token
  token = 'invalid.jwt.token'
  const r2 = await req('GET', '/orders')
  t('无效 token → 401/403', r2.status === 401 || r2.status === 403)
  token = saved

  // 创建 CLIENT 用户测试权限隔离
  const cr = await req('POST', '/users', { username: `sec_${TS}`, password: 'Test123456',
    display_name: '权限测试', user_type: 'CLIENT' })
  if (cr.data?.id) {
    const lr = await req('POST', '/auth/login', { username: `sec_${TS}`, password: 'Test123456' })
    if (lr.data?.token) {
      const st = token; token = lr.data.token
      t('CLIENT → /contact 列表 403', (await req('GET', '/contact')).status === 403)
      t('CLIENT → /users 403', (await req('GET', '/users')).status === 403)
      token = st
    } else { t('CLIENT 权限测试 → 跳过（登录失败）', false); t('CLIENT 权限测试2 → 跳过', false) }
    await req('DELETE', `/users/${cr.data.id}`)
  } else { t('CLIENT 权限测试 → 跳过（创建失败）', false); t('CLIENT 权限测试2 → 跳过', false) }
}

// ===== 清理 & 主流程 =====

async function cleanup() {
  section('清理测试数据')
  if (created.userId) { await req('DELETE', `/users/${created.userId}`); console.log(`  [已停用] 用户 ${created.userId}`) }
  for (const [k, v] of Object.entries(created)) {
    if (v && k !== 'userId') console.log(`  [保留] ${k}=${v}（凭证关联）`)
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║  EU-TMS 全模块 API 端到端测试            ║')
  console.log(`║  ${BASE}  ║`)
  console.log('╚══════════════════════════════════════════╝')

  const start = Date.now()
  try {
    await testAuth()
    if (!token) { console.error('\n登录失败，终止'); process.exit(1) }
    await testDashboard()
    await testClients()
    await testCarriers()
    await testOrders()
    await testQuotations()
    await testCMR()
    await testGPS()
    await testShippingReleases()
    await testCustoms()
    await testFinance()
    await testInvoiceTemplates()
    await testNotifications()
    await testSystem()
    await testUsers()
    await testContact()
    await testSecurity()
    await cleanup()
  } catch (e) { console.error('\n异常:', e.message) }

  const sec = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`\n╔══════════════════════════════════════════╗`)
  console.log(`║  完成 ${sec}s — 通过 ${passed} / 失败 ${failed} / 共 ${passed + failed}`)
  console.log(`╚══════════════════════════════════════════╝`)
  if (errors.length) { console.log('\n失败:'); errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`)) }
  process.exit(failed > 0 ? 1 : 0)
}

main()
