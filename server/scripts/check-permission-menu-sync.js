/**
 * 权限-菜单同步校验（P5）
 *
 * 全局规范要求新增菜单/页面时"权限四件套"同步：
 *   1. 迁移里加权限码
 *   2. 前端 MENU_PERMISSIONS 加映射
 *   3. 页面用 hasPermission() 拦敏感操作
 *   4. 后端路由挂 requirePermission()
 * 这个脚本查前三件里最容易脱节的部分——**代码里用的权限码和迁移里定义的对不对得上**。
 *
 * 用法（提交前跑一次，不连数据库，纯静态扫描）：
 *   cd server && node scripts/check-permission-menu-sync.js
 *
 * 退出码：0 = 通过；2 = 有引用了未定义的权限码，必须修
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

const log = (m = '') => process.stdout.write(m + '\n')
const RED = (t) => `\x1b[31m${t}\x1b[0m`
const YELLOW = (t) => `\x1b[33m${t}\x1b[0m`
const GREEN = (t) => `\x1b[32m${t}\x1b[0m`
const DIM = (t) => `\x1b[2m${t}\x1b[0m`

const MIGRATION = path.join(ROOT, 'server/database/migrations/109_permission_system.sql')
const MENU_CONFIG = path.join(ROOT, 'admin/src/constants/permissions.ts')

/**
 * 递归收集目录下的源码文件
 * @param {string} dir
 * @param {string[]} exts 后缀白名单
 * @returns {string[]} 绝对路径列表
 */
function walk(dir, exts) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, exts))
    else if (exts.some(e => entry.name.endsWith(e))) out.push(full)
  }
  return out
}

// ---------------------------------------------------------------------------
// 1. 迁移里定义了哪些权限码
// ---------------------------------------------------------------------------
if (!fs.existsSync(MIGRATION)) {
  log(RED(`找不到迁移文件：${MIGRATION}`))
  process.exit(2)
}
const migrationSql = fs.readFileSync(MIGRATION, 'utf8')
const defined = new Set()
// 匹配 INSERT INTO permissions 里每行开头的 ('perm:code', ...
for (const m of migrationSql.matchAll(/^\s*\('([a-z_]+:[a-z_]+)'/gm)) {
  defined.add(m[1])
}

log(`\n权限码字典：${GREEN(String(defined.size))} 个（来自 109_permission_system.sql）`)

// ---------------------------------------------------------------------------
// 2. 代码里引用了哪些权限码
// ---------------------------------------------------------------------------
/** @type {Map<string, string[]>} 权限码 -> 引用它的文件（相对路径） */
const used = new Map()

function record(code, file) {
  const rel = path.relative(ROOT, file)
  if (!used.has(code)) used.set(code, [])
  if (!used.get(code).includes(rel)) used.get(code).push(rel)
}

// 后端：requirePermission('a:b', 'c:d')
for (const file of walk(path.join(ROOT, 'server/modules'), ['.js'])) {
  const src = fs.readFileSync(file, 'utf8')
  for (const m of src.matchAll(/requirePermission\(([^)]*)\)/g)) {
    for (const c of m[1].matchAll(/'([a-z_]+:[a-z_]+)'/g)) record(c[1], file)
  }
  // roleHasAnyPermission(req.user.roleCode, ['a:b'])
  for (const m of src.matchAll(/roleHasAnyPermission\([^)]*?\[([^\]]*)\]/g)) {
    for (const c of m[1].matchAll(/'([a-z_]+:[a-z_]+)'/g)) record(c[1], file)
  }
}

// 前端三端：hasPermission('a:b') / hasAnyPermission([...]) / MENU_PERMISSIONS / permission: 'a:b'
const frontendDirs = ['admin/src', 'customer-portal/src', 'carrier-portal/src']
for (const dir of frontendDirs) {
  for (const file of walk(path.join(ROOT, dir), ['.ts', '.tsx'])) {
    const src = fs.readFileSync(file, 'utf8')
    for (const m of src.matchAll(/'([a-z_]+:[a-z_]+)'/g)) {
      // 只认长得像权限码的字符串，排掉 'Content-Type' 这类
      record(m[1], file)
    }
  }
}

// ---------------------------------------------------------------------------
// 3. 对账
// ---------------------------------------------------------------------------
const undefinedCodes = [...used.keys()].filter(c => !defined.has(c)).sort()
const unusedCodes = [...defined].filter(c => !used.has(c)).sort()

let exitCode = 0

if (undefinedCodes.length > 0) {
  exitCode = 2
  log(RED(`\n❌ 代码引用了 ${undefinedCodes.length} 个字典里没有的权限码（必须修）：`))
  for (const code of undefinedCodes) {
    log(`   ${RED(code)}`)
    for (const f of used.get(code)) log(DIM(`      ← ${f}`))
  }
  log(DIM('\n   处理办法：要么在 109_permission_system.sql 里补上这个码，要么改代码用已有的码。'))
} else {
  log(GREEN('\n✅ 代码里用到的权限码，字典里都有定义'))
}

// ---------------------------------------------------------------------------
// 4. 菜单映射检查
// ---------------------------------------------------------------------------
if (fs.existsSync(MENU_CONFIG)) {
  const menuSrc = fs.readFileSync(MENU_CONFIG, 'utf8')
  const menuBlock = menuSrc.match(/MENU_PERMISSIONS[^{]*\{([\s\S]*?)\n\}/)
  const mappedPaths = new Set()
  if (menuBlock) {
    for (const m of menuBlock[1].matchAll(/'(\/[^']*)'\s*:/g)) mappedPaths.add(m[1])
  }

  // Sidebar 里的菜单路径
  const sidebar = path.join(ROOT, 'admin/src/components/Sidebar.tsx')
  const missing = []
  if (fs.existsSync(sidebar)) {
    const sidebarSrc = fs.readFileSync(sidebar, 'utf8')
    for (const m of sidebarSrc.matchAll(/\{\s*path:\s*'(\/[^']*)'/g)) {
      if (!mappedPaths.has(m[1])) missing.push(m[1])
    }
  }

  if (missing.length > 0) {
    log(YELLOW(`\n⚠️  Sidebar 有 ${missing.length} 个菜单没配权限（所有角色都能看到，敏感功能务必补上）：`))
    for (const p of missing) log(`   ${YELLOW(p)}`)
  } else {
    log(GREEN('✅ Sidebar 的每个菜单都配了权限映射'))
  }
} else {
  log(YELLOW(`\n⚠️  找不到 ${path.relative(ROOT, MENU_CONFIG)}，跳过菜单映射检查`))
}

// ---------------------------------------------------------------------------
// 4b. 页面标题映射检查（导航同步四件套的第 3 件）
//
//     漏了这个的表现很隐蔽：页面能正常打开，只是顶栏标题回落成「仪表板」。
//     2026-08-02 新增「角色权限」菜单时就漏了，顺带发现「用户管理」和
//     「发票模板」也一直缺（一直显示成仪表板）。
// ---------------------------------------------------------------------------
const HEADER = path.join(ROOT, 'admin/src/components/Header.tsx')
const SIDEBAR = path.join(ROOT, 'admin/src/components/Sidebar.tsx')

if (fs.existsSync(HEADER) && fs.existsSync(SIDEBAR)) {
  const headerSrc = fs.readFileSync(HEADER, 'utf8')
  const titleBlock = headerSrc.match(/routeTitleMap[^{]*\{([\s\S]*?)\n\}/)
  const titled = new Set()
  if (titleBlock) {
    for (const m of titleBlock[1].matchAll(/'(\/[^']*)'\s*:/g)) titled.add(m[1])
  }

  const sidebarSrc = fs.readFileSync(SIDEBAR, 'utf8')
  const menuPaths = [...sidebarSrc.matchAll(/\{\s*path:\s*'(\/[^']*)'/g)].map(m => m[1])
  // 前缀命中也算（/settings 能覆盖 /settings/master-data）
  const noTitle = menuPaths.filter(p => ![...titled].some(t => p === t || p.startsWith(t + '/')))

  if (noTitle.length > 0) {
    log(YELLOW(`\n⚠️  有 ${noTitle.length} 个菜单没配页面标题（顶栏会显示成「仪表板」）：`))
    for (const p of noTitle) log(`   ${YELLOW(p)}`)
    log(DIM('   补到 admin/src/components/Header.tsx 的 routeTitleMap 里。'))
  } else {
    log(GREEN('✅ Sidebar 的每个菜单都配了页面标题'))
  }
}

// ---------------------------------------------------------------------------
// 5. 仅供参考：定义了但没人用的码
// ---------------------------------------------------------------------------
if (unusedCodes.length > 0) {
  log(DIM(`\nℹ️  字典里定义但代码暂未使用的权限码（${unusedCodes.length} 个，仅参考——`))
  log(DIM('   有的是给后续阶段预留的，比如 P6 的服务商询价）：'))
  log(DIM(`   ${unusedCodes.join(', ')}`))
}

log(exitCode === 0 ? GREEN('\n===== 校验通过 =====\n') : RED('\n===== 校验未通过 =====\n'))
process.exit(exitCode)
