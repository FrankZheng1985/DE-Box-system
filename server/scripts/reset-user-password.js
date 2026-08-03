/**
 * 重置指定账号的登录密码
 *
 * 用法:
 *   node scripts/reset-user-password.js <用户名>
 *
 * 密码在终端交互输入（不回显），不走命令行参数、不走环境变量，
 * 因此不会落进 shell history，也不会出现在任何文件或日志里。
 */

import readline from 'readline'
import bcrypt from 'bcryptjs'
import db from '../core/db.js'

const MIN_LENGTH = 12

/** 隐藏回显地读一行输入 */
function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    })
    // 提示行必须交给 readline 自己输出：question() 会重绘当前行，
    // 若先手写提示、再无条件屏蔽全部输出，重绘会把提示一起擦掉——
    // 终端上看不到任何字，只剩一个光标（实际仍在等输入）。
    // 正确顺序：先放行提示输出，question() 调用之后再静音，只挡击键回显。
    let muted = false
    rl._writeToOutput = (str) => {
      if (!muted) rl.output.write(str)
    }
    rl.question(prompt, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
    muted = true
  })
}

/** 基本强度校验：长度 + 字符种类，挡住 admin123 这类弱口令 */
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
  const username = process.argv[2]
  if (!username) {
    process.stderr.write('用法: node scripts/reset-user-password.js <用户名>\n')
    process.exit(1)
  }

  // 没有终端就隐藏不了输入（ssh host "cmd" 默认不分配 TTY），直接挡下并给出正确命令
  if (!process.stdin.isTTY) {
    process.stderr.write(
      '当前没有终端，密码输入无法隐藏，已中止。\n' +
        `请加 -t 重跑: ssh -t <主机> "cd /var/www/germany-box-system/server && node scripts/reset-user-password.js ${username}"\n`
    )
    process.exit(1)
  }

  const found = await db.query(
    'SELECT id, username, display_name, user_type, is_active FROM users WHERE username = $1',
    [username]
  )
  if (found.rows.length === 0) {
    process.stderr.write(`账号不存在: ${username}\n`)
    process.exit(1)
  }

  const user = found.rows[0]
  process.stdout.write(
    `\n目标账号: ${user.username}（${user.display_name} / ${user.user_type} / ` +
      `${user.is_active ? '启用中' : '已禁用'}）\n` +
      '改完之后，该账号所有已登录的会话在 token 过期后都要重新登录。\n\n'
  )

  const password = await askHidden('请输入新密码（不会显示）: ')
  const problem = checkStrength(password)
  if (problem) {
    process.stderr.write(`密码强度不足：${problem}\n`)
    process.exit(1)
  }

  const confirm = await askHidden('请再输入一次确认: ')
  if (password !== confirm) {
    process.stderr.write('两次输入不一致，已取消，密码未改动\n')
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 10)
  const updated = await db.query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING username',
    [hash, user.id]
  )

  process.stdout.write(`\n✅ 已重置 ${updated.rows[0].username} 的密码，请立刻存进密码管理器\n`)
  await db.closePool()
  process.exit(0)
}

main().catch(async (err) => {
  process.stderr.write(`执行失败: ${err.message}\n`)
  await db.closePool().catch(() => {})
  process.exit(1)
})
