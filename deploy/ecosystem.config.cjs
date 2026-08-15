// PM2 配置文件
// 德国Box运输管理系统 - 后端服务

module.exports = {
  apps: [
    {
      name: 'germany-box-server',
      script: './server/app.js',
      cwd: '/var/www/germany-box-system',
      instances: 'max',  // 根据 CPU 核心数自动设置
      exec_mode: 'cluster',  // 集群模式
      
      // 环境变量
      env: {
        NODE_ENV: 'development',
        PORT: 3002
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002
      },

      // 日志配置
      // ⚠️ time: true 必须有，否则 log_date_format 是空转的 —— pm2 只有在
      //    time 打开（等价于命令行 --time）时才给每行日志加时间戳前缀。
      //    没有时间戳的后果见踩坑 064：日志四个月不轮转又无时间，
      //    grep 到的旧报错看起来像"现在还在发生"，白查一轮。
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/pm2/germany-box-error.log',
      out_file: '/var/log/pm2/germany-box-out.log',
      merge_logs: true,
      
      // 自动重启配置
      watch: false,  // 生产环境不要开启 watch
      max_memory_restart: '1G',  // 内存超过 1G 自动重启
      
      // 重启策略
      exp_backoff_restart_delay: 100,  // 指数退避重启延迟
      max_restarts: 10,  // 最大重启次数
      min_uptime: '10s',  // 最小运行时间
      
      // 优雅关闭
      kill_timeout: 5000,
      // ⚠️ wait_ready 必须是 false：server/app.js 没有调用 process.send('ready')。
      //    开着的话 pm2 会一直等这个信号，直到 listen_timeout 超时才认为启动完成，
      //    每个实例白等 10 秒。这份配置在 2026-04-12 之后一直没被真正加载过
      //    （CI 走的是 reload 分支），所以这个坑一直没暴露；本次让配置生效前先关掉，
      //    保证「启用 ecosystem」只改变日志行为、不改变启动语义。
      //    以后要开它，得先在 app.js 里补 process.send('ready')。
      wait_ready: false,
      listen_timeout: 10000,

      // 健康检查（可选）
      // health_check: {
      //   endpoint: '/api/health',
      //   interval: 30000
      // }
    }
  ],

  // 部署配置（用于远程部署）
  deploy: {
    production: {
      user: 'root',
      host: ['47.83.241.117'],
      ref: 'origin/main',
      repo: 'git@github.com:FrankZheng1985/DE-Box-system.git',
      path: '/var/www/germany-box-system',
      'pre-deploy-local': '',
      'post-deploy': 'npm run install:all && npm run build:admin && npm run build:customer && cd server && node scripts/init-db.js && cd .. && pm2 reload ecosystem.config.cjs --env production',
      'pre-setup': ''
    }
  }
};
