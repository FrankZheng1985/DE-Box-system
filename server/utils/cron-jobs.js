/**
 * 定时任务管理
 * 使用 node-cron 实现周期性业务检查
 */

import cron from 'node-cron'
import { query } from '../core/db.js'
import { notificationEngine } from '../core/index.js'

// 资质到期提醒 - 每天 8:00
cron.schedule('0 8 * * *', async () => {
  try {
    const result = await query(
      `SELECT id, company_name, license_expiry, insurance_expiry
       FROM carriers
       WHERE (license_expiry IS NOT NULL AND license_expiry <= CURRENT_DATE + INTERVAL '30 days')
          OR (insurance_expiry IS NOT NULL AND insurance_expiry <= CURRENT_DATE + INTERVAL '30 days')`
    )
    for (const carrier of result.rows) {
      const parts = []
      if (carrier.license_expiry) parts.push(`营业执照 ${carrier.license_expiry}`)
      if (carrier.insurance_expiry) parts.push(`保险 ${carrier.insurance_expiry}`)
      await notificationEngine.send({
        type: 'QUALIFICATION_EXPIRY',
        title: `承运商资质即将到期: ${carrier.company_name}`,
        content: `到期项: ${parts.join(', ')}`,
        targetRole: 'ADMIN'
      }).catch(() => {})
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
      `SELECT fr.id, fr.document_number, fr.total_amount, fr.currency, fr.due_date,
              c.company_name as client_name
       FROM financial_records fr
       LEFT JOIN clients c ON c.id = fr.client_id
       WHERE fr.due_date < CURRENT_DATE AND fr.status = 'UNPAID'
       ORDER BY fr.due_date`
    )
    for (const record of result.rows) {
      await notificationEngine.send({
        type: 'OVERDUE_PAYMENT',
        title: `账单逾期: ${record.document_number}`,
        content: `客户 ${record.client_name || '未知'}, 金额 ${record.currency} ${record.total_amount}, 到期日 ${record.due_date}`,
        targetRole: 'FINANCE'
      }).catch(() => {})
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

    // 开放当月
    await query(
      `UPDATE posting_periods SET is_open = true, opened_by = '系统自动', opened_at = NOW()
       WHERE fiscal_year = $1 AND period_month = $2 AND is_open = false`,
      [currentYear, currentMonth]
    )
    // 关闭上上月
    await query(
      `UPDATE posting_periods SET is_open = false, closed_by = '系统自动', closed_at = NOW()
       WHERE fiscal_year = $1 AND period_month = $2 AND is_open = true`,
      [closeYear, closeMonth]
    )
    console.warn(`[定时任务] 过账期间管理完成: 开放 ${currentYear}-${currentMonth}, 关闭 ${closeYear}-${closeMonth}`)
  } catch (err) {
    console.error('[定时任务] 过账期间管理失败:', err.message)
  }
})

console.warn('[定时任务] 已注册: 资质到期提醒(8:00), 逾期催款(9:00), 过账期间管理(每月1号)')
