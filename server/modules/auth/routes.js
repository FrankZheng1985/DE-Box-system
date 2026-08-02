/**
 * 认证模块路由
 * 支持三种角色登录：Operator / Client / Carrier
 */

import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../../core/db.js'
import { authenticateToken } from '../../middleware/auth.js'
import { getPermissionsByRoleCode } from '../../core/permission-service.js'

const router = Router()

/**
 * 用户登录
 * POST /api/v1/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.json({ code: 400, message: '用户名和密码不能为空', data: null })
    }

    // 查询用户（关联角色和组织）
    const result = await query(
      `SELECT u.id, u.username, u.password_hash, u.email, u.phone,
              u.display_name, u.user_type, u.linked_entity_id, u.is_active,
              r.role_code, r.role_name, r.role_type
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.username = $1`,
      [username]
    )

    if (result.rows.length === 0) {
      return res.json({ code: 401, message: '用户名或密码错误', data: null })
    }

    const user = result.rows[0]

    if (!user.is_active) {
      return res.json({ code: 401, message: '账号已停用，请联系管理员', data: null })
    }

    // 验证密码
    const validPassword = await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      return res.json({ code: 401, message: '用户名或密码错误', data: null })
    }

    // 获取用户组织分配
    const orgResult = await query(
      `SELECT company_code, business_area, is_default
       FROM user_org_assignments WHERE user_id = $1`,
      [user.id]
    )
    const defaultOrg = orgResult.rows.find(o => o.is_default) || orgResult.rows[0]

    // 获取授权对象值
    const authResult = await query(
      `SELECT av.auth_object_code, av.field_values
       FROM auth_values av
       WHERE av.role_id = (SELECT role_id FROM users WHERE id = $1) AND av.is_active = true`,
      [user.id]
    )

    // 当前角色拥有的权限码（P5）
    // token 里只放 roleCode，权限码由后端按角色查表——改权限后无需重新登录
    const permissions = [...(await getPermissionsByRoleCode(user.role_code))]

    // 生成 JWT
    const tokenPayload = {
      id: user.id,
      username: user.username,
      userType: user.user_type,
      roleCode: user.role_code,
      roleName: user.role_name,
      companyCode: defaultOrg?.company_code || 'DE01',
      linkedEntityId: user.linked_entity_id
    }

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    })

    // 更新最后登录时间
    await query(
      `UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]
    )

    res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          email: user.email,
          phone: user.phone,
          userType: user.user_type,
          roleCode: user.role_code,
          roleName: user.role_name,
          linkedEntityId: user.linked_entity_id
        },
        organization: defaultOrg,
        authObjects: authResult.rows,
        permissions
      }
    })
  } catch (error) {
    console.error('登录失败:', error)
    res.status(500).json({ code: 500, message: '登录失败，请稍后重试', data: null })
  }
})

/**
 * 获取当前用户信息
 * GET /api/v1/auth/profile
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.email, u.phone, u.display_name,
              u.user_type, u.linked_entity_id, u.language,
              r.role_code, r.role_name, r.role_type
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [req.user.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '用户不存在', data: null })
    }

    const orgResult = await query(
      `SELECT company_code, business_area, is_default
       FROM user_org_assignments WHERE user_id = $1`,
      [req.user.id]
    )

    res.json({
      code: 200,
      message: 'success',
      data: {
        user: result.rows[0],
        organizations: orgResult.rows
      }
    })
  } catch (error) {
    console.error('获取用户信息失败:', error)
    res.status(500).json({ code: 500, message: '获取用户信息失败', data: null })
  }
})

/**
 * 获取当前用户的权限码（P5）
 * GET /api/v1/auth/permissions
 *
 * 前端刷新页面或管理员刚改完角色权限时拉一次，
 * 不用退出重登。
 */
router.get('/permissions', authenticateToken, async (req, res) => {
  try {
    const permissions = [...(await getPermissionsByRoleCode(req.user.roleCode))]
    res.json({
      code: 200,
      message: 'success',
      data: {
        roleCode: req.user.roleCode,
        permissions
      }
    })
  } catch (error) {
    console.error('获取权限失败:', error)
    res.status(500).json({ code: 500, message: '获取权限失败', data: null })
  }
})

/**
 * 修改密码
 * PUT /api/v1/auth/password
 */
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body

    if (!oldPassword || !newPassword) {
      return res.json({ code: 400, message: '旧密码和新密码不能为空', data: null })
    }
    if (newPassword.length < 6) {
      return res.json({ code: 400, message: '新密码长度不能少于6位', data: null })
    }

    const result = await query(
      `SELECT password_hash FROM users WHERE id = $1`, [req.user.id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '用户不存在', data: null })
    }

    const valid = await bcrypt.compare(oldPassword, result.rows[0].password_hash)
    if (!valid) {
      return res.json({ code: 400, message: '旧密码错误', data: null })
    }

    const hash = await bcrypt.hash(newPassword, 10)
    await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash, req.user.id])

    res.json({ code: 200, message: '密码修改成功', data: null })
  } catch (error) {
    console.error('修改密码失败:', error)
    res.status(500).json({ code: 500, message: '修改密码失败', data: null })
  }
})

export default router
