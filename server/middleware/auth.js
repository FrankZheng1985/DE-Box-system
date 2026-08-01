/**
 * 认证中间件
 */

import jwt from 'jsonwebtoken'
import { serverConfig } from '../config/index.js'

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
 * 权限检查中间件
 */
export function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        errCode: 401,
        msg: '请先登录',
        data: null,
      })
    }

    // 管理员拥有所有权限
    if (req.user.role === 'admin') {
      return next()
    }

    // 检查是否有任意一个所需权限
    const userPermissions = req.user.permissions || []
    const hasPermission = permissions.some(p => userPermissions.includes(p))

    if (!hasPermission) {
      return res.status(403).json({
        errCode: 403,
        msg: '没有权限执行此操作',
        data: null,
      })
    }

    next()
  }
}

/**
 * 管理员权限检查
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      errCode: 401,
      msg: '请先登录',
      data: null,
    })
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      errCode: 403,
      msg: '需要管理员权限',
      data: null,
    })
  }

  next()
}

export default {
  authenticateToken,
  optionalAuth,
  requirePermission,
  requireAdmin,
}
