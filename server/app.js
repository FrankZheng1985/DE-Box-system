/**
 * EU-TMS 欧洲运输管理系统 - 后端服务入口
 * 架构标准：SAP S/4HANA ERP 设计原则
 * 版本：V2.0
 */

import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { Server } from 'socket.io'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env') })

// ERP 内核数据库连接
import { testConnection } from './core/db.js'

// 业务模块路由
import authRoutes from './modules/auth/routes.js'
import orderRoutes from './modules/order/routes.js'
import clientRoutes from './modules/client/routes.js'
import carrierRoutes from './modules/carrier/routes.js'
import dashboardRoutes from './modules/dashboard/routes.js'
import inquiryRoutes from './modules/inquiry/routes.js'
import quotationRoutes from './modules/quotation/routes.js'
import cmrRoutes from './modules/cmr/routes.js'
import gpsRoutes from './modules/gps/routes.js'
import shippingReleaseRoutes from './modules/shipping-release/routes.js'
import customsRoutes from './modules/customs/routes.js'
import financeRoutes from './modules/finance/routes.js'
import invoiceTemplateRoutes from './modules/invoice-template/routes.js'
import contactRoutes from './modules/contact/routes.js'
import notificationRoutes from './modules/notification/routes.js'
import systemRoutes from './modules/system/routes.js'

// 中间件
import { errorHandler } from './middleware/errorHandler.js'
import { requestLogger, securityHeaders, rateLimiter } from './middleware/security.js'

const app = express()
const httpServer = createServer(app)

// Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
})

// ==================== 中间件 ====================
app.use(securityHeaders)
if (process.env.NODE_ENV !== 'production') {
  app.use(requestLogger)
}
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use('/api/v1/auth/login', rateLimiter(10, 60000))

// 静态文件
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// ==================== API V1 路由 ====================
app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/orders', orderRoutes)
app.use('/api/v1/clients', clientRoutes)
app.use('/api/v1/carriers', carrierRoutes)
app.use('/api/v1/dashboard', dashboardRoutes)
app.use('/api/v1/inquiries', inquiryRoutes)
app.use('/api/v1/quotations', quotationRoutes)
app.use('/api/v1/cmr', cmrRoutes)
app.use('/api/v1/gps', gpsRoutes)
app.use('/api/v1/shipping-releases', shippingReleaseRoutes)
app.use('/api/v1/customs', customsRoutes)
app.use('/api/v1/finance', financeRoutes)
app.use('/api/v1/invoice-templates', invoiceTemplateRoutes)
app.use('/api/v1/contact', contactRoutes)
app.use('/api/v1/notifications', notificationRoutes)
app.use('/api/v1/system', systemRoutes)

// ==================== 系统端点 ====================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    architecture: 'SAP ERP Standard',
    env: process.env.NODE_ENV || 'development'
  })
})

app.get('/api/version', (req, res) => {
  res.json({
    code: 200,
    message: 'success',
    data: {
      apiVersion: 'v1',
      appVersion: '2.0.0',
      appName: 'EU-TMS 欧洲运输管理系统',
      architecture: 'SAP ERP Standard',
      modules: {
        loaded: ['auth', 'orders', 'clients', 'carriers', 'dashboard',
                 'inquiries', 'quotations', 'cmr', 'gps', 'shipping-releases',
                 'customs', 'finance', 'notifications', 'system'],
        planned: ['invoice-templates']
      }
    }
  })
})

// 错误处理
app.use(errorHandler)

// Socket.IO
io.on('connection', (socket) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('客户端连接:', socket.id)
  }
  socket.on('disconnect', () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('客户端断开:', socket.id)
    }
  })
})
app.set('io', io)

// ==================== 启动服务器 ====================
const PORT = process.env.PORT || 3002

async function startServer() {
  try {
    await testConnection()

    httpServer.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║         EU-TMS 欧洲运输管理系统 V2.0                         ║
║         架构标准: SAP S/4HANA ERP                            ║
╠══════════════════════════════════════════════════════════════╣
║  🚀 服务已启动  端口: ${PORT}                                   ║
║  🌍 环境: ${(process.env.NODE_ENV || 'development').padEnd(48)}║
║  📅 时间: ${new Date().toLocaleString().padEnd(48)}║
╠══════════════════════════════════════════════════════════════╣
║  ERP 内核引擎:                                               ║
║    ✓ 凭证引擎  ✓ 单据流  ✓ 编号范围  ✓ 变更追踪              ║
║    ✓ 科目确定  ✓ 信用管理  ✓ 定价引擎  ✓ 过账期间            ║
║    ✓ 工作流引擎  ✓ 通知引擎                                   ║
╠══════════════════════════════════════════════════════════════╣
║  业务模块: 15 个模块全部加载                                  ║
╚══════════════════════════════════════════════════════════════╝
      `)
    })
  } catch (error) {
    console.error('服务器启动失败:', error)
    process.exit(1)
  }
}

startServer()

export default app
