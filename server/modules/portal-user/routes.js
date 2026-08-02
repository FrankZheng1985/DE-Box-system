/**
 * 客户门户 · 本公司账号管理路由（P5）
 *
 * 客户管理员（client_admin）自助管理本公司的子账号：新建、改角色、停用、重置密码。
 *
 * ⚠️ 这是子系统专属端点，和运营端的 /api/v1/users 完全分开（模块间 API 隔离规范）。
 *    两者最关键的区别是：这里的每一条 SQL 都硬性带上
 *    `linked_entity_id = 当前登录人的 linkedEntityId`，
 *    客户永远只能看到和操作自己公司的账号。
 */

import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { authenticateToken, requirePermission } from '../../middleware/auth.js'
import { query } from '../../core/db.js'

const router = Router()
router.use(authenticateToken)

/**
 * 必须是绑定了公司的客户账号
 *
 * requirePermission 只管"有没有这个权限码"，管不了"你属于哪家公司"。
 * sys_admin 权限码全有但没有 linked_entity_id，放进来会查出一堆空数据，
 * 所以这里单独挡一道。
 */
function requireClientCompany(req, res, next) {
  const userType = req.user.userType || req.user.roleCode
  if (userType !== 'CLIENT' || !req.user.linkedEntityId) {
    return res.status(403).json({ code: 403, message: '仅客户账号可管理本公司成员', data: null })
  }
  next()
}

router.use(requireClientCompany)
router.use(requirePermission('portal:user_manage'))

/**
 * 可分配的角色（只有客户端角色）
 * GET /api/v1/portal/users/roles
 *
 * ⚠️ 固定路径必须在 /:id 之前（踩坑 001）
 */
router.get('/roles', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, role_code, role_name FROM roles
       WHERE role_type = 'CLIENT' AND is_active = true
       ORDER BY role_code`
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    console.error('[客户门户] 获取角色失败:', error)
    res.status(500).json({ code: 500, message: '获取角色列表失败', data: null })
  }
})

/**
 * 本公司账号列表
 * GET /api/v1/portal/users
 */
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.display_name, u.email, u.phone,
              u.is_active, u.last_login_at, u.created_at,
              u.role_id, r.role_code, r.role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.user_type = 'CLIENT' AND u.linked_entity_id = $1
       ORDER BY u.created_at ASC`,
      [req.user.linkedEntityId]
    )
    res.json({ code: 200, message: 'success', data: result.rows })
  } catch (error) {
    console.error('[客户门户] 获取账号列表失败:', error)
    res.status(500).json({ code: 500, message: '获取账号列表失败', data: null })
  }
})

/**
 * 校验角色是不是本端可分配的客户端角色
 * @param {string} roleId
 * @returns {Promise<boolean>}
 */
async function isAssignableRole(roleId) {
  if (!roleId) return false
  const result = await query(
    `SELECT 1 FROM roles WHERE id = $1 AND role_type = 'CLIENT' AND is_active = true`,
    [roleId]
  )
  return result.rows.length > 0
}

/**
 * 新建子账号
 * POST /api/v1/portal/users
 */
router.post('/', async (req, res) => {
  try {
    const { username, password, display_name, email, phone, role_id } = req.body

    if (!username || !password || !display_name) {
      return res.status(400).json({ code: 400, message: '参数错误：用户名、密码、姓名为必填项', data: null })
    }
    if (password.length < 6) {
      return res.status(400).json({ code: 400, message: '参数错误：密码不能少于 6 位', data: null })
    }
    // 不校验角色就等于让客户自己给自己分配运营端角色
    if (!(await isAssignableRole(role_id))) {
      return res.status(400).json({ code: 400, message: '参数错误：请选择有效的成员角色', data: null })
    }

    const existing = await query(`SELECT id FROM users WHERE username = $1`, [username])
    if (existing.rows.length > 0) {
      return res.status(400).json({ code: 400, message: '参数错误：用户名已被占用', data: null })
    }

    const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10))

    const result = await query(
      `INSERT INTO users (username, password_hash, display_name, email, phone,
                          user_type, role_id, linked_entity_id, is_active)
       VALUES ($1, $2, $3, $4, $5, 'CLIENT', $6, $7, true)
       RETURNING id, username, display_name, email, phone, is_active, created_at`,
      [username, passwordHash, display_name, email || null, phone || null,
       role_id, req.user.linkedEntityId]
    )

    res.status(201).json({ code: 200, message: '成员创建成功', data: result.rows[0] })
  } catch (error) {
    console.error('[客户门户] 创建账号失败:', error)
    res.status(500).json({ code: 500, message: '创建成员失败', data: null })
  }
})

/**
 * 取本公司的某个成员（不存在或不是本公司的一律当不存在）
 * @returns {Promise<object|null>}
 */
async function loadCompanyMember(userId, companyId) {
  const result = await query(
    `SELECT id, username, is_active FROM users
     WHERE id = $1 AND user_type = 'CLIENT' AND linked_entity_id = $2`,
    [userId, companyId]
  )
  return result.rows[0] || null
}

/**
 * 编辑成员资料与角色
 * PUT /api/v1/portal/users/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const member = await loadCompanyMember(req.params.id, req.user.linkedEntityId)
    if (!member) {
      return res.status(404).json({ code: 404, message: '成员不存在', data: null })
    }

    const { display_name, email, phone, role_id } = req.body
    if (role_id !== undefined && !(await isAssignableRole(role_id))) {
      return res.status(400).json({ code: 400, message: '参数错误：请选择有效的成员角色', data: null })
    }
    // 管理员改自己的角色 = 有可能把本公司最后一个管理员降级，之后谁也管不了账号
    if (role_id !== undefined && member.id === req.user.id) {
      return res.status(400).json({ code: 400, message: '不能修改自己的角色', data: null })
    }

    await query(
      `UPDATE users SET
         display_name = COALESCE($1, display_name),
         email        = COALESCE($2, email),
         phone        = COALESCE($3, phone),
         role_id      = COALESCE($4, role_id),
         updated_at   = NOW()
       WHERE id = $5`,
      [display_name ?? null, email ?? null, phone ?? null, role_id ?? null, member.id]
    )

    res.json({ code: 200, message: '成员信息已更新', data: null })
  } catch (error) {
    console.error('[客户门户] 更新账号失败:', error)
    res.status(500).json({ code: 500, message: '更新成员失败', data: null })
  }
})

/**
 * 停用/启用成员
 * PUT /api/v1/portal/users/:id/toggle-status
 */
router.put('/:id/toggle-status', async (req, res) => {
  try {
    const member = await loadCompanyMember(req.params.id, req.user.linkedEntityId)
    if (!member) {
      return res.status(404).json({ code: 404, message: '成员不存在', data: null })
    }
    if (member.id === req.user.id) {
      return res.status(400).json({ code: 400, message: '不能停用自己的账号', data: null })
    }

    const result = await query(
      `UPDATE users SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 RETURNING is_active`,
      [member.id]
    )

    res.json({
      code: 200,
      message: result.rows[0].is_active ? '成员已启用' : '成员已停用',
      data: { is_active: result.rows[0].is_active }
    })
  } catch (error) {
    console.error('[客户门户] 切换账号状态失败:', error)
    res.status(500).json({ code: 500, message: '操作失败', data: null })
  }
})

/**
 * 重置成员密码
 * PUT /api/v1/portal/users/:id/reset-password
 */
router.put('/:id/reset-password', async (req, res) => {
  try {
    const member = await loadCompanyMember(req.params.id, req.user.linkedEntityId)
    if (!member) {
      return res.status(404).json({ code: 404, message: '成员不存在', data: null })
    }

    const { password } = req.body
    if (!password || password.length < 6) {
      return res.status(400).json({ code: 400, message: '参数错误：密码不能少于 6 位', data: null })
    }

    const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10))
    await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, member.id]
    )

    res.json({ code: 200, message: '密码已重置', data: null })
  } catch (error) {
    console.error('[客户门户] 重置密码失败:', error)
    res.status(500).json({ code: 500, message: '重置密码失败', data: null })
  }
})

export default router
