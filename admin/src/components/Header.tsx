import { Bell, LogOut, User, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// 路由 -> 页面标题映射
const routeTitleMap: Record<string, string> = {
  '/dashboard': '仪表板',
  '/orders': '订单管理',
  '/inquiries': '询价报价',
  '/quotes': '询价报价',
  '/cmr': 'CMR 管理',
  '/shipping-release': '船司放单',
  '/customs': '清关管理',
  '/gps': 'GPS 追踪',
  '/finance': '财务管理',
  '/invoice-templates': '发票模板',
  '/clients': '客户管理',
  '/carriers': '运输公司',
  '/notifications': '通知中心',
  '/settings': '系统设置',
  '/system/users': '用户管理',
  '/system/roles': '角色权限',
}

// 根据当前路径获取页面标题
function getPageTitle(pathname: string): string {
  // 精确匹配
  if (routeTitleMap[pathname]) {
    return routeTitleMap[pathname]
  }
  // 前缀匹配（支持子路由）
  const matchedKey = Object.keys(routeTitleMap).find((key) =>
    pathname.startsWith(key)
  )
  return matchedKey ? routeTitleMap[matchedKey] : '仪表板'
}

export default function Header() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const pageTitle = getPageTitle(location.pathname)

  // 点击外部关闭菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/60 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
      {/* 左侧：页面标题 */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{pageTitle}</h2>
      </div>

      {/* 右侧操作区 */}
      <div className="flex items-center gap-3">
        {/* 通知铃铛 */}
        <button className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all duration-200 ease-in-out">
          <Bell className="w-5 h-5" />
          {/* 未读消息红点 */}
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
        </button>

        {/* 分隔线 */}
        <div className="w-px h-8 bg-slate-200" />

        {/* 用户头像下拉 */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2.5 p-1.5 hover:bg-slate-50 rounded-xl transition-all duration-200 ease-in-out"
          >
            {/* 头像 */}
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-[0_2px_8px_rgb(59,130,246,0.25)]">
              <span className="text-white text-sm font-medium">
                {user?.displayName?.charAt(0) || 'U'}
              </span>
            </div>
            {/* 用户名和角色 */}
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium text-slate-900 leading-tight">
                {user?.displayName || '用户'}
              </p>
              <p className="text-xs text-slate-400 leading-tight">
                {user?.roleName || '操作员'}
              </p>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-300 hidden md:block" />
          </button>

          {/* 下拉菜单 */}
          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-200/60 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              {/* 用户信息 */}
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-900">
                  {user?.displayName}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {user?.email}
                </p>
              </div>

              {/* 个人设置 */}
              <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-all duration-200 ease-in-out">
                <User className="w-4 h-4 text-slate-400" />
                个人设置
              </button>

              {/* 退出登录 */}
              <button
                onClick={logout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-all duration-200 ease-in-out"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
