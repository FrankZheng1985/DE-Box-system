import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BarChart3,
  Package,
  Tag,
  FileText,
  Anchor,
  Shield,
  MapPin,
  DollarSign,
  Receipt,
  Users,
  Building,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  UserCog,
  ShieldCheck,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../contexts/AuthContext'
import { MENU_PERMISSIONS } from '../constants/permissions'
import BrandMark from './BrandMark'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

interface MenuItem {
  path: string
  /** 语言包 key，真正的文案渲染时才翻译（P9） */
  labelKey: string
  icon: React.ComponentType<{ className?: string }>
}

// EU-TMS V2 菜单项
const menuItems: MenuItem[] = [
  { path: '/dashboard', labelKey: 'nav.dashboard', icon: BarChart3 },
  { path: '/orders', labelKey: 'nav.orders', icon: Package },
  { path: '/inquiries', labelKey: 'nav.inquiries', icon: Tag },
  { path: '/cmr', labelKey: 'nav.cmr', icon: FileText },
  { path: '/shipping-release', labelKey: 'nav.shippingRelease', icon: Anchor },
  { path: '/customs', labelKey: 'nav.customs', icon: Shield },
  { path: '/gps', labelKey: 'nav.gps', icon: MapPin },
  { path: '/finance', labelKey: 'nav.finance', icon: DollarSign },
  { path: '/invoice-templates', labelKey: 'nav.invoiceTemplates', icon: Receipt },
  { path: '/clients', labelKey: 'nav.clients', icon: Users },
  { path: '/carriers', labelKey: 'nav.carriers', icon: Building },
  { path: '/notifications', labelKey: 'nav.notifications', icon: Bell },
  { path: '/settings', labelKey: 'nav.settings', icon: Settings },
  { path: '/system/users', labelKey: 'nav.users', icon: UserCog },
  { path: '/system/roles', labelKey: 'nav.roles', icon: ShieldCheck },
]

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { hasAnyPermission } = useAuth()

  // 只显示当前角色有权限的菜单（P5）
  // MENU_PERMISSIONS 里没配的路径视为不需要权限，照常显示
  const visibleMenuItems = menuItems.filter(item => {
    const required = MENU_PERMISSIONS[item.path]
    return !required || hasAnyPermission(required)
  })

  // 判断当前路由是否激活（支持子路由匹配）
  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard' || location.pathname === '/'
    }
    // 询价和报价是同一个菜单项下的两个视图，任一路径都要点亮「询价报价」
    if (path === '/inquiries') {
      return location.pathname.startsWith('/inquiries') || location.pathname.startsWith('/quotes')
    }
    return location.pathname.startsWith(path)
  }

  return (
    <aside
      className={clsx(
        'fixed top-0 left-0 h-screen flex flex-col',
        'bg-white/80 backdrop-blur-md border-r border-slate-200/60',
        'transition-all duration-200 ease-in-out z-30',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo 区域 */}
      <div className="h-16 flex items-center px-4 border-b border-slate-200/60">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 bg-[#1C1C1E] rounded-xl flex items-center justify-center flex-shrink-0 shadow-[0_2px_8px_rgb(28,28,30,0.3)]">
            <BrandMark className="w-5 h-5" />
          </div>
          {!collapsed && (
            <div className="whitespace-nowrap">
              <h1 className="text-sm font-bold text-slate-900">KALUNA SPED</h1>
              <p className="text-xs text-slate-400">{t('app.systemName')} {t('app.version')}</p>
            </div>
          )}
        </div>
      </div>

      {/* 菜单列表 */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {visibleMenuItems.map((item) => {
          const active = isActive(item.path)
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              title={collapsed ? t(item.labelKey) : undefined}
              className={clsx(
                'w-full flex items-center gap-3 rounded-xl transition-all duration-200 ease-in-out',
                collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5',
                active
                  ? 'bg-blue-50 text-blue-700 font-medium shadow-[0_2px_8px_rgb(59,130,246,0.08)]'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              )}
            >
              <item.icon
                className={clsx(
                  'w-5 h-5 flex-shrink-0 transition-colors duration-200',
                  active ? 'text-blue-600' : 'text-slate-400'
                )}
              />
              {!collapsed && (
                <span className="text-sm truncate">{t(item.labelKey)}</span>
              )}
              {/* 激活指示条 */}
              {active && !collapsed && (
                <div className="ml-auto w-1 h-5 bg-blue-600 rounded-full" />
              )}
            </button>
          )
        })}
      </nav>

      {/* 底部：折叠按钮 + 版本号 */}
      <div className="border-t border-slate-200/60 p-2">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all duration-200 ease-in-out"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs">{t('nav.collapse')}</span>
            </>
          )}
        </button>
        {!collapsed && (
          <p className="text-xs text-slate-300 text-center mt-1">v2.0.0</p>
        )}
      </div>
    </aside>
  )
}
