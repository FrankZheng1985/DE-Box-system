/**
 * 生产环境数据初始化脚本（2026-08-06 正式运营前一次性使用）
 *
 * 目的：清空全部测试业务数据，保留系统配置和真实主数据，让系统以干净状态开始运营。
 *
 * 保留：
 *   - 系统配置：权限、角色、科目表、编号范围、定价配置、过账期间、md_* 主数据字典、系统设置
 *   - 真实主数据：clients（安百/翼能）、carriers（SGF/Eurosped）、全部 users（测试账号保持停用）
 *   - 用户相关：user_org_assignments、notification_preferences
 *
 * 清除：
 *   - 全部测试业务数据：订单、凭证、财务记录、日记账、变更追踪、通知、咨询、日志
 *   - 2026-04 迁移遗留的 backup_before_import schema（10 张旧备份表，DROP 不带 CASCADE）
 *   - 业务编号范围计数器归零（客户 CLT / 承运商 CAR 计数器保留，因为对应主数据保留）
 *
 * 用法：
 *   node scripts/init-production-data.js          # 检查模式：只统计，不改任何数据
 *   node scripts/init-production-data.js --fix    # 执行清理（单事务，任何一步出错整体回滚）
 *
 * 前置条件（--fix 前必须完成）：
 *   bash scripts/backup-db.sh                     # 全量逻辑备份
 *
 * 说明：本脚本经 Frank 2026-08-06 逐项确认后编写。表内全量 DELETE 是本次初始化的
 *       明确意图（清理范围以下方白名单为准），不属于误操作场景。
 */
import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
})

// CLI 脚本的进度输出统一走 stdout（规范只允许 console.error / console.warn）
const log = msg => process.stdout.write(msg + '\n')

// 按外键依赖顺序排列：子表在前，orders 引用 documents 所以 orders 在 documents 之前
const TABLES_TO_CLEAR = [
  'order_status_logs',
  'order_files',
  'gps_tracking',
  'cmr_documents',
  'customs_clearances',
  'shipping_releases',
  'quotations',
  'inquiries',
  'journal_entries',
  'financial_records',
  'document_flow',
  'credit_check_logs',
  'change_document_items',
  'change_documents',
  'notifications',
  'api_request_logs',
  'contact_inquiries',
  'orders',
  'documents'
]

// 编号范围归零的对象类型（CLT/CAR 不在列表里：客户和承运商主数据保留，计数器不能回退）
const NUMBER_RANGES_TO_RESET = [
  'ORD', 'INQ', 'QUO', 'CMR', 'CUS', 'CINQ',
  'FI_AP', 'FI_AR', 'FI_PAY', 'FI_REC', 'FI_REV',
  'REL', 'SRV'
]

// 保留数据的核对基线（--fix 后逐项核对，数量不符会明确提示）
const KEEP_BASELINE = [
  { table: 'clients', expected: 2 },
  { table: 'carriers', expected: 2 },
  { table: 'users', expected: 6 },
  { table: 'roles', expected: 8 },
  { table: 'permissions', expected: 76 },
  { table: 'chart_of_accounts', expected: 28 },
  { table: 'number_ranges', expected: 15 }
]

const isFix = process.argv.includes('--fix')

// 2026-04 迁移遗留的备份表都在独立 schema backup_before_import 里
const BACKUP_SCHEMA = 'backup_before_import'

async function findBackupTables(client) {
  const result = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename`,
    [BACKUP_SCHEMA]
  )
  return result.rows.map(r => r.tablename)
}

async function main() {
  const client = await pool.connect()
  try {
    log(`模式：${isFix ? '执行清理（--fix）' : '检查（只读，不改数据）'}`)
    log('')

    // 1. 统计将清理的数据
    log('== 将清理的业务表 ==')
    let totalRows = 0
    for (const table of TABLES_TO_CLEAR) {
      const r = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`)
      totalRows += r.rows[0].n
      if (r.rows[0].n > 0) log(`  ${table}: ${r.rows[0].n} 行`)
    }
    log(`  合计 ${totalRows} 行`)

    const backupTables = await findBackupTables(client)
    log('')
    log(`== 将删除的旧备份表（${backupTables.length} 张） ==`)
    for (const t of backupTables) log(`  ${t}`)

    const ranges = await client.query(
      `SELECT object_type, current_number FROM number_ranges
       WHERE object_type = ANY($1) AND current_number > 0 ORDER BY object_type`,
      [NUMBER_RANGES_TO_RESET]
    )
    log('')
    log('== 将归零的编号范围 ==')
    for (const r of ranges.rows) log(`  ${r.object_type}: ${r.current_number} → 0`)

    if (!isFix) {
      log('')
      log('检查完成。确认无误后：先 bash scripts/backup-db.sh 备份，再加 --fix 执行。')
      return
    }

    // 2. 执行清理（单事务）
    log('')
    log('== 开始清理（单事务） ==')
    await client.query('BEGIN')

    for (const table of TABLES_TO_CLEAR) {
      const r = await client.query(`DELETE FROM ${table}`)
      if (r.rowCount > 0) log(`  已清空 ${table}（${r.rowCount} 行）`)
    }

    for (const t of backupTables) {
      // 不带 CASCADE：备份表如有依赖会直接报错回滚，绝不静默级联
      await client.query(`DROP TABLE ${BACKUP_SCHEMA}."${t}"`)
      log(`  已删除旧备份表 ${BACKUP_SCHEMA}.${t}`)
    }
    if (backupTables.length > 0) {
      // RESTRICT：schema 里如果还残留任何对象会直接报错回滚，绝不静默级联
      await client.query(`DROP SCHEMA ${BACKUP_SCHEMA} RESTRICT`)
      log(`  已删除空 schema ${BACKUP_SCHEMA}`)
    }

    await client.query(
      `UPDATE number_ranges SET current_number = 0 WHERE object_type = ANY($1)`,
      [NUMBER_RANGES_TO_RESET]
    )
    log(`  编号范围已归零：${NUMBER_RANGES_TO_RESET.join(', ')}`)

    await client.query('COMMIT')
    log('事务已提交。')

    // 3. 核对结果
    log('')
    log('== 核对保留数据 ==')
    let allOk = true
    for (const { table, expected } of KEEP_BASELINE) {
      const r = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`)
      const ok = r.rows[0].n === expected
      if (!ok) allOk = false
      log(`  ${ok ? '✓' : '✗ 数量不符!'} ${table}: ${r.rows[0].n}（期望 ${expected}）`)
    }
    for (const table of TABLES_TO_CLEAR) {
      const r = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`)
      if (r.rows[0].n !== 0) {
        allOk = false
        log(`  ✗ ${table} 未清空，仍有 ${r.rows[0].n} 行`)
      }
    }
    log(allOk ? '全部核对通过 ✓' : '存在核对失败项，请人工检查！')
    process.exitCode = allOk ? 0 : 2
  } catch (err) {
    try { await client.query('ROLLBACK') } catch { /* 事务可能尚未开始 */ }
    console.error('执行失败，事务已回滚：', err.message)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
