import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MyOrders from './pages/MyOrders'
import OrderDetail from './pages/OrderDetail'
import OrderEdit from './pages/OrderEdit'
import CreateOrder from './pages/CreateOrder'
import InquiryList from './pages/InquiryList'
import InquiryDetail from './pages/InquiryDetail'
import InquiryEdit from './pages/InquiryEdit'
import MyQuotations from './pages/MyQuotations'
import Tracking from './pages/Tracking'
import CustomsOp from './pages/CustomsOp'
import CMRFiles from './pages/CMRFiles'
import Billing from './pages/Billing'
import MemberManagement from './pages/MemberManagement'
import Settings from './pages/Settings'

// 受保护的路由组件
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-primary-200 rounded-xl" />
          <div className="w-24 h-3 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<MyOrders />} />
        {/* 固定路径必须排在参数路径前面，否则 /orders/create 会被 /orders/:id 吃掉 */}
        <Route path="orders/create" element={<CreateOrder />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="orders/:id/edit" element={<OrderEdit />} />
        <Route path="inquiry" element={<InquiryList />} />
        <Route path="inquiry/create" element={<InquiryList />} />
        <Route path="inquiry/:id" element={<InquiryDetail />} />
        <Route path="inquiry/:id/edit" element={<InquiryEdit />} />
        <Route path="quotations" element={<MyQuotations />} />
        <Route path="tracking" element={<Tracking />} />
        <Route path="customs" element={<CustomsOp />} />
        <Route path="cmr" element={<CMRFiles />} />
        <Route path="billing" element={<Billing />} />
        <Route path="members" element={<MemberManagement />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  // basename 必须和 vite.config 的 base 一致，否则 navigate('/login') 会跳到根路径，
  // 刷新后被 nginx 交给管理端 SPA（P9 修复）
  return (
    <BrowserRouter basename="/customer">
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
