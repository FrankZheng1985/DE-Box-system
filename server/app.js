/**
 * 德国Box运输管理系统 - 后端服务入口
 * 
 * ERP标准架构：
 * - API 版本化 (/api/v1/...)
 * - 安全中间件链
 * - 统一错误处理
 * - 请求日志记录
 */

import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { Server } from 'socket.io'

// 加载环境变量
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env') })

// 导入配置
import { testConnection, serverConfig, corsConfig } from './config/index.js'

// 导入路由模块
import authRoutes from './modules/auth/routes.js'
import userRoutes from './modules/users/routes.js'
import systemRoutes from './modules/system/routes.js'
import orderRoutes from './modules/order/routes.js'
import tmsRoutes from './modules/tms/routes.js'
import crmRoutes from './modules/crm/routes.js'
import supplierRoutes from './modules/supplier/routes.js'
import financeRoutes from './modules/finance/routes.js'
import productRoutes from './modules/product/routes.js'
import customerRoutes from './modules/customer/routes.js'

// 导入中间件
import { errorHandler } from './middleware/errorHandler.js'
import { requestLogger, securityHeaders, rateLimiter } from './middleware/security.js'

const app = express()
const httpServer = createServer(app)

// Socket.IO 配置
const io = new Server(httpServer, {
  cors: corsConfig,
})

// ==================== 安全中间件 ====================
// 安全响应头
app.use(securityHeaders)

// 请求日志（开发环境）
if (serverConfig.env === 'development') {
  app.use(requestLogger)
}

// 基础中间件配置
app.use(cors(corsConfig))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// API 限流（针对认证接口）
app.use('/api/auth/login', rateLimiter(10, 60000)) // 每分钟最多10次登录尝试
app.use('/api/v1/auth/login', rateLimiter(10, 60000))

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// ==================== API 版本化路由 ====================

// API v1 路由（推荐使用）
app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/users', userRoutes)
app.use('/api/v1/system', systemRoutes)
app.use('/api/v1/orders', orderRoutes)
app.use('/api/v1/tms', tmsRoutes)
app.use('/api/v1/crm', crmRoutes)
app.use('/api/v1/suppliers', supplierRoutes)
app.use('/api/v1/finance', financeRoutes)
app.use('/api/v1/products', productRoutes)
app.use('/api/v1/customer', customerRoutes)

// 向后兼容：保留原有 /api/* 路由（无版本号）
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/system', systemRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/tms', tmsRoutes)
app.use('/api/crm', crmRoutes)
app.use('/api/suppliers', supplierRoutes)
app.use('/api/finance', financeRoutes)
app.use('/api/products', productRoutes)
app.use('/api/customer', customerRoutes)

// ==================== 系统端点 ====================

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    env: serverConfig.env
  })
})

// API 版本信息
app.get('/api/version', (req, res) => {
  res.json({
    errCode: 200,
    msg: '获取成功',
    data: {
      apiVersion: 'v1',
      appVersion: '1.0.0',
      supportedVersions: ['v1'],
      deprecatedVersions: [],
    }
  })
})

// 错误处理中间件
app.use(errorHandler)

// Socket.IO 连接处理
io.on('connection', (socket) => {
  console.log('客户端连接:', socket.id)
  
  socket.on('disconnect', () => {
    console.log('客户端断开:', socket.id)
  })
})

// 将 io 实例挂载到 app 上，供其他模块使用
app.set('io', io)

// 启动服务器
const PORT = serverConfig.port

async function startServer() {
  try {
    // 测试数据库连接
    await testConnection()
    
    httpServer.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║           德国Box运输管理系统 - 后端服务                    ║
╠════════════════════════════════════════════════════════════╣
║  🚀 服务已启动                                              ║
║  📡 端口: ${PORT}                                            ║
║  🌍 环境: ${serverConfig.env}                                    ║
║  📅 时间: ${new Date().toLocaleString()}           ║
╚════════════════════════════════════════════════════════════╝
      `)
    })
  } catch (error) {
    console.error('❌ 服务器启动失败:', error)
    process.exit(1)
  }
}

startServer()

export default app
