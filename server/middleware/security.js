/**
 * 安全中间件
 * 
 * ERP标准：提供基础的安全防护
 * - 安全响应头
 * - 请求日志
 * - API 限流
 */

/**
 * 安全响应头中间件
 * 防止常见的Web攻击
 */
export function securityHeaders(req, res, next) {
  // 防止点击劫持
  res.setHeader('X-Frame-Options', 'DENY')
  
  // 防止 MIME 类型嗅探
  res.setHeader('X-Content-Type-Options', 'nosniff')
  
  // 启用 XSS 过滤器
  res.setHeader('X-XSS-Protection', '1; mode=block')
  
  // 控制 Referrer 信息
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  // 权限策略
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  
  next()
}

/**
 * 请求日志中间件（开发环境）
 */
export function requestLogger(req, res, next) {
  const start = Date.now()
  
  res.on('finish', () => {
    const duration = Date.now() - start
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')?.substring(0, 50),
    }
    
    // 根据状态码使用不同的日志级别
    if (res.statusCode >= 500) {
      console.error('❌ [ERROR]', JSON.stringify(logData))
    } else if (res.statusCode >= 400) {
      console.warn('⚠️ [WARN]', JSON.stringify(logData))
    } else {
      // requestLogger 整个中间件只在 NODE_ENV !== 'production' 时才被 app.js 挂载，
      // 生产根本不会执行到这里
      // eslint-disable-next-line no-console
      console.log('📝 [INFO]', `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`)
    }
  })
  
  next()
}

/**
 * 简单的内存限流器
 * 
 * @param {number} maxRequests - 时间窗口内的最大请求数
 * @param {number} windowMs - 时间窗口（毫秒）
 */
export function rateLimiter(maxRequests = 100, windowMs = 60000) {
  const requests = new Map()
  
  // 定期清理过期记录
  setInterval(() => {
    const now = Date.now()
    for (const [key, data] of requests.entries()) {
      if (now - data.startTime > windowMs) {
        requests.delete(key)
      }
    }
  }, windowMs)
  
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress || 'unknown'
    const now = Date.now()
    
    let data = requests.get(key)
    
    if (!data || now - data.startTime > windowMs) {
      // 新的时间窗口
      data = { count: 1, startTime: now }
      requests.set(key, data)
    } else {
      data.count++
    }
    
    // 设置限流响应头
    res.setHeader('X-RateLimit-Limit', maxRequests)
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - data.count))
    res.setHeader('X-RateLimit-Reset', Math.ceil((data.startTime + windowMs) / 1000))
    
    if (data.count > maxRequests) {
      return res.status(429).json({
        errCode: 429,
        msg: '请求过于频繁，请稍后再试',
        data: {
          retryAfter: Math.ceil((data.startTime + windowMs - now) / 1000),
        },
      })
    }
    
    next()
  }
}

/**
 * 敏感数据过滤器
 * 在日志中隐藏敏感信息
 */
export function sanitizeData(data, sensitiveFields = ['password', 'token', 'secret', 'authorization']) {
  if (!data || typeof data !== 'object') return data
  
  const sanitized = Array.isArray(data) ? [...data] : { ...data }
  
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase()
    
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      sanitized[key] = '***HIDDEN***'
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeData(sanitized[key], sensitiveFields)
    }
  }
  
  return sanitized
}

/**
 * IP 白名单中间件
 * 
 * @param {string[]} whitelist - 允许的 IP 列表
 */
export function ipWhitelist(whitelist = []) {
  return (req, res, next) => {
    if (whitelist.length === 0) {
      return next()
    }
    
    const clientIp = req.ip || req.connection.remoteAddress || ''
    
    // 检查是否在白名单中
    const isAllowed = whitelist.some(ip => {
      if (ip.includes('*')) {
        // 支持通配符，如 192.168.*.*
        const pattern = ip.replace(/\./g, '\\.').replace(/\*/g, '\\d+')
        return new RegExp(`^${pattern}$`).test(clientIp)
      }
      return ip === clientIp
    })
    
    if (!isAllowed) {
      return res.status(403).json({
        errCode: 403,
        msg: '访问被拒绝',
        data: null,
      })
    }
    
    next()
  }
}

export default {
  securityHeaders,
  requestLogger,
  rateLimiter,
  sanitizeData,
  ipWhitelist,
}
