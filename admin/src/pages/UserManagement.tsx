/**
 * 用户管理页面
 * 完整 CRUD：列表、创建、编辑、重置密码、停用/启用
 */

import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, Pencil, KeyRound, UserX, UserCheck, Search } from 'lucide-react'
import Modal from '../components/Modal'
import { getAuthHeaders } from '../utils/api'

// ==================== 类型定义 ====================

interface UserRecord {
  id: number
  username: string
  display_name: string
  email: string | null
  phone: string | null
  user_type: 'OPERATOR' | 'CLIENT' | 'CARRIER'
  role_id: number | null
  role_name: string | null
  role_code: string | null
  linked_entity_id: number | null
  is_active: boolean
  created_at: string
}

interface EntityOption {
  id: number
  name: string
}

// 系统角色（对应 seed data 中的 8 个角色）
const SYSTEM_ROLES = [
  { id: 1, code: 'sys_admin', name: '系统管理员' },
  { id: 2, code: 'boss', name: '老板' },
  { id: 3, code: 'operations_manager', name: '运营经理' },
  { id: 4, code: 'operations_staff', name: '运营专员' },
  { id: 5, code: 'finance_manager', name: '财务经理' },
  { id: 6, code: 'finance_staff', name: '财务专员' },
  { id: 7, code: 'sales', name: '销售人员' },
  { id: 8, code: 'viewer', name: '只读用户' },
]

// 用户类型显示
const USER_TYPE_MAP: Record<string, { label: string; color: string }> = {
  OPERATOR: { label: '操作员', color: 'bg-blue-100 text-blue-700' },
  CLIENT: { label: '客户', color: 'bg-green-100 text-green-700' },
  CARRIER: { label: '承运商', color: 'bg-amber-100 text-amber-700' },
}

// ==================== 组件 ====================

export default function UserManagement() {
  // 列表状态
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')

  // 弹窗状态
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)

  // 表单状态
  const [form, setForm] = useState({
    username: '',
    password: '',
    display_name: '',
    email: '',
    phone: '',
    user_type: 'OPERATOR' as string,
    role_id: '' as string,
    linked_entity_id: '' as string,
  })
  const [newPassword, setNewPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 关联实体选项
  const [clients, setClients] = useState<EntityOption[]>([])
  const [carriers, setCarriers] = useState<EntityOption[]>([])

  // ==================== 数据获取 ====================

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: '1', page_size: '200' })
      if (keyword) params.set('keyword', keyword)

      const res = await fetch(`/api/v1/users?${params.toString()}`, {
        headers: { ...getAuthHeaders() }
      })
      const json = await res.json()
      if (json.code === 200) {
        setUsers(json.data || [])
      }
    } catch (error) {
      console.error('获取用户列表失败:', error)
    } finally {
      setLoading(false)
    }
  }, [keyword])

  const fetchEntities = useCallback(async () => {
    try {
      // 获取客户列表
      const clientRes = await fetch('/api/v1/clients?page_size=500', {
        headers: { ...getAuthHeaders() }
      })
      const clientJson = await clientRes.json()
      if (clientJson.code === 200 && clientJson.data) {
        setClients(clientJson.data.map((c: { id: number; company_name: string }) => ({
          id: c.id,
          name: c.company_name
        })))
      }

      // 获取承运商列表
      const carrierRes = await fetch('/api/v1/carriers?page_size=500', {
        headers: { ...getAuthHeaders() }
      })
      const carrierJson = await carrierRes.json()
      if (carrierJson.code === 200 && carrierJson.data) {
        setCarriers(carrierJson.data.map((c: { id: number; company_name: string }) => ({
          id: c.id,
          name: c.company_name
        })))
      }
    } catch (error) {
      console.error('获取关联实体失败:', error)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    fetchEntities()
  }, [fetchEntities])

  // ==================== 操作处理 ====================

  const resetForm = () => {
    setForm({
      username: '',
      password: '',
      display_name: '',
      email: '',
      phone: '',
      user_type: 'OPERATOR',
      role_id: '',
      linked_entity_id: '',
    })
  }

  const handleCreate = async () => {
    if (!form.username || !form.password || !form.display_name) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          display_name: form.display_name,
          email: form.email || null,
          phone: form.phone || null,
          user_type: form.user_type,
          role_id: form.role_id ? Number(form.role_id) : null,
          linked_entity_id: form.linked_entity_id ? Number(form.linked_entity_id) : null,
        })
      })
      const json = await res.json()
      if (json.code === 200) {
        setShowCreateModal(false)
        resetForm()
        fetchUsers()
      } else {
        alert(json.message || '创建失败')
      }
    } catch (error) {
      console.error('创建用户失败:', error)
      alert('创建用户失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async () => {
    if (!editingUser) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/v1/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          display_name: form.display_name,
          email: form.email || null,
          phone: form.phone || null,
          user_type: form.user_type,
          role_id: form.role_id ? Number(form.role_id) : null,
          linked_entity_id: form.linked_entity_id ? Number(form.linked_entity_id) : null,
        })
      })
      const json = await res.json()
      if (json.code === 200) {
        setShowEditModal(false)
        setEditingUser(null)
        resetForm()
        fetchUsers()
      } else {
        alert(json.message || '更新失败')
      }
    } catch (error) {
      console.error('更新用户失败:', error)
      alert('更新用户失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetPassword = async () => {
    if (!editingUser || !newPassword) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/v1/users/${editingUser.id}/reset-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ new_password: newPassword })
      })
      const json = await res.json()
      if (json.code === 200) {
        setShowPasswordModal(false)
        setEditingUser(null)
        setNewPassword('')
        alert('密码重置成功')
      } else {
        alert(json.message || '重置失败')
      }
    } catch (error) {
      console.error('重置密码失败:', error)
      alert('重置密码失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async (user: UserRecord) => {
    const action = user.is_active ? '停用' : '启用'
    if (!confirm(`确认${action}用户「${user.display_name}」？`)) return

    try {
      const res = await fetch(`/api/v1/users/${user.id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      })
      const json = await res.json()
      if (json.code === 200) {
        fetchUsers()
      } else {
        alert(json.message || `${action}失败`)
      }
    } catch (error) {
      console.error('切换用户状态失败:', error)
    }
  }

  const openEditModal = (user: UserRecord) => {
    setEditingUser(user)
    setForm({
      username: user.username,
      password: '',
      display_name: user.display_name || '',
      email: user.email || '',
      phone: user.phone || '',
      user_type: user.user_type,
      role_id: user.role_id ? String(user.role_id) : '',
      linked_entity_id: user.linked_entity_id ? String(user.linked_entity_id) : '',
    })
    setShowEditModal(true)
  }

  const openPasswordModal = (user: UserRecord) => {
    setEditingUser(user)
    setNewPassword('')
    setShowPasswordModal(true)
  }

  // ==================== 渲染 ====================

  // 关联实体选项（根据用户类型显示不同列表）
  const entityOptions = form.user_type === 'CLIENT' ? clients : form.user_type === 'CARRIER' ? carriers : []

  return (
    <div className="p-4 lg:p-6 space-y-6 min-h-screen bg-slate-50/50">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">用户管理</h1>
          <p className="text-sm text-slate-500 mt-0.5">管理系统用户账户和权限分配</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowCreateModal(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl
            hover:bg-blue-700 transition-all duration-200 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          添加用户
        </button>
      </div>

      {/* 搜索栏 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索用户名、显示名称、邮箱..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
                transition-all duration-200"
            />
          </div>
          <button
            onClick={fetchUsers}
            className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl
              hover:bg-blue-100 transition-all duration-200"
          >
            搜索
          </button>
        </div>
      </div>

      {/* 用户表格 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-800">系统用户</h3>
          <span className="ml-auto text-xs text-slate-400">{users.length} 个用户</span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[15%]" />
                <col className="w-[18%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[15%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">用户名</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">显示名称</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">邮箱</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">用户类型</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">角色</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">状态</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                      暂无用户数据
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 truncate">
                        {user.username}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 truncate">
                        {user.display_name || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 truncate">
                        {user.email || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                          ${USER_TYPE_MAP[user.user_type]?.color || 'bg-gray-100 text-gray-600'}`}>
                          {USER_TYPE_MAP[user.user_type]?.label || user.user_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate-600">
                        {user.role_name || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                          ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {user.is_active ? '启用' : '停用'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEditModal(user)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                            title="编辑"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openPasswordModal(user)}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200"
                            title="重置密码"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(user)}
                            className={`p-1.5 rounded-lg transition-all duration-200 ${
                              user.is_active
                                ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
                            }`}
                            title={user.is_active ? '停用' : '启用'}
                          >
                            {user.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ==================== 创建用户弹窗 ==================== */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="添加用户"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={submitting || !form.username || !form.password || !form.display_name}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl
                hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {submitting ? '创建中...' : '创建'}
            </button>
          </div>
        }
      >
        <UserForm
          form={form}
          setForm={setForm}
          entityOptions={entityOptions}
          isCreate={true}
        />
      </Modal>

      {/* ==================== 编辑用户弹窗 ==================== */}
      <Modal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingUser(null) }}
        title={`编辑用户 - ${editingUser?.username || ''}`}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setShowEditModal(false); setEditingUser(null) }}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handleEdit}
              disabled={submitting || !form.display_name}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl
                hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {submitting ? '保存中...' : '保存'}
            </button>
          </div>
        }
      >
        <UserForm
          form={form}
          setForm={setForm}
          entityOptions={entityOptions}
          isCreate={false}
        />
      </Modal>

      {/* ==================== 重置密码弹窗 ==================== */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => { setShowPasswordModal(false); setEditingUser(null) }}
        title={`重置密码 - ${editingUser?.display_name || ''}`}
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setShowPasswordModal(false); setEditingUser(null) }}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handleResetPassword}
              disabled={submitting || !newPassword || newPassword.length < 6}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-xl
                hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {submitting ? '重置中...' : '确认重置'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            为用户「{editingUser?.display_name}」设置新密码，密码长度至少 6 位。
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">新密码 *</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="请输入新密码（至少 6 位）"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
                transition-all duration-200"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ==================== 用户表单子组件 ====================

interface UserFormProps {
  form: {
    username: string
    password: string
    display_name: string
    email: string
    phone: string
    user_type: string
    role_id: string
    linked_entity_id: string
  }
  setForm: (f: any) => void
  entityOptions: EntityOption[]
  isCreate: boolean
}

function UserForm({ form, setForm, entityOptions, isCreate }: UserFormProps) {
  const updateField = (field: string, value: string) => {
    setForm((prev: typeof form) => ({ ...prev, [field]: value }))
  }

  // 用户类型切换时清空关联实体
  const handleTypeChange = (value: string) => {
    setForm((prev: typeof form) => ({ ...prev, user_type: value, linked_entity_id: '' }))
  }

  return (
    <div className="space-y-4">
      {/* 用户名 */}
      {isCreate && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">用户名 *</label>
          <input
            type="text"
            value={form.username}
            onChange={(e) => updateField('username', e.target.value)}
            placeholder="请输入用户名（用于登录）"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
              transition-all duration-200"
          />
        </div>
      )}

      {/* 密码 */}
      {isCreate && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">密码 *</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => updateField('password', e.target.value)}
            placeholder="请输入密码（至少 6 位）"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
              transition-all duration-200"
          />
        </div>
      )}

      {/* 显示名称 */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">显示名称 *</label>
        <input
          type="text"
          value={form.display_name}
          onChange={(e) => updateField('display_name', e.target.value)}
          placeholder="请输入显示名称"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
            transition-all duration-200"
        />
      </div>

      {/* 邮箱 & 电话 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            placeholder="email@example.com"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
              transition-all duration-200"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">电话</label>
          <input
            type="text"
            value={form.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            placeholder="+49 xxx"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
              transition-all duration-200"
          />
        </div>
      </div>

      {/* 用户类型 */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">用户类型</label>
        <select
          value={form.user_type}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
            transition-all duration-200"
        >
          <option value="OPERATOR">操作员（内部人员）</option>
          <option value="CLIENT">客户</option>
          <option value="CARRIER">承运商</option>
        </select>
      </div>

      {/* 角色 */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">角色</label>
        <select
          value={form.role_id}
          onChange={(e) => updateField('role_id', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
            transition-all duration-200"
        >
          <option value="">请选择角色</option>
          {SYSTEM_ROLES.map(role => (
            <option key={role.id} value={role.id}>{role.name}（{role.code}）</option>
          ))}
        </select>
      </div>

      {/* 关联实体（仅 CLIENT / CARRIER 类型显示） */}
      {(form.user_type === 'CLIENT' || form.user_type === 'CARRIER') && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            关联{form.user_type === 'CLIENT' ? '客户' : '承运商'}
          </label>
          <select
            value={form.linked_entity_id}
            onChange={(e) => updateField('linked_entity_id', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
              transition-all duration-200"
          >
            <option value="">请选择关联实体</option>
            {entityOptions.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
