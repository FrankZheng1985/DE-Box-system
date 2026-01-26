/**
 * 数据库初始化脚本
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { query, testConnection } from '../config/database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function initDatabase() {
  console.log('🚀 开始初始化数据库...')
  
  try {
    // 测试连接
    const connected = await testConnection()
    if (!connected) {
      console.error('❌ 数据库连接失败，请检查配置')
      process.exit(1)
    }
    
    // 读取并执行迁移文件
    const migrationsDir = path.join(__dirname, '../database/migrations')
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()
    
    for (const file of files) {
      console.log(`📄 执行迁移: ${file}`)
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      
      // 分割SQL语句并执行
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'))
      
      for (const statement of statements) {
        try {
          await query(statement)
        } catch (error) {
          // 忽略"已存在"类型的错误
          if (!error.message.includes('already exists') && 
              !error.message.includes('duplicate key')) {
            console.warn(`  ⚠️ ${error.message}`)
          }
        }
      }
      
      console.log(`  ✅ ${file} 完成`)
    }
    
    console.log('✅ 数据库初始化完成!')
    console.log('')
    console.log('默认管理员账号:')
    console.log('  用户名: admin')
    console.log('  密码: admin123')
    console.log('')
    
    process.exit(0)
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error)
    process.exit(1)
  }
}

initDatabase()
