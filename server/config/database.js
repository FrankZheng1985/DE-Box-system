/**
 * 数据库配置模块
 * 使用 PostgreSQL 作为唯一数据库
 */

import pg from 'pg'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') })

// 数据库连接配置
const isProduction = process.env.NODE_ENV === 'production'
const DATABASE_URL = process.env.DATABASE_URL || 
  (isProduction ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL_TEST)

if (!DATABASE_URL) {
  console.error('❌ 错误: 未配置数据库连接字符串')
  console.error('   请在 .env 文件中设置 DATABASE_URL')
  process.exit(1)
}

let pgPool = null

/**
 * 将 ? 占位符转换为 PostgreSQL 风格的 $1, $2...
 */
function convertPlaceholders(sql) {
  let index = 0
  return sql.replace(/\?/g, () => `$${++index}`)
}

/**
 * PostgreSQL Statement 包装类
 */
class PgStatement {
  constructor(pool, sql) {
    this.pool = pool
    this.originalSql = sql
    this.pgSql = convertPlaceholders(sql)
  }
  
  run(...params) {
    return this.pool.query(this.pgSql, params)
      .then(result => ({
        changes: result.rowCount,
        lastInsertRowid: result.rows[0]?.id || null
      }))
      .catch(err => {
        if (err.message.includes('already exists') || 
            err.message.includes('duplicate column')) {
          return { changes: 0 }
        }
        console.error('❌ PG run error:', err.message)
        console.error('   SQL:', this.pgSql)
        throw err
      })
  }
  
  get(...params) {
    return this.pool.query(this.pgSql, params)
      .then(result => result.rows[0])
      .catch(err => {
        console.error('❌ PG get error:', err.message)
        throw err
      })
  }
  
  all(...params) {
    return this.pool.query(this.pgSql, params)
      .then(result => result.rows)
      .catch(err => {
        console.error('❌ PG all error:', err.message)
        throw err
      })
  }
}

/**
 * PostgreSQL 数据库适配器
 */
class PostgresDatabase {
  constructor(pool) {
    this.pool = pool
    this.isPostgres = true
  }
  
  prepare(sql) {
    return new PgStatement(this.pool, sql)
  }
  
  exec(sql) {
    return this.pool.query(sql)
      .then(result => ({ changes: result.rowCount || 0 }))
      .catch(err => {
        if (err.message.includes('already exists') || 
            err.message.includes('duplicate column') ||
            err.code === '42701') {
          return { changes: 0 }
        }
        console.error('❌ PostgreSQL exec 错误:', err.message)
        return { changes: 0 }
      })
  }
  
  pragma() {
    return null
  }
  
  transaction(fn) {
    return async (...args) => {
      const client = await this.pool.connect()
      try {
        await client.query('BEGIN')
        const txDb = new PostgresTransactionDb(client)
        const result = await fn.call(txDb, ...args)
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }
  }
  
  close() {
    return this.pool.end()
  }
}

/**
 * PostgreSQL 事务数据库适配器
 */
class PostgresTransactionDb {
  constructor(client) {
    this.client = client
    this.isPostgres = true
  }
  
  prepare(sql) {
    const pgSql = convertPlaceholders(sql)
    return {
      run: async (...params) => {
        const result = await this.client.query(pgSql, params)
        return { changes: result.rowCount }
      },
      get: async (...params) => {
        const result = await this.client.query(pgSql, params)
        return result.rows[0]
      },
      all: async (...params) => {
        const result = await this.client.query(pgSql, params)
        return result.rows
      }
    }
  }
}

/**
 * 获取数据库实例（单例模式）
 */
export function getDatabase() {
  if (!pgPool) {
    const isLocalhost = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
    
    let sslConfig = false
    if (!isLocalhost) {
      sslConfig = { rejectUnauthorized: false }
    }
    
    pgPool = new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: sslConfig,
      max: 20,
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
    
    pgPool.on('error', (err) => {
      console.error('❌ PostgreSQL 连接池错误:', err.message)
    })
    
    const dbType = isProduction ? '生产' : '开发'
    console.log(`🌐 PostgreSQL 数据库连接已建立 (${dbType}环境)`)
  }
  return new PostgresDatabase(pgPool)
}

/**
 * 检查是否使用 PostgreSQL
 */
export function isUsingPostgres() {
  return true
}

/**
 * 关闭数据库连接
 */
export function closeDatabase() {
  if (pgPool) {
    pgPool.end()
    pgPool = null
    console.log('🌐 PostgreSQL 连接池已关闭')
  }
}

/**
 * 执行事务
 */
export function transaction(callback) {
  const database = getDatabase()
  return database.transaction(callback)()
}

/**
 * 生成UUID
 */
export function generateId(prefix = '') {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
  return prefix ? `${prefix}-${uuid}` : uuid
}

/**
 * 测试数据库连接
 */
export async function testConnection() {
  getDatabase()
  try {
    const client = await pgPool.connect()
    const result = await client.query('SELECT current_database() as db')
    console.log('✅ PostgreSQL 连接测试成功:', result.rows[0].db)
    client.release()
    return true
  } catch (error) {
    console.error('❌ PostgreSQL 连接测试失败:', error.message)
    return false
  }
}

/**
 * 直接执行 SQL 查询
 */
export async function query(sql, params = []) {
  getDatabase()
  try {
    const result = await pgPool.query(sql, params)
    return result
  } catch (error) {
    console.error('❌ SQL 查询错误:', error.message)
    console.error('   SQL:', sql)
    throw error
  }
}

export default {
  getDatabase,
  closeDatabase,
  transaction,
  generateId,
  testConnection,
  isUsingPostgres,
  query
}
