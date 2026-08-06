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

// JWT 密钥没有兜底默认值，缺失时直接拒绝启动。
// 原先这里是 `process.env.JWT_SECRET || '写死的字符串'`：只要环境变量没配上，
// 服务就会静默用那个仓库里人人可见的值签发和校验 token——等于谁都能自己签一个
// sys_admin 的 token 绕过登录，而且日志上一切正常，没有任何迹象。
// 认证密钥的失效方向必须是「起不来」，不能是「换个已知的凑合用」。
if (!process.env.JWT_SECRET) {
  console.error('致命错误: 未配置 JWT_SECRET，拒绝启动')
  console.error('请在 server/.env 中设置 JWT_SECRET（建议 openssl rand -hex 32 生成）')
  process.exit(1)
}

// 服务器配置
export const serverConfig = {
  port: process.env.PORT || 3002,
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET,
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
