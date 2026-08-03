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
 *
 * P9：失败响应除 message（中文）外，additive 地带一个 messageCode。
 * 前端按码查自己的语言包显示，查不到再退回后端 message，
 * 这样德语/英语界面上不会再冒出中文报错。
 * 后端消息整体 i18n 是 P9 第 4 批，这里先把登录这条链路铺好。
 *
 * 已定义的码：
 *   MISSING_CREDENTIALS  用户名和密码不能为空
 *   INVALID_CREDENTIALS  用户名或密码错误
 *   ACCOUNT_DISABLED     账号已停用，请联系管理员
 *   LOGIN_ERROR          服务端异常
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.json({ code: 400, message: '用户名和密码不能为空', messageCode: 'MISSING_CREDENTIALS', data: null })
    }

    // 查询用户（关联角色和组织）
    const result = await query(
      `SELECT u.id, u.username, u.password_hash, u.email, u.phone,
              u.display_name, u.user_type, u.linked_entity_id, u.is_active, u.language,
              r.role_code, r.role_name, r.role_type
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.username = $1`,
      [username]
    )

    if (result.rows.length === 0) {
      return res.json({ code: 401, message: '用户名或密码错误', messageCode: 'INVALID_CREDENTIALS', data: null })
    }

    const user = result.rows[0]

    if (!user.is_active) {
      return res.json({ code: 401, message: '账号已停用，请联系管理员', messageCode: 'ACCOUNT_DISABLED', data: null })
    }

    // 验证密码
    const validPassword = await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      return res.json({ code: 401, message: '用户名或密码错误', messageCode: 'INVALID_CREDENTIALS', data: null })
    }

    // 门户账号：校验绑定的公司是否真实存在（踩坑 035）
    //
    // 绑定指向一家已被删掉的公司时，租户隔离条件 WHERE client_id = <悬空UUID>
    // 永远匹配不到行，于是门户每个页面都返回 200 + 空数组、控制台无任何报错，
    // 看起来就像「这家公司确实还没有业务」——客户和运营都查不出毛病。
    // requireTenantBinding 只挡「绑定为空」，挡不住「绑定指向不存在的 ID」，
    // 所以在登录入口就拦下来，把静默失败变成明确提示。
    if ((user.user_type === 'CLIENT' || user.user_type === 'CARRIER') && user.linked_entity_id) {
      // 表名来自固定三元表达式，只有两种取值，不存在注入面
      const boundTable = user.user_type === 'CLIENT' ? 'clients' : 'carriers'
      const boundResult = await query(
        `SELECT id FROM ${boundTable} WHERE id = $1`,
        [user.linked_entity_id]
      )
      if (boundResult.rows.length === 0) {
        console.error('[登录拒绝] 门户账号绑定的公司不存在 | username:', user.username,
          '| userType:', user.user_type, '| linkedEntityId:', user.linked_entity_id)
        return res.json({
          code: 401,
          message: '账号绑定的公司不存在，请联系管理员重新绑定',
          messageCode: 'BOUND_COMPANY_MISSING',
          data: null
        })
      }
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
          linkedEntityId: user.linked_entity_id,
          // P9 三语国际化：登录后前端直接按这个值切界面语言，不用再多请求一次 profile
          language: user.language || 'zh'
        },
        organization: defaultOrg,
        authObjects: authResult.rows,
        permissions
      }
    })
  } catch (error) {
    console.error('登录失败:', error)
    res.status(500).json({ code: 500, message: '登录失败，请稍后重试', messageCode: 'LOGIN_ERROR', data: null })
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
