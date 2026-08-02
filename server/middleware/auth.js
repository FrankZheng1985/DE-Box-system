/**
 * 认证中间件
 */

import jwt from 'jsonwebtoken'
import { serverConfig } from '../config/index.js'
import { roleHasAnyPermission, SUPER_ROLE_CODE } from '../core/permission-service.js'

/**
 * JWT 认证中间件
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({
      errCode: 401,
      msg: '未提供认证令牌',
      data: null,
    })
  }

  try {
    const decoded = jwt.verify(token, serverConfig.jwtSecret)
    req.user = decoded
    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        errCode: 401,
        msg: '认证令牌已过期，请重新登录',
        data: null,
      })
    }
    return res.status(403).json({
      errCode: 403,
      msg: '无效的认证令牌',
      data: null,
    })
  }
}

/**
 * 可选认证中间件（不强制要求登录）
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (token) {
    try {
      const decoded = jwt.verify(token, serverConfig.jwtSecret)
      req.user = decoded
    } catch {
      // 令牌无效，但不阻止请求
    }
  }

  next()
}

/**
 * 用户类型检查中间件
 * 限制只有指定类型的用户才能访问
 */
export function requireUserType(...allowedTypes) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ code: 401, message: '请先登录', data: null })
    }
    const userType = req.user.userType || req.user.roleCode
    // sys_admin 始终放行
    if (req.user.roleCode === 'sys_admin' || userType === 'OPERATOR') {
      return next()
    }
    if (!allowedTypes.includes(userType)) {
      console.warn('[权限拒绝] username:', req.user?.username, '| userType:', req.user?.userType, '| roleCode:', req.user?.roleCode, '| allowedTypes:', allowedTypes, '| path:', req.method, req.path)
      return res.status(403).json({ code: 403, message: '没有权限执行此操作', data: null })
    }
    next()
  }
}

/**
 * 租户绑定检查中间件（P5）
 *
 * 客户/承运商账号必须绑定了公司（users.linked_entity_id）才能访问共享业务接口。
 *
 * 为什么要单独挡一道：各模块的租户过滤普遍写成
 *   `if (userType === 'CLIENT' && user.linkedEntityId) { sql += ' AND client_id = $n' }`
 * —— linkedEntityId 为空时条件整个不加，等于**不过滤，返回全部数据**。
 * 这个"失效方向"是错的：绑定缺失应该拒绝访问，而不是放行看全部。
 * 与其在七个模块里各修一遍并指望以后没人写错，不如在入口一次挡掉。
 *
 * 运营账号不受影响（本来就该看全量）。
 */
export function requireTenantBinding(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ code: 401, message: '请先登录', data: null })
  }

  const userType = req.user.userType || req.user.roleCode
  if ((userType === 'CLIENT' || userType === 'CARRIER') && !req.user.linkedEntityId) {
    console.warn('[租户拒绝] 门户账号未绑定公司 | username:', req.user?.username,
      '| userType:', userType, '| path:', req.method, req.originalUrl)
    return res.status(403).json({
      code: 403,
      message: '账号未关联公司，请联系管理员完成绑定后再使用',
      data: null
    })
  }

  next()
}

/**
 * 权限码检查中间件（P5 权限体系）
 *
 * 传入多个权限码时是「任意一个满足即放行」，
 * 用于同一个接口被不同角色以不同名义调用的场景，
 * 例如 CMR 上传：运营用 cmr:upload，承运商用 carrier_portal:cmr_upload。
 *
 * 用法：router.post('/', authenticateToken, requirePermission('order:create'), handler)
 */
export function requirePermission(...permissions) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ code: 401, message: '请先登录', data: null })
    }

    try {
      const allowed = await roleHasAnyPermission(req.user.roleCode, permissions)
      if (!allowed) {
        console.warn(
          '[权限拒绝] username:', req.user?.username,
          '| roleCode:', req.user?.roleCode,
          '| 需要:', permissions.join(' 或 '),
          '| path:', req.method, req.originalUrl
        )
        return res.status(403).json({ code: 403, message: '没有权限执行此操作', data: null })
      }
      next()
    } catch (error) {
      console.error('权限校验失败:', error)
      res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
    }
  }
}

/**
 * 系统管理员检查
 * 只有 sys_admin 角色能过，用于角色权限管理这类"权限的权限"
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ code: 401, message: '请先登录', data: null })
  }

  if (req.user.roleCode !== SUPER_ROLE_CODE) {
    return res.status(403).json({ code: 403, message: '需要系统管理员权限', data: null })
  }

  next()
}

export default {
  authenticateToken,
  optionalAuth,
  requireUserType,
  requireTenantBinding,
  requirePermission,
  requireAdmin,
}
