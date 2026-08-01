/**
 * 报价确认落地页（免登录）
 *
 * 客户点邮件里的链接会落到这里。这是全站唯一一个不需要登录、
 * 直接返回 HTML 的端点，所以页面自带样式、不依赖任何前端构建产物。
 */

/** HTML 转义 —— 报价备注、客户名都是外部可控内容 */
function esc(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function shell(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <!-- 不让搜索引擎收录带 token 的链接 -->
  <meta name="robots" content="noindex,nofollow">
  <title>${esc(title)} - EU-TMS</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
         color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
    .card{background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.06);max-width:560px;width:100%;overflow:hidden}
    .hd{background:#1e293b;color:#fff;padding:20px 28px;font-size:18px;font-weight:600}
    .hd small{color:#94a3b8;font-weight:400;font-size:12px;margin-left:10px}
    .bd{padding:28px}
    h1{font-size:19px;margin:0 0 16px}
    table{width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;margin:16px 0}
    td{padding:11px 14px;font-size:14px}
    td.k{color:#64748b;width:38%}
    td.v{color:#0f172a}
    .amt{color:#2563eb;font-size:22px;font-weight:700}
    .btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}
    button{flex:1;min-width:120px;border:0;border-radius:10px;padding:13px 16px;font-size:15px;font-weight:600;
           color:#fff;cursor:pointer;transition:opacity .2s ease-in-out}
    button:hover{opacity:.88}
    button:disabled{opacity:.5;cursor:not-allowed}
    .accept{background:#16a34a}.pending{background:#d97706}.reject{background:#dc2626}
    .note{color:#94a3b8;font-size:12px;line-height:1.7;margin-top:20px}
    .msg{padding:14px 16px;border-radius:10px;font-size:14px;line-height:1.6;margin-bottom:4px}
    .ok{background:#dcfce7;color:#15803d}
    .err{background:#fee2e2;color:#b91c1c}
    textarea{width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:10px;font-size:14px;
             font-family:inherit;resize:vertical;outline:none}
    textarea:focus{border-color:#2563eb}
    label{display:block;font-size:13px;color:#64748b;margin:16px 0 6px}
  </style>
</head>
<body>
  <div class="card">
    <div class="hd">EU-TMS <small>报价确认</small></div>
    <div class="bd">${bodyHtml}</div>
  </div>
</body>
</html>`
}

/** 错误 / 提示页（token 无效、已用过、已过期） */
export function messagePage({ title, message, tone = 'err' }) {
  return shell(title, `
    <h1>${esc(title)}</h1>
    <div class="msg ${tone === 'ok' ? 'ok' : 'err'}">${esc(message)}</div>
    <p class="note">如需帮助，请直接回复业务人员的邮件，或登录客户门户「我的报价」查看最新状态。</p>
  `)
}

/**
 * 确认页
 *
 * ⚠️ 为什么邮件链接（GET）不直接改状态：
 *    Outlook / Gmail 等的安全扫描器会预取邮件里的链接。
 *    如果 GET 就落库，客户还没看到邮件，报价可能已经"被同意"了。
 *    所以 GET 只渲染这个页面，真正的动作要用户在页面上再点一次（POST）。
 *
 * @param {object} p
 * @param {string} p.token       明文 token（放进表单）
 * @param {string} p.action      邮件里点的动作，用于预选
 * @param {object} p.quotation   报价信息
 * @param {string} p.formAction  表单提交地址
 */
export function confirmPage({ token, action, quotation, formAction }) {
  const money = formatMoney(quotation.total_price, quotation.currency)
  const route = routeText(quotation.route_from, quotation.route_to)
  const validUntil = quotation.valid_until
    ? new Date(quotation.valid_until).toLocaleDateString('de-DE')
    : ''

  const row = (k, v) => v ? `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>` : ''

  const actionLabel = {
    ACCEPT: '同意报价', REJECT: '拒绝报价', PENDING: '暂时待定',
  }[action] || ''

  return shell('确认报价', `
    <h1>报价单 ${esc(quotation.quotation_number)}</h1>
    ${actionLabel ? `<div class="msg ok">您选择了「${esc(actionLabel)}」，请在下方确认。</div>` : ''}
    <table>
      ${row('客户', quotation.client_name)}
      ${row('路线', route)}
      ${row('有效期至', validUntil)}
      ${row('备注', quotation.remarks)}
      <tr><td class="k">报价金额</td><td class="v amt">${esc(money)}</td></tr>
    </table>

    <form method="POST" action="${esc(formAction)}" id="f">
      <input type="hidden" name="token" value="${esc(token)}">
      <input type="hidden" name="action" id="act" value="${esc(action || '')}">
      <label for="note">备注（选填，拒绝时请说明原因）</label>
      <textarea id="note" name="note" rows="3" placeholder="有什么想让我们知道的？"></textarea>
      <div class="btns">
        <button type="submit" class="accept"  onclick="document.getElementById('act').value='ACCEPT'">同意报价</button>
        <button type="submit" class="pending" onclick="document.getElementById('act').value='PENDING'">暂时待定</button>
        <button type="submit" class="reject"  onclick="document.getElementById('act').value='REJECT'">拒绝报价</button>
      </div>
    </form>

    <p class="note">
      同意后系统将自动为您生成运输订单并转入我司审核。<br/>
      本链接仅可使用一次，提交后即失效。
    </p>
    <script>
      // 防重复提交：客户连点两下会并发进来两个请求
      document.getElementById('f').addEventListener('submit', function () {
        Array.prototype.forEach.call(this.querySelectorAll('button'), function (b) { b.disabled = true })
      })
    </script>
  `)
}

function formatMoney(amount, currency = 'EUR') {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '-'
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(n)
  } catch {
    return `${currency || 'EUR'} ${n.toFixed(2)}`
  }
}

function routeText(from, to) {
  const parse = (v) => {
    if (!v) return {}
    if (typeof v === 'string') { try { return JSON.parse(v) || {} } catch { return {} } }
    return v
  }
  const f = parse(from)
  const t = parse(to)
  const fs = [f.country, f.city].filter(Boolean).join(' ')
  const ts = [t.country, t.city].filter(Boolean).join(' ')
  if (!fs && !ts) return ''
  return `${fs || '-'} → ${ts || '-'}`
}

export default { messagePage, confirmPage }
