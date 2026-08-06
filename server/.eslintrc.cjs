/**
 * 后端 ESLint 配置
 *
 * 规则来源：全局 CLAUDE.md「安全规范 · 日志规范」
 * - 允许 console.error / console.warn，禁止 console.log
 * - 未使用的变量用 _ 前缀忽略
 *
 * 为什么后端比前端更需要这条：
 *   前端打日志只脏浏览器控制台，**后端打日志是往生产服务器写业务数据**。
 *   2026-08-06 就查出 order/service.js 每完成一单往生产日志写
 *   「订单号 + 应收 / 应付金额」，长期没人发现正是因为后端没有 lint。
 *
 * 例外：scripts/ 目录整体豁免 no-console —— 那些是 CLI 工具
 * （体检脚本、迁移脚本、冒烟测试），要把结果打给人看，console.log 是正当输出。
 */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    // server/package.json 是 "type": "module"
    sourceType: 'module',
  },
  ignorePatterns: [
    'node_modules',
    'uploads',
    '.eslintrc.cjs',
    // SQL 迁移不是 JS，不用扫
    'database/migrations',

    // ⚠️ 唯一一个「本该扫但扫不了」的文件，不是懒得管：
    // utils/i18n.js 用了 ES2025 的 import attributes
    //   import zhPack from '../i18n/locales/zh.json' with { type: 'json' }
    // eslint 8 的 espree 9 解析不了（ecmaVersion 最高到 2024，填 2025 直接报
    // Invalid ecmaVersion）。要覆盖它得升 eslint 9 + 换 flat config，
    // 那会连带动三个前端，属于独立任务，不在「给后端补 lint」的范围里。
    //
    // 代价说明白：**这个文件目前不受 lint 保护**。全后端仅此一处用了该语法
    // （2026-08-06 全仓库确认），改动它时要人工留意 console.log 和未使用变量。
    'utils/i18n.js',
  ],
  rules: {
    // 禁止 console.log，放行 error / warn
    'no-console': ['error', { allow: ['error', 'warn'] }],

    // 未使用的变量：_ 前缀视为有意忽略
    // （Express 的错误处理中间件签名必须是 4 个参数，用不上的写成 _next）
    'no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
  },
  overrides: [
    {
      // CLI 脚本：打印结果给人看是正当用途
      files: ['scripts/**/*.js'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
}
