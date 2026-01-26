/**
 * 配置入口文件
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') })

// 导出所有配置
export * from './database.js'

// 服务器配置
export const serverConfig = {
  port: process.env.PORT || 3002,
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'germany-box-transport-secret-key-2024',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
}

// CORS 配置
export const corsConfig = {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}

export default {
  serverConfig,
  corsConfig,
}
