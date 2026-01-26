/**
 * 全局错误处理中间件
 */

export function errorHandler(err, req, res, next) {
  console.error('❌ 服务器错误:', err)

  // 默认错误响应
  const statusCode = err.statusCode || 500
  const message = err.message || '服务器内部错误'

  res.status(statusCode).json({
    errCode: statusCode,
    msg: message,
    data: null,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}

export default { errorHandler }
