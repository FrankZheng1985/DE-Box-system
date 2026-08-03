/**
 * 客户 / 承运商详情页的「账号」区块
 *
 * 2026-08-03 Frank 提出：客户的登录账号只在「用户管理」里能看到，
 * 从客户详情进不去，业务岗要给新签约客户开账号得先跑到用户管理再找公司。
 *
 * 做法是**加不是搬**——「用户管理」保留全量列表（技术支持要一个地方搜所有账号、
 * 重置任意密码），这里再按公司维度展示一份，两个入口服务两种场景。
 *
 * ⚠️ 走的是运营端自己的 /api/v1/users 接口，不是客户门户的 portal-user 端点
 *    （模块间 API 隔离规范：子系统专属端点不跨端复用）。
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { UserPlus, KeyRound, UserX, UserCheck, Loader2, X } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'

/** 与 GET /users 返回一致（snake_case，踩坑 003） */
interface AccountRow {
  id: string
  username: string
  display_name: string
  email: string | null
  phone: string | null
  is_active: boolean
  role_id: string | null
  role_code: string | null
  role_name: string | null
  created_at: string
}

interface RoleOption {
  id: string
  role_code: string
  role_name: string
  role_type: string
}

interface EntityAccountsPanelProps {
  /** CLIENT = 客户，CARRIER = 承运商 */
  entityType: 'CLIENT' | 'CARRIER'
  entityId: string
}

export default function EntityAccountsPanel({ entityType, entityId }: EntityAccountsPanelProps) {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canManage = hasPermission('system:user')

  const [rows, setRows] = useState<AccountRow[]>([])
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)

  // 新建 / 重置密码弹窗
  const [showCreate, setShowCreate] = useState(false)
  const [resetTarget, setResetTarget] = useState<AccountRow | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<AccountRow[]>>(
        `/users?linked_entity_id=${entityId}&page_size=100`
      )
      if (res.code === 200) setRows(Array.isArray(res.data) ? res.data : [])
    } catch (error) {
      console.error('获取关联账号失败:', error)
      setNotice({ text: t('common.loadFailed'), ok: false })
    } finally {
      setLoading(false)
    }
  }, [entityId, t])

  const loadRoles = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<RoleOption[]>>('/system/roles')
      if (res.code === 200 && Array.isArray(res.data)) {
        setRoles(res.data.filter((r) => r.role_type === entityType))
      }
    } catch (error) {
      console.error('获取角色列表失败:', error)
    }
  }, [entityType])

  useEffect(() => {
    load()
    loadRoles()
  }, [load, loadRoles])

  const toggleActive = async (row: AccountRow) => {
    try {
      const res = await api.delete<ApiResponse>(`/users/${row.id}`)
      if (res.code === 200) {
        setNotice({ text: t('accounts.statusUpdated'), ok: true })
        load()
      } else {
        setNotice({ text: res.message || t('common.operateFailed'), ok: false })
      }
    } catch (error) {
      console.error('切换账号状态失败:', error)
      setNotice({ text: t('common.operateFailed'), ok: false })
    }
  }

  return (
    <div className="space-y-4">
      {notice && (
        <div
          className={`text-sm px-4 py-3 rounded-xl ${
            notice.ok ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">{t('accounts.title')}</h3>
          <span className="text-xs text-slate-400">{t('common.totalCount', { count: rows.length })}</span>
          {canManage && (
            <button
              onClick={() => setShowCreate(true)}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white
                bg-primary-600 hover:bg-primary-700 rounded-lg transition-all duration-200 ease-in-out"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {t('accounts.add')}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[720px]">
            {/* 列宽按最长的德语文案分配 */}
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[18%]" />
              <col className="w-[20%]" />
              <col className="w-[18%]" />
              <col className="w-[12%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="text-left px-4 py-3 font-medium">{t('accounts.username')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('accounts.displayName')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('accounts.email')}</th>
                <th className="text-center px-4 py-3 font-medium">{t('accounts.role')}</th>
                <th className="text-center px-4 py-3 font-medium">{t('common.status')}</th>
                <th className="text-center px-4 py-3 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-sm text-slate-400">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10">
                    <p className="text-sm text-slate-400">{t('accounts.empty')}</p>
                    <p className="text-xs text-slate-400 mt-1">{t('accounts.emptyHint')}</p>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="text-left px-4 py-3 text-xs font-medium text-slate-900 truncate">
                      {row.username}
                    </td>
                    <td className="text-left px-4 py-3 text-xs text-slate-600 truncate">
                      {row.display_name || t('common.empty')}
                    </td>
                    <td className="text-left px-4 py-3 text-xs text-slate-600 truncate">
                      {row.email || t('common.empty')}
                    </td>
                    <td className="text-center px-4 py-3 text-xs text-slate-600 truncate">
                      {row.role_code
                        ? t(`role.${row.role_code}`, { defaultValue: row.role_name || row.role_code })
                        : t('common.empty')}
                    </td>
                    <td className="text-center px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                          row.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {row.is_active ? t('status.ACTIVE') : t('status.INACTIVE')}
                      </span>
                    </td>
                    <td className="text-center px-4 py-3">
                      {canManage ? (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setResetTarget(row)}
                            title={t('accounts.resetPassword')}
                            className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all duration-200"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleActive(row)}
                            title={row.is_active ? t('accounts.disable') : t('accounts.enable')}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200"
                          >
                            {row.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">{t('common.empty')}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateAccountDialog
          entityType={entityType}
          entityId={entityId}
          roles={roles}
          submitting={submitting}
          setSubmitting={setSubmitting}
          onClose={() => setShowCreate(false)}
          onDone={(ok, text) => {
            setNotice({ text, ok })
            if (ok) {
              setShowCreate(false)
              load()
            }
          }}
        />
      )}

      {resetTarget && (
        <ResetPasswordDialog
          target={resetTarget}
          submitting={submitting}
          setSubmitting={setSubmitting}
          onClose={() => setResetTarget(null)}
          onDone={(ok, text) => {
            setNotice({ text, ok })
            if (ok) setResetTarget(null)
          }}
        />
      )}
    </div>
  )
}

// ==================== 弹窗外壳 ====================

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inputClass =
  'w-full h-9 px-3 border border-slate-200 rounded-lg text-sm outline-none ' +
  'focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all duration-200 ease-in-out'

// ==================== 新建账号 ====================

function CreateAccountDialog({
  entityType, entityId, roles, submitting, setSubmitting, onClose, onDone,
}: {
  entityType: 'CLIENT' | 'CARRIER'
  entityId: string
  roles: RoleOption[]
  submitting: boolean
  setSubmitting: (v: boolean) => void
  onClose: () => void
  onDone: (ok: boolean, text: string) => void
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    username: '', password: '', display_name: '', email: '', phone: '', role_id: '',
  })
  const [error, setError] = useState('')

  const submit = async () => {
    // 角色必须一起校验：role_id 为空建出来的账号权限集是空的，
    // 登得进去但每个接口都 403，表现为「账号好像坏了」而不是明确报错
    if (!form.username.trim() || !form.password.trim() || !form.display_name.trim() || !form.role_id) {
      setError(t('accounts.errorRequired'))
      return
    }
    if (form.password.length < 6) {
      setError(t('accounts.errorPasswordShort'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await api.post<ApiResponse>('/users', {
        username: form.username.trim(),
        password: form.password,
        display_name: form.display_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        user_type: entityType,
        role_id: form.role_id || null,
        linked_entity_id: entityId,
      })
      if (res.code === 200) {
        onDone(true, t('accounts.createSuccess'))
      } else {
        setError(res.message || t('accounts.createFailed'))
      }
    } catch (err) {
      console.error('创建账号失败:', err)
      setError(err instanceof Error ? err.message : t('accounts.createFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog title={t('accounts.add')} onClose={onClose}>
      <div className="px-6 py-5 space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg">{error}</div>}

        <Field label={t('accounts.username')} required>
          <input
            className={inputClass}
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            placeholder={t('accounts.phUsername')}
          />
        </Field>
        <Field label={t('accounts.displayName')} required>
          <input
            className={inputClass}
            value={form.display_name}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            placeholder={t('accounts.phDisplayName')}
          />
        </Field>
        <Field label={t('accounts.initialPassword')} required>
          <input
            type="password"
            className={inputClass}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={t('accounts.phPassword')}
          />
        </Field>
        <Field label={t('accounts.role')}>
          <select
            className={inputClass}
            value={form.role_id}
            onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}
          >
            <option value="">{t('accounts.selectRole')}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {t(`role.${r.role_code}`, { defaultValue: r.role_name })}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('accounts.email')}>
            <input
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <Field label={t('accounts.phone')}>
            <input
              className={inputClass}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </Field>
        </div>
      </div>
      <DialogFooter onClose={onClose} onSubmit={submit} submitting={submitting} confirmText={t('accounts.create')} />
    </Dialog>
  )
}

// ==================== 重置密码 ====================

function ResetPasswordDialog({
  target, submitting, setSubmitting, onClose, onDone,
}: {
  target: AccountRow
  submitting: boolean
  setSubmitting: (v: boolean) => void
  onClose: () => void
  onDone: (ok: boolean, text: string) => void
}) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = async () => {
    if (password.length < 6) {
      setError(t('accounts.errorPasswordShort'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await api.put<ApiResponse>(`/users/${target.id}/reset-password`, { new_password: password })
      if (res.code === 200) {
        onDone(true, t('accounts.resetSuccess'))
      } else {
        setError(res.message || t('accounts.resetFailed'))
      }
    } catch (err) {
      console.error('重置密码失败:', err)
      setError(err instanceof Error ? err.message : t('accounts.resetFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog title={t('accounts.resetTitle', { name: target.display_name || target.username })} onClose={onClose}>
      <div className="px-6 py-5 space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg">{error}</div>}
        <Field label={t('accounts.newPassword')} required>
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('accounts.phNewPassword')}
          />
        </Field>
      </div>
      <DialogFooter onClose={onClose} onSubmit={submit} submitting={submitting} confirmText={t('accounts.confirmReset')} />
    </Dialog>
  )
}

// ==================== 小组件 ====================

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function DialogFooter({
  onClose, onSubmit, submitting, confirmText,
}: {
  onClose: () => void
  onSubmit: () => void
  submitting: boolean
  confirmText: string
}) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
      <button
        onClick={onClose}
        className="h-9 px-4 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all duration-200 ease-in-out"
      >
        {t('common.cancel')}
      </button>
      <button
        onClick={onSubmit}
        disabled={submitting}
        className="h-9 px-4 text-xs text-white bg-primary-600 rounded-lg hover:bg-primary-700
          disabled:opacity-50 flex items-center gap-1.5 transition-all duration-200 ease-in-out"
      >
        {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {confirmText}
      </button>
    </div>
  )
}
