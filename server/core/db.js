/**
 * 数据库连接池 - ERP 内核专用
 *
 * 所有 ERP 模块统一使用此连接池，不再使用旧的 config/database.js 适配器。
 * 提供事务包装器，确保所有业务操作在事务中执行。
 */

import pg from 'pg'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '../.env') })

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('错误: 未配置 DATABASE_URL')
  process.exit(1)
}

const isLocalhost = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: isLocalhost ? false : { rejectUnauthorized: false },
  max: 20,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
})

pool.on('error', (err) => {
  console.error('数据库连接池错误:', err.message)
})

/**
 * 获取连接池（用于简单查询）
 */
export function getPool() {
  return pool
}

/**
 * 简单查询（不需要事务时用）
 */
export async function query(sql, params = []) {
  return pool.query(sql, params)
}

/**
 * 事务包装器
 * 所有涉及 ERP 内核引擎的操作必须在事务中执行。
 *
 * 用法：
 *   const result = await withTransaction(async (client) => {
 *     await documentEngine.createDocument(client, {...})
 *     await orderModel.create(client, {...})
 *     return order
 *   })
 */
export async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * 测试数据库连接
 */
export async function testConnection() {
  try {
    const client = await pool.connect()
    const result = await client.query('SELECT current_database() as db, NOW() as time')
    // eslint-disable-next-line no-console -- 连接自检，启动时只输出一次
    console.log(`✅ 数据库连接成功: ${result.rows[0].db} (${result.rows[0].time})`)
    client.release()
    return true
  } catch (error) {
    console.error('数据库连接失败:', error.message)
    return false
  }
}

/**
 * 关闭连接池
 */
export async function closePool() {
  await pool.end()
}

export default { getPool, query, withTransaction, testConnection, closePool }
