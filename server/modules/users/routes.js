/**
 * 用户管理模块路由
 * 
 * ERP标准：
 * - 软删除机制保护数据完整性
 * - 有业务关联的用户禁止删除
 * - 审计日志记录所有操作
 */

import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { getDatabase, generateId } from '../../config/database.js'
import { authenticateToken, requirePermission } from '../../middleware/auth.js'
import { logAudit } from '../../middleware/auditLog.js'

const router = Router()

/**
 * 获取用户列表
 * GET /api/users
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, search, role, status, includeDeleted } = req.query
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    
    const db = getDatabase()
    
    // 默认过滤已删除的用户
    let whereClause = includeDeleted === 'true' ? '1=1' : '(u.is_deleted IS NULL OR u.is_deleted = FALSE)'
    const params = []
    
    if (search) {
      whereClause += ' AND (u.username ILIKE $' + (params.length + 1) + ' OR u.name ILIKE $' + (params.length + 1) + ')'
      params.push(`%${search}%`)
    }
    
    if (role) {
      whereClause += ' AND u.role = $' + (params.length + 1)
      params.push(role)
    }
    
    if (status) {
      whereClause += ' AND u.status = $' + (params.length + 1)
      params.push(status)
    }
    
    // 查询总数
    const countResult = await db.prepare(`
      SELECT COUNT(*) as total FROM users u WHERE ${whereClause}
    `).get(...params)
    
    // 查询列表
    const users = await db.prepare(`
      SELECT u.id, u.username, u.name, u.email, u.phone, u.avatar,
             u.role, r.role_name as "roleName", u.status,
             u.last_login_time as "lastLoginTime", u.login_count as "loginCount",
             u.create_time as "createTime", u.update_time as "updateTime",
             u.is_deleted as "isDeleted"
      FROM users u
      LEFT JOIN roles r ON u.role = r.role_code
      WHERE ${whereClause}
      ORDER BY u.create_time DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `).all(...params, parseInt(pageSize), offset)
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: {
        list: users,
        total: parseInt(countResult.total),
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      },
    })
  } catch (error) {
    console.error('获取用户列表失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取用户列表失败',
      data: null,
    })
  }
})

/**
 * 获取单个用户
 * GET /api/users/:id
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    const user = await db.prepare(`
      SELECT u.id, u.username, u.name, u.email, u.phone, u.avatar,
             u.role, r.role_name as "roleName", u.status,
             u.last_login_time as "lastLoginTime", u.login_count as "loginCount",
             u.create_time as "createTime", u.update_time as "updateTime"
      FROM users u
      LEFT JOIN roles r ON u.role = r.role_code
      WHERE u.id = ?
    `).get(id)
    
    if (!user) {
      return res.status(404).json({
        errCode: 404,
        msg: '用户不存在',
        data: null,
      })
    }
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: user,
    })
  } catch (error) {
    console.error('获取用户失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取用户失败',
      data: null,
    })
  }
})

/**
 * 创建用户
 * POST /api/users
 */
router.post('/', authenticateToken, requirePermission('system:user'), async (req, res) => {
  try {
    const { username, name, email, phone, role, password } = req.body
    
    if (!username || !name || !password) {
      return res.json({
        errCode: 400,
        msg: '用户名、姓名和密码不能为空',
        data: null,
      })
    }
    
    const db = getDatabase()
    
    // 检查用户名是否已存在
    const existing = await db.prepare(`
      SELECT id FROM users WHERE username = ?
    `).get(username)
    
    if (existing) {
      return res.json({
        errCode: 400,
        msg: '用户名已存在',
        data: null,
      })
    }
    
    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10)
    
    const id = generateId('user')
    
    await db.prepare(`
      INSERT INTO users (id, username, name, email, phone, role, password, status, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
    `).run(id, username, name, email || null, phone || null, role || 'operator', hashedPassword)
    
    res.json({
      errCode: 200,
      msg: '创建成功',
      data: { id },
    })
  } catch (error) {
    console.error('创建用户失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '创建用户失败',
      data: null,
    })
  }
})

/**
 * 更新用户
 * PUT /api/users/:id
 */
router.put('/:id', authenticateToken, requirePermission('system:user'), async (req, res) => {
  try {
    const { id } = req.params
    const { name, email, phone, role, status } = req.body
    
    const db = getDatabase()
    
    // 检查用户是否存在
    const existing = await db.prepare(`
      SELECT id FROM users WHERE id = ?
    `).get(id)
    
    if (!existing) {
      return res.status(404).json({
        errCode: 404,
        msg: '用户不存在',
        data: null,
      })
    }
    
    // 构建更新语句
    const updates = []
    const params = []
    
    if (name !== undefined) {
      updates.push('name = $' + (params.length + 1))
      params.push(name)
    }
    if (email !== undefined) {
      updates.push('email = $' + (params.length + 1))
      params.push(email)
    }
    if (phone !== undefined) {
      updates.push('phone = $' + (params.length + 1))
      params.push(phone)
    }
    if (role !== undefined) {
      updates.push('role = $' + (params.length + 1))
      params.push(role)
    }
    if (status !== undefined) {
      updates.push('status = $' + (params.length + 1))
      params.push(status)
    }
    
    updates.push('update_time = NOW()')
    params.push(id)
    
    await db.prepare(`
      UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}
    `).run(...params)
    
    res.json({
      errCode: 200,
      msg: '更新成功',
      data: null,
    })
  } catch (error) {
    console.error('更新用户失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '更新用户失败',
      data: null,
    })
  }
})

/**
 * 删除用户（软删除）
 * DELETE /api/users/:id
 * 
 * ERP标准：
 * - 不允许删除自己
 * - 有业务数据关联的用户只能停用，不能删除
 * - 采用软删除机制保护数据
 */
router.delete('/:id', authenticateToken, requirePermission('system:user'), async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    // 不允许删除自己
    if (id === req.user.id) {
      return res.json({
        errCode: 400,
        msg: '不能删除自己的账号',
        data: null,
      })
    }
    
    // 检查用户是否存在
    const user = await db.prepare(`SELECT id, username, name, is_deleted FROM users WHERE id = ?`).get(id)
    
    if (!user) {
      return res.status(404).json({
        errCode: 404,
        msg: '用户不存在',
        data: null,
      })
    }
    
    if (user.is_deleted) {
      return res.json({
        errCode: 400,
        msg: '该用户已被删除',
        data: null,
      })
    }
    
    // 检查是否有关联的订单操作记录
    const hasOrders = await db.prepare(`
      SELECT 1 FROM orders WHERE operator_id = ? LIMIT 1
    `).get(id)
    
    // 检查是否有关联的发票操作记录
    const hasInvoices = await db.prepare(`
      SELECT 1 FROM invoices WHERE operator_id = ? LIMIT 1
    `).get(id)
    
    // 检查是否是客户的销售负责人
    const hasCustomers = await db.prepare(`
      SELECT 1 FROM customers WHERE sales_id = ? LIMIT 1
    `).get(id)
    
    if (hasOrders || hasInvoices || hasCustomers) {
      return res.json({
        errCode: 400,
        msg: '该用户存在业务关联数据，无法删除。请将用户状态设为"停用"。',
        data: {
          hasOrders: !!hasOrders,
          hasInvoices: !!hasInvoices,
          hasCustomers: !!hasCustomers,
        },
      })
    }
    
    // 执行软删除
    await db.prepare(`
      UPDATE users 
      SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = ?, status = 'inactive', update_time = NOW()
      WHERE id = ?
    `).run(req.user.id, id)
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'USER_DELETE',
      targetType: 'user',
      targetId: id,
      details: { username: user.username, name: user.name },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '删除成功',
      data: null,
    })
  } catch (error) {
    console.error('删除用户失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '删除用户失败: ' + error.message,
      data: null,
    })
  }
})

/**
 * 重置用户密码
 * POST /api/users/:id/reset-password
 */
router.post('/:id/reset-password', authenticateToken, requirePermission('system:user'), async (req, res) => {
  try {
    const { id } = req.params
    const { password } = req.body
    
    if (!password || password.length < 6) {
      return res.json({
        errCode: 400,
        msg: '密码长度不能少于6位',
        data: null,
      })
    }
    
    const db = getDatabase()
    const hashedPassword = await bcrypt.hash(password, 10)
    
    await db.prepare(`
      UPDATE users SET password = ?, update_time = NOW() WHERE id = ?
    `).run(hashedPassword, id)
    
    res.json({
      errCode: 200,
      msg: '密码重置成功',
      data: null,
    })
  } catch (error) {
    console.error('重置密码失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '重置密码失败',
      data: null,
    })
  }
})

/**
 * 获取角色列表
 * GET /api/users/roles/list
 */
router.get('/roles/list', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    
    const roles = await db.prepare(`
      SELECT role_code as "roleCode", role_name as "roleName", 
             description, is_system as "isSystem", status
      FROM roles
      WHERE status = 'active'
      ORDER BY is_system DESC, role_code
    `).all()
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: roles,
    })
  } catch (error) {
    console.error('获取角色列表失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取角色列表失败',
      data: null,
    })
  }
})

export default router
