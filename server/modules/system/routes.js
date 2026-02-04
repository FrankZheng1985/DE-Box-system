/**
 * 系统管理模块路由
 * 
 * ERP标准：
 * - 系统设置管理
 * - 权限管理
 * - 审计日志查询
 */

import { Router } from 'express'
import { getDatabase } from '../../config/database.js'
import { authenticateToken, requirePermission, requireAdmin } from '../../middleware/auth.js'
import { queryAuditLogs, AuditActions } from '../../middleware/auditLog.js'

const router = Router()

/**
 * 获取系统设置
 * GET /api/system/settings
 */
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    
    const settings = await db.prepare(`
      SELECT setting_key as key, setting_value as value
      FROM system_settings
    `).all()
    
    const result = {}
    settings.forEach(s => {
      result[s.key] = s.value
    })
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: result,
    })
  } catch (error) {
    console.error('获取系统设置失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取系统设置失败',
      data: null,
    })
  }
})

/**
 * 更新系统设置
 * PUT /api/system/settings
 */
router.put('/settings', authenticateToken, requirePermission('system:basic_data'), async (req, res) => {
  try {
    const { key, value } = req.body
    const db = getDatabase()
    
    await db.prepare(`
      INSERT INTO system_settings (setting_key, setting_value, update_time)
      VALUES (?, ?, NOW())
      ON CONFLICT (setting_key) 
      DO UPDATE SET setting_value = EXCLUDED.setting_value, update_time = NOW()
    `).run(key, value)
    
    res.json({
      errCode: 200,
      msg: '设置成功',
      data: null,
    })
  } catch (error) {
    console.error('更新系统设置失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '更新系统设置失败',
      data: null,
    })
  }
})

/**
 * 获取基础数据列表
 * GET /api/system/basic-data/:type
 */
router.get('/basic-data/:type', authenticateToken, async (req, res) => {
  try {
    const { type } = req.params
    const { page = 1, pageSize = 50, search } = req.query
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    
    const db = getDatabase()
    
    let whereClause = 'type = $1'
    const params = [type]
    
    if (search) {
      whereClause += ' AND (name ILIKE $2 OR code ILIKE $2)'
      params.push(`%${search}%`)
    }
    
    const countResult = await db.prepare(`
      SELECT COUNT(*) as total FROM basic_data WHERE ${whereClause}
    `).get(...params)
    
    const list = await db.prepare(`
      SELECT id, type, code, name, description, status, sort_order as "sortOrder",
             create_time as "createTime", update_time as "updateTime"
      FROM basic_data
      WHERE ${whereClause}
      ORDER BY sort_order, code
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `).all(...params, parseInt(pageSize), offset)
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: {
        list,
        total: parseInt(countResult.total),
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      },
    })
  } catch (error) {
    console.error('获取基础数据失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取基础数据失败',
      data: null,
    })
  }
})

/**
 * 获取权限列表
 * GET /api/system/permissions
 */
router.get('/permissions', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    
    const permissions = await db.prepare(`
      SELECT permission_code as "permissionCode", permission_name as "permissionName",
             module, description, category
      FROM permissions
      ORDER BY module, permission_code
    `).all()
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: permissions,
    })
  } catch (error) {
    console.error('获取权限列表失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取权限列表失败',
      data: null,
    })
  }
})

/**
 * 获取角色权限
 * GET /api/system/roles/:roleCode/permissions
 */
router.get('/roles/:roleCode/permissions', authenticateToken, async (req, res) => {
  try {
    const { roleCode } = req.params
    const db = getDatabase()
    
    const permissions = await db.prepare(`
      SELECT permission_code as "permissionCode"
      FROM role_permissions
      WHERE role_code = ?
    `).all(roleCode)
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: permissions.map(p => p.permissionCode),
    })
  } catch (error) {
    console.error('获取角色权限失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取角色权限失败',
      data: null,
    })
  }
})

/**
 * 更新角色权限
 * PUT /api/system/roles/:roleCode/permissions
 */
router.put('/roles/:roleCode/permissions', authenticateToken, requirePermission('system:user'), async (req, res) => {
  try {
    const { roleCode } = req.params
    const { permissions } = req.body
    const db = getDatabase()
    
    // 删除原有权限
    await db.prepare(`DELETE FROM role_permissions WHERE role_code = ?`).run(roleCode)
    
    // 添加新权限
    if (permissions && permissions.length > 0) {
      for (const permission of permissions) {
        await db.prepare(`
          INSERT INTO role_permissions (role_code, permission_code)
          VALUES (?, ?)
        `).run(roleCode, permission)
      }
    }
    
    res.json({
      errCode: 200,
      msg: '更新成功',
      data: null,
    })
  } catch (error) {
    console.error('更新角色权限失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '更新角色权限失败',
      data: null,
    })
  }
})

/**
 * 获取信息中心列表
 * GET /api/system/messages
 */
router.get('/messages', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, type } = req.query
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    
    const db = getDatabase()
    
    let whereClause = '1=1'
    const params = []
    
    if (type) {
      whereClause += ' AND type = $' + (params.length + 1)
      params.push(type)
    }
    
    const countResult = await db.prepare(`
      SELECT COUNT(*) as total FROM system_messages WHERE ${whereClause}
    `).get(...params)
    
    const list = await db.prepare(`
      SELECT id, title, content, type, status, priority,
             create_time as "createTime", update_time as "updateTime"
      FROM system_messages
      WHERE ${whereClause}
      ORDER BY create_time DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `).all(...params, parseInt(pageSize), offset)
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: {
        list,
        total: parseInt(countResult.total),
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      },
    })
  } catch (error) {
    console.error('获取消息列表失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取消息列表失败',
      data: null,
    })
  }
})

// ==================== 审计日志 API ====================

/**
 * 获取审计日志列表
 * GET /api/system/audit-logs
 * 
 * ERP标准：审计日志查询，仅管理员可访问
 */
router.get('/audit-logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, userId, action, targetType, targetId, startDate, endDate } = req.query
    
    const result = await queryAuditLogs({
      userId,
      action,
      targetType,
      targetId,
      startDate,
      endDate,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    })
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: result,
    })
  } catch (error) {
    console.error('获取审计日志失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取审计日志失败',
      data: null,
    })
  }
})

/**
 * 获取审计日志动作类型列表
 * GET /api/system/audit-logs/actions
 */
router.get('/audit-logs/actions', authenticateToken, requireAdmin, (req, res) => {
  res.json({
    errCode: 200,
    msg: '获取成功',
    data: Object.keys(AuditActions).map(key => ({
      code: AuditActions[key],
      name: key,
    })),
  })
})

/**
 * 获取指定对象的操作历史
 * GET /api/system/audit-logs/:targetType/:targetId
 */
router.get('/audit-logs/:targetType/:targetId', authenticateToken, async (req, res) => {
  try {
    const { targetType, targetId } = req.params
    const { page = 1, pageSize = 20 } = req.query
    
    const result = await queryAuditLogs({
      targetType,
      targetId,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    })
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: result,
    })
  } catch (error) {
    console.error('获取操作历史失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取操作历史失败',
      data: null,
    })
  }
})

export default router
