/**
 * 权限服务（P5 权限体系）
 *
 * 职责：按角色查出权限码集合，供中间件和接口使用。
 *
 * 为什么权限码不塞进 JWT：
 *   1. 全系统 75 个权限码，全塞进 token 会让每个请求的 header 明显变大
 *   2. 管理员在角色权限页改了勾选后，用户必须重新登录才生效——体验很差
 *   所以改成"JWT 只带 roleCode，权限码按需查库 + 内存缓存"，
 *   改权限时主动清缓存，最迟 60 秒全节点生效。
 *
 * ⚠️ PM2 是多进程（-i 2），缓存是每个进程各一份。
 *    所以除了改权限时主动清本进程缓存，还留了 60 秒 TTL 兜底，
 *    保证另一个进程最多 60 秒后也会重新查库。
 */

import { query } from './db.js'

/** 缓存有效期（毫秒） */
const CACHE_TTL_MS = 60 * 1000

/** role_code -> { codes: Set<string>, expiresAt: number } */
const cache = new Map()

/** 系统管理员角色码：绕过一切权限检查 */
export const SUPER_ROLE_CODE = 'sys_admin'

/**
 * 查询某个角色拥有的全部权限码
 * @param {string} roleCode 角色码，如 op_staff
 * @returns {Promise<Set<string>>}
 */
export async function getPermissionsByRoleCode(roleCode) {
  if (!roleCode) return new Set()

  const cached = cache.get(roleCode)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.codes
  }

  const result = await query(
    `SELECT rp.perm_code
     FROM role_permissions rp
     JOIN roles r ON r.id = rp.role_id
     WHERE r.role_code = $1 AND r.is_active = true`,
    [roleCode]
  )

  const codes = new Set(result.rows.map(row => row.perm_code))
  cache.set(roleCode, { codes, expiresAt: Date.now() + CACHE_TTL_MS })
  return codes
}

/**
 * 判断某角色是否拥有指定权限码中的任意一个
 * @param {string} roleCode
 * @param {string[]} required 需要的权限码
 * @returns {Promise<boolean>}
 */
export async function roleHasAnyPermission(roleCode, required) {
  if (roleCode === SUPER_ROLE_CODE) return true
  if (!required || required.length === 0) return true

  const codes = await getPermissionsByRoleCode(roleCode)
  return required.some(code => codes.has(code))
}

/**
 * 清除权限缓存
 * @param {string} [roleCode] 不传则清空全部
 */
export function invalidatePermissionCache(roleCode) {
  if (roleCode) {
    cache.delete(roleCode)
  } else {
    cache.clear()
  }
}

/**
 * 取权限码字典（角色权限管理页用）
 * @param {string} [scope] OPERATOR / CLIENT / CARRIER，不传取全部
 */
export async function listPermissionCatalog(scope) {
  const params = []
  let where = ''
  if (scope) {
    params.push(scope)
    where = 'WHERE scope = $1'
  }

  const result = await query(
    `SELECT perm_code, perm_name, module, module_name, perm_type, scope, sort_order, description
     FROM permissions ${where}
     ORDER BY sort_order, perm_code`,
    params
  )
  return result.rows
}

export default {
  SUPER_ROLE_CODE,
  getPermissionsByRoleCode,
  roleHasAnyPermission,
  invalidatePermissionCache,
  listPermissionCatalog,
}
