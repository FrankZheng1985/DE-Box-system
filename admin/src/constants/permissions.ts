/**
 * 权限码常量（P5 权限体系）
 *
 * ⚠️ 这里的权限码必须和后端 `server/database/migrations/109_permission_system.sql`
 *    里 seed 的 perm_code 一一对应。改动后请跑：
 *      cd server && node scripts/check-permission-menu-sync.js
 *
 * 新增菜单/页面时的四件套（全局规范）：
 *   1. 迁移里加权限码
 *   2. 这里的 MENU_PERMISSIONS 加映射
 *   3. 页面用 hasPermission() 拦敏感操作
 *   4. 后端路由挂 requirePermission()
 */

/** 系统管理员角色码：前端一切权限判断对它直接放行 */
export const SUPER_ROLE_CODE = 'sys_admin'

/**
 * 菜单路径 → 需要的权限码
 *
 * 值是数组，表示"任意一个满足就显示这个菜单"。
 * 没有出现在这张表里的路径 = 不需要权限，所有登录用户可见。
 */
export const MENU_PERMISSIONS: Record<string, string[]> = {
  '/dashboard': ['dashboard:view'],
  '/orders': ['order:view'],
  '/inquiries': ['inquiry:view'],
  '/quotes': ['quotation:view'],
  '/cmr': ['cmr:view'],
  '/shipping-release': ['shipping_release:view'],
  '/customs': ['customs:view'],
  '/gps': ['gps:view'],
  '/finance': ['finance:view'],
  '/invoice-templates': ['invoice_template:view'],
  '/clients': ['client:view'],
  '/carriers': ['carrier:view'],
  '/notifications': ['notification:view'],
  '/settings': ['system:settings'],
  '/settings/posting-periods': ['system:period'],
  '/settings/chart-of-accounts': ['system:account'],
  '/settings/number-ranges': ['system:number_range'],
  '/settings/master-data': ['system:master_data'],
  '/settings/open-api': ['open_api:manage'],
  '/system/users': ['system:user'],
  '/system/roles': ['system:role'],
}

/**
 * 取某个路由需要的权限码
 *
 * 按最长前缀匹配：/orders/:id/edit 会命中 /orders 的配置。
 * @param pathname 当前路由路径
 * @returns 需要的权限码数组；空数组表示不需要权限
 */
export function getRequiredPermissions(pathname: string): string[] {
  let matched: string[] = []
  let matchedLength = 0

  for (const [path, codes] of Object.entries(MENU_PERMISSIONS)) {
    if ((pathname === path || pathname.startsWith(path + '/')) && path.length > matchedLength) {
      matched = codes
      matchedLength = path.length
    }
  }
  return matched
}
