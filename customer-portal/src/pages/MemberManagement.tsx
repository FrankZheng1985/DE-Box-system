/**
 * 客户门户 · 账号管理（P5）
 *
 * 客户管理员自助管理本公司成员：新建、改角色、停用/启用、重置密码。
 * 后端每条 SQL 都带 linked_entity_id 过滤，看不到也改不了别家公司的账号。
 */

import { useState, useEffect } from 'react'
import { Users, Plus, KeyRound, UserX, UserCheck, Loader2, X } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'

// ==================== 类型定义 ====================

interface Member {
  id: string
  username: string
  display_name: string
  email: string | null
  phone: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
  role_id: string | null
  role_code: string | null
  role_name: string | null
}

interface RoleOption {
  id: string
  role_code: string
  role_name: string
}

interface MemberFormData {
  username: string
  password: string
  display_name: string
  email: string
  phone: string
  role_id: string
}

const EMPTY_FORM: MemberFormData = {
  username: '',
  password: '',
  display_name: '',
  email: '',
  phone: '',
  role_id: '',
}

// ==================== 组件 ====================

export default function MemberManagement() {
  const { user } = useAuth()

  const [members, setMembers] = useState<Member[]>([])
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<MemberFormData>(EMPTY_FORM)

  const [resetTarget, setResetTarget] = useState<Member | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const notify = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage({ type: '', text: '' }), 4000)
  }

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    try {
      const [memberRes, roleRes] = await Promise.all([
        api.get<ApiResponse<Member[]>>('/portal/users'),
        api.get<ApiResponse<RoleOption[]>>('/portal/users/roles'),
      ])
      if (memberRes.code === 200) setMembers(memberRes.data || [])
      if (roleRes.code === 200) setRoles(roleRes.data || [])
    } catch (error) {
      console.error('加载成员失败:', error)
      notify('error', '加载失败，请刷新重试')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await api.post<ApiResponse<Member>>('/portal/users', form)
      if (res.code === 200) {
        setShowCreate(false)
        setForm(EMPTY_FORM)
        notify('success', '成员创建成功')
        loadAll()
      } else {
        notify('error', res.message || '创建失败')
      }
    } catch (error: any) {
      console.error('创建成员失败:', error)
      notify('error', error.message || '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleChangeRole = async (member: Member, roleId: string) => {
    try {
      const res = await api.put<ApiResponse<null>>(`/portal/users/${member.id}`, { role_id: roleId })
      if (res.code === 200) {
        notify('success', `${member.display_name} 的角色已更新`)
        loadAll()
      } else {
        notify('error', res.message || '更新失败')
      }
    } catch (error: any) {
      console.error('更新角色失败:', error)
      notify('error', error.message || '更新失败')
    }
  }

  const handleToggle = async (member: Member) => {
    try {
      const res = await api.put<ApiResponse<{ is_active: boolean }>>(
        `/portal/users/${member.id}/toggle-status`
      )
      if (res.code === 200) {
        notify('success', res.message)
        loadAll()
      } else {
        notify('error', res.message || '操作失败')
      }
    } catch (error: any) {
      console.error('切换状态失败:', error)
      notify('error', error.message || '操作失败')
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetTarget) return
    setSubmitting(true)
    try {
      const res = await api.put<ApiResponse<null>>(
        `/portal/users/${resetTarget.id}/reset-password`,
        { password: newPassword }
      )
      if (res.code === 200) {
        setResetTarget(null)
        setNewPassword('')
        notify('success', '密码已重置，请通知本人使用新密码登录')
      } else {
        notify('error', res.message || '重置失败')
      }
    } catch (error: any) {
      console.error('重置密码失败:', error)
      notify('error', error.message || '重置失败')
    } finally {
      setSubmitting(false)
    }
  }

  // ==================== 渲染 ====================

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* 页头 */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-slate-900">账号管理</h1>
          <p className="text-sm text-slate-500 mt-1">
            管理本公司在系统里的成员账号和各自的权限
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600
            rounded-xl hover:bg-primary-700 transition-all duration-200 ease-in-out shadow-sm"
        >
          <Plus className="w-4 h-4" />
          添加成员
        </button>
      </div>

      {/* 提示条 */}
      {message.text && (
        <div
          className={`px-4 py-3 rounded-xl text-sm ${
            message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 成员表格 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary-500" />
          <h3 className="text-sm font-semibold text-slate-800">本公司成员</h3>
          <span className="ml-auto text-xs text-slate-400">{members.length} 人</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[720px]">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[20%]" />
              <col className="w-[18%]" />
              <col className="w-[10%]" />
              <col className="w-[20%]" />
            </colgroup>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">登录名</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">姓名</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">邮箱</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">角色</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                    暂无成员
                  </td>
                </tr>
              ) : (
                members.map(member => {
                  const isSelf = member.id === user?.id
                  return (
                    <tr key={member.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-xs font-medium text-slate-900 truncate">
                        {member.username}
                        {isSelf && <span className="ml-1 text-primary-600">（我）</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 truncate">{member.display_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 truncate">{member.email || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {isSelf ? (
                          <span className="text-xs text-slate-500">{member.role_name || '-'}</span>
                        ) : (
                          <select
                            value={member.role_id || ''}
                            onChange={e => handleChangeRole(member, e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1
                              focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400
                              transition-all duration-200"
                          >
                            {roles.map(r => (
                              <option key={r.id} value={r.id}>{r.role_name}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            member.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {member.is_active ? '启用' : '停用'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setResetTarget(member)}
                            title="重置密码"
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-gray-100 hover:text-slate-700
                              transition-all duration-200"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          {!isSelf && (
                            <button
                              onClick={() => handleToggle(member)}
                              title={member.is_active ? '停用' : '启用'}
                              className={`p-1.5 rounded-lg transition-all duration-200 ${
                                member.is_active
                                  ? 'text-red-500 hover:bg-red-50'
                                  : 'text-green-600 hover:bg-green-50'
                              }`}
                            >
                              {member.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 新建成员弹窗 */}
      {showCreate && (
        <Dialog title="添加成员" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="登录名" required>
              <input
                type="text"
                required
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                placeholder="用于登录的账号名，创建后不可修改"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="姓名" required>
              <input
                type="text"
                required
                value={form.display_name}
                onChange={e => setForm({ ...form, display_name: e.target.value })}
                placeholder="真实姓名，用于系统内显示"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="初始密码" required>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="至少 6 位，创建后请转告本人尽快修改"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="角色" required>
              <select
                required
                value={form.role_id}
                onChange={e => setForm({ ...form, role_id: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">请选择角色</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.role_name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                客户管理员可管理账号、查看账单、确认报价；客户用户只能下单和询价。
              </p>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="邮箱">
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="用于接收系统通知邮件"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="电话">
                <input
                  type="text"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="联系电话"
                  className={INPUT_CLASS}
                />
              </Field>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-slate-600 rounded-xl hover:bg-gray-100 transition-all duration-200"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600
                  rounded-xl hover:bg-primary-700 disabled:bg-gray-300 transition-all duration-200"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                创建
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* 重置密码弹窗 */}
      {resetTarget && (
        <Dialog title={`重置 ${resetTarget.display_name} 的密码`} onClose={() => setResetTarget(null)}>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <Field label="新密码" required>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="至少 6 位，重置后请当面或电话转告本人"
                className={INPUT_CLASS}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="px-4 py-2 text-sm text-slate-600 rounded-xl hover:bg-gray-100 transition-all duration-200"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600
                  rounded-xl hover:bg-primary-700 disabled:bg-gray-300 transition-all duration-200"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                确认重置
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}

// ==================== 小组件 ====================

const INPUT_CLASS =
  'w-full min-w-[220px] px-3 py-2 text-sm border border-gray-200 rounded-xl ' +
  'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 ' +
  'transition-all duration-200'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-gray-100 hover:text-slate-600 transition-all duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
