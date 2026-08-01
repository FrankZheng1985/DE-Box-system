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
  const bodyText = (message || '').replace(/\n/g, '<br/>')
  const html = emailWrapper('系统通知', `
    <h2 style="color:#1e293b;margin:0 0 16px;font-size:18px;">${title}</h2>
    ${bodyText ? `<p style="color:#475569;line-height:1.6;font-size:14px;">${bodyText}</p>` : ''}
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
      登录 EU-TMS 系统查看详情。
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
  orderConfirmationEmail,
  statusUpdateEmail,
  invoiceEmail,
}
