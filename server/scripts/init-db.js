/**
 * 数据库初始化脚本
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'
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
      
      try {
        // 直接执行整个SQL文件的内容，不再手动分割，
        // 这样可以支持 DO $$ 块、函数和触发器
        await query(sql)
        console.log(`  ✅ ${file} 完成`)
      } catch (error) {
        // 忽略"已存在"类型的警告，但在生产环境建议详细记录
        if (error.message.includes('already exists') || 
            error.message.includes('duplicate key')) {
          console.log(`  ℹ️  ${file} 部分对象已存在，跳过。`)
        } else {
          console.error(`  ❌ 执行 ${file} 失败: ${error.message}`)
          throw error // 抛出错误以停止初始化过程
        }
      }
    }
    
    console.log('✅ 数据库初始化完成!')
    console.log('')

    // 种子 SQL 里 admin 的哈希是公开值，必须用 SEED_ADMIN_PASSWORD 覆盖掉
    const seedPassword = process.env.SEED_ADMIN_PASSWORD
    if (seedPassword) {
      const hash = await bcrypt.hash(seedPassword, 10)
      await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE username = $2', [hash, 'admin'])
      console.warn('默认管理员账号: admin（密码已按 SEED_ADMIN_PASSWORD 设置）')
    } else {
      console.warn('⚠️  未设置 SEED_ADMIN_PASSWORD，admin 仍是种子文件里的公开默认密码。')
      console.warn('⚠️  这个哈希在仓库里人人可见，请立刻登录后台修改，或重跑：')
      console.warn('⚠️    SEED_ADMIN_PASSWORD=\'你的强密码\' npm run server:init')
    }
    console.log('')

    process.exit(0)
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error)
    process.exit(1)
  }
}

initDatabase()
