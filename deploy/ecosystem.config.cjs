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
      wait_ready: true,
      listen_timeout: 10000,

      // 健康检查（可选）
      // health_check: {
      //   endpoint: '/api/health',
      //   interval: 30000
      // }
    }
  ],

  // 部署配置（可选，用于远程部署）
  deploy: {
    production: {
      user: 'root',
      host: ['你的ECS公网IP'],
      ref: 'origin/main',
      repo: 'git@github.com:你的用户名/germany-box-system.git',
      path: '/var/www/germany-box-system',
      'pre-deploy-local': '',
      'post-deploy': 'npm run install:all && npm run build:admin && pm2 reload ecosystem.config.cjs --env production',
      'pre-setup': ''
    }
  }
};
