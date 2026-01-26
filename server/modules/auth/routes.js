/**
 * 认证模块路由
 */

import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDatabase, generateId } from '../../config/database.js'
import { serverConfig } from '../../config/index.js'
import { authenticateToken } from '../../middleware/auth.js'

const router = Router()

/**
 * 用户登录
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.json({
        errCode: 400,
        msg: '用户名和密码不能为空',
        data: null,
      })
    }

    const db = getDatabase()
    
    // 查询用户
    const user = await db.prepare(`
      SELECT u.*, r.role_name as roleName
      FROM users u
      LEFT JOIN roles r ON u.role = r.role_code
      WHERE u.username = ? AND u.status = 'active'
    `).get(username)

    if (!user) {
      return res.json({
        errCode: 401,
        msg: '用户名或密码错误',
        data: null,
      })
    }

    // 验证密码
    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return res.json({
        errCode: 401,
        msg: '用户名或密码错误',
        data: null,
      })
    }

    // 获取用户权限
    const permissions = await db.prepare(`
      SELECT rp.permission_code
      FROM role_permissions rp
      WHERE rp.role_code = ?
    `).all(user.role)

    const permissionList = permissions.map(p => p.permission_code)

    // 生成 JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        permissions: permissionList,
      },
      serverConfig.jwtSecret,
      { expiresIn: serverConfig.jwtExpiresIn }
    )

    // 更新最后登录时间
    await db.prepare(`
      UPDATE users 
      SET last_login_time = NOW(), login_count = COALESCE(login_count, 0) + 1
      WHERE id = ?
    `).run(user.id)

    // 返回用户信息（不包含密码）
    const { password: _, ...userInfo } = user

    res.json({
      errCode: 200,
      msg: '登录成功',
      data: {
        user: userInfo,
        permissions: permissionList,
        token,
      },
    })
  } catch (error) {
    console.error('登录失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '登录失败，请稍后重试',
      data: null,
    })
  }
})

/**
 * 获取当前用户信息
 * GET /api/auth/profile
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    
    const user = await db.prepare(`
      SELECT u.id, u.username, u.name, u.email, u.phone, u.avatar, 
             u.role, r.role_name as roleName, u.status,
             u.last_login_time as lastLoginTime, u.create_time as createTime
      FROM users u
      LEFT JOIN roles r ON u.role = r.role_code
      WHERE u.id = ?
    `).get(req.user.id)

    if (!user) {
      return res.status(404).json({
        errCode: 404,
        msg: '用户不存在',
        data: null,
      })
    }

    // 获取权限
    const permissions = await db.prepare(`
      SELECT permission_code
      FROM role_permissions
      WHERE role_code = ?
    `).all(user.role)

    res.json({
      errCode: 200,
      msg: '获取成功',
      data: {
        user,
        permissions: permissions.map(p => p.permission_code),
      },
    })
  } catch (error) {
    console.error('获取用户信息失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取用户信息失败',
      data: null,
    })
  }
})

/**
 * 修改密码
 * POST /api/auth/change-password
 */
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body

    if (!oldPassword || !newPassword) {
      return res.json({
        errCode: 400,
        msg: '旧密码和新密码不能为空',
        data: null,
      })
    }

    if (newPassword.length < 6) {
      return res.json({
        errCode: 400,
        msg: '新密码长度不能少于6位',
        data: null,
      })
    }

    const db = getDatabase()
    
    // 获取当前用户
    const user = await db.prepare(`
      SELECT password FROM users WHERE id = ?
    `).get(req.user.id)

    if (!user) {
      return res.status(404).json({
        errCode: 404,
        msg: '用户不存在',
        data: null,
      })
    }

    // 验证旧密码
    const validPassword = await bcrypt.compare(oldPassword, user.password)
    if (!validPassword) {
      return res.json({
        errCode: 400,
        msg: '旧密码错误',
        data: null,
      })
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // 更新密码
    await db.prepare(`
      UPDATE users SET password = ?, update_time = NOW() WHERE id = ?
    `).run(hashedPassword, req.user.id)

    res.json({
      errCode: 200,
      msg: '密码修改成功',
      data: null,
    })
  } catch (error) {
    console.error('修改密码失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '修改密码失败',
      data: null,
    })
  }
})

export default router
