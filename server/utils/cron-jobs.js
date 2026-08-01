/**
 * 定时任务管理
 * 使用 node-cron 实现周期性业务检查
 */

import cron from 'node-cron'
import { query, withTransaction } from '../core/db.js'
import { notificationEngine, NOTIFICATION_TYPES } from '../core/index.js'
import { processPendingEmails } from './email-queue.js'
import { getBoolSetting, getNumberSetting } from './settings.js'

// 资质到期提醒 - 每天 8:00
cron.schedule('0 8 * * *', async () => {
  try {
    const result = await query(
      `SELECT id, company_name, license_expiry, insurance_expiry
       FROM carriers
       WHERE (license_expiry IS NOT NULL AND license_expiry <= CURRENT_DATE + INTERVAL '30 days')
          OR (insurance_expiry IS NOT NULL AND insurance_expiry <= CURRENT_DATE + INTERVAL '30 days')`
    )

    if (result.rows.length > 0) {
      await withTransaction(async (client) => {
        const userIds = await notificationEngine.getUserIdsByRoles(client, ['sys_admin', 'op_manager'])
        if (userIds.length === 0) {
          console.warn('[定时任务] 资质到期提醒：没有找到管理员用户，跳过通知')
          return
        }
        for (const carrier of result.rows) {
          const parts = []
          if (carrier.license_expiry) parts.push(`营业执照 ${carrier.license_expiry}`)
          if (carrier.insurance_expiry) parts.push(`保险 ${carrier.insurance_expiry}`)
          await notificationEngine.notify(client, {
            userIds,
            type: NOTIFICATION_TYPES.QUALIFICATION_EXPIRING,
            title: `承运商资质即将到期: ${carrier.company_name}`,
            message: `到期项: ${parts.join(', ')}`
          })
        }
      })
    }

    console.warn(`[定时任务] 资质到期检查完成，发现 ${result.rows.length} 条`)
  } catch (err) {
    console.error('[定时任务] 资质到期检查失败:', err.message)
  }
})

// 账单到期提醒 + 逾期催款 + 自动标记逾期 - 每天 9:00
//
// 需求 8：到期前 N 天提醒、逾期催款，两者都要发给客户而不只是内部站内信。
// 提醒天数、开关都读 system_settings，运营在系统设置页能改，不用改代码。
cron.schedule('0 9 * * *', async () => {
  try {
    // ---- 1. 先把已逾期但状态还是 UNPAID 的账单翻成 OVERDUE ----
    // 这一步以前完全没有，逾期账单在系统里一直显示"未付款"，
    // 财务页的逾期统计因此永远是 0。
    if (await getBoolSetting('overdue_auto_flag_enabled', true)) {
      const flagged = await query(
        `UPDATE financial_records
         SET payment_status = 'OVERDUE'
         WHERE due_date < CURRENT_DATE
           AND payment_status = 'UNPAID'
           AND COALESCE(paid_amount, 0) < amount
         RETURNING id`
      )
      if (flagged.rowCount > 0) {
        console.warn(`[定时任务] 自动标记逾期账单 ${flagged.rowCount} 条`)
      }
    }

    // ---- 2. 到期前 N 天提醒 + 逾期催款 ----
    const remindBefore = await getNumberSetting('payment_reminder_days_before', 7)
    const remindEnabled = await getBoolSetting('payment_reminder_enabled', true)
    const overdueEnabled = await getBoolSetting('overdue_reminder_enabled', true)

    // due_date - 今天 的天数：正数=还剩几天，负数=已逾期几天
    const result = await query(
      `SELECT fr.id, fr.record_number, fr.amount, fr.currency, fr.due_date,
              (fr.due_date - CURRENT_DATE) AS days_diff,
              c.id AS client_id, c.company_name AS client_name,
              c.contact_email, c.invoice_email
       FROM financial_records fr
       LEFT JOIN clients c
         ON c.id = fr.counterparty_id AND fr.counterparty_type = 'CLIENT'
       WHERE fr.payment_status IN ('UNPAID', 'OVERDUE')
         AND fr.due_date IS NOT NULL
         AND (fr.due_date < CURRENT_DATE OR fr.due_date = CURRENT_DATE + $1::int)
       ORDER BY fr.due_date`,
      [Math.max(0, Math.round(remindBefore))]
    )

    let mailed = 0
    await withTransaction(async (client) => {
      // 内部站内信照旧发给财务和管理员
      const userIds = await notificationEngine.getUserIdsByRoles(client, ['finance', 'sys_admin'])

      for (const record of result.rows) {
        const daysDiff = Number(record.days_diff)
        const overdue = daysDiff < 0
        if (overdue && !overdueEnabled) continue
        if (!overdue && !remindEnabled) continue

        const title = overdue
          ? `账单逾期: ${record.record_number}`
          : `账单即将到期: ${record.record_number}`
        const message = `客户 ${record.client_name || '未知'}, 金额 ${record.currency} ${record.amount}, 到期日 ${record.due_date}`

        if (userIds.length > 0) {
          await notificationEngine.notify(client, {
            userIds,
            type: NOTIFICATION_TYPES.INVOICE_DUE,
            title,
            message,
          })
        }

        // ---- 发给客户本人 ----
        // 开票邮箱优先（账单类邮件本来就该走财务对接人）
        const to = record.invoice_email || record.contact_email
        if (!to) continue

        // 同一张账单同一天不重复发，避免 cron 因重启/补跑轰炸客户
        const dup = await client.query(
          `SELECT 1 FROM notifications
           WHERE email_to = $1 AND email_template = 'PAYMENT_REMINDER'
             AND email_payload->>'recordNumber' = $2
             AND created_at >= CURRENT_DATE
           LIMIT 1`,
          [to, record.record_number]
        )
        if (dup.rows.length > 0) continue

        const payload = {
          recordNumber: record.record_number,
          clientName: record.client_name || '客户',
          amount: `${record.currency} ${Number(record.amount).toFixed(2)}`,
          dueDate: new Date(record.due_date).toLocaleDateString('de-DE'),
          daysDiff,
        }
        await client.query(
          `INSERT INTO notifications
             (user_id, type, title, message, channel, email_to, email_status,
              email_template, email_payload)
           VALUES (NULL, $1, $2, $3, 'EMAIL', $4, 'PENDING', 'PAYMENT_REMINDER', $5)`,
          [NOTIFICATION_TYPES.INVOICE_DUE, title, message, to, JSON.stringify(payload)]
        )
        mailed++
      }
    })

    console.warn(`[定时任务] 账单提醒完成，命中 ${result.rows.length} 条，客户邮件入队 ${mailed} 封`)
  } catch (err) {
    console.error('[定时任务] 账单提醒失败:', err.message)
  }
})

// 过账期间自动管理 - 每月1号 0:05
cron.schedule('5 0 1 * *', async () => {
  try {
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()
    // 计算上上月
    const closeMonth = currentMonth <= 2 ? currentMonth + 10 : currentMonth - 2
    const closeYear = currentMonth <= 2 ? currentYear - 1 : currentYear

    // ⚠️ opened_by / closed_by 是 UUID 列（REFERENCES users(id)），
    //    原来写的是中文字符串 '系统自动'，每月都报
    //    invalid input syntax for type uuid，这个任务从来没成功过。
    //    系统自动操作没有对应用户，写 NULL；"什么时候开的"看 opened_at / closed_at。
    const opened = await query(
      `UPDATE posting_periods SET is_open = true, opened_by = NULL, opened_at = NOW()
       WHERE fiscal_year = $1 AND period_month = $2 AND is_open = false`,
      [currentYear, currentMonth]
    )
    // 关闭上上月
    const closed = await query(
      `UPDATE posting_periods SET is_open = false, closed_by = NULL, closed_at = NOW()
       WHERE fiscal_year = $1 AND period_month = $2 AND is_open = true`,
      [closeYear, closeMonth]
    )
    console.warn(`[定时任务] 过账期间管理完成: 开放 ${currentYear}-${currentMonth} (${opened.rowCount} 条), 关闭 ${closeYear}-${closeMonth} (${closed.rowCount} 条)`)
  } catch (err) {
    console.error('[定时任务] 过账期间管理失败:', err.message)
  }
})

// 邮件队列轮询 - 每 2 分钟
// 通知引擎只把待发邮件写进 notifications 表，真正的发信在这里做
cron.schedule('*/2 * * * *', async () => {
  try {
    await processPendingEmails()
  } catch (err) {
    console.error('[定时任务] 邮件队列处理失败:', err.message)
  }
})

console.warn('[定时任务] 已注册: 邮件队列(每2分钟), 资质到期提醒(8:00), 账单提醒+逾期标记(9:00), 过账期间管理(每月1号)')
