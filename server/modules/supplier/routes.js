/**
 * 供应商管理模块路由
 * 
 * ERP标准：
 * - 软删除机制保护供应商数据
 * - 有业务关联的供应商禁止删除，只能停用
 * - 审计日志记录所有操作
 */

import { Router } from 'express'
import { getDatabase, generateId } from '../../config/database.js'
import { authenticateToken, requirePermission } from '../../middleware/auth.js'
import { logAudit } from '../../middleware/auditLog.js'

const router = Router()

/**
 * 获取供应商列表
 * GET /api/suppliers
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, search, type, includeDeleted } = req.query
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    
    const db = getDatabase()
    
    // 默认过滤已删除的供应商
    let whereClause = includeDeleted === 'true' ? '1=1' : '(s.is_deleted IS NULL OR s.is_deleted = FALSE)'
    const params = []
    
    if (status) {
      whereClause += ' AND s.status = $' + (params.length + 1)
      params.push(status)
    }
    
    if (search) {
      whereClause += ' AND (s.name ILIKE $' + (params.length + 1) + ' OR s.code ILIKE $' + (params.length + 1) + ')'
      params.push(`%${search}%`)
    }
    
    if (type) {
      whereClause += ' AND s.type = $' + (params.length + 1)
      params.push(type)
    }
    
    const countResult = await db.prepare(`
      SELECT COUNT(*) as total FROM suppliers s WHERE ${whereClause}
    `).get(...params)
    
    const list = await db.prepare(`
      SELECT s.id, s.code, s.name, s.short_name as "shortName", s.type,
             s.contact_person as "contactPerson", s.phone, s.email, s.address,
             s.payment_terms as "paymentTerms", s.status, s.remark,
             s.create_time as "createTime", s.update_time as "updateTime",
             s.is_deleted as "isDeleted"
      FROM suppliers s
      WHERE ${whereClause}
      ORDER BY s.create_time DESC
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
    console.error('获取供应商列表失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取供应商列表失败',
      data: null,
    })
  }
})

/**
 * 获取供应商详情
 * GET /api/suppliers/:id
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    const supplier = await db.prepare(`
      SELECT * FROM suppliers WHERE id = ?
    `).get(id)
    
    if (!supplier) {
      return res.status(404).json({
        errCode: 404,
        msg: '供应商不存在',
        data: null,
      })
    }
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: supplier,
    })
  } catch (error) {
    console.error('获取供应商详情失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取供应商详情失败',
      data: null,
    })
  }
})

/**
 * 创建供应商
 * POST /api/suppliers
 */
router.post('/', authenticateToken, requirePermission('supplier:manage'), async (req, res) => {
  try {
    const { name, shortName, type, contactPerson, phone, email, address, paymentTerms, remark } = req.body
    
    if (!name) {
      return res.json({
        errCode: 400,
        msg: '供应商名称不能为空',
        data: null,
      })
    }
    
    const db = getDatabase()
    const id = generateId('supp')
    const code = 'S' + Date.now().toString().slice(-8)
    
    await db.prepare(`
      INSERT INTO suppliers (id, code, name, short_name, type, contact_person, phone, email,
                            address, payment_terms, status, remark, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW(), NOW())
    `).run(id, code, name, shortName || null, type || 'carrier', contactPerson || null,
           phone || null, email || null, address || null, paymentTerms || 30, remark || null)
    
    res.json({
      errCode: 200,
      msg: '创建成功',
      data: { id, code },
    })
  } catch (error) {
    console.error('创建供应商失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '创建供应商失败',
      data: null,
    })
  }
})

/**
 * 更新供应商
 * PUT /api/suppliers/:id
 */
router.put('/:id', authenticateToken, requirePermission('supplier:manage'), async (req, res) => {
  try {
    const { id } = req.params
    const updates = []
    const params = []
    
    const fields = ['name', 'shortName', 'type', 'contactPerson', 'phone', 'email', 'address', 'paymentTerms', 'status', 'remark']
    const dbFields = ['name', 'short_name', 'type', 'contact_person', 'phone', 'email', 'address', 'payment_terms', 'status', 'remark']
    
    fields.forEach((field, index) => {
      if (req.body[field] !== undefined) {
        updates.push(dbFields[index] + ' = $' + (params.length + 1))
        params.push(req.body[field])
      }
    })
    
    if (updates.length === 0) {
      return res.json({
        errCode: 400,
        msg: '没有要更新的字段',
        data: null,
      })
    }
    
    updates.push('update_time = NOW()')
    params.push(id)
    
    const db = getDatabase()
    await db.prepare(`
      UPDATE suppliers SET ${updates.join(', ')} WHERE id = $${params.length}
    `).run(...params)
    
    res.json({
      errCode: 200,
      msg: '更新成功',
      data: null,
    })
  } catch (error) {
    console.error('更新供应商失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '更新供应商失败',
      data: null,
    })
  }
})

/**
 * 删除供应商（软删除）
 * DELETE /api/suppliers/:id
 * 
 * ERP标准：
 * - 有运输单关联的供应商禁止删除，只能停用
 * - 采用软删除机制保护数据
 */
router.delete('/:id', authenticateToken, requirePermission('supplier:manage'), async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    // 检查供应商是否存在
    const supplier = await db.prepare(`
      SELECT id, code, name, is_deleted FROM suppliers WHERE id = ?
    `).get(id)
    
    if (!supplier) {
      return res.status(404).json({
        errCode: 404,
        msg: '供应商不存在',
        data: null,
      })
    }
    
    if (supplier.is_deleted) {
      return res.json({
        errCode: 400,
        msg: '该供应商已被删除',
        data: null,
      })
    }
    
    // 检查是否有关联的运输单（通过承运商名称匹配）
    const hasShipments = await db.prepare(`
      SELECT 1 FROM tms_shipments WHERE carrier = ? AND status NOT IN ('cancelled') LIMIT 1
    `).get(supplier.name)
    
    if (hasShipments) {
      return res.json({
        errCode: 400,
        msg: '该供应商存在关联运输单，无法删除。请将供应商状态设为"停用"。',
        data: {
          suggestion: '建议使用"停用"功能替代删除'
        },
      })
    }
    
    // 执行软删除
    await db.prepare(`
      UPDATE suppliers 
      SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = ?, status = 'inactive', update_time = NOW()
      WHERE id = ?
    `).run(req.user.id, id)
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'SUPPLIER_DELETE',
      targetType: 'supplier',
      targetId: id,
      details: { code: supplier.code, name: supplier.name },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '删除成功',
      data: null,
    })
  } catch (error) {
    console.error('删除供应商失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '删除供应商失败: ' + error.message,
      data: null,
    })
  }
})

export default router
