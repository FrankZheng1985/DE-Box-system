/**
 * 邮件发送队列
 *
 * 背景：通知引擎（core/notification-engine.js）只负责把通知写进 notifications 表，
 *      需要走邮件的行会被标记 email_status = 'PENDING'。
 *      真正的发信动作由这里完成，再由 utils/cron-jobs.js 定时调用。
 *
 * 这样拆的原因：
 *   - core/ 是纯 ERP 内核，不依赖 utils/ 里的外部服务（SMTP、OSS）
 *   - 发信失败不能拖垮业务事务，所以放在事务之外异步补发
 */

import { query } from '../core/db.js'
import { sendEmail, isConfigured, notificationEmail } from './email-service.js'

// 单次轮询最多处理多少封，避免一次拉太多把 SMTP 打挂
const BATCH_SIZE = 20

// 最多重试几次，超过就标记 FAILED 不再重试
const MAX_ATTEMPTS = 3

// 被领取但超过这个分钟数还没有结果的，认为进程中途挂了，放回队列
const STUCK_MINUTES = 10

/**
 * 处理待发送的邮件通知
 *
 * ⚠️ 生产是 PM2 cluster 模式（-i 2），多个进程会同时跑这个轮询。
 *    所以必须先用 UPDATE ... FOR UPDATE SKIP LOCKED 把记录"领"成 SENDING，
 *    领到的进程才发信，否则同一封邮件会被发两遍。
 *
 * @returns {Promise<{ total: number, sent: number, failed: number, skipped: boolean }>}
 */
export async function processPendingEmails() {
  // SMTP 没配置就别空转，也别把待发记录标成失败（配好后还能补发）
  if (!isConfigured()) {
    console.warn('[邮件队列] SMTP 未配置（缺少 SMTP_USER / SMTP_PASS），跳过本轮发送')
    return { total: 0, sent: 0, failed: 0, skipped: true }
  }

  // 回收上一轮卡死的记录（进程被 kill 时可能停在 SENDING）
  await query(
    `UPDATE notifications SET email_status = 'PENDING'
     WHERE email_status = 'SENDING'
       AND email_claimed_at < NOW() - ($1 || ' minutes')::INTERVAL`,
    [String(STUCK_MINUTES)]
  )

  // 原子领取：一条记录只会被一个进程领到
  const pending = await query(
    `UPDATE notifications SET email_status = 'SENDING', email_claimed_at = NOW()
     WHERE id IN (
       SELECT id FROM notifications
       WHERE email_status = 'PENDING' AND email_to IS NOT NULL
       ORDER BY created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, type, title, message, email_to, email_attempts`,
    [BATCH_SIZE]
  )

  let sent = 0
  let failed = 0

  for (const row of pending.rows) {
    // PostgreSQL 的 INTEGER 经 pg 驱动返回的是数字，但历史行可能为 null
    const attempts = parseInt(row.email_attempts, 10) || 0

    try {
      const { subject, html } = notificationEmail(row.title, row.message)
      const result = await sendEmail({ to: row.email_to, subject, html })

      if (result.skipped) {
        // sendEmail 内部判定未配置，把记录放回队列等下一轮
        await query(`UPDATE notifications SET email_status = 'PENDING' WHERE id = $1`, [row.id])
        continue
      }

      await query(
        `UPDATE notifications
         SET email_status = 'SENT', email_sent_at = NOW(),
             email_attempts = $1, email_error = NULL
         WHERE id = $2`,
        [attempts + 1, row.id]
      )
      sent++
    } catch (err) {
      const nextAttempts = attempts + 1
      // 没到上限就留在 PENDING 等下一轮，到上限才彻底判失败
      const nextStatus = nextAttempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING'

      await query(
        `UPDATE notifications
         SET email_status = $1, email_attempts = $2, email_error = $3
         WHERE id = $4`,
        [nextStatus, nextAttempts, err.message?.slice(0, 500) || '未知错误', row.id]
      )
      failed++
      console.error(`[邮件队列] 通知 ${row.id} 第 ${nextAttempts} 次发送失败: ${err.message}`)
    }
  }

  if (pending.rows.length > 0) {
    console.warn(`[邮件队列] 本轮处理 ${pending.rows.length} 封：成功 ${sent}，失败 ${failed}`)
  }

  return { total: pending.rows.length, sent, failed, skipped: false }
}

export default { processPendingEmails }
