import { useLocation, useNavigate } from 'react-router-dom'
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
  Truck,
} from 'lucide-react'
import clsx from 'clsx'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

interface MenuItem {
  path: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

// EU-TMS V2 菜单项
const menuItems: MenuItem[] = [
  { path: '/dashboard', label: '仪表板', icon: BarChart3 },
  { path: '/orders', label: '订单管理', icon: Package },
  { path: '/quotes', label: '询价报价', icon: Tag },
  { path: '/cmr', label: 'CMR 管理', icon: FileText },
  { path: '/shipping-release', label: '船司放单', icon: Anchor },
  { path: '/customs', label: '清关管理', icon: Shield },
  { path: '/gps', label: 'GPS 追踪', icon: MapPin },
  { path: '/finance', label: '财务管理', icon: DollarSign },
  { path: '/invoice-templates', label: '发票模板', icon: Receipt },
  { path: '/clients', label: '客户管理', icon: Users },
  { path: '/carriers', label: '运输公司', icon: Building },
  { path: '/notifications', label: '通知中心', icon: Bell },
  { path: '/settings', label: '系统设置', icon: Settings },
]

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()

  // 判断当前路由是否激活（支持子路由匹配）
  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard' || location.pathname === '/'
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
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center flex-shrink-0 shadow-[0_2px_8px_rgb(37,99,235,0.3)]">
            <Truck className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="whitespace-nowrap">
              <h1 className="text-sm font-bold text-slate-900">EU-TMS</h1>
              <p className="text-xs text-slate-400">运输管理系统 V2</p>
            </div>
          )}
        </div>
      </div>

      {/* 菜单列表 */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {menuItems.map((item) => {
          const active = isActive(item.path)
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              title={collapsed ? item.label : undefined}
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
                <span className="text-sm truncate">{item.label}</span>
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
              <span className="text-xs">收起菜单</span>
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
