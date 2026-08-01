import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard,
  Package,
  PlusCircle,
  MessageSquare,
  Tag,
  MapPin,
  ShieldCheck,
  FileText,
  Receipt,
  Settings,
  LogOut,
  User,
  Menu,
  Truck,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { path: '/', icon: LayoutDashboard, label: '概览' },
  { path: '/orders', icon: Package, label: '我的订单' },
  { path: '/orders/create', icon: PlusCircle, label: '新建订单' },
  { path: '/inquiry', icon: MessageSquare, label: '询价' },
  { path: '/quotations', icon: Tag, label: '我的报价' },
  { path: '/tracking', icon: MapPin, label: '运输追踪' },
  { path: '/customs', icon: ShieldCheck, label: '清关操作' },
  { path: '/cmr', icon: FileText, label: 'CMR文件' },
  { path: '/billing', icon: Receipt, label: '我的账单' },
  { path: '/settings', icon: Settings, label: '账户设置' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // 获取当前页面标题
  const currentPage = navItems.find(item =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  )

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[200px] bg-white border-r border-gray-200 flex flex-col
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center gap-2 px-4 border-b border-gray-100">
          <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
            <Truck className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-slate-900">EU-TMS</span>
          <span className="text-[10px] text-slate-400 ml-auto">客户端</span>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-slate-600 hover:bg-gray-50 hover:text-slate-900'
                }`
              }
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* 底部用户信息 */}
        <div className="border-t border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-700 truncate">
                {user?.name || user?.username}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {user?.company || '客户'}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200"
          >
            <LogOut className="w-3.5 h-3.5" />
            退出登录
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部栏 */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 lg:px-6 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 mr-3"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-semibold text-slate-900">
            {currentPage?.label || '客户门户'}
          </h1>
        </header>

        {/* 页面内容 */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
