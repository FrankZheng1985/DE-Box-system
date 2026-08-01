/**
 * 邮件服务
 * 基于 nodemailer，通过环境变量配置 SMTP
 * 环境变量: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

import nodemailer from 'nodemailer'

// SMTP 配置
const smtpConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
}

const defaultFrom = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@eu-tms.com'

// 创建 transporter（延迟初始化，避免未配置时报错）
let transporter = null

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport(smtpConfig)
  }
  return transporter
}

/**
 * 检查 SMTP 是否已配置
 */
export function isConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS)
}

/**
 * 发送邮件
 * @param {Object} options
 * @param {string} options.to - 收件人
 * @param {string} options.subject - 主题
 * @param {string} options.html - HTML 内容
 * @param {Array} [options.attachments] - 附件 [{filename, content, contentType}]
 * @returns {Promise<Object>} 发送结果
 */
export async function sendEmail({ to, subject, html, attachments = [] }) {
  if (!isConfigured()) {
    console.warn('[邮件服务] SMTP 未配置（缺少 SMTP_USER / SMTP_PASS），跳过发送')
    return { skipped: true, reason: 'SMTP 未配置' }
  }

  try {
    const result = await getTransporter().sendMail({
      from: defaultFrom,
      to,
      subject,
      html,
      attachments,
    })
    return { success: true, messageId: result.messageId }
  } catch (error) {
    console.error('[邮件服务] 发送失败:', error.message)
    throw error
  }
}

// ========================
// 邮件模板
// ========================

/**
 * 通用邮件外壳
 */
function emailWrapper(title, bodyHtml) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <!-- 页眉 -->
        <tr><td style="background:#1e293b;padding:24px 32px;">
          <span style="color:#fff;font-size:20px;font-weight:bold;">EU-TMS</span>
          <span style="color:#94a3b8;font-size:12px;margin-left:12px;">${title}</span>
        </td></tr>
        <!-- 内容 -->
        <tr><td style="padding:32px;">
          ${bodyHtml}
        </td></tr>
        <!-- 页脚 -->
        <tr><td style="background:#f1f5f9;padding:16px 32px;text-align:center;">
          <p style="margin:0;color:#94a3b8;font-size:11px;">
            EU-TMS | European Transport Management System<br/>
            此邮件由系统自动发送，请勿直接回复
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * 通用通知邮件模板
 * 系统通知走邮件渠道时统一用这个模板（由 utils/email-queue.js 调用）
 * @param {string} title - 通知标题
 * @param {string} [message] - 通知正文
 * @returns {{ subject: string, html: string }}
 */
export function notificationEmail(title, message) {
  const subject = `[EU-TMS] ${title}`
  // 通知标题/正文里会拼客户名、承运商名等外部可控内容，先转义再换行
  const bodyText = esc(message || '').replace(/\n/g, '<br/>')
  const html = emailWrapper('系统通知', `
    <h2 style="color:#1e293b;margin:0 0 16px;font-size:18px;">${esc(title)}</h2>
    ${bodyText ? `<p style="color:#475569;line-height:1.6;font-size:14px;">${bodyText}</p>` : ''}
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
      登录 EU-TMS 系统查看详情。
    </p>
  `)
  return { subject, html }
}

/**
 * HTML 转义
 *
 * 模板里所有来自数据库/用户输入的值都要过这一层。
 * 客户名、备注这些字段客户自己填得进内容，不转义就是把 HTML 注入
 * 直接送进收件人的邮箱（客户名写成 `<script>` 或伪造一个假按钮）。
 */
function esc(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 报价确认邮件（需求 5.2）
 *
 * 系统没有 IMAP 收信能力，做不了"解析客户回复邮件"，
 * 改为邮件里放三个带一次性 token 的确认链接，客户点哪个就回写哪个状态。
 *
 * ⚠️ 三个链接都是 GET，会被邮件客户端的安全扫描器预取。
 *    所以链接落地页只是**展示确认页**，真正改状态要在页面上再点一次（POST）。
 *
 * @param {object} p
 * @param {string} p.quotationNumber 报价单号
 * @param {string} p.clientName      客户名称
 * @param {string} p.route           路线描述
 * @param {string} p.totalPrice      报价金额（已格式化）
 * @param {string} [p.validUntil]    有效期
 * @param {string} [p.remarks]       备注
 * @param {string} p.acceptUrl       同意链接
 * @param {string} p.rejectUrl       拒绝链接
 * @param {string} p.pendingUrl      待定链接
 * @returns {{ subject: string, html: string }}
 */
export function quotationEmail(p) {
  const subject = `[EU-TMS] 报价单 ${p.quotationNumber} 请确认`

  const row = (label, value) => value
    ? `<tr><td style="padding:10px 14px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">${esc(label)}</td>
           <td style="padding:10px 14px;color:#1e293b;font-size:13px;border-bottom:1px solid #f1f5f9;">${esc(value)}</td></tr>`
    : ''

  // 邮件客户端对 flex/grid 支持极差，按钮用表格排，才能在 Outlook 里也不散架
  const button = (url, text, bg) =>
    `<td align="center" style="padding:0 6px;">
       <a href="${esc(url)}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;
          padding:12px 22px;border-radius:6px;font-size:14px;font-weight:bold;">${esc(text)}</a>
     </td>`

  const html = emailWrapper('报价确认', `
    <h2 style="color:#1e293b;margin:0 0 16px;font-size:18px;">您的报价已出</h2>
    <p style="color:#475569;line-height:1.6;font-size:14px;">
      尊敬的 <strong>${esc(p.clientName)}</strong>，您好！
    </p>
    <p style="color:#475569;line-height:1.6;font-size:14px;">
      报价单 <strong style="color:#2563eb;">${esc(p.quotationNumber)}</strong> 详情如下，请确认：
    </p>

    <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:6px;">
      ${row('路线', p.route)}
      ${row('有效期至', p.validUntil)}
      ${row('备注', p.remarks)}
      <tr>
        <td style="padding:14px;color:#64748b;font-size:13px;">报价金额</td>
        <td style="padding:14px;color:#2563eb;font-size:20px;font-weight:bold;">${esc(p.totalPrice)}</td>
      </tr>
    </table>

    <p style="color:#475569;font-size:14px;margin:24px 0 12px;">请选择：</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
      ${button(p.acceptUrl,  '同意报价', '#16a34a')}
      ${button(p.pendingUrl, '暂时待定', '#d97706')}
      ${button(p.rejectUrl,  '拒绝报价', '#dc2626')}
    </tr></table>

    <p style="color:#94a3b8;font-size:12px;margin-top:24px;line-height:1.6;">
      点击「同意报价」后，系统会自动为您生成运输订单并转入我司审核。<br/>
      以上链接仅可使用一次${p.validUntil ? `，并在 ${esc(p.validUntil)} 后失效` : ''}。<br/>
      您也可以登录客户门户，在「我的报价」中完成确认。
    </p>
  `)
  return { subject, html }
}

/**
 * 账单到期 / 逾期提醒邮件（需求 8）
 *
 * @param {object} p
 * @param {string} p.recordNumber 账单号
 * @param {string} p.clientName   客户名称
 * @param {string} p.amount       金额（已格式化）
 * @param {string} p.dueDate      到期日
 * @param {number} p.daysDiff     距到期天数；正数=还剩几天，负数=已逾期几天
 * @returns {{ subject: string, html: string }}
 */
export function paymentReminderEmail(p) {
  const overdue = p.daysDiff < 0
  const days = Math.abs(p.daysDiff)
  const headline = overdue ? `账单已逾期 ${days} 天` : `账单将于 ${days} 天后到期`
  const subject = `[EU-TMS] ${overdue ? '逾期催款' : '账单到期提醒'} - ${p.recordNumber}`
  const accent = overdue ? '#dc2626' : '#d97706'

  const html = emailWrapper(overdue ? '逾期催款' : '账单提醒', `
    <h2 style="color:${accent};margin:0 0 16px;font-size:18px;">${esc(headline)}</h2>
    <p style="color:#475569;line-height:1.6;font-size:14px;">
      尊敬的 <strong>${esc(p.clientName)}</strong>，您好！
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:6px;">
      <tr>
        <td style="padding:10px 14px;color:#64748b;font-size:13px;">账单号</td>
        <td style="padding:10px 14px;color:#1e293b;font-size:13px;font-weight:bold;">${esc(p.recordNumber)}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;color:#64748b;font-size:13px;">到期日</td>
        <td style="padding:10px 14px;color:${accent};font-size:13px;font-weight:bold;">${esc(p.dueDate)}</td>
      </tr>
      <tr>
        <td style="padding:14px;color:#64748b;font-size:13px;">应付金额</td>
        <td style="padding:14px;color:${accent};font-size:20px;font-weight:bold;">${esc(p.amount)}</td>
      </tr>
    </table>
    <p style="color:#475569;font-size:13px;">
      ${overdue ? '请尽快安排付款。' : '请在到期日前完成付款。'}如已付款请忽略本邮件，或联系财务部门核对。
    </p>
  `)
  return { subject, html }
}

/**
 * 订单确认邮件模板
 * @param {string} orderNumber - 订单号
 * @param {string} clientName - 客户名称
 * @param {string} route - 路线描述 (如 "Hamburg → Munich")
 * @returns {{ subject: string, html: string }}
 */
export function orderConfirmationEmail(orderNumber, clientName, route) {
  const subject = `[EU-TMS] 订单确认 - ${orderNumber}`
  const html = emailWrapper('订单确认', `
    <h2 style="color:#1e293b;margin:0 0 16px;">订单已确认</h2>
    <p style="color:#475569;line-height:1.6;">
      尊敬的 <strong>${clientName}</strong>，您好！
    </p>
    <p style="color:#475569;line-height:1.6;">
      您的订单 <strong style="color:#2563eb;">${orderNumber}</strong> 已确认，详情如下：
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr style="background:#f8fafc;">
        <td style="padding:10px 14px;color:#64748b;font-size:13px;">订单号</td>
        <td style="padding:10px 14px;font-weight:bold;color:#1e293b;font-size:13px;">${orderNumber}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;color:#64748b;font-size:13px;">路线</td>
        <td style="padding:10px 14px;color:#1e293b;font-size:13px;">${route}</td>
      </tr>
    </table>
    <p style="color:#475569;font-size:13px;">如有疑问，请联系您的客户经理。</p>
  `)
  return { subject, html }
}

/**
 * 状态更新邮件模板
 * @param {string} orderNumber - 订单号
 * @param {string} oldStatus - 旧状态
 * @param {string} newStatus - 新状态
 * @param {string} clientName - 客户名称
 * @returns {{ subject: string, html: string }}
 */
export function statusUpdateEmail(orderNumber, oldStatus, newStatus, clientName) {
  const statusLabels = {
    PENDING_REVIEW: '待审核', CONFIRMED: '已确认', IN_TRANSIT: '运输中',
    COMPLETED: '已完成', CANCELLED: '已取消', EXCEPTION: '异常',
  }
  const oldLabel = statusLabels[oldStatus] || oldStatus
  const newLabel = statusLabels[newStatus] || newStatus

  const subject = `[EU-TMS] 订单状态更新 - ${orderNumber}`
  const html = emailWrapper('状态更新', `
    <h2 style="color:#1e293b;margin:0 0 16px;">订单状态已更新</h2>
    <p style="color:#475569;line-height:1.6;">
      尊敬的 <strong>${clientName}</strong>，您好！
    </p>
    <p style="color:#475569;line-height:1.6;">
      订单 <strong style="color:#2563eb;">${orderNumber}</strong> 状态已变更：
    </p>
    <div style="display:flex;align-items:center;gap:12px;margin:20px 0;">
      <span style="background:#fee2e2;color:#dc2626;padding:6px 14px;border-radius:4px;font-size:13px;">${oldLabel}</span>
      <span style="color:#94a3b8;font-size:18px;">→</span>
      <span style="background:#dcfce7;color:#16a34a;padding:6px 14px;border-radius:4px;font-size:13px;">${newLabel}</span>
    </div>
    <p style="color:#475569;font-size:13px;">如有疑问，请联系您的客户经理。</p>
  `)
  return { subject, html }
}

/**
 * 发票邮件模板
 * @param {string} invoiceNumber - 发票号
 * @param {string} clientName - 客户名称
 * @param {number} amount - 金额
 * @param {string} currency - 币种
 * @returns {{ subject: string, html: string }}
 */
export function invoiceEmail(invoiceNumber, clientName, amount, currency) {
  const currencySymbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency
  const formattedAmount = `${currencySymbol} ${Number(amount).toFixed(2)}`

  const subject = `[EU-TMS] 发票通知 - ${invoiceNumber}`
  const html = emailWrapper('发票通知', `
    <h2 style="color:#1e293b;margin:0 0 16px;">新发票通知</h2>
    <p style="color:#475569;line-height:1.6;">
      尊敬的 <strong>${clientName}</strong>，您好！
    </p>
    <p style="color:#475569;line-height:1.6;">
      以下是您的发票信息：
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr style="background:#f8fafc;">
        <td style="padding:10px 14px;color:#64748b;font-size:13px;">发票号</td>
        <td style="padding:10px 14px;font-weight:bold;color:#1e293b;font-size:13px;">${invoiceNumber}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;color:#64748b;font-size:13px;">金额</td>
        <td style="padding:10px 14px;font-weight:bold;color:#2563eb;font-size:16px;">${formattedAmount}</td>
      </tr>
    </table>
    <p style="color:#475569;font-size:13px;">请在 30 天内完成付款。如有疑问，请联系财务部门。</p>
  `)
  return { subject, html }
}

export default {
  sendEmail,
  isConfigured,
  notificationEmail,
  quotationEmail,
  paymentReminderEmail,
  orderConfirmationEmail,
  statusUpdateEmail,
  invoiceEmail,
}
