/**
 * 客户门户 ESLint 配置
 *
 * 规则来源：全局 CLAUDE.md「前端编码规范 · ESLint 规则」
 * - 允许 console.error 和 console.warn，禁止 console.log
 * - 未使用的变量用 _ 前缀忽略
 */
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs', 'vite.config.ts'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

    // 禁止 console.log，放行 error / warn
    'no-console': ['error', { allow: ['error', 'warn'] }],

    // any 不禁用：项目规范未要求，且存量 120 余处，开了全是噪音
    '@typescript-eslint/no-explicit-any': 'off',

    // 未使用的变量：_ 前缀视为有意忽略
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
  },
}
