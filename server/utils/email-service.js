/**
 * 邮件服务
 * 基于 nodemailer，通过环境变量配置 SMTP
 * 环境变量: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

import nodemailer from 'nodemailer'
import { t } from './i18n.js'

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
function emailWrapper(title, bodyHtml, lang = 'zh') {
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
            ${t(lang, 'email.footerAuto')}
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
export function notificationEmail(title, message, lang = 'zh') {
  const subject = t(lang, 'email.notifySubject', { title })
  // 通知标题/正文里会拼客户名、承运商名等外部可控内容，先转义再换行
  const bodyText = esc(message || '').replace(/\n/g, '<br/>')
  const html = emailWrapper(t(lang, 'email.headerNotification'), `
    <h2 style="color:#1e293b;margin:0 0 16px;font-size:18px;">${esc(title)}</h2>
    ${bodyText ? `<p style="color:#475569;line-height:1.6;font-size:14px;">${bodyText}</p>` : ''}
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
      ${t(lang, 'email.notifyLoginHint')}
    </p>
  `, lang)
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
export function quotationEmail(p, lang = 'zh') {
  const subject = t(lang, 'email.quoteSubject', { number: p.quotationNumber })

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

  const html = emailWrapper(t(lang, 'email.headerQuotation'), `
    <h2 style="color:#1e293b;margin:0 0 16px;font-size:18px;">${t(lang, 'email.quoteHeading')}</h2>
    <p style="color:#475569;line-height:1.6;font-size:14px;">
      ${t(lang, 'email.quoteGreeting', { client: esc(p.clientName) })}
    </p>
    <p style="color:#475569;line-height:1.6;font-size:14px;">
      ${t(lang, 'email.quoteIntro', { number: esc(p.quotationNumber) })}
    </p>

    <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:6px;">
      ${row(t(lang, 'email.quoteRoute'), p.route)}
      ${row(t(lang, 'email.quoteValidUntil'), p.validUntil)}
      ${row(t(lang, 'email.quoteRemarks'), p.remarks)}
      <tr>
        <td style="padding:14px;color:#64748b;font-size:13px;">${t(lang, 'email.quoteAmount')}</td>
        <td style="padding:14px;color:#2563eb;font-size:20px;font-weight:bold;">${esc(p.totalPrice)}</td>
      </tr>
    </table>

    <p style="color:#475569;font-size:14px;margin:24px 0 12px;">${t(lang, 'email.quotePickPrompt')}</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
      ${button(p.acceptUrl,  t(lang, 'email.quoteAccept'), '#16a34a')}
      ${button(p.pendingUrl, t(lang, 'email.quotePending'), '#d97706')}
      ${button(p.rejectUrl,  t(lang, 'email.quoteReject'), '#dc2626')}
    </tr></table>

    <p style="color:#94a3b8;font-size:12px;margin-top:24px;line-height:1.6;">
      ${t(lang, 'email.quoteFootLine1')}<br/>
      ${t(lang, 'email.quoteFootOnce')}${p.validUntil ? t(lang, 'email.quoteFootExpires', { date: esc(p.validUntil) }) : ''}<br/>
      ${t(lang, 'email.quoteFootPortal')}
    </p>
  `, lang)
  return { subject, html }
}

/**
 * 服务商询价邮件（2026-08-07 Frank 定：询价从"只登记"升级为系统直发）
 *
 * 收件方是外部欧洲服务商，不走系统的三语偏好，固定英语+德语双语正文，
 * 谁都能看懂，也不用逐家维护语言设置。所以本模板刻意没有 lang 参数。
 *
 * ⚠️ 不放客户信息：询价来自客户订单，但对服务商只报路线和货物，
 *    客户名/客户价格绝不能出现在这封邮件里。
 *
 * @param {object} p
 * @param {string} p.carrierInquiryNumber 服务商询价单号（CINQ-…，服务商回邮件时引用）
 * @param {string} [p.carrierName]        服务商公司名（称呼用）
 * @param {string} [p.route]              路线描述，如 "DE Hamburg → PL Warszawa"
 * @param {string} [p.serviceEn]          服务类型英文（如 Road freight FTL）
 * @param {string} [p.serviceDe]          服务类型德文
 * @param {string} [p.containerType]      柜型
 * @param {string} [p.pod]                目的港/POD
 * @param {string} [p.cargoDescription]   货物描述
 * @param {string} [p.weightKg]           重量（已格式化，含单位）
 * @param {string} [p.volumeM3]           体积（已格式化，含单位）
 * @param {string} [p.quantity]           件数
 * @param {string} [p.specialReqEn]       特殊要求英文
 * @param {string} [p.specialReqDe]       特殊要求德文
 * @param {string} [p.requestRemarks]     运营补充要求（原样附上，可能是任意语言）
 * @returns {{ subject: string, html: string }}
 */
export function carrierInquiryEmail(p) {
  const subject = `Transport Inquiry / Transportanfrage ${p.carrierInquiryNumber}${p.route ? ` – ${p.route}` : ''}`

  // 双语标签放同一行，表格只渲染一遍，比上下两大段重复表格好读
  const row = (labelEn, labelDe, value) => value
    ? `<tr><td style="padding:10px 14px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${esc(labelEn)}${labelDe && labelDe !== labelEn ? ` / ${esc(labelDe)}` : ''}</td>
           <td style="padding:10px 14px;color:#1e293b;font-size:13px;border-bottom:1px solid #f1f5f9;">${esc(value)}</td></tr>`
    : ''

  const service = [p.serviceEn, p.serviceDe].filter(Boolean).join(' / ')
  const specialReq = [p.specialReqEn, p.specialReqDe]
    .filter(Boolean)
    // 英德文相同（比如库里没维护德文名）就只显示一遍
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(' / ')

  const html = emailWrapper('Transport Inquiry / Transportanfrage', `
    <h2 style="color:#1e293b;margin:0 0 16px;font-size:18px;">Request for Quotation / Anfrage</h2>
    <p style="color:#475569;line-height:1.6;font-size:14px;">
      Dear ${esc(p.carrierName || 'Partner')} team,<br/>
      please quote your best rate for the transport below.
      Simply <strong>reply to this email</strong> with your price, transit time and validity,
      quoting reference <strong>${esc(p.carrierInquiryNumber)}</strong>.
    </p>
    <p style="color:#475569;line-height:1.6;font-size:14px;">
      Sehr geehrtes Team von ${esc(p.carrierName || 'Partner')},<br/>
      bitte senden Sie uns Ihr bestes Angebot für den unten stehenden Transport.
      <strong>Antworten Sie einfach auf diese E-Mail</strong> mit Preis, Laufzeit und Gültigkeit,
      unter Angabe der Referenz <strong>${esc(p.carrierInquiryNumber)}</strong>.
    </p>

    <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:6px;">
      ${row('Reference', 'Referenz', p.carrierInquiryNumber)}
      ${row('Route', 'Strecke', p.route)}
      ${row('Service', 'Leistung', service)}
      ${row('Container', 'Container', p.containerType)}
      ${row('POD', 'Bestimmungshafen', p.pod)}
      ${row('Cargo', 'Ware', p.cargoDescription)}
      ${row('Weight', 'Gewicht', p.weightKg)}
      ${row('Volume', 'Volumen', p.volumeM3)}
      ${row('Quantity', 'Stückzahl', p.quantity)}
      ${row('Special requirements', 'Besondere Anforderungen', specialReq)}
      ${row('Remarks', 'Anmerkungen', p.requestRemarks)}
    </table>

    <p style="color:#475569;font-size:13px;line-height:1.6;">
      Best regards / Mit freundlichen Grüßen<br/>
      <strong>KALUNA SPED</strong>
    </p>
    <p style="color:#94a3b8;font-size:11px;line-height:1.6;margin-top:16px;">
      Kaluna UG (haftungsbeschränkt) · Niederbeckstraße 35, 40472 Düsseldorf<br/>
      Amtsgericht Düsseldorf HRB 108503 · Geschäftsführer: Shunyi Wang
    </p>
  `, 'en')
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
export function paymentReminderEmail(p, lang = 'zh') {
  const overdue = p.daysDiff < 0
  const days = Math.abs(p.daysDiff)
  const headline = overdue
    ? t(lang, 'email.payOverdueHeadline', { days })
    : t(lang, 'email.payDueHeadline', { days })
  const subject = overdue
    ? t(lang, 'email.payOverdueSubject', { number: p.recordNumber })
    : t(lang, 'email.payDueSubject', { number: p.recordNumber })
  const accent = overdue ? '#dc2626' : '#d97706'

  const header = overdue
    ? t(lang, 'email.payHeaderOverdue')
    : t(lang, 'email.headerPaymentReminder')

  const html = emailWrapper(header, `
    <h2 style="color:${accent};margin:0 0 16px;font-size:18px;">${esc(headline)}</h2>
    <p style="color:#475569;line-height:1.6;font-size:14px;">
      ${t(lang, 'email.payGreeting', { client: esc(p.clientName) })}
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:6px;">
      <tr>
        <td style="padding:10px 14px;color:#64748b;font-size:13px;">${t(lang, 'email.payBillNo')}</td>
        <td style="padding:10px 14px;color:#1e293b;font-size:13px;font-weight:bold;">${esc(p.recordNumber)}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;color:#64748b;font-size:13px;">${t(lang, 'email.payDueDate')}</td>
        <td style="padding:10px 14px;color:${accent};font-size:13px;font-weight:bold;">${esc(p.dueDate)}</td>
      </tr>
      <tr>
        <td style="padding:14px;color:#64748b;font-size:13px;">${t(lang, 'email.payAmount')}</td>
        <td style="padding:14px;color:${accent};font-size:20px;font-weight:bold;">${esc(p.amount)}</td>
      </tr>
    </table>
    <p style="color:#475569;font-size:13px;">
      ${overdue ? t(lang, 'email.payActionOverdue') : t(lang, 'email.payActionDue')}${t(lang, 'email.payIgnoreHint')}
    </p>
  `, lang)
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
  carrierInquiryEmail,
  paymentReminderEmail,
  orderConfirmationEmail,
  statusUpdateEmail,
  invoiceEmail,
}
