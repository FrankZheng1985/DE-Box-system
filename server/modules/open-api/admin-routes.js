/**
 * 开放 API 的 admin 管理端点（P8 第二阶段）
 *
 * 挂载前缀 /api/v1/open-api —— 这是给运营管理端用的 JWT 区，
 * 和对外的 /api/open/v1（X-API-Key 区，routes.js）是两个世界，别混。
 *
 * 权限：整组路由挂 open_api:manage（迁移 113；默认 sys_admin + op_manager）。
 * 安全：api_keys 一律点名列查询，key_hash 永不返回（踩坑 026）；
 *       密钥明文只在 签发/换钥匙 的响应里出现一次，服务端不留存。
 *
 * ⚠️ 路由顺序：/keys、/logs 固定路径在 /keys/:id 之前（踩坑 001）
 */

import { Router } from 'express'
import { authenticateToken, requireUserType, requirePermission } from '../../middleware/auth.js'
import { query } from '../../core/db.js'
import crypto from 'node:crypto'
import { generateKey, hashKey } from './service.js'
import { sendTestEvent } from './webhook-service.js'

const router = Router()
router.use(authenticateToken)
router.use(requireUserType('OPERATOR'))
router.use(requirePermission('open_api:manage'))

/**
 * 列表/详情统一的选择列 —— 不含 key_hash，永远不含。
 * webhook_secret 例外地可见：运营要把它交给合作方做验签，且它签不了 API 请求。
 */
const KEY_COLUMNS = `
  k.id, k.partner_code, k.partner_name, k.client_id, k.key_prefix, k.status,
  k.rate_limit_per_min, k.ip_whitelist, k.last_used_at, k.remarks, k.created_at,
  k.webhook_url, k.webhook_secret,
  c.client_code, c.company_name AS client_name`

/** ip_whitelist 入库前的规整：去空格、去空项，非数组一律当空数组 */
function normalizeIps(value) {
  if (!Array.isArray(value)) return []
  return value.map((s) => String(s).trim()).filter(Boolean)
}

/**
 * 密钥列表
 * GET /api/v1/open-api/keys
 */
router.get('/keys', async (req, res) => {
  try {
    const result = await query(
      `SELECT ${KEY_COLUMNS}
       FROM api_keys k JOIN clients c ON c.id = k.client_id
       ORDER BY k.created_at`
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    console.error('获取密钥列表失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
  }
})

/**
 * 签发新密钥
 * POST /api/v1/open-api/keys
 * body: { partnerCode, partnerName, clientId, rateLimitPerMin?, ipWhitelist?, remarks? }
 *
 * 响应里的 plainKey 只出现这一次，前端弹窗提示复制后即丢弃。
 */
router.post('/keys', async (req, res) => {
  try {
    const partnerCode = String(req.body.partnerCode || '').trim().toUpperCase()
    const partnerName = String(req.body.partnerName || '').trim()
    const { clientId } = req.body
    if (!partnerCode || !partnerName || !clientId) {
      return res.status(400).json({ code: 400, message: '合作方代码、名称、挂靠客户都是必填', data: null })
    }
    if (!/^[A-Z0-9_]{2,50}$/.test(partnerCode)) {
      return res.status(400).json({ code: 400, message: '合作方代码只能是 2-50 位大写字母/数字/下划线', data: null })
    }

    const dup = await query(`SELECT 1 FROM api_keys WHERE partner_code = $1`, [partnerCode])
    if (dup.rows.length > 0) {
      return res.status(400).json({ code: 400, message: `合作方 ${partnerCode} 已有密钥，换钥匙请用「换钥匙」，停用请用「停用」`, data: null })
    }

    const client = await query(`SELECT id, status FROM clients WHERE id = $1`, [clientId])
    if (client.rows.length === 0) {
      return res.status(400).json({ code: 400, message: '挂靠客户不存在', data: null })
    }

    const rate = Math.max(1, parseInt(req.body.rateLimitPerMin, 10) || 60)
    const ips = normalizeIps(req.body.ipWhitelist)

    const plainKey = generateKey()
    const created = await query(
      `INSERT INTO api_keys
       (partner_code, partner_name, client_id, key_prefix, key_hash,
        status, rate_limit_per_min, ip_whitelist, remarks, created_by)
       VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6,$7,$8,$9)
       RETURNING id`,
      [partnerCode, partnerName, clientId, plainKey.slice(0, 12), hashKey(plainKey),
       rate, JSON.stringify(ips), req.body.remarks || null, req.user.id]
    )

    res.json({
      code: 200,
      message: '密钥已签发，明文只显示这一次，请立即复制并通过安全渠道交给合作方',
      data: { id: created.rows[0].id, plainKey },
    })
  } catch (error) {
    console.error('签发密钥失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
  }
})

/**
 * API 请求日志（分页 + 筛选）
 * GET /api/v1/open-api/logs?partnerCode=&result=&externalRef=&dateFrom=&dateTo=&page=&pageSize=
 */
router.get('/logs', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20))

    const where = []
    const params = []
    let idx = 0
    if (req.query.partnerCode) { params.push(req.query.partnerCode); where.push(`l.partner_code = $${++idx}`) }
    if (req.query.result) { params.push(req.query.result); where.push(`l.result = $${++idx}`) }
    if (req.query.externalRef) { params.push(`%${req.query.externalRef}%`); where.push(`l.external_ref ILIKE $${++idx}`) }
    if (req.query.dateFrom) { params.push(req.query.dateFrom); where.push(`l.created_at >= $${++idx}`) }
    if (req.query.dateTo) { params.push(req.query.dateTo); where.push(`l.created_at < ($${++idx})::date + 1`) }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    const total = await query(`SELECT COUNT(*)::int AS n FROM api_request_logs l ${whereSql}`, params)
    const rows = await query(
      `SELECT l.id, l.partner_code, l.method, l.path, l.external_ref,
              l.status_code, l.result, l.error_message, l.ip, l.duration_ms, l.created_at
       FROM api_request_logs l
       ${whereSql}
       ORDER BY l.id DESC
       LIMIT $${++idx} OFFSET $${++idx}`,
      [...params, pageSize, (page - 1) * pageSize]
    )

    res.json({
      code: 200, message: 'success', data: rows.rows,
      pagination: { total: total.rows[0].n, page, pageSize },
    })
  } catch (error) {
    console.error('获取 API 日志失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
  }
})

/**
 * Webhook 投递记录（分页 + 筛选）
 * GET /api/v1/open-api/webhook-deliveries?partnerCode=&status=&page=&pageSize=
 */
router.get('/webhook-deliveries', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20))

    const where = []
    const params = []
    let idx = 0
    if (req.query.partnerCode) { params.push(req.query.partnerCode); where.push(`d.partner_code = $${++idx}`) }
    if (req.query.status) { params.push(req.query.status); where.push(`d.status = $${++idx}`) }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    const total = await query(`SELECT COUNT(*)::int AS n FROM api_webhook_deliveries d ${whereSql}`, params)
    const rows = await query(
      `SELECT d.id, d.partner_code, d.event_type, d.external_ref, d.status,
              d.attempts, d.next_attempt_at, d.last_status_code, d.last_error,
              d.created_at, d.sent_at
       FROM api_webhook_deliveries d
       ${whereSql}
       ORDER BY d.id DESC
       LIMIT $${++idx} OFFSET $${++idx}`,
      [...params, pageSize, (page - 1) * pageSize]
    )

    res.json({
      code: 200, message: 'success', data: rows.rows,
      pagination: { total: total.rows[0].n, page, pageSize },
    })
  } catch (error) {
    console.error('获取 Webhook 投递记录失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
  }
})

/**
 * 编辑密钥档案（名称/限速/IP 白名单/备注/Webhook 接收地址）
 * PUT /api/v1/open-api/keys/:id
 *
 * 刻意不支持：改 partner_code（幂等键的一半，历史单据会对不上）、
 * 换挂靠客户（等于把对方之后推的单挂到另一家名下，要换请停用后新签）。
 */
router.put('/keys/:id', async (req, res) => {
  try {
    const sets = []
    const params = []
    let idx = 0
    if (req.body.partnerName !== undefined) {
      const name = String(req.body.partnerName).trim()
      if (!name) return res.status(400).json({ code: 400, message: '合作方名称不能为空', data: null })
      params.push(name); sets.push(`partner_name = $${++idx}`)
    }
    if (req.body.rateLimitPerMin !== undefined) {
      params.push(Math.max(1, parseInt(req.body.rateLimitPerMin, 10) || 60))
      sets.push(`rate_limit_per_min = $${++idx}`)
    }
    if (req.body.ipWhitelist !== undefined) {
      params.push(JSON.stringify(normalizeIps(req.body.ipWhitelist)))
      sets.push(`ip_whitelist = $${++idx}`)
    }
    if (req.body.remarks !== undefined) {
      // 清空备注存 NULL 不存空串（P7 遗留瑕疵的教训，这里一开始就归一）
      params.push(String(req.body.remarks).trim() || null)
      sets.push(`remarks = $${++idx}`)
    }
    let needSecret = false
    if (req.body.webhookUrl !== undefined) {
      const url = String(req.body.webhookUrl).trim()
      if (url) {
        if (!/^https?:\/\/.+/.test(url) || url.length > 500) {
          return res.status(400).json({ code: 400, message: 'Webhook 地址必须是 http(s) URL 且不超过 500 字符', data: null })
        }
        // 生产合作方务必用 https，本地联调允许 http
        params.push(url)
        needSecret = true
      } else {
        params.push(null)
      }
      sets.push(`webhook_url = $${++idx}`)
    }
    if (sets.length === 0) {
      return res.status(400).json({ code: 400, message: '没有可更新的字段', data: null })
    }
    // 首次配置 URL 时自动生成签名密钥（已有就不动，避免把已交付合作方的密钥刷掉）
    if (needSecret) {
      params.push(crypto.randomBytes(24).toString('hex'))
      sets.push(`webhook_secret = COALESCE(webhook_secret, $${++idx})`)
    }

    params.push(req.params.id)
    const result = await query(
      `UPDATE api_keys SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${++idx} RETURNING id`,
      params
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '密钥不存在', data: null })
    }
    res.json({ code: 200, message: '已保存', data: null })
  } catch (error) {
    console.error('更新密钥失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
  }
})

/**
 * 停用 / 启用
 * POST /api/v1/open-api/keys/:id/disable
 * POST /api/v1/open-api/keys/:id/enable
 *
 * 停用即时生效：对外认证每次请求都实时查库。
 */
router.post('/keys/:id/disable', async (req, res) => setKeyStatus(req, res, 'DISABLED'))
router.post('/keys/:id/enable', async (req, res) => setKeyStatus(req, res, 'ACTIVE'))

async function setKeyStatus(req, res, status) {
  try {
    const result = await query(
      `UPDATE api_keys SET status = $1, updated_at = NOW() WHERE id = $2
       RETURNING partner_code, partner_name`,
      [status, req.params.id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '密钥不存在', data: null })
    }
    const r = result.rows[0]
    res.json({
      code: 200,
      message: `${r.partner_code}（${r.partner_name}）已${status === 'ACTIVE' ? '启用' : '停用'}`,
      data: null,
    })
  } catch (error) {
    console.error('修改密钥状态失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
  }
}

/**
 * 换钥匙（旧钥匙即刻失效，同时恢复启用状态）
 * POST /api/v1/open-api/keys/:id/rotate
 */
router.post('/keys/:id/rotate', async (req, res) => {
  try {
    const plainKey = generateKey()
    const result = await query(
      `UPDATE api_keys
       SET key_prefix = $1, key_hash = $2, status = 'ACTIVE', updated_at = NOW()
       WHERE id = $3
       RETURNING partner_code, partner_name`,
      [plainKey.slice(0, 12), hashKey(plainKey), req.params.id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '密钥不存在', data: null })
    }
    const r = result.rows[0]
    res.json({
      code: 200,
      message: `${r.partner_code}（${r.partner_name}）已换新钥匙，旧钥匙即刻失效。明文只显示这一次`,
      data: { plainKey },
    })
  } catch (error) {
    console.error('换钥匙失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
  }
})

/**
 * 联调自测：给合作方的接收端发一条测试事件，把对方应答带回来
 * POST /api/v1/open-api/keys/:id/webhook-test
 *
 * 用于对接联调：对方给了接收地址后，运营点一下就知道地址通不通、验签对不对，
 * 不用干等真实业务事件发生。测试不写投递记录（见 sendTestEvent 注释）。
 */
router.post('/keys/:id/webhook-test', async (req, res) => {
  try {
    const r = await query(
      `SELECT partner_code, partner_name, webhook_url, webhook_secret
       FROM api_keys WHERE id = $1`,
      [req.params.id]
    )
    if (r.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '密钥不存在', data: null })
    }
    const key = r.rows[0]
    if (!key.webhook_url || !key.webhook_secret) {
      return res.status(400).json({ code: 400, message: '该合作方还没有配置 Webhook 接收地址', data: null })
    }

    const result = await sendTestEvent(key)
    res.json({
      code: 200,
      message: result.ok
        ? `测试事件已送达，对方返回 HTTP ${result.statusCode}（${result.durationMs} ms）`
        : `测试事件投递失败：${result.error}`,
      data: result,
    })
  } catch (error) {
    console.error('发送 Webhook 测试事件失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
  }
})

/**
 * 换 Webhook 签名密钥（合作方侧密钥疑似泄露时用；换后对方必须同步更新验签密钥）
 * POST /api/v1/open-api/keys/:id/webhook-secret/rotate
 */
router.post('/keys/:id/webhook-secret/rotate', async (req, res) => {
  try {
    const secret = crypto.randomBytes(24).toString('hex')
    const result = await query(
      `UPDATE api_keys SET webhook_secret = $1, updated_at = NOW()
       WHERE id = $2 RETURNING partner_code, partner_name`,
      [secret, req.params.id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '密钥不存在', data: null })
    }
    const r = result.rows[0]
    res.json({
      code: 200,
      message: `${r.partner_code}（${r.partner_name}）的 Webhook 签名密钥已更换，请同步告知合作方`,
      data: { webhookSecret: secret },
    })
  } catch (error) {
    console.error('换 Webhook 签名密钥失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
  }
})

export default router
