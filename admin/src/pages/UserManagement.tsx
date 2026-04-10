/**
 * 用户管理页面（V2 简化版）
 * 展示当前登录用户信息 + 角色列表 + 占位用户表
 * 后端用户 CRUD API 尚未就绪，暂用本地数据
 */

import { Users, Shield, User, Mail, Phone, Plus, Info } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

// 系统角色（对应 seed data 中的 8 个角色）
const SYSTEM_ROLES = [
  { code: 'admin', name: '系统管理员', description: '拥有所有系统权限', color: 'bg-red-100 text-red-700' },
  { code: 'boss', name: '老板', description: '查看所有数据和报表', color: 'bg-purple-100 text-purple-700' },
  { code: 'operations_manager', name: '运营经理', description: '管理订单和运输调度', color: 'bg-blue-100 text-blue-700' },
  { code: 'operations_staff', name: '运营专员', description: '日常订单操作和跟踪', color: 'bg-sky-100 text-sky-700' },
  { code: 'finance_manager', name: '财务经理', description: '管理财务和审批', color: 'bg-green-100 text-green-700' },
  { code: 'finance_staff', name: '财务专员', description: '日常财务操作', color: 'bg-emerald-100 text-emerald-700' },
  { code: 'sales', name: '销售人员', description: '管理客户和报价', color: 'bg-amber-100 text-amber-700' },
  { code: 'viewer', name: '只读用户', description: '仅可查看数据', color: 'bg-gray-100 text-gray-600' },
]

export default function UserManagement() {
  const { user } = useAuth()

  return (
    <div className="p-4 lg:p-6 space-y-6 min-h-screen bg-slate-50/50">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">用户管理</h1>
          <p className="text-sm text-slate-500 mt-0.5">管理系统用户和角色权限</p>
        </div>
        <div className="relative group">
          <button
            disabled
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl
              opacity-50 cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            添加用户
          </button>
          <div className="absolute right-0 top-full mt-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg
            opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-10">
            功能开发中
          </div>
        </div>
      </div>

      {/* 当前用户信息卡片 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
          <User className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-800">当前登录用户</h3>
        </div>
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl font-bold text-blue-600">
              {user?.displayName?.charAt(0) || user?.username?.charAt(0) || 'U'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
            <div>
              <p className="text-xs text-slate-500">姓名</p>
              <p className="text-sm font-medium text-slate-900">{user?.displayName || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">用户名</p>
              <p className="text-sm font-medium text-slate-900">{user?.username || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">角色</p>
              <p className="text-sm font-medium text-slate-900">{user?.roleName || user?.roleCode || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">邮箱</p>
              <p className="text-sm font-medium text-slate-900">{user?.email || '-'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 用户列表（占位） */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-800">系统用户</h3>
          <span className="ml-auto text-xs text-slate-400 flex items-center gap-1">
            <Info className="w-3 h-3" /> 用户 CRUD 接口开发中，当前仅展示管理员账户
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[25%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[15%]" />
              <col className="w-[20%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">用户</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">角色</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">邮箱</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                      <Shield className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">系统管理员</p>
                      <p className="text-xs text-slate-500">@admin</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                    系统管理员
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">admin@eu-tms.de</td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    正常
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-xs text-slate-400">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 角色列表 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
          <Shield className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-800">系统角色</h3>
          <span className="ml-auto text-xs text-slate-400">{SYSTEM_ROLES.length} 个角色</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SYSTEM_ROLES.map((role) => (
            <div key={role.code}
              className="p-4 rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all duration-200">
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${role.color}`}>
                  {role.name}
                </span>
              </div>
              <p className="text-xs text-slate-500">{role.description}</p>
              <p className="text-xs text-slate-400 mt-1 font-mono">{role.code}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
