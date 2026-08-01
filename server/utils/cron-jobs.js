/**
 * 定时任务管理
 * 使用 node-cron 实现周期性业务检查
 */

import cron from 'node-cron'
import { query, withTransaction } from '../core/db.js'
import { notificationEngine, NOTIFICATION_TYPES } from '../core/index.js'
import { processPendingEmails } from './email-queue.js'

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

// 账单逾期催款 - 每天 9:00
cron.schedule('0 9 * * *', async () => {
  try {
    const result = await query(
      `SELECT fr.id, fr.record_number, fr.amount, fr.currency, fr.due_date,
              c.company_name as client_name
       FROM financial_records fr
       LEFT JOIN clients c ON c.id = fr.counterparty_id AND fr.counterparty_type = 'CLIENT'
       WHERE fr.due_date < CURRENT_DATE AND fr.payment_status = 'UNPAID'
       ORDER BY fr.due_date`
    )
    if (result.rows.length > 0) {
      await withTransaction(async (client) => {
        const userIds = await notificationEngine.getUserIdsByRoles(client, ['finance', 'sys_admin'])
        if (userIds.length === 0) {
          console.warn('[定时任务] 逾期催款：没有找到财务/管理员用户，跳过通知')
          return
        }
        for (const record of result.rows) {
          await notificationEngine.notify(client, {
            userIds,
            type: NOTIFICATION_TYPES.INVOICE_DUE,
            title: `账单逾期: ${record.record_number}`,
            message: `客户 ${record.client_name || '未知'}, 金额 ${record.currency} ${record.amount}, 到期日 ${record.due_date}`
          })
        }
      })
    }

    console.warn(`[定时任务] 逾期催款检查完成，发现 ${result.rows.length} 条`)
  } catch (err) {
    console.error('[定时任务] 逾期催款检查失败:', err.message)
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

console.warn('[定时任务] 已注册: 邮件队列(每2分钟), 资质到期提醒(8:00), 逾期催款(9:00), 过账期间管理(每月1号)')
