#!/usr/bin/env node
/**
 * 编号分配器：踩坑经验库 / 数据库迁移
 *
 * 解决什么问题
 * ------------
 * 本仓库经常同时开多个 Claude Code 对话，各自在自己的 worktree 里干活。
 * 大家都按「看目录最大号 +1」取编号，于是**必然撞号**——
 * 截至 2026-08-07 已经撞了三次（030 / 036 / 041），还有一次靠改名躲过（050→051）。
 *
 * 光看自己工作区不够，光看 origin/main 也不够：
 * **别的对话的活正躺在它自己的 worktree 里，还没推上来**。
 * 所以这个脚本三处都扫：
 *
 *   1. origin/main（已上线的）
 *   2. 当前工作区（自己刚写的）
 *   3. **所有兄弟 worktree**（别的对话正在写、还没推的）← 这条才是关键
 *
 * 用法
 * ----
 *   node scripts/next-numbers.js          # 取号前跑，看下一个可用号
 *   node scripts/next-numbers.js --fetch  # 先 git fetch 再看（推荐）
 *
 * 退出码：0 = 没有撞号；2 = 发现重复编号
 *
 * ⚠️ 它**降低**撞号概率，不能根除：两个对话同一秒跑它仍会拿到同一个号。
 *    取到号后尽快提交推送，别攒着——攒得越久越容易撞。
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.join(__dirname, '..')

const log = (m = '') => process.stdout.write(m + '\n')
const RED = (t) => `\x1b[31m${t}\x1b[0m`
const YELLOW = (t) => `\x1b[33m${t}\x1b[0m`
const GREEN = (t) => `\x1b[32m${t}\x1b[0m`
const DIM = (t) => `\x1b[2m${t}\x1b[0m`

/** 要管的两类编号 */
const KINDS = [
  { name: '踩坑经验库', dir: 'docs/踩坑经验库', digits: 3 },
  { name: '数据库迁移', dir: 'server/database/migrations', digits: 3 },
]

/**
 * 跑 git 命令，失败返回空串而不是抛出
 * @param {string} cmd
 * @param {string} cwd
 */
function git(cmd, cwd = ROOT) {
  try {
    return execSync(`git ${cmd}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

/** 从一批文件名里抽出前缀数字 */
function numsFromNames(names) {
  const out = []
  for (const n of names) {
    const m = path.basename(n).match(/^(\d{3})/)
    if (m) out.push({ num: parseInt(m[1], 10), file: path.basename(n) })
  }
  return out
}

/** 列出所有兄弟 worktree 的路径（不含当前这个） */
function siblingWorktrees() {
  const out = git('worktree list --porcelain')
  const paths = []
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) paths.push(line.slice('worktree '.length).trim())
  }
  const here = fs.realpathSync(ROOT)
  return paths.filter((p) => {
    try {
      return fs.realpathSync(p) !== here
    } catch {
      return false
    }
  })
}

function main() {
  const doFetch = process.argv.includes('--fetch')
  if (doFetch) {
    log(DIM('  git fetch origin …'))
    git('fetch origin')
  }

  const others = siblingWorktrees()
  let hasDup = false

  log('')
  for (const kind of KINDS) {
    log(`${kind.name}  ${DIM(kind.dir)}`)

    // 编号 → 文件名 → 出现在哪些地方
    // **按文件名去重**：同一个文件同时出现在 origin/main、本工作区和各 worktree 里
    // 是正常的（大家都 checkout 了同一份），那不叫撞号。
    // 只有**同一个号对应不同文件名**才是撞号。
    /** @type {Map<number, Map<string, Set<string>>>} */
    const seen = new Map()
    const note = (entries, origin) => {
      for (const e of entries) {
        if (!seen.has(e.num)) seen.set(e.num, new Map())
        const byName = seen.get(e.num)
        if (!byName.has(e.file)) byName.set(e.file, new Set())
        byName.get(e.file).add(origin)
      }
    }

    // 1) origin/main —— 已上线的
    // core.quotePath=false：否则中文文件名会被转义成 \350\267\257 之类，和本地名对不上
    const tracked = git(`-c core.quotePath=false ls-tree -r --name-only origin/main -- "${kind.dir}"`)
      .split('\n').filter(Boolean)
    note(numsFromNames(tracked), 'origin/main')

    // 2) 当前工作区 —— 自己刚写的（含未提交）
    const localDir = path.join(ROOT, kind.dir)
    if (fs.existsSync(localDir)) {
      note(numsFromNames(fs.readdirSync(localDir)), '本工作区')
    }

    // 3) 兄弟 worktree —— 别的对话正在写、还没推的（关键的一步）
    for (const wt of others) {
      const d = path.join(wt, kind.dir)
      if (!fs.existsSync(d)) continue
      // 第一个（不在 .claude/worktrees/ 下的）是主工作区，单独标注免得看混
      const label = wt.includes('/.claude/worktrees/')
        ? `worktree:${path.basename(wt)}`
        : '主工作区'
      note(numsFromNames(fs.readdirSync(d)), label)
    }

    if (seen.size === 0) {
      log(DIM('  （一个都没有）'))
      log('')
      continue
    }

    // 撞号 = 同一个号对应**不同的文件名**
    const dups = [...seen.entries()]
      .filter(([, byName]) => byName.size > 1)
      .sort((a, b) => a[0] - b[0])
    for (const [num, byName] of dups) {
      hasDup = true
      log(RED(`  ✘ ${String(num).padStart(kind.digits, '0')} 撞号，${byName.size} 个不同文件：`))
      for (const [file, origins] of byName) {
        log(`      ${file}  ${DIM('[' + [...origins].join(', ') + ']')}`)
      }
    }

    const max = Math.max(...seen.keys())
    const next = max + 1
    log(`  当前最大 ${String(max).padStart(kind.digits, '0')}` +
        `，${GREEN('下一个可用：' + String(next).padStart(kind.digits, '0'))}`)
    log('')
  }

  if (!doFetch) {
    log(YELLOW('  提示：没加 --fetch，origin/main 可能是旧的。建议 node scripts/next-numbers.js --fetch'))
  }
  if (others.length) {
    log(DIM(`  已扫描 ${others.length} 个兄弟工作区：${others.map((p) => path.basename(p)).join(', ')}`))
  }
  if (hasDup) {
    log(YELLOW('  注意：兄弟 worktree 若停在较早的提交上，可能仍留着已被改名的旧文件，'))
    log(YELLOW('        从而报出"假撞号"。判断时先看它是不是只出现在某一个 worktree 里。'))
  }
  log(DIM('  取到号后尽快提交推送——攒得越久越容易被别的对话撞上。'))
  log('')

  process.exit(hasDup ? 2 : 0)
}

main()
