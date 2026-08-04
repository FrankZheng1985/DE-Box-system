/**
 * 门户账号「悬空绑定」体检（踩坑 035）
 *
 * users.linked_entity_id 指向的 clients / carriers 记录被删掉后，
 * 租户隔离条件 WHERE client_id = <悬空UUID> 永远匹配不到行，
 * 门户每个页面都返回 200 + 空数组、控制台零报错——
 * 客户以为「系统里没有我的单子」，运营也查不出毛病。
 *
 * 这个表没有外键约束（补外键要处理存量脏数据，风险更高），
 * 数据库层面拦不住，所以靠两道防线：
 *   1. 登录时拦（server/modules/auth/routes.js，绑定查不到就拒绝登录）
 *   2. 这个脚本——主动体检，不用等有人登录才发现
 *
 * 用法：
 *   node scripts/check-dangling-entity-bindings.js            # 只查，不改
 *   node scripts/check-dangling-entity-bindings.js --fix \
 *        --bind siemens=安百 --bind speedtrans=SGF            # 按指定公司名改绑
 *
 * --fix 只改 linked_entity_id，**不会启用账号**（is_active 一律不动）。
 * 停用账号的启用是独立的安全决策，要先确认密码已轮换。
 *
 * 退出码：0 = 没有悬空绑定；2 = 存在悬空绑定（--fix 修完会重查后再返回）
 */

import { query } from '../core/db.js'

const log = (m = '') => process.stdout.write(m + '\n')
const RED = (t) => `\x1b[31m${t}\x1b[0m`
const YELLOW = (t) => `\x1b[33m${t}\x1b[0m`
const GREEN = (t) => `\x1b[32m${t}\x1b[0m`
const DIM = (t) => `\x1b[2m${t}\x1b[0m`

/** CLIENT 绑 clients 表，CARRIER 绑 carriers 表 */
const TABLE_BY_TYPE = { CLIENT: 'clients', CARRIER: 'carriers' }

/**
 * 解析 --bind 参数，形如 --bind 用户名=公司名（可重复）
 * @param {string[]} argv
 * @returns {Map<string,string>} 用户名 → 公司名
 */
function parseBindArgs(argv) {
  const map = new Map()
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--bind') continue
    const pair = argv[i + 1] || ''
    const eq = pair.indexOf('=')
    if (eq <= 0) {
      log(RED(`--bind 参数格式不对：${pair}，应为 用户名=公司名`))
      process.exit(1)
    }
    map.set(pair.slice(0, eq), pair.slice(eq + 1))
  }
  return map
}

/**
 * 查出所有门户账号及其绑定是否有效
 * @returns {Promise<Array<object>>}
 */
async function loadPortalUsers() {
  const res = await query(
    `SELECT u.username, u.user_type, u.is_active, u.linked_entity_id,
            (SELECT company_name FROM clients  WHERE id = u.linked_entity_id) AS client_name,
            (SELECT company_name FROM carriers WHERE id = u.linked_entity_id) AS carrier_name
       FROM users u
      WHERE u.user_type IN ('CLIENT', 'CARRIER')
      ORDER BY u.user_type, u.username`
  )
  return res.rows.map((r) => {
    const boundName = r.user_type === 'CLIENT' ? r.client_name : r.carrier_name
    return {
      ...r,
      boundName,
      // 绑定为空是另一回事（requireTenantBinding 会挡），不算悬空
      dangling: Boolean(r.linked_entity_id) && !boundName,
    }
  })
}

/**
 * 按公司名查 UUID
 * @param {string} table clients | carriers
 * @param {string} companyName
 * @returns {Promise<string|null>}
 */
async function findEntityIdByName(table, companyName) {
  // 表名来自固定映射，只有两种取值，不存在注入面
  const res = await query(
    `SELECT id FROM ${table} WHERE company_name = $1`,
    [companyName]
  )
  if (res.rows.length > 1) {
    log(RED(`  公司名「${companyName}」在 ${table} 里有 ${res.rows.length} 条同名记录，不敢猜，请改用 UUID 手工处理`))
    return null
  }
  return res.rows[0]?.id || null
}

async function main() {
  const argv = process.argv.slice(2)
  const doFix = argv.includes('--fix')
  const binds = parseBindArgs(argv)

  log('')
  log('门户账号绑定体检')
  log('─'.repeat(64))

  const users = await loadPortalUsers()
  if (users.length === 0) {
    log(DIM('  没有 CLIENT / CARRIER 类型的账号'))
    process.exit(0)
  }

  for (const u of users) {
    const state = u.dangling
      ? RED('✘ 悬空（绑定的公司已不存在）')
      : !u.linked_entity_id
        ? YELLOW('○ 未绑定')
        : GREEN(`✔ ${u.boundName}`)
    log(`  ${u.username.padEnd(14)} ${u.user_type.padEnd(8)} ${(u.is_active ? '启用' : '停用').padEnd(5)} ${state}`)
    if (u.dangling) log(DIM(`      指向 ${u.linked_entity_id}`))
  }

  const dangling = users.filter((u) => u.dangling)
  log('─'.repeat(64))

  if (dangling.length === 0) {
    log(GREEN('✔ 没有悬空绑定'))
    process.exit(0)
  }

  log(RED(`✘ 发现 ${dangling.length} 个悬空绑定`))

  if (!doFix) {
    log('')
    log(DIM('  改绑：加 --fix --bind 用户名=公司名（可重复）'))
    log(DIM('  注意 --fix 不会启用账号，is_active 一律不动'))
    process.exit(2)
  }

  // ── 修复模式 ──
  log('')
  log('改绑：')
  for (const u of dangling) {
    const wanted = binds.get(u.username)
    if (!wanted) {
      log(YELLOW(`  ${u.username}：没给 --bind，跳过`))
      continue
    }
    const table = TABLE_BY_TYPE[u.user_type]
    const newId = await findEntityIdByName(table, wanted)
    if (!newId) {
      log(RED(`  ${u.username}：在 ${table} 里找不到公司「${wanted}」，跳过`))
      continue
    }
    // 只改绑定，绝不动 is_active
    const upd = await query(
      `UPDATE users SET linked_entity_id = $1, updated_at = NOW()
        WHERE username = $2 AND user_type = $3
        RETURNING username`,
      [newId, u.username, u.user_type]
    )
    if (upd.rowCount === 1) {
      log(GREEN(`  ✔ ${u.username} → ${wanted} (${newId})`))
    } else {
      log(RED(`  ✘ ${u.username} 更新影响 ${upd.rowCount} 行，异常`))
    }
  }

  // 改完重查一遍，以最终状态决定退出码
  log('')
  log('复查：')
  const after = await loadPortalUsers()
  for (const u of after) {
    const state = u.dangling ? RED('✘ 仍悬空') : !u.linked_entity_id ? YELLOW('○ 未绑定') : GREEN(`✔ ${u.boundName}`)
    log(`  ${u.username.padEnd(14)} ${(u.is_active ? '启用' : '停用').padEnd(5)} ${state}`)
  }
  const stillDangling = after.filter((u) => u.dangling).length
  log('─'.repeat(64))
  if (stillDangling === 0) {
    log(GREEN('✔ 悬空绑定已全部处理'))
    process.exit(0)
  }
  log(RED(`✘ 仍有 ${stillDangling} 个悬空绑定`))
  process.exit(2)
}

main().catch((e) => {
  console.error('体检脚本执行失败:', e.message)
  process.exit(1)
})
