import { NavLink } from 'react-router-dom'
import { 
  Home,
  Package, 
  Truck, 
  Users, 
  Building2, 
  Wallet, 
  Tag,
  Settings,
  ChevronDown,
  ChevronRight,
  Receipt,
  CreditCard,
  ClipboardCheck,
  FileText,
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

interface MenuItem {
  path: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  children?: MenuItem[]
}

const menuItems: MenuItem[] = [
  {
    path: '/dashboard',
    label: '系统概览',
    icon: Home,
  },
  {
    path: '/orders',
    label: '订单管理',
    icon: Package,
  },
  {
    path: '/tms',
    label: 'TMS运输管理',
    icon: Truck,
  },
  {
    path: '/crm',
    label: 'CRM客户管理',
    icon: Users,
    children: [
      { path: '/crm/customers', label: '客户列表', icon: Users },
    ],
  },
  {
    path: '/suppliers',
    label: '供应商管理',
    icon: Building2,
  },
  {
    path: '/finance',
    label: '财务管理',
    icon: Wallet,
    children: [
      { path: '/finance', label: '财务概览', icon: Wallet },
      { path: '/finance/invoices', label: '应收发票', icon: Receipt },
      { path: '/finance/payables', label: '应付账款', icon: CreditCard },
      { path: '/finance/reconciliation', label: '对账管理', icon: ClipboardCheck },
    ],
  },
  {
    path: '/products',
    label: '产品定价',
    icon: Tag,
  },
  {
    path: '/system',
    label: '系统管理',
    icon: Settings,
    children: [
      { path: '/system/users', label: '用户管理', icon: Users },
      { path: '/system/basic-data', label: '基础数据', icon: Settings },
    ],
  },
]

export default function Sidebar() {
  const [expandedItems, setExpandedItems] = useState<string[]>([])

  const toggleExpand = (path: string) => {
    setExpandedItems(prev =>
      prev.includes(path)
        ? prev.filter(p => p !== path)
        : [...prev, path]
    )
  }

  const isExpanded = (path: string) => expandedItems.includes(path)

  const renderMenuItem = (item: MenuItem, level = 0) => {
    const hasChildren = item.children && item.children.length > 0
    const expanded = isExpanded(item.path)

    return (
      <div key={item.path}>
        {hasChildren ? (
          <>
            <button
              onClick={() => toggleExpand(item.path)}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 transition-colors rounded-lg mx-1',
                level > 0 && 'pl-8'
              )}
            >
              {expanded ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
              <item.icon className="w-4 h-4 text-gray-500" />
              <span className="text-gray-700">{item.label}</span>
            </button>
            {expanded && (
              <div className="ml-4">
                {item.children?.map((child) => renderMenuItem(child, level + 1))}
              </div>
            )}
          </>
        ) : (
          <NavLink
            to={item.path}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-lg mx-1',
                level > 0 && 'pl-8',
                isActive
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'hover:bg-gray-100 text-gray-700'
              )
            }
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </NavLink>
        )}
      </div>
    )
  }

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">德国Box</h1>
            <p className="text-xs text-gray-500">运输管理系统</p>
          </div>
        </div>
      </div>

      {/* 菜单 */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-1">
        {menuItems.map(item => renderMenuItem(item))}
      </nav>

      {/* 底部 */}
      <div className="p-4 border-t border-gray-200">
        <p className="text-xs text-gray-400 text-center">v1.0.0</p>
      </div>
    </aside>
  )
}
