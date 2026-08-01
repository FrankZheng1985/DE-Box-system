/**
 * 通知邮件链路自检脚本
 *
 * 走的是完整链路（不是直接调 SMTP）：
 *   写入 notifications 表(email_status=PENDING) → email-queue 轮询领取 → sendEmail → 回写 SENT
 * 这样能一次性验证"通知引擎 → 邮件队列 → SMTP"三段都是通的。
 *
 * 用法：
 *   cd server && node scripts/test-notification-email.js <收件邮箱>
 *
 * 例：
 *   node scripts/test-notification-email.js fengzheng9@icloud.com
 */

import dotenv from 'dotenv'
import { query, closePool } from '../core/db.js'
import { isConfigured } from '../utils/email-service.js'
import { processPendingEmails } from '../utils/email-queue.js'

dotenv.config()

const targetEmail = process.argv[2]

if (!targetEmail || !targetEmail.includes('@')) {
  console.error('用法: node scripts/test-notification-email.js <收件邮箱>')
  process.exit(1)
}

async function main() {
  console.warn('========== 通知邮件链路自检 ==========')

  // 1. SMTP 配置检查
  console.warn('\n[1/4] 检查 SMTP 配置')
  console.warn(`  SMTP_HOST = ${process.env.SMTP_HOST || '(未设置)'}`)
  console.warn(`  SMTP_PORT = ${process.env.SMTP_PORT || '(未设置)'}`)
  console.warn(`  SMTP_USER = ${process.env.SMTP_USER || '(未设置)'}`)
  console.warn(`  SMTP_PASS = ${process.env.SMTP_PASS ? '已设置' : '(未设置)'}`)
  console.warn(`  SMTP_FROM = ${process.env.SMTP_FROM || '(未设置，将退回 SMTP_USER)'}`)

  if (!isConfigured()) {
    console.error('\n❌ SMTP 未配置（缺少 SMTP_USER / SMTP_PASS），无法发信')
    console.error('   请在 server/.env 补齐后，用 pm2 delete all && pm2 start 重启（踩坑 005）')
    process.exit(1)
  }
  console.warn('  ✅ SMTP 已配置')

  // 2. 找一个用户挂这条通知（notifications.user_id 有外键约束）
  console.warn('\n[2/4] 查找 admin 用户')
  const userResult = await query(
    `SELECT id, username FROM users WHERE user_type = 'OPERATOR' AND is_active = true
     ORDER BY created_at LIMIT 1`
  )
  if (userResult.rows.length === 0) {
    console.error('❌ 没有找到可用的运营用户')
    process.exit(1)
  }
  const user = userResult.rows[0]
  console.warn(`  ✅ 使用用户 ${user.username}`)

  // 3. 写一条待发邮件通知（email_to 直接指定收件人，不走用户自己的邮箱）
  console.warn('\n[3/4] 写入待发送通知')
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Europe/Berlin' })
  const inserted = await query(
    `INSERT INTO notifications
       (user_id, type, title, message, channel, email_to, email_status)
     VALUES ($1, 'STATUS_UPDATE', $2, $3, 'EMAIL', $4, 'PENDING')
     RETURNING id`,
    [
      user.id,
      'EU-TMS 邮件链路测试',
      `这是一封系统自检邮件，说明"通知引擎 → 邮件队列 → SMTP"整条链路已经打通。\n发送时间（柏林时间）：${timestamp}`,
      targetEmail
    ]
  )
  const notificationId = inserted.rows[0].id
  console.warn(`  ✅ 通知已入库: ${notificationId}`)

  // 4. 立即跑一次队列（生产环境是每 2 分钟自动跑）
  console.warn('\n[4/4] 执行邮件队列')
  const result = await processPendingEmails()
  console.warn(`  处理 ${result.total} 封：成功 ${result.sent}，失败 ${result.failed}`)

  // 回查这条记录的最终状态
  const final = await query(
    `SELECT email_status, email_to, email_sent_at, email_attempts, email_error
     FROM notifications WHERE id = $1`,
    [notificationId]
  )
  const row = final.rows[0]

  console.warn('\n========== 结果 ==========')
  console.warn(`  收件人   : ${row.email_to}`)
  console.warn(`  状态     : ${row.email_status}`)
  console.warn(`  发送时间 : ${row.email_sent_at || '-'}`)
  console.warn(`  尝试次数 : ${row.email_attempts}`)
  if (row.email_error) console.warn(`  错误信息 : ${row.email_error}`)

  if (row.email_status === 'SENT') {
    console.warn(`\n✅ 发送成功，请到 ${targetEmail} 查收（注意看垃圾邮件箱）`)
  } else {
    console.error('\n❌ 发送未成功，请看上面的错误信息')
    process.exitCode = 1
  }
}

main()
  .catch((err) => {
    console.error('自检脚本执行失败:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await closePool()
  })
