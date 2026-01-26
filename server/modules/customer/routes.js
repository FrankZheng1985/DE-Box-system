/**
 * 客户端认证模块路由
 */

import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDatabase } from '../../config/database.js'
import { serverConfig } from '../../config/index.js'

const router = Router()

/**
 * 客户登录
 * POST /api/customer/auth/login
 */
router.post('/auth/login', async (req, res) => {
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
    
    // 查询客户用户（从 customers 表或使用 users 表的客户类型）
    // 这里先使用 users 表，后续可以扩展为独立的客户表
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

    // 生成 JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        type: 'customer', // 标记为客户端token
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
        token,
      },
    })
  } catch (error) {
    console.error('客户登录失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '登录失败，请稍后重试',
      data: null,
    })
  }
})

/**
 * 获取客户订单列表
 * GET /api/customer/orders
 */
router.get('/orders', async (req, res) => {
  try {
    // TODO: 实现客户订单查询
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: {
        list: [],
        total: 0,
      },
    })
  } catch (error) {
    console.error('获取订单失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取订单失败',
      data: null,
    })
  }
})

/**
 * 物流追踪查询
 * GET /api/customer/tracking/:trackingNo
 */
router.get('/tracking/:trackingNo', async (req, res) => {
  try {
    const { trackingNo } = req.params
    
    // TODO: 实现物流追踪查询
    res.json({
      errCode: 404,
      msg: '未找到物流信息',
      data: null,
    })
  } catch (error) {
    console.error('查询物流失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '查询失败',
      data: null,
    })
  }
})

export default router
