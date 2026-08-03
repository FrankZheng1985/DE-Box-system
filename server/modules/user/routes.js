/**
 * 用户管理 API 路由
 * 仅 OPERATOR 类型用户可访问
 *
 * 注意事项（踩坑经验）：
 * - /stats 路由放在 /:id 之前，避免被 /:id 拦截
 * - 数字字段使用 Number() 转换
 * - 数据库字段使用 snake_case
 */

import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { authenticateToken, requireUserType, requirePermission } from '../../middleware/auth.js'
import { query } from '../../core/db.js'

const router = Router()
router.use(authenticateToken)
router.use(requireUserType('OPERATOR'))
// 员工账号管理（新建、改角色、重置密码）统一要 system:user 权限（P5）
router.use(requirePermission('system:user'))

// ==================== 用户统计（放在 /:id 之前） ====================

router.get('/stats', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE is_active = true) AS active_count,
        COUNT(*) FILTER (WHERE is_active = false) AS inactive_count,
        COUNT(*) FILTER (WHERE user_type = 'OPERATOR') AS operator_count,
        COUNT(*) FILTER (WHERE user_type = 'CLIENT') AS client_count,
        COUNT(*) FILTER (WHERE user_type = 'CARRIER') AS carrier_count,
        COUNT(*) AS total_count
      FROM users
    `)
    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    console.error('获取用户统计失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ==================== 用户列表 ====================

router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      page_size = 50,
      user_type,
      is_active,
      keyword,
      // 按关联公司筛选：客户详情 / 承运商详情的「账号」区块用（P9 配套）
      linked_entity_id
    } = req.query

    const pageNum = Number(page)
    const pageSizeNum = Number(page_size)
    const offset = (pageNum - 1) * pageSizeNum

    // 构建查询条件
    const conditions = []
    const params = []
    let paramIdx = 1

    if (user_type) {
      conditions.push(`u.user_type = $${paramIdx++}`)
      params.push(user_type)
    }

    if (linked_entity_id) {
      conditions.push(`u.linked_entity_id = $${paramIdx++}`)
      params.push(linked_entity_id)
    }

    if (is_active !== undefined && is_active !== '') {
      conditions.push(`u.is_active = $${paramIdx++}`)
      params.push(is_active === 'true')
    }

    if (keyword) {
      conditions.push(`(u.username ILIKE $${paramIdx} OR u.display_name ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx})`)
      params.push(`%${keyword}%`)
      paramIdx++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // 查询总数
    const countResult = await query(
      `SELECT COUNT(*) AS total FROM users u ${whereClause}`,
      params
    )
    const total = Number(countResult.rows[0].total)

    // 查询列表（关联角色表）
    const listResult = await query(
      `SELECT u.id, u.username, u.display_name, u.email, u.phone,
              u.user_type, u.role_id, u.linked_entity_id, u.is_active,
              u.created_at, u.updated_at,
              r.role_name, r.role_code
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, pageSizeNum, offset]
    )

    res.json({
      code: 200,
      message: 'success',
      data: listResult.rows,
      pagination: {
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(total / pageSizeNum)
      }
    })
  } catch (error) {
    console.error('获取用户列表失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ==================== 用户详情 ====================

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await query(
      `SELECT u.id, u.username, u.display_name, u.email, u.phone,
              u.user_type, u.role_id, u.linked_entity_id, u.is_active,
              u.created_at, u.updated_at,
              r.role_name, r.role_code
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '用户不存在' })
    }

    res.json({ code: 200, message: 'success', data: result.rows[0] })
  } catch (error) {
    console.error('获取用户详情失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ==================== 创建用户 ====================

router.post('/', async (req, res) => {
  try {
    const {
      username,
      password,
      display_name,
      email,
      phone,
      user_type,
      role_id,
      linked_entity_id
    } = req.body

    // 参数校验
    if (!username || !password || !display_name) {
      return res.status(400).json({ code: 400, message: '参数错误：用户名、密码、显示名称为必填项' })
    }

    if (!['OPERATOR', 'CLIENT', 'CARRIER'].includes(user_type)) {
      return res.status(400).json({ code: 400, message: '参数错误：无效的用户类型' })
    }

    // 角色必填：role_id 为空的账号权限集是空的，登得进去但所有接口都 403，
    // 表现为"账号能用但处处报没权限"，很难查（2026-08-03 duguirong 就是这么建出来的）
    if (!role_id) {
      return res.status(400).json({ code: 400, message: '参数错误：必须为账号指定角色' })
    }

    // 角色类型必须和用户类型匹配，否则会建出「CLIENT 用户挂运营角色」这种越权账号
    const roleRow = await query(
      `SELECT role_code, role_type FROM roles WHERE id = $1 AND is_active = true`,
      [role_id]
    )
    if (roleRow.rows.length === 0) {
      return res.status(400).json({ code: 400, message: '参数错误：角色不存在或已停用' })
    }
    if (roleRow.rows[0].role_type !== user_type) {
      return res.status(400).json({
        code: 400,
        message: `参数错误：角色「${roleRow.rows[0].role_code}」属于 ${roleRow.rows[0].role_type}，不能分配给 ${user_type} 账号`
      })
    }

    // 检查用户名是否已存在
    const existing = await query(
      `SELECT id FROM users WHERE username = $1`, [username]
    )
    if (existing.rows.length > 0) {
      return res.status(400).json({ code: 400, message: '参数错误：用户名已存在' })
    }

    // 密码哈希
    const salt = await bcrypt.genSalt(10)
    const password_hash = await bcrypt.hash(password, salt)

    // 创建用户
    const result = await query(
      `INSERT INTO users (username, password_hash, display_name, email, phone,
                          user_type, role_id, linked_entity_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       RETURNING id, username, display_name, email, phone, user_type, role_id,
                 linked_entity_id, is_active, created_at`,
      [username, password_hash, display_name, email || null, phone || null,
       user_type, role_id || null, linked_entity_id || null]
    )

    res.status(201).json({
      code: 200,
      message: '用户创建成功',
      data: result.rows[0]
    })
  } catch (error) {
    console.error('创建用户失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ==================== 更新用户 ====================

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const {
      display_name,
      email,
      phone,
      user_type,
      role_id,
      linked_entity_id
    } = req.body

    // 检查用户是否存在
    const existing = await query(`SELECT id FROM users WHERE id = $1`, [id])
    if (existing.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '用户不存在' })
    }

    // 构建更新字段
    const updates = []
    const params = []
    let paramIdx = 1

    if (display_name !== undefined) {
      updates.push(`display_name = $${paramIdx++}`)
      params.push(display_name)
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIdx++}`)
      params.push(email || null)
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIdx++}`)
      params.push(phone || null)
    }
    if (user_type !== undefined) {
      if (!['OPERATOR', 'CLIENT', 'CARRIER'].includes(user_type)) {
        return res.status(400).json({ code: 400, message: '参数错误：无效的用户类型' })
      }
      updates.push(`user_type = $${paramIdx++}`)
      params.push(user_type)
    }
    if (role_id !== undefined) {
      updates.push(`role_id = $${paramIdx++}`)
      params.push(role_id || null)
    }
    if (linked_entity_id !== undefined) {
      updates.push(`linked_entity_id = $${paramIdx++}`)
      params.push(linked_entity_id || null)
    }

    if (updates.length === 0) {
      return res.status(400).json({ code: 400, message: '参数错误：没有可更新的字段' })
    }

    updates.push(`updated_at = NOW()`)
    params.push(id)

    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx}
       RETURNING id, username, display_name, email, phone, user_type, role_id,
                 linked_entity_id, is_active, created_at, updated_at`,
      params
    )

    res.json({ code: 200, message: '用户更新成功', data: result.rows[0] })
  } catch (error) {
    console.error('更新用户失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ==================== 重置密码 ====================

router.put('/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params
    const { new_password } = req.body

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ code: 400, message: '参数错误：密码长度至少 6 位' })
    }

    // 检查用户是否存在
    const existing = await query(`SELECT id FROM users WHERE id = $1`, [id])
    if (existing.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '用户不存在' })
    }

    const salt = await bcrypt.genSalt(10)
    const password_hash = await bcrypt.hash(new_password, salt)

    await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [password_hash, id]
    )

    res.json({ code: 200, message: '密码重置成功', data: null })
  } catch (error) {
    console.error('重置密码失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

// ==================== 停用/启用用户（软删除，不硬删） ====================

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    // 检查用户是否存在
    const existing = await query(`SELECT id, is_active FROM users WHERE id = $1`, [id])
    if (existing.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '用户不存在' })
    }

    // 切换 is_active 状态（软删除）
    const newActive = !existing.rows[0].is_active

    await query(
      `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2`,
      [newActive, id]
    )

    res.json({
      code: 200,
      message: newActive ? '用户已启用' : '用户已停用',
      // ⚠️ 主键是 UUID，Number(id) 得 NaN、JSON 序列化成 null（CLAUDE.md 第 6 条）
      data: { id, is_active: newActive }
    })
  } catch (error) {
    console.error('更新用户状态失败:', error)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

export default router
