/**
 * 客户门户 · 账号管理（P5）
 *
 * 客户管理员自助管理本公司成员：新建、改角色、停用/启用、重置密码。
 * 后端每条 SQL 都带 linked_entity_id 过滤，看不到也改不了别家公司的账号。
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
      notify('error', t('members.loadFailed'))
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
        notify('success', t('members.createSuccess'))
        loadAll()
      } else {
        notify('error', res.message || t('members.createFailed'))
      }
    } catch (error: any) {
      console.error('创建成员失败:', error)
      notify('error', error.message || t('members.createFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleChangeRole = async (member: Member, roleId: string) => {
    try {
      const res = await api.put<ApiResponse<null>>(`/portal/users/${member.id}`, { role_id: roleId })
      if (res.code === 200) {
        notify('success', t('members.roleUpdated', { name: member.display_name }))
        loadAll()
      } else {
        notify('error', res.message || t('members.updateFailed'))
      }
    } catch (error: any) {
      console.error('更新角色失败:', error)
      notify('error', error.message || t('members.updateFailed'))
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
        notify('error', res.message || t('members.actionFailed'))
      }
    } catch (error: any) {
      console.error('切换状态失败:', error)
      notify('error', error.message || t('members.actionFailed'))
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
        notify('success', t('members.resetSuccess'))
      } else {
        notify('error', res.message || t('members.resetFailed'))
      }
    } catch (error: any) {
      console.error('重置密码失败:', error)
      notify('error', error.message || t('members.resetFailed'))
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
          <h1 className="text-lg font-bold text-slate-900">{t('nav.members')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('members.subtitle')}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600
            rounded-xl hover:bg-primary-700 transition-all duration-200 ease-in-out shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('members.add')}
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
          <h3 className="text-sm font-semibold text-slate-800">{t('members.listTitle')}</h3>
          <span className="ml-auto text-xs text-slate-400">{t('members.count', { count: members.length })}</span>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">{t('members.username')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">{t('members.displayName')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">{t('members.email')}</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">{t('members.role')}</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">{t('common.status')}</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                    {t('members.empty')}
                  </td>
                </tr>
              ) : (
                members.map(member => {
                  const isSelf = member.id === user?.id
                  return (
                    <tr key={member.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-xs font-medium text-slate-900 truncate">
                        {member.username}
                        {isSelf && <span className="ml-1 text-primary-600">{t('members.self')}</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 truncate">{member.display_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 truncate">{member.email || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {isSelf ? (
                          <span className="text-xs text-slate-500">{t(`role.${member.role_code}`, { defaultValue: member.role_name || t('common.empty') })}</span>
                        ) : (
                          <select
                            value={member.role_id || ''}
                            onChange={e => handleChangeRole(member, e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1
                              focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400
                              transition-all duration-200"
                          >
                            {roles.map(r => (
                              <option key={r.id} value={r.id}>{t(`role.${r.role_code}`, { defaultValue: r.role_name })}</option>
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
                          {member.is_active ? t('members.active') : t('members.inactive')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setResetTarget(member)}
                            title={t('members.resetPassword')}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-gray-100 hover:text-slate-700
                              transition-all duration-200"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          {!isSelf && (
                            <button
                              onClick={() => handleToggle(member)}
                              title={member.is_active ? t('members.disable') : t('members.enable')}
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
        <Dialog title={t('members.add')} onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label={t('members.username')} required>
              <input
                type="text"
                required
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                placeholder={t('members.phUsername')}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label={t('members.displayName')} required>
              <input
                type="text"
                required
                value={form.display_name}
                onChange={e => setForm({ ...form, display_name: e.target.value })}
                placeholder={t('members.phDisplayName')}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label={t('members.initialPassword')} required>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder={t('members.phPassword')}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label={t('members.role')} required>
              <select
                required
                value={form.role_id}
                onChange={e => setForm({ ...form, role_id: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">{t('members.selectRole')}</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.role_name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                {t('members.roleHint')}
              </p>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('members.email')}>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder={t('members.phEmail')}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label={t('members.phone')}>
                <input
                  type="text"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder={t('members.phPhone')}
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
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600
                  rounded-xl hover:bg-primary-700 disabled:bg-gray-300 transition-all duration-200"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('members.create')}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* 重置密码弹窗 */}
      {resetTarget && (
        <Dialog title={t('members.resetTitle', { name: resetTarget.display_name })} onClose={() => setResetTarget(null)}>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <Field label={t('members.newPassword')} required>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder={t('members.phNewPassword')}
                className={INPUT_CLASS}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="px-4 py-2 text-sm text-slate-600 rounded-xl hover:bg-gray-100 transition-all duration-200"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600
                  rounded-xl hover:bg-primary-700 disabled:bg-gray-300 transition-all duration-200"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('members.confirmReset')}
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
