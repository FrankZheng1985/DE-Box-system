import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Loader2 } from 'lucide-react'
import Layout from './components/Layout'

// ==================== 页面组件（懒加载） ====================

// 登录
const Login = lazy(() => import('./pages/Login'))

// 仪表盘
const Dashboard = lazy(() => import('./pages/Dashboard'))

// 订单管理
const OrderManagement = lazy(() => import('./pages/OrderManagement'))
const OrderCreate = lazy(() => import('./pages/OrderCreate'))
const OrderDetail = lazy(() => import('./pages/OrderDetail'))
const OrderEdit = lazy(() => import('./pages/OrderEdit'))
const OrderAssign = lazy(() => import('./pages/OrderAssign'))

// 报价管理
const QuotationManagement = lazy(() => import('./pages/QuotationManagement'))
const QuotationCreate = lazy(() => import('./pages/QuotationCreate'))
const QuotationDetail = lazy(() => import('./pages/QuotationDetail'))

// CMR 运单
const CMRManagement = lazy(() => import('./pages/CMRManagement'))

// 船司放单
const ShippingRelease = lazy(() => import('./pages/ShippingRelease'))

// 清关管理
const CustomsManagement = lazy(() => import('./pages/CustomsManagement'))

// GPS 追踪
const GPSTracking = lazy(() => import('./pages/GPSTracking'))

// 财务管理
const FinanceManagement = lazy(() => import('./pages/FinanceManagement'))

// 发票模板
const InvoiceTemplates = lazy(() => import('./pages/InvoiceTemplates'))

// 客户管理
const ClientList = lazy(() => import('./pages/ClientList'))
const ClientDetail = lazy(() => import('./pages/ClientDetail'))
const ClientEdit = lazy(() => import('./pages/ClientEdit'))

// 承运商管理
const CarrierList = lazy(() => import('./pages/CarrierList'))
const CarrierDetail = lazy(() => import('./pages/CarrierDetail'))
const CarrierEdit = lazy(() => import('./pages/CarrierEdit'))

// 通知中心
const Notifications = lazy(() => import('./pages/Notifications'))

// 系统设置
const Settings = lazy(() => import('./pages/Settings'))
const PostingPeriods = lazy(() => import('./pages/PostingPeriods'))
const ChartOfAccounts = lazy(() => import('./pages/ChartOfAccounts'))
const NumberRanges = lazy(() => import('./pages/NumberRanges'))
const UserManagement = lazy(() => import('./pages/UserManagement'))

// ==================== 加载组件 ====================

function PageLoading() {
  return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      <span className="ml-2 text-slate-500 text-sm">加载中...</span>
    </div>
  )
}

// ==================== 全屏加载（初始化） ====================

function FullScreenLoading() {
  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      <span className="ml-2 text-slate-500">系统加载中...</span>
    </div>
  )
}

// ==================== 保护路由 ====================

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <FullScreenLoading />
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

// ==================== 应用路由 ====================

function AppRoutes() {
  return (
    <Layout>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          {/* 首页重定向到仪表盘 */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />

          {/* 订单管理 */}
          <Route path="/orders" element={<OrderManagement />} />
          <Route path="/orders/create" element={<OrderCreate />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/orders/:id/edit" element={<OrderEdit />} />
          <Route path="/orders/:id/assign" element={<OrderAssign />} />

          {/* 报价管理 */}
          <Route path="/quotes" element={<QuotationManagement />} />
          <Route path="/quotes/create" element={<QuotationCreate />} />
          <Route path="/quotes/:id" element={<QuotationDetail />} />

          {/* CMR 运单 */}
          <Route path="/cmr" element={<CMRManagement />} />

          {/* 船司放单 */}
          <Route path="/shipping-release" element={<ShippingRelease />} />

          {/* 清关管理 */}
          <Route path="/customs" element={<CustomsManagement />} />

          {/* GPS 追踪 */}
          <Route path="/gps" element={<GPSTracking />} />

          {/* 财务管理 */}
          <Route path="/finance" element={<FinanceManagement />} />

          {/* 发票模板 */}
          <Route path="/invoice-templates" element={<InvoiceTemplates />} />

          {/* 客户管理 */}
          <Route path="/clients" element={<ClientList />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/clients/:id/edit" element={<ClientEdit />} />

          {/* 承运商管理 */}
          <Route path="/carriers" element={<CarrierList />} />
          <Route path="/carriers/:id" element={<CarrierDetail />} />
          <Route path="/carriers/:id/edit" element={<CarrierEdit />} />

          {/* 通知中心 */}
          <Route path="/notifications" element={<Notifications />} />

          {/* 系统设置 */}
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/posting-periods" element={<PostingPeriods />} />
          <Route path="/settings/chart-of-accounts" element={<ChartOfAccounts />} />
          <Route path="/settings/number-ranges" element={<NumberRanges />} />
          <Route path="/system/users" element={<UserManagement />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}

// ==================== 根组件 ====================

function App() {
  // 全局禁用数字输入框的滚轮滚动改变值的行为
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number') {
        e.preventDefault()
        target.blur()
      }
    }

    document.addEventListener('wheel', handleWheel, { passive: false, capture: true })

    return () => {
      document.removeEventListener('wheel', handleWheel, { capture: true })
    }
  }, [])

  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* 登录页不需要 Layout */}
          <Route
            path="/login"
            element={
              <Suspense fallback={<FullScreenLoading />}>
                <Login />
              </Suspense>
            }
          />

          {/* 所有其他页面需要登录 */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppRoutes />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
