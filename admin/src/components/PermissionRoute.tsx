import { useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getRequiredPermissions } from '../constants/permissions'

/**
 * 路由权限守卫（P5）
 *
 * 登录之后还要看权限码：地址栏直接敲一个没权限的页面，
 * 之前是照样渲染出来、只有接口 403（页面看着像坏了）。
 * 现在直接给一个明确的"无权访问"提示。
 */
export default function PermissionRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { hasAnyPermission } = useAuth()

  const required = getRequiredPermissions(location.pathname)
  if (required.length > 0 && !hasAnyPermission(required)) {
    return <NoPermission />
  }

  return <>{children}</>
}

function NoPermission() {
  return (
    <div className="h-full flex items-center justify-center p-4 lg:p-6">
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] px-8 py-10 max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-7 h-7 text-amber-600" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">无权访问</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          你当前的角色没有查看这个页面的权限。
          <br />
          如果确实需要，请联系系统管理员在「角色权限」里为你的角色开通。
        </p>
      </div>
    </div>
  )
}
