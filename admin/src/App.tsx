import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Loader2 } from 'lucide-react'

// 页面组件
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Layout from './components/Layout'

// 订单管理
import OrderManagement from './pages/OrderManagement'

// TMS运输管理
import TMSManagement from './pages/TMSManagement'

// CRM客户管理
import CustomerList from './pages/CustomerList'

// 供应商管理
import SupplierManagement from './pages/SupplierManagement'

// 财务管理
import FinanceManagement from './pages/FinanceManagement'
import InvoiceManagement from './pages/InvoiceManagement'
import PayableManagement from './pages/PayableManagement'
import ReconciliationManagement from './pages/ReconciliationManagement'

// 产品定价
import ProductPricing from './pages/ProductPricing'

// 系统管理
import UserManagement from './pages/UserManagement'
import BasicData from './pages/BasicData'

// 保护路由组件
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        <span className="ml-2 text-gray-600">加载中...</span>
      </div>
    )
  }
  
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        {/* 首页和仪表盘 */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        
        {/* 订单管理 */}
        <Route path="/orders" element={<OrderManagement />} />
        
        {/* TMS运输管理 */}
        <Route path="/tms" element={<TMSManagement />} />
        
        {/* CRM客户管理 */}
        <Route path="/crm" element={<CustomerList />} />
        <Route path="/crm/customers" element={<CustomerList />} />
        
        {/* 供应商管理 */}
        <Route path="/suppliers" element={<SupplierManagement />} />
        
        {/* 财务管理 */}
        <Route path="/finance" element={<FinanceManagement />} />
        <Route path="/finance/invoices" element={<InvoiceManagement />} />
        <Route path="/finance/payables" element={<PayableManagement />} />
        <Route path="/finance/reconciliation" element={<ReconciliationManagement />} />
        
        {/* 产品定价 */}
        <Route path="/products" element={<ProductPricing />} />
        
        {/* 系统管理 */}
        <Route path="/system" element={<UserManagement />} />
        <Route path="/system/users" element={<UserManagement />} />
        <Route path="/system/basic-data" element={<BasicData />} />
      </Routes>
    </Layout>
  )
}

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
          <Route path="/login" element={<Login />} />
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
