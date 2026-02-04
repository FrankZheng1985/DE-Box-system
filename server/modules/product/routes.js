/**
 * 产品定价模块路由
 * 
 * ERP标准：
 * - 软删除机制保护产品数据
 * - 有业务关联的产品禁止删除，只能停用
 * - 审计日志记录所有操作
 */

import { Router } from 'express'
import { getDatabase, generateId } from '../../config/database.js'
import { authenticateToken, requirePermission } from '../../middleware/auth.js'
import { logAudit } from '../../middleware/auditLog.js'

const router = Router()

/**
 * 获取产品列表
 * GET /api/products
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, search, category, includeDeleted } = req.query
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    
    const db = getDatabase()
    
    // 默认过滤已删除的产品
    let whereClause = includeDeleted === 'true' ? '1=1' : '(p.is_deleted IS NULL OR p.is_deleted = FALSE)'
    const params = []
    
    if (status) {
      whereClause += ' AND p.status = $' + (params.length + 1)
      params.push(status)
    }
    
    if (search) {
      whereClause += ' AND (p.name ILIKE $' + (params.length + 1) + ' OR p.code ILIKE $' + (params.length + 1) + ')'
      params.push(`%${search}%`)
    }
    
    if (category) {
      whereClause += ' AND p.category = $' + (params.length + 1)
      params.push(category)
    }
    
    const countResult = await db.prepare(`
      SELECT COUNT(*) as total FROM products p WHERE ${whereClause}
    `).get(...params)
    
    const list = await db.prepare(`
      SELECT p.id, p.code, p.name, p.category, p.unit, p.base_price as "basePrice",
             p.currency, p.status, p.description,
             p.create_time as "createTime", p.update_time as "updateTime",
             p.is_deleted as "isDeleted"
      FROM products p
      WHERE ${whereClause}
      ORDER BY p.code
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
    console.error('获取产品列表失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取产品列表失败',
      data: null,
    })
  }
})

/**
 * 获取产品详情
 * GET /api/products/:id
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    const product = await db.prepare(`
      SELECT * FROM products WHERE id = ?
    `).get(id)
    
    if (!product) {
      return res.status(404).json({
        errCode: 404,
        msg: '产品不存在',
        data: null,
      })
    }
    
    // 获取价格规则
    const priceRules = await db.prepare(`
      SELECT * FROM product_price_rules WHERE product_id = ? ORDER BY min_quantity
    `).all(id)
    
    res.json({
      errCode: 200,
      msg: '获取成功',
      data: {
        ...product,
        priceRules,
      },
    })
  } catch (error) {
    console.error('获取产品详情失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '获取产品详情失败',
      data: null,
    })
  }
})

/**
 * 创建产品
 * POST /api/products
 */
router.post('/', authenticateToken, requirePermission('product:manage'), async (req, res) => {
  try {
    const { code, name, category, unit, basePrice, currency, description } = req.body
    
    if (!code || !name) {
      return res.json({
        errCode: 400,
        msg: '产品编码和名称不能为空',
        data: null,
      })
    }
    
    const db = getDatabase()
    
    // 检查编码是否已存在
    const existing = await db.prepare(`
      SELECT id FROM products WHERE code = ?
    `).get(code)
    
    if (existing) {
      return res.json({
        errCode: 400,
        msg: '产品编码已存在',
        data: null,
      })
    }
    
    const id = generateId('prod')
    
    await db.prepare(`
      INSERT INTO products (id, code, name, category, unit, base_price, currency, status, description,
                           create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW(), NOW())
    `).run(id, code, name, category || 'service', unit || 'unit', basePrice || 0,
           currency || 'EUR', description || null)
    
    res.json({
      errCode: 200,
      msg: '创建成功',
      data: { id },
    })
  } catch (error) {
    console.error('创建产品失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '创建产品失败',
      data: null,
    })
  }
})

/**
 * 更新产品
 * PUT /api/products/:id
 */
router.put('/:id', authenticateToken, requirePermission('product:manage'), async (req, res) => {
  try {
    const { id } = req.params
    const updates = []
    const params = []
    
    const fields = ['name', 'category', 'unit', 'basePrice', 'currency', 'status', 'description']
    const dbFields = ['name', 'category', 'unit', 'base_price', 'currency', 'status', 'description']
    
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
      UPDATE products SET ${updates.join(', ')} WHERE id = $${params.length}
    `).run(...params)
    
    res.json({
      errCode: 200,
      msg: '更新成功',
      data: null,
    })
  } catch (error) {
    console.error('更新产品失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '更新产品失败',
      data: null,
    })
  }
})

/**
 * 删除产品（软删除）
 * DELETE /api/products/:id
 * 
 * ERP标准：
 * - 有订单引用的产品禁止删除，只能停用
 * - 采用软删除机制保护数据
 */
router.delete('/:id', authenticateToken, requirePermission('product:manage'), async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    // 检查产品是否存在
    const product = await db.prepare(`
      SELECT id, code, name, is_deleted FROM products WHERE id = ?
    `).get(id)
    
    if (!product) {
      return res.status(404).json({
        errCode: 404,
        msg: '产品不存在',
        data: null,
      })
    }
    
    if (product.is_deleted) {
      return res.json({
        errCode: 400,
        msg: '该产品已被删除',
        data: null,
      })
    }
    
    // 检查是否有订单明细引用
    const hasOrderItems = await db.prepare(`
      SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1
    `).get(id)
    
    if (hasOrderItems) {
      return res.json({
        errCode: 400,
        msg: '该产品已被订单引用，无法删除。请将产品状态设为"停用"。',
        data: {
          suggestion: '建议使用"停用"功能替代删除'
        },
      })
    }
    
    // 执行软删除（包括价格规则）
    const deleteProductTx = db.transaction(async function() {
      // 删除价格规则（物理删除，因为产品已软删除）
      await this.prepare(`DELETE FROM product_price_rules WHERE product_id = ?`).run(id)
      
      // 软删除产品
      await this.prepare(`
        UPDATE products 
        SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = ?, status = 'inactive', update_time = NOW()
        WHERE id = ?
      `).run(req.user.id, id)
    })
    
    await deleteProductTx()
    
    // 记录审计日志
    await logAudit({
      userId: req.user.id,
      action: 'PRODUCT_DELETE',
      targetType: 'product',
      targetId: id,
      details: { code: product.code, name: product.name },
      ip: req.ip
    })
    
    res.json({
      errCode: 200,
      msg: '删除成功',
      data: null,
    })
  } catch (error) {
    console.error('删除产品失败:', error)
    res.status(500).json({
      errCode: 500,
      msg: '删除产品失败: ' + error.message,
      data: null,
    })
  }
})

export default router
