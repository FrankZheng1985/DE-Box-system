import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  Truck,
  FileText,
  MapPin,
  Receipt,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import BrandMark from './BrandMark'
import LanguageSwitcher from './LanguageSwitcher'

// labelKey 是语言包里的 key，真正的文案在渲染时才翻译（P9）
const menuItems = [
  { path: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, permission: '' },
  { path: '/tasks', labelKey: 'nav.tasks', icon: Truck, permission: 'carrier_portal:task_view' },
  { path: '/cmr', labelKey: 'nav.cmr', icon: FileText, permission: 'carrier_portal:cmr_upload' },
  { path: '/gps', labelKey: 'nav.gps', icon: MapPin, permission: 'carrier_portal:gps_report' },
  { path: '/billing', labelKey: 'nav.billing', icon: Receipt, permission: 'carrier_portal:billing_view' },
  { path: '/settings', labelKey: 'nav.settings', icon: Settings, permission: 'carrier_portal:company_settings' },
]

export default function Layout() {
  const { t } = useTranslation()
  const { user, logout, hasPermission } = useAuth()

  // 只显示当前账号有权限的菜单（P5）——例如司机看不到"费用结算"
  const visibleMenuItems = menuItems.filter(item => !item.permission || hasPermission(item.permission))
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo 区域 */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#1C1C1E] rounded-xl flex items-center justify-center">
              <BrandMark className="w-5 h-5" />
            </div>
            <span className="text-lg font-semibold text-slate-900">{t('app.portalName')}</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label={t('nav.closeMenu')}
            className="lg:hidden p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 p-4 space-y-1">
          {visibleMenuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                ${isActive
                  ? 'bg-green-50 text-green-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        {/* 语言切换 + 用户信息 */}
        <div className="p-4 border-t border-slate-200">
          <LanguageSwitcher className="mb-3" />
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-green-700">
                {user?.name?.charAt(0) || 'C'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.name || t('nav.defaultUserName')}</p>
              <p className="text-xs text-slate-500 truncate">{user?.company || user?.email || ''}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
              title={t('nav.logout')}
              aria-label={t('nav.logout')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部栏（移动端） */}
        <header className="lg:hidden flex items-center h-16 px-4 bg-white border-b border-slate-200">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label={t('nav.openMenu')}
            className="p-2 text-slate-600 hover:text-slate-900"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="ml-3 text-lg font-semibold text-slate-900">{t('app.portalName')}</span>
        </header>

        {/* 页面内容 */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
