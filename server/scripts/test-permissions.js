/**
 * P5 权限体系冒烟测试
 *
 * 覆盖：角色差异、字段级信用权限、客户/承运商门户的租户隔离、
 *       角色权限保存与缓存失效。
 *
 * ⚠️ 会写数据（临时客户、改 op_staff 的权限勾选），**只能对测试库跑，不要连生产 RDS**：
 *   createdb eutms_p5_test
 *   for f in 100 101 102 103 104 105 106 107 108 109; do
 *     psql -d eutms_p5_test -f server/database/migrations/${f}_*.sql; done
 *   cd server && DATABASE_URL="postgresql://<用户>@localhost:5432/eutms_p5_test" \
 *     JWT_SECRET="test" node scripts/test-permissions.js
 *
 * cmr / customs 的模块顶层 mkdirSync('/var/www/...') 原来没有 try/catch，
 * 本机无写权限时 import 就崩；已修好，所以这里能一并挂上。
 */
const log = (m = '') => process.stdout.write(m + '\n')
import express from 'express'
import jwt from 'jsonwebtoken'
import { query } from '../core/db.js'

const app = express()
app.use(express.json())

const authRoutes = (await import('../modules/auth/routes.js')).default
const systemRoutes = (await import('../modules/system/routes.js')).default
const clientRoutes = (await import('../modules/client/routes.js')).default
const carrierRoutes = (await import('../modules/carrier/routes.js')).default
const orderRoutes = (await import('../modules/order/routes.js')).default
const financeRoutes = (await import('../modules/finance/routes.js')).default
const gpsRoutes = (await import('../modules/gps/routes.js')).default
const cmrRoutes = (await import('../modules/cmr/routes.js')).default
const customsRoutes = (await import('../modules/customs/routes.js')).default
const invoiceTemplateRoutes = (await import('../modules/invoice-template/routes.js')).default

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/system', systemRoutes)
app.use('/api/v1/clients', clientRoutes)
app.use('/api/v1/carriers', carrierRoutes)
app.use('/api/v1/orders', orderRoutes)
app.use('/api/v1/finance', financeRoutes)
app.use('/api/v1/gps', gpsRoutes)
app.use('/api/v1/cmr', cmrRoutes)
app.use('/api/v1/customs', customsRoutes)
app.use('/api/v1/invoice-templates', invoiceTemplateRoutes)

const server = app.listen(3099)
const BASE = 'http://127.0.0.1:3099/api/v1'

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

// 【6】会改 op_staff 的权限勾选，先恢复成迁移 109 的默认值，保证脚本可重复跑
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

// 造几个不同角色的身份
const roles = await query(`SELECT id, role_code FROM roles`)
const roleId = Object.fromEntries(roles.rows.map(r => [r.role_code, r.id]))

const adminRow = await query(`SELECT id FROM users WHERE username = 'admin'`)
const adminId = adminRow.rows[0].id
const admin = tokenFor({ id: adminId, username: 'admin', userType: 'OPERATOR', roleCode: 'sys_admin' })
const staff = tokenFor({ id: adminId, username: 'staff', userType: 'OPERATOR', roleCode: 'op_staff' })
const finance = tokenFor({ id: adminId, username: 'fin', userType: 'OPERATOR', roleCode: 'finance' })
const clientUser = tokenFor({ id: adminId, username: 'cu', userType: 'CLIENT', roleCode: 'client_user', linkedEntityId: '11111111-1111-1111-1111-111111111111' })
const clientAdmin = tokenFor({ id: adminId, username: 'ca', userType: 'CLIENT', roleCode: 'client_admin', linkedEntityId: '11111111-1111-1111-1111-111111111111' })
const manager = tokenFor({ id: adminId, username: 'mgr', userType: 'OPERATOR', roleCode: 'op_manager' })
const driver = tokenFor({ id: adminId, username: 'drv', userType: 'CARRIER', roleCode: 'carrier_driver', linkedEntityId: '22222222-2222-2222-2222-222222222222' })

log('\n【1】未登录一律 401')
check('无 token 取客户列表 → 401', (await call('/clients', null)).status === 401)

log('\n【2】安全漏洞已堵：客户/承运商账号不能碰主数据')
check('客户账号取客户列表 → 403', (await call('/clients', clientUser)).status === 403)
check('客户账号取承运商列表 → 403', (await call('/carriers', clientUser)).status === 403)
check('司机账号取承运商列表 → 403', (await call('/carriers', driver)).status === 403)
check('运营专员取客户列表 → 200', (await call('/clients', staff)).status === 200)

log('\n【3】细粒度权限生效')
check('运营专员导出客户(无 client:export) → 403', (await call('/clients/export', staff)).status === 403)
check('财务导出客户(有 client:export) → 200', (await call('/clients/export', finance)).status === 200)
check('运营专员看财务汇总(无 finance:view) → 403', (await call('/finance/summary', staff)).status === 403)
check('财务看财务汇总 → 200', (await call('/finance/summary', finance)).status === 200)
check('运营专员看利润分析(无 finance:profit) → 403', (await call('/finance/profit/by-client', staff)).status === 403)
check('运营专员进角色权限页(无 system:role) → 403', (await call('/system/permissions', staff)).status === 403)
check('sys_admin 进角色权限页 → 200', (await call('/system/permissions', admin)).status === 200)

log('\n【4】信用字段要 client:credit')
const c = await query(`INSERT INTO clients (client_code, company_name, country, status, company_code)
  VALUES ('P5TEST','P5 测试客户','DE','ACTIVE','DE01') RETURNING id`)
const clientId = c.rows[0].id
const editRes = await call(`/clients/${clientId}`, staff, 'PUT', { companyName: 'P5 改名' })
check('运营专员改客户资料(只有 client:view) → 403', editRes.status === 403, JSON.stringify(editRes.json))
const mgrEdit = await call(`/clients/${clientId}`, manager, 'PUT', { companyName: 'P5 改名' })
check('运营经理改客户资料(有 client:edit) → 200', mgrEdit.status === 200, JSON.stringify(mgrEdit.json))
const mgrCredit = await call(`/clients/${clientId}`, manager, 'PUT', { creditLimit: 111 })
check('运营经理改信用额度(有 client:credit) → 200', mgrCredit.status === 200, JSON.stringify(mgrCredit.json))
const finNormal = await call(`/clients/${clientId}`, finance, 'PUT', { companyName: '财务不该改名' })
check('财务改客户资料(无 client:edit) → 403', finNormal.status === 403, JSON.stringify(finNormal.json))
const creditRes = await call(`/clients/${clientId}`, staff, 'PUT', { creditLimit: 999999 })
check('运营专员改信用额度(无 client:credit) → 403', creditRes.status === 403, JSON.stringify(creditRes.json))
const credRes = await call(`/clients/${clientId}`, finance, 'PUT', { creditLimit: 50000 })
check('财务改信用额度(有 client:credit) → 200', credRes.status === 200, JSON.stringify(credRes.json))

log('\n【5】租户隔离：客户改不了别人的 clientId')
check('客户管理员看应收(有 portal:billing_view) → 200', (await call('/finance/receivables?clientId=' + clientId, clientAdmin)).status === 200)
check('客户普通用户看应收(无 portal:billing_view) → 403', (await call('/finance/receivables', clientUser)).status === 403)
check('客户账号看应付 → 403', (await call('/finance/payables', clientAdmin)).status === 403)
check('司机看应收 → 403', (await call('/finance/receivables', driver)).status === 403)

log('\n【5b】门户账号没绑定公司时必须拒绝，而不是放行看全部')
// 各模块的租户过滤都写成 `if (userType==='CLIENT' && linkedEntityId)`，
// 绑定为空时条件整个不加 = 返回全部数据。requireTenantBinding 在入口挡掉这种情况。
const unboundClient = tokenFor({ id: adminId, username: 'unbound', userType: 'CLIENT', roleCode: 'client_admin' })
const unboundCarrier = tokenFor({ id: adminId, username: 'unbound2', userType: 'CARRIER', roleCode: 'carrier_admin' })
check('未绑定公司的客户查订单 → 403', (await call('/orders', unboundClient)).status === 403)
check('未绑定公司的客户查应收 → 403', (await call('/finance/receivables', unboundClient)).status === 403)
check('未绑定公司的承运商查订单 → 403', (await call('/orders', unboundCarrier)).status === 403)
check('绑定正常的客户仍可查订单 → 200', (await call('/orders', clientAdmin)).status === 200)

log('\n【5c】既有问题修复：cmr/customs 能被引入，/rules 不再被 /:id 吞掉')
check('cmr 列表（模块能 import = mkdirSync 已加 try/catch）→ 200', (await call('/cmr', staff)).status === 200)
check('customs 列表 → 200', (await call('/customs', staff)).status === 200)
// /rules 原来排在 /:id 之后被当成 id，而 id 是 UUID → 类型错误 500
const rulesRes = await call('/invoice-templates/rules', finance)
check('发票模板 /rules → 200（原来是 500）', rulesRes.status === 200, JSON.stringify(rulesRes.json))
check('发票模板 /:id 传真 UUID 仍能走到详情逻辑 → 404',
  (await call('/invoice-templates/11111111-1111-1111-1111-111111111111', finance)).status === 404)

log('\n【6】角色权限保存 + 缓存失效')
const saveRes = await call(`/system/roles/${roleId.op_staff}/permissions`, admin, 'PUT',
  { permissions: ['client:view', 'client:export'] })
check('保存 op_staff 权限 → 200', saveRes.status === 200, JSON.stringify(saveRes.json))
check('保存后运营专员能导出客户了（缓存已失效）', (await call('/clients/export', staff)).status === 200)
check('保存后运营专员看不到订单了', (await call('/orders', staff)).status === 403)
check('传不存在的权限码 → 400',
  (await call(`/system/roles/${roleId.op_staff}/permissions`, admin, 'PUT', { permissions: ['bogus:code'] })).status === 400)
check('改 sys_admin 权限 → 400',
  (await call(`/system/roles/${roleId.sys_admin}/permissions`, admin, 'PUT', { permissions: [] })).status === 400)

log('\n【7】登录接口下发权限码')
// 直接查登录逻辑依赖的表比造密码简单：验证 /auth/permissions
const permRes = await call('/auth/permissions', finance)
check('/auth/permissions 返回财务的权限码',
  permRes.status === 200 && permRes.json?.data?.permissions?.includes('finance:post') === false
    && permRes.json?.data?.permissions?.includes('finance:payment'),
  JSON.stringify(permRes.json?.data?.permissions?.slice(0, 5)))

// 清理
await query(`DELETE FROM clients WHERE id = $1`, [clientId])

log(`\n===== 通过 ${pass} 项，失败 ${fail} 项 =====`)
server.close()
process.exit(fail === 0 ? 0 : 1)
