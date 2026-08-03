import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './i18n'
import './index.css'

// ⚠️ 下面两处崩溃兜底屏刻意保留中文，不走 i18n（P9）：
//    它们要在「i18n 自己也挂了」的情况下仍能显示，
//    如果这里依赖 t()，i18n 初始化失败时用户会看到一片空白而不是错误提示。

// 添加全局错误处理
window.addEventListener('error', (event) => {
  console.error('全局错误:', event.error)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的 Promise 拒绝:', event.reason)
})

// 错误边界组件
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React 错误边界捕获到错误:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: '#dc2626', backgroundColor: '#ffffff', minHeight: '100vh' }}>
          <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>应用渲染错误</h1>
          <p style={{ marginBottom: '8px' }}>
            错误信息: {this.state.error?.message || '未知错误'}
          </p>
          <p style={{ marginBottom: '16px', color: '#6b7280' }}>
            请查看浏览器控制台获取更多信息
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            刷新页面
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

try {
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('找不到 root 元素')
  }

  rootElement.style.backgroundColor = '#f9fafb'
  rootElement.style.color = '#111827'

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )
} catch (error) {
  console.error('应用启动失败:', error)
  const rootElement = document.getElementById('root')
  if (rootElement) {
    rootElement.style.backgroundColor = '#ffffff'
    rootElement.style.color = '#111827'
    rootElement.innerHTML = `
      <div style="padding: 20px; color: #dc2626; background-color: #ffffff; min-height: 100vh;">
        <h1 style="font-size: 24px; margin-bottom: 16px;">应用启动失败</h1>
        <p style="margin-bottom: 8px;">错误信息: ${error instanceof Error ? error.message : String(error)}</p>
        <p style="margin-bottom: 16px; color: #6b7280;">请查看浏览器控制台获取更多信息</p>
        <button onclick="window.location.reload()" style="padding: 8px 16px; background-color: #2563eb; color: #ffffff; border: none; border-radius: 4px; cursor: pointer;">
          刷新页面
        </button>
      </div>
    `
  }
}
