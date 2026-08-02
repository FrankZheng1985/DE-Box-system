/**
 * 开放 API 密钥管理脚本（P8）
 *
 * 密钥明文只在 create / rotate 的输出里出现一次，库里只存 SHA-256。
 * 打印出来后立即通过安全渠道交给合作方，系统里再也查不到明文。
 *
 * 用法（在 server/ 目录下执行）：
 *   node scripts/create-api-key.js list
 *   node scripts/create-api-key.js create --partner-code YIDIDA --partner-name 易抵达 \
 *        --client <客户code或UUID> [--rate 60] [--ips "1.2.3.4,5.6.7.*"] [--remarks 备注]
 *   node scripts/create-api-key.js disable YIDIDA
 *   node scripts/create-api-key.js enable  YIDIDA
 *   node scripts/create-api-key.js rotate  YIDIDA     # 换新钥匙，旧的立即失效
 */

import crypto from 'node:crypto'
import { query, closePool } from '../core/db.js'

const log = (m = '') => process.stdout.write(m + '\n')

function generateKey() {
  // eutms_ + 48 位十六进制（24 字节随机数）
  return 'eutms_' + crypto.randomBytes(24).toString('hex')
}

function hashKey(plainKey) {
  return crypto.createHash('sha256').update(plainKey, 'utf8').digest('hex')
}

/** 解析 --key value 形式的参数 */
function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1]
      i++
    }
  }
  return args
}

/** 客户参数既可以给 client_code 也可以给 UUID */
async function resolveClient(codeOrId) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codeOrId)
  const result = isUuid
    ? await query(`SELECT id, client_code, company_name, status FROM clients WHERE id = $1`, [codeOrId])
    : await query(`SELECT id, client_code, company_name, status FROM clients WHERE client_code = $1`, [codeOrId])
  return result.rows[0] || null
}

/** 建钥匙的操作人：第一个在职 sys_admin（兼任 API 建单时凭证引擎的 created_by，踩坑 019） */
async function resolveCreator() {
  const result = await query(
    `SELECT u.id, u.username FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.role_code = 'sys_admin' AND u.is_active = true
     ORDER BY u.created_at LIMIT 1`
  )
  return result.rows[0] || null
}

async function cmdList() {
  const result = await query(
    `SELECT k.partner_code, k.partner_name, k.key_prefix, k.status,
            k.rate_limit_per_min, k.ip_whitelist, k.last_used_at, k.created_at,
            c.client_code, c.company_name
     FROM api_keys k JOIN clients c ON c.id = k.client_id
     ORDER BY k.created_at`
  )
  if (result.rows.length === 0) { log('（还没有任何 API 密钥）'); return }
  for (const r of result.rows) {
    log(`${r.status === 'ACTIVE' ? '🟢' : '⛔'} ${r.partner_code}（${r.partner_name}）`)
    log(`   前缀 ${r.key_prefix}…  挂靠客户 ${r.client_code} ${r.company_name}`)
    log(`   限速 ${r.rate_limit_per_min}/分钟  IP白名单 ${JSON.stringify(r.ip_whitelist)}`)
    log(`   最近使用 ${r.last_used_at || '从未'}  创建于 ${r.created_at}`)
  }
}

async function cmdCreate(args) {
  const partnerCode = (args['partner-code'] || '').trim().toUpperCase()
  const partnerName = (args['partner-name'] || '').trim()
  if (!partnerCode || !partnerName || !args.client) {
    log('❌ 缺少参数：--partner-code、--partner-name、--client 都是必填')
    process.exitCode = 1
    return
  }

  const existing = await query(`SELECT id FROM api_keys WHERE partner_code = $1`, [partnerCode])
  if (existing.rows.length > 0) {
    log(`❌ 合作方 ${partnerCode} 已有密钥。换钥匙请用 rotate，停用请用 disable。`)
    process.exitCode = 1
    return
  }

  const client = await resolveClient(args.client)
  if (!client) { log(`❌ 找不到客户：${args.client}（client_code 或 UUID）`); process.exitCode = 1; return }
  if (client.status !== 'ACTIVE') log(`⚠️  注意：客户 ${client.client_code} 当前状态是 ${client.status}`)

  const creator = await resolveCreator()
  if (!creator) { log('❌ 系统里没有在职的 sys_admin，无法签发'); process.exitCode = 1; return }

  const rate = Math.max(1, parseInt(args.rate, 10) || 60)
  const ips = (args.ips || '').split(',').map((s) => s.trim()).filter(Boolean)

  const plainKey = generateKey()
  await query(
    `INSERT INTO api_keys
     (partner_code, partner_name, client_id, key_prefix, key_hash,
      status, rate_limit_per_min, ip_whitelist, remarks, created_by)
     VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6,$7,$8,$9)`,
    [partnerCode, partnerName, client.id, plainKey.slice(0, 12), hashKey(plainKey),
     rate, JSON.stringify(ips), args.remarks || null, creator.id]
  )

  log('✅ 密钥已签发')
  log(`   合作方：${partnerCode}（${partnerName}）`)
  log(`   挂靠客户：${client.client_code} ${client.company_name}`)
  log(`   限速：${rate}/分钟  IP白名单：${ips.length ? ips.join(', ') : '不限'}`)
  log('')
  log('   ┌──────────────────── 密钥明文（只显示这一次） ────────────────────┐')
  log(`     ${plainKey}`)
  log('   └──────────────────────────────────────────────────────────────────┘')
  log('   请立即通过安全渠道（不要用邮件明文）交给合作方，库里只存哈希，丢了只能 rotate。')
}

async function setStatus(partnerCode, status) {
  const result = await query(
    `UPDATE api_keys SET status = $1, updated_at = NOW()
     WHERE partner_code = $2 RETURNING partner_code, partner_name`,
    [status, (partnerCode || '').trim().toUpperCase()]
  )
  if (result.rows.length === 0) { log(`❌ 找不到合作方：${partnerCode}`); process.exitCode = 1; return }
  const r = result.rows[0]
  log(`✅ ${r.partner_code}（${r.partner_name}）已${status === 'ACTIVE' ? '启用' : '停用'}`)
}

async function cmdRotate(partnerCode) {
  const code = (partnerCode || '').trim().toUpperCase()
  const plainKey = generateKey()
  const result = await query(
    `UPDATE api_keys
     SET key_prefix = $1, key_hash = $2, status = 'ACTIVE', updated_at = NOW()
     WHERE partner_code = $3 RETURNING partner_code, partner_name`,
    [plainKey.slice(0, 12), hashKey(plainKey), code]
  )
  if (result.rows.length === 0) { log(`❌ 找不到合作方：${partnerCode}`); process.exitCode = 1; return }
  const r = result.rows[0]
  log(`✅ ${r.partner_code}（${r.partner_name}）已换新钥匙，旧钥匙立即失效`)
  log('')
  log('   ┌──────────────────── 密钥明文（只显示这一次） ────────────────────┐')
  log(`     ${plainKey}`)
  log('   └──────────────────────────────────────────────────────────────────┘')
}

const [cmd, ...rest] = process.argv.slice(2)
try {
  if (cmd === 'list') await cmdList()
  else if (cmd === 'create') await cmdCreate(parseArgs(rest))
  else if (cmd === 'disable') await setStatus(rest[0], 'DISABLED')
  else if (cmd === 'enable') await setStatus(rest[0], 'ACTIVE')
  else if (cmd === 'rotate') await cmdRotate(rest[0])
  else {
    log('用法：node scripts/create-api-key.js <list|create|disable|enable|rotate> [参数]')
    log('详见文件头注释')
  }
} catch (err) {
  console.error('❌ 执行失败:', err.message)
  process.exitCode = 1
} finally {
  await closePool()
}
