import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  Users,
} from 'lucide-react'
import { useState } from 'react'
import BrandMark from './BrandMark'
import LanguageSwitcher from './LanguageSwitcher'

/**
 * 导航项
 * permission 为空表示所有客户账号都能看；配了权限码则按权限码过滤（P5）
 */
const navItems = [
  { path: '/', icon: LayoutDashboard, labelKey: 'nav.dashboard', permission: '' },
  { path: '/orders', icon: Package, labelKey: 'nav.orders', permission: 'portal:order_view' },
  { path: '/orders/create', icon: PlusCircle, labelKey: 'nav.createOrder', permission: 'portal:order_create' },
  { path: '/inquiry', icon: MessageSquare, labelKey: 'nav.inquiry', permission: 'portal:inquiry_manage' },
  { path: '/quotations', icon: Tag, labelKey: 'nav.quotations', permission: 'portal:quotation_view' },
  { path: '/tracking', icon: MapPin, labelKey: 'nav.tracking', permission: 'portal:order_view' },
  { path: '/customs', icon: ShieldCheck, labelKey: 'nav.customs', permission: 'portal:order_view' },
  { path: '/cmr', icon: FileText, labelKey: 'nav.cmr', permission: 'portal:file_download' },
  { path: '/billing', icon: Receipt, labelKey: 'nav.billing', permission: 'portal:billing_view' },
  { path: '/members', icon: Users, labelKey: 'nav.members', permission: 'portal:user_manage' },
  { path: '/settings', icon: Settings, labelKey: 'nav.settings', permission: '' },
]

export default function Layout() {
  const { t } = useTranslation()
  const { user, logout, hasPermission } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // 只显示当前账号有权限的菜单（P5）
  const visibleNavItems = navItems.filter(item => !item.permission || hasPermission(item.permission))

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
          <div className="w-7 h-7 bg-[#1C1C1E] rounded-lg flex items-center justify-center">
            <BrandMark className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold text-slate-900">KALUNA SPED</span>
          <span className="text-[10px] text-slate-400 ml-auto">{t('app.shortName')}</span>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {visibleNavItems.map((item) => (
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
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        {/* 底部用户信息 */}
        <div className="border-t border-gray-100 p-3">
          <LanguageSwitcher className="mb-2" />
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-700 truncate">
                {user?.name || user?.username}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {user?.company || t('nav.defaultUserName')}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200"
          >
            <LogOut className="w-3.5 h-3.5" />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部栏 */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 lg:px-6 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label={t('nav.openMenu')}
            className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 mr-3"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-semibold text-slate-900">
            {currentPage ? t(currentPage.labelKey) : t('app.portalName')}
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
