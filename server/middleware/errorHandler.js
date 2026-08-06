/**
 * 全局错误处理中间件
 */

// 第 4 个参数 _next 不能删：Express 靠函数入参个数（arity === 4）
// 识别「错误处理中间件」，删了它就退化成普通中间件，错误再也进不来
export function errorHandler(err, req, res, _next) {
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
