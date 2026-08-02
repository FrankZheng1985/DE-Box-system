/**
 * 给指定客户开一个客户门户账号
 *
 * 用法:
 *   node scripts/create-client-portal-user.js <客户编码> <登录用户名> <邮箱> <显示名>
 * 例:
 *   node scripts/create-client-portal-user.js C-00002 yineng suling@yineng56.com "苏凌（翼能）"
 *
 * 账号固定为 user_type=CLIENT + 角色 client_admin，并绑定 linked_entity_id 到该客户，
 * 因此只能看到自己公司的数据（门户接口一律以 JWT 里的 linkedEntityId 做租户隔离）。
 * 密码在终端交互输入（不回显），不落 shell history、不写进任何文件。
 */

import readline from 'readline'
import bcrypt from 'bcryptjs'
import db from '../core/db.js'

const MIN_LENGTH = 12

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    })
    process.stdout.write(prompt)
    rl._writeToOutput = () => {}
    rl.question('', (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

function checkStrength(password) {
  if (password.length < MIN_LENGTH) {
    return `密码至少 ${MIN_LENGTH} 位，当前 ${password.length} 位`
  }
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length
  if (kinds < 3) {
    return '密码需包含大写字母、小写字母、数字、符号中的至少三类'
  }
  return null
}

async function main() {
  const [clientCode, username, email, displayName] = process.argv.slice(2)
  if (!clientCode || !username || !email || !displayName) {
    process.stderr.write(
      '用法: node scripts/create-client-portal-user.js <客户编码> <登录用户名> <邮箱> <显示名>\n'
    )
    process.exit(1)
  }

  const clientRow = await db.query(
    'SELECT id, client_code, company_name, status FROM clients WHERE client_code = $1',
    [clientCode]
  )
  if (clientRow.rows.length === 0) {
    process.stderr.write(`客户不存在: ${clientCode}\n`)
    process.exit(1)
  }
  const target = clientRow.rows[0]

  const dup = await db.query('SELECT username FROM users WHERE username = $1', [username])
  if (dup.rows.length > 0) {
    process.stderr.write(`用户名已被占用: ${username}\n`)
    process.exit(1)
  }

  const role = await db.query("SELECT id, role_name FROM roles WHERE role_code = 'client_admin'")
  if (role.rows.length === 0) {
    process.stderr.write('角色 client_admin 不存在，请先检查角色表\n')
    process.exit(1)
  }

  process.stdout.write(
    `\n将为客户「${target.company_name}」(${target.client_code}, ${target.status}) 创建门户账号:\n` +
      `  登录名: ${username}\n  邮箱:   ${email}\n  显示名: ${displayName}\n` +
      `  角色:   ${role.rows[0].role_name} (CLIENT，仅能访问本客户数据)\n\n`
  )

  const password = await askHidden('请输入该账号的初始密码（不会显示）: ')
  const problem = checkStrength(password)
  if (problem) {
    process.stderr.write(`密码强度不足：${problem}\n`)
    process.exit(1)
  }
  const confirm = await askHidden('请再输入一次确认: ')
  if (password !== confirm) {
    process.stderr.write('两次输入不一致，已取消，未创建账号\n')
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 10)

  await db.withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO users (username, password_hash, email, display_name, role_id,
         user_type, linked_entity_id, is_active)
       VALUES ($1, $2, $3, $4, $5, 'CLIENT', $6, true)
       RETURNING id`,
      [username, hash, email, displayName, role.rows[0].id, target.id]
    )
    await client.query(
      `INSERT INTO user_org_assignments (user_id, company_code, is_default)
       VALUES ($1, 'DE01', true)
       ON CONFLICT (user_id, company_code, business_area) DO NOTHING`,
      [inserted.rows[0].id]
    )
  })

  process.stdout.write(
    `\n✅ 已创建客户门户账号 ${username}\n` +
      '   登录地址: https://kalunasped.com/customer/\n' +
      '   请把密码通过安全渠道交给对方，并存进密码管理器\n'
  )
  await db.closePool()
  process.exit(0)
}

main().catch(async (err) => {
  process.stderr.write(`执行失败: ${err.message}\n`)
  await db.closePool().catch(() => {})
  process.exit(1)
})
