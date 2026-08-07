/**
 * 存量修正：状态是「已报价」但客户其实一张报价都没收到的询价单
 *
 * 起因：旧版 POST /quotations 一建报价（固定是 DRAFT）就把询价改成 QUOTED。
 * 于是客户门户询价页显示「已报价」，而报价时效列是横杠——时效只认非草稿报价。
 * 运营看列表也会以为这单已经回过价了，实际草稿还躺在系统里没发出去。
 *
 * 代码侧已改成「发送报价时才置 QUOTED」，这个脚本处理改之前留下的存量数据：
 * 把 status = 'QUOTED' 但名下没有任何非草稿报价的询价单退回 PENDING_QUOTE。
 *
 * 只碰 QUOTED 这一种状态：
 *   - ACCEPTED / REJECTED 是客户已经做过决策的，退回去等于抹掉业务事实
 *   - CANCELLED 已终止，不该复活
 *
 * 用法：
 *   node scripts/fix-inquiry-quoted-without-sent.js          # 只查，不改
 *   node scripts/fix-inquiry-quoted-without-sent.js --fix    # 实际回退状态
 *
 * 退出码：0 = 没有需要修正的数据；2 = 存在脏数据（--fix 修完会重查后再返回）
 */

import { query } from '../core/db.js'

const log = (m = '') => process.stdout.write(m + '\n')
const RED = (t) => `\x1b[31m${t}\x1b[0m`
const GREEN = (t) => `\x1b[32m${t}\x1b[0m`
const DIM = (t) => `\x1b[2m${t}\x1b[0m`

/**
 * 查出「标着已报价、但一张非草稿报价都没有」的询价单
 * @returns {Promise<Array<object>>}
 */
async function loadDirtyInquiries() {
  const result = await query(
    `SELECT i.id, i.inquiry_number, i.created_at,
            c.company_name AS client_name,
            (SELECT COUNT(*) FROM quotations q WHERE q.inquiry_id = i.id)::int AS draft_count
       FROM inquiries i
       LEFT JOIN clients c ON c.id = i.client_id
      WHERE i.status = 'QUOTED'
        AND NOT EXISTS (
              SELECT 1 FROM quotations q
               WHERE q.inquiry_id = i.id AND q.status <> 'DRAFT'
            )
      ORDER BY i.created_at`
  )
  return result.rows
}

async function main() {
  const shouldFix = process.argv.includes('--fix')

  const dirty = await loadDirtyInquiries()
  log('')
  log('「已报价」但客户没收到任何报价的询价单：')
  log('─'.repeat(72))

  if (dirty.length === 0) {
    log(GREEN('✔ 没有需要修正的数据'))
    process.exit(0)
  }

  for (const row of dirty) {
    const date = new Date(row.created_at).toISOString().slice(0, 10)
    log(
      `  ${String(row.inquiry_number).padEnd(20)} ${String(row.client_name || '-').padEnd(20)} ` +
      `建单 ${date}  ${DIM(`草稿报价 ${row.draft_count} 张`)}`
    )
  }
  log('─'.repeat(72))
  log(RED(`✘ 共 ${dirty.length} 张询价单状态与实际不符`))

  if (!shouldFix) {
    log('')
    log(DIM('加 --fix 参数可将它们退回 PENDING_QUOTE（待报价）'))
    process.exit(2)
  }

  log('')
  log('开始修正…')
  // 条件里再带一次 status = 'QUOTED' 和 NOT EXISTS：
  // 从上面查询到这里之间，运营可能刚好把某张报价发出去了
  const updated = await query(
    `UPDATE inquiries i
        SET status = 'PENDING_QUOTE', updated_at = NOW()
      WHERE i.status = 'QUOTED'
        AND NOT EXISTS (
              SELECT 1 FROM quotations q
               WHERE q.inquiry_id = i.id AND q.status <> 'DRAFT'
            )
      RETURNING i.inquiry_number`
  )
  for (const row of updated.rows) {
    log(GREEN(`  ✔ ${row.inquiry_number} → PENDING_QUOTE`))
  }

  log('')
  log('复查：')
  const after = await loadDirtyInquiries()
  log('─'.repeat(72))
  if (after.length === 0) {
    log(GREEN(`✔ 已修正 ${updated.rowCount} 张，当前无脏数据`))
    process.exit(0)
  }
  log(RED(`✘ 仍有 ${after.length} 张未修正`))
  process.exit(2)
}

main().catch((e) => {
  console.error('修正脚本执行失败:', e.message)
  process.exit(1)
})
