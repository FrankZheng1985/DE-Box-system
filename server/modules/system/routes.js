/**
 * 系统设置路由
 */

import { Router } from 'express'
import { authenticateToken, requireUserType } from '../../middleware/auth.js'
import { query, withTransaction } from '../../core/db.js'

const router = Router()
router.use(authenticateToken)

router.get('/settings', async (req, res) => {
  try {
    const result = await query(`SELECT setting_key, setting_value, setting_type, description FROM system_settings ORDER BY setting_key`)
    const settings = {}
    for (const row of result.rows) {
      settings[row.setting_key] = {
        value: row.setting_type === 'NUMBER' ? parseFloat(row.setting_value) :
               row.setting_type === 'BOOLEAN' ? row.setting_value === 'true' : row.setting_value,
        type: row.setting_type, description: row.description
      }
    }
    res.json({ code: 200, message: 'success', data: settings })
  } catch (error) { res.status(500).json({ code: 500, message: '获取系统配置失败', data: null }) }
})

// ⚠️ 系统配置是全局开关（信用检查、自动开票、提醒天数等），
//    以前只挂 authenticateToken，任何登录账号——包括客户门户和承运商门户的账号——
//    都能改。收紧为仅运营可写（踩坑 016 的同类问题）。
router.put('/settings', requireUserType('OPERATOR'), async (req, res) => {
  try {
    let updated = 0
    const unknown = []
    for (const [key, value] of Object.entries(req.body || {})) {
      const r = await query(
        `UPDATE system_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2`,
        [String(value), key])
      // 原来不看影响行数：key 写错时 UPDATE 影响 0 行，接口照样回"更新成功"，
      // 用户以为改了其实没改。现在把没命中的 key 如实报回去。
      if (r.rowCount === 0) unknown.push(key)
      else updated += r.rowCount
    }
    if (unknown.length > 0) {
      return res.status(400).json({
        code: 400,
        message: `以下配置项不存在，未保存：${unknown.join(', ')}`,
        data: { updated, unknown },
      })
    }
    res.json({ code: 200, message: '系统配置更新成功', data: { updated } })
  } catch (error) {
    console.error('[系统配置] 保存失败:', error)
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

router.get('/settings/account', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, email, phone, display_name, language FROM users WHERE id = $1`, [req.user.id])
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) { res.status(500).json({ code: 500, message: '获取账户设置失败', data: null }) }
})

router.put('/settings/account', async (req, res) => {
  try {
    const { email, phone, displayName, language } = req.body
    await query(`UPDATE users SET email = COALESCE($1, email), phone = COALESCE($2, phone),
      display_name = COALESCE($3, display_name), language = COALESCE($4, language), updated_at = NOW()
      WHERE id = $5`, [email, phone, displayName, language, req.user.id])
    res.json({ code: 200, message: '账户设置更新成功', data: null })
  } catch (error) { res.status(500).json({ code: 500, message: error.message, data: null }) }
})

// ==================== 角色列表 ====================

router.get('/roles', async (req, res) => {
  try {
    const result = await query(`SELECT id, role_code, role_name, role_type FROM roles WHERE is_active = true ORDER BY role_type, role_name`)
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取角色列表失败', data: null })
  }
})

// ==================== 过账期间管理 ====================

router.get('/posting-periods', async (req, res) => {
  try {
    const { companyCode = 'DE01', fiscalYear = new Date().getFullYear() } = req.query
    const result = await query(
      `SELECT id, company_code, fiscal_year, period_month, is_open,
              opened_by, opened_at, closed_by, closed_at
       FROM posting_periods
       WHERE company_code = $1 AND fiscal_year = $2
       ORDER BY period_month`,
      [companyCode, parseInt(fiscalYear)]
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取过账期间失败', data: null })
  }
})

router.put('/posting-periods/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params
    // 获取当前状态
    const current = await query(`SELECT id, is_open FROM posting_periods WHERE id = $1`, [id])
    if (current.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '过账期间不存在', data: null })
    }

    const isOpen = current.rows[0].is_open
    if (isOpen) {
      // 关闭期间
      await query(
        `UPDATE posting_periods SET is_open = false, closed_by = $1, closed_at = NOW() WHERE id = $2`,
        [req.user.id, id]
      )
    } else {
      // 开放期间
      await query(
        `UPDATE posting_periods SET is_open = true, opened_by = $1, opened_at = NOW(), closed_by = NULL, closed_at = NULL WHERE id = $2`,
        [req.user.id, id]
      )
    }
    res.json({ code: 200, message: isOpen ? '期间已关闭' : '期间已开放', data: null })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
})

// ==================== 编号范围管理 ====================

router.get('/number-ranges', async (req, res) => {
  try {
    const { companyCode = 'DE01' } = req.query
    const result = await query(
      `SELECT id, object_type, prefix, current_number,
              range_start, range_end, number_format, company_code
       FROM number_ranges
       WHERE company_code = $1
       ORDER BY object_type`,
      [companyCode]
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取编号范围失败', data: null })
  }
})

// ==================== 会计科目表 ====================

router.get('/chart-of-accounts', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, account_code, account_name, account_type, parent_code,
              is_reconciliation, is_postable
       FROM chart_of_accounts
       ORDER BY account_code`
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    res.status(500).json({ code: 500, message: '获取科目表失败', data: null })
  }
})

// ==================== 基础数据管理 (Master Data) ====================

// 类型 -> 表名映射（白名单，防止SQL注入）
const MD_TABLES = {
  'shipping-lines': 'md_shipping_lines',
  'container-types': 'md_container_types',
  'currencies': 'md_currencies',
  'countries': 'md_countries',
  'ports': 'md_ports',
  'vehicle-types': 'md_vehicle_types',
  'special-requirements': 'md_special_requirements',
}

// 每种类型的额外列（除了 code, name_zh, name_en, is_active, sort_order 之外）
const MD_EXTRA_COLS = {
  'shipping-lines': ['country', 'website'],
  'container-types': ['length_ft'],
  'currencies': ['symbol'],
  'countries': ['region'],
  'ports': ['country_code', 'port_type'],
  'vehicle-types': ['max_weight_kg', 'max_volume_m3'],
  'special-requirements': ['description'],
}

// 每种类型的中文名（用于提示信息）
const MD_TYPE_NAMES = {
  'shipping-lines': '船司',
  'container-types': '箱型',
  'currencies': '币种',
  'countries': '国家',
  'ports': '港口',
  'vehicle-types': '车型',
  'special-requirements': '特殊要求',
}

// 验证类型参数
function validateMdType(type) {
  if (!MD_TABLES[type]) {
    return null
  }
  return MD_TABLES[type]
}

// 获取基础数据列表（分页 + 搜索 + 状态筛选）
// 注意：此路由的固定路径 options 必须在 :id 参数路由之前
router.get('/master-data/:type/options', async (req, res) => {
  try {
    const table = validateMdType(req.params.type)
    if (!table) {
      return res.status(400).json({ code: 400, message: '无效的基础数据类型', data: null })
    }

    const extraCols = MD_EXTRA_COLS[req.params.type] || []
    const selectCols = ['code', 'name_zh', 'name_en', ...extraCols].join(', ')

    const result = await query(
      `SELECT ${selectCols} FROM ${table} WHERE is_active = true ORDER BY sort_order ASC, name_zh ASC`
    )

    // 根据类型返回不同格式的 value（与业务表已存值兼容）
    const type = req.params.type
    const options = result.rows.map(row => {
      let value, label

      if (type === 'countries') {
        // 国家：value = name_en（与 orders 表中已存值一致）
        value = row.name_en
        label = `${row.name_en} (${row.name_zh})`
      } else if (type === 'currencies') {
        // 币种：value = code
        value = row.code
        label = `${row.code} (${row.name_zh})`
      } else if (type === 'container-types') {
        // 箱型：value = code
        value = row.code
        label = `${row.code} - ${row.name_zh}`
      } else if (type === 'shipping-lines') {
        // 船司：value = name_en（与 orders 表中已存值一致，如 "MSC", "Maersk"）
        value = row.name_en
        label = `${row.name_en} (${row.name_zh})`
      } else if (type === 'special-requirements') {
        // 特殊要求：value = name_zh（与 orders 表中已存值一致）
        value = row.name_zh
        label = row.name_zh
      } else if (type === 'ports') {
        // 港口：value = name_en
        value = row.name_en
        label = `${row.name_en} (${row.name_zh})`
      } else if (type === 'vehicle-types') {
        // 车型：value = name_en
        value = row.name_en
        label = `${row.name_en} (${row.name_zh})`
      } else {
        value = row.code
        label = row.name_zh
      }

      const option = { value, label, code: row.code }
      // 币种额外返回 symbol
      if (type === 'currencies' && row.symbol) {
        option.symbol = row.symbol
      }
      // 港口额外返回 country_code
      if (type === 'ports' && row.country_code) {
        option.country_code = row.country_code
      }
      return option
    })

    res.json({ code: 200, message: 'success', data: options })
  } catch (error) {
    console.error('[MasterData] 获取选项失败:', error)
    res.status(500).json({ code: 500, message: '获取选项数据失败', data: null })
  }
})

// 获取基础数据列表（管理页面用，带分页）
router.get('/master-data/:type', async (req, res) => {
  try {
    const table = validateMdType(req.params.type)
    if (!table) {
      return res.status(400).json({ code: 400, message: '无效的基础数据类型', data: null })
    }

    const { search, status, page = 1, pageSize = 20 } = req.query
    const extraCols = MD_EXTRA_COLS[req.params.type] || []
    const allCols = ['id', 'code', 'name_zh', 'name_en', 'is_active', 'sort_order', 'created_at', 'updated_at', ...extraCols]
    const selectCols = allCols.join(', ')

    let sql = `SELECT ${selectCols} FROM ${table} WHERE 1=1`
    const params = []
    let idx = 0

    // 搜索
    if (search) {
      params.push(`%${search}%`)
      idx++
      sql += ` AND (code ILIKE $${idx} OR name_zh ILIKE $${idx} OR name_en ILIKE $${idx})`
    }

    // 状态筛选
    if (status === 'active') {
      sql += ` AND is_active = true`
    } else if (status === 'inactive') {
      sql += ` AND is_active = false`
    }

    // 计算总数
    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) t`, params)
    const total = parseInt(countResult.rows[0].total)

    // 排序 + 分页
    sql += ` ORDER BY sort_order ASC, created_at DESC`
    params.push(parseInt(pageSize))
    sql += ` LIMIT $${++idx}`
    params.push((parseInt(page) - 1) * parseInt(pageSize))
    sql += ` OFFSET $${++idx}`

    const result = await query(sql, params)

    res.json({
      code: 200,
      message: 'success',
      data: result.rows,
      pagination: { total, page: parseInt(page), pageSize: parseInt(pageSize) }
    })
  } catch (error) {
    console.error('[MasterData] 获取列表失败:', error)
    res.status(500).json({ code: 500, message: '获取基础数据列表失败', data: null })
  }
})

// 新增基础数据
router.post('/master-data/:type', async (req, res) => {
  try {
    const table = validateMdType(req.params.type)
    if (!table) {
      return res.status(400).json({ code: 400, message: '无效的基础数据类型', data: null })
    }

    const typeName = MD_TYPE_NAMES[req.params.type]
    const { code, name_zh, name_en, sort_order, ...extraFields } = req.body

    if (!code || !name_zh) {
      return res.status(400).json({ code: 400, message: '代码和中文名称为必填项', data: null })
    }

    // 检查 code 是否重复
    const existing = await query(`SELECT id FROM ${table} WHERE code = $1`, [code])
    if (existing.rows.length > 0) {
      return res.status(400).json({ code: 400, message: `${typeName}代码 "${code}" 已存在`, data: null })
    }

    // 构建INSERT
    const cols = ['code', 'name_zh', 'name_en', 'sort_order']
    const vals = [code.toUpperCase(), name_zh, name_en || null, sort_order || 0]
    let paramIdx = vals.length

    // 追加额外字段
    const allowedExtra = MD_EXTRA_COLS[req.params.type] || []
    for (const col of allowedExtra) {
      if (extraFields[col] !== undefined) {
        cols.push(col)
        vals.push(extraFields[col] || null)
        paramIdx++
      }
    }

    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ')
    const result = await query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      vals
    )

    res.json({ code: 200, message: `${typeName}添加成功`, data: result.rows[0] })
  } catch (error) {
    console.error('[MasterData] 新增失败:', error)
    if (error.code === '23505') {
      res.status(400).json({ code: 400, message: '代码已存在，请使用不同的代码', data: null })
    } else {
      res.status(500).json({ code: 500, message: error.message || '添加失败', data: null })
    }
  }
})

// 修改基础数据
router.put('/master-data/:type/:id', async (req, res) => {
  try {
    const table = validateMdType(req.params.type)
    if (!table) {
      return res.status(400).json({ code: 400, message: '无效的基础数据类型', data: null })
    }

    const typeName = MD_TYPE_NAMES[req.params.type]
    const { id } = req.params
    const { code, name_zh, name_en, sort_order, ...extraFields } = req.body

    // 检查是否存在
    const existing = await query(`SELECT id FROM ${table} WHERE id = $1`, [id])
    if (existing.rows.length === 0) {
      return res.status(404).json({ code: 404, message: `${typeName}不存在`, data: null })
    }

    // 如果修改了 code，检查是否冲突
    if (code) {
      const codeCheck = await query(`SELECT id FROM ${table} WHERE code = $1 AND id != $2`, [code, id])
      if (codeCheck.rows.length > 0) {
        return res.status(400).json({ code: 400, message: `${typeName}代码 "${code}" 已被使用`, data: null })
      }
    }

    // 动态构建 SET 子句
    const setClauses = []
    const params = []
    let idx = 0

    const fieldMap = { code, name_zh, name_en, sort_order }
    for (const [field, value] of Object.entries(fieldMap)) {
      if (value !== undefined) {
        params.push(field === 'code' ? value.toUpperCase() : value)
        setClauses.push(`${field} = $${++idx}`)
      }
    }

    // 额外字段
    const allowedExtra = MD_EXTRA_COLS[req.params.type] || []
    for (const col of allowedExtra) {
      if (extraFields[col] !== undefined) {
        params.push(extraFields[col])
        setClauses.push(`${col} = $${++idx}`)
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ code: 400, message: '没有可更新的字段', data: null })
    }

    setClauses.push('updated_at = NOW()')
    params.push(id)
    await query(`UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = $${++idx}`, params)

    // 查询更新后的记录
    const result = await query(`SELECT * FROM ${table} WHERE id = $1`, [id])
    res.json({ code: 200, message: `${typeName}更新成功`, data: result.rows[0] })
  } catch (error) {
    console.error('[MasterData] 更新失败:', error)
    if (error.code === '23505') {
      res.status(400).json({ code: 400, message: '代码已存在，请使用不同的代码', data: null })
    } else {
      res.status(500).json({ code: 500, message: error.message || '更新失败', data: null })
    }
  }
})

// 启用/停用基础数据
router.put('/master-data/:type/:id/toggle', async (req, res) => {
  try {
    const table = validateMdType(req.params.type)
    if (!table) {
      return res.status(400).json({ code: 400, message: '无效的基础数据类型', data: null })
    }

    const typeName = MD_TYPE_NAMES[req.params.type]
    const { id } = req.params

    const current = await query(`SELECT id, is_active, code FROM ${table} WHERE id = $1`, [id])
    if (current.rows.length === 0) {
      return res.status(404).json({ code: 404, message: `${typeName}不存在`, data: null })
    }

    const newStatus = !current.rows[0].is_active
    await query(`UPDATE ${table} SET is_active = $1, updated_at = NOW() WHERE id = $2`, [newStatus, id])

    const statusText = newStatus ? '启用' : '停用'
    res.json({ code: 200, message: `${typeName} "${current.rows[0].code}" 已${statusText}`, data: { is_active: newStatus } })
  } catch (error) {
    console.error('[MasterData] 切换状态失败:', error)
    res.status(500).json({ code: 500, message: error.message || '操作失败', data: null })
  }
})

export default router
