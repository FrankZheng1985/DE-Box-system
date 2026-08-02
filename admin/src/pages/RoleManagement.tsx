/**
 * 角色权限管理（P5）
 *
 * 左侧选角色，右侧按模块分组勾选权限码，保存即整包覆盖。
 * 系统管理员（sys_admin）拥有全部权限，不允许改，界面上只读展示。
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ShieldCheck, Save, Lock, Check } from 'lucide-react'
import { getAuthHeaders } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { SUPER_ROLE_CODE } from '../constants/permissions'

// ==================== 类型定义 ====================

interface Role {
  id: string
  role_code: string
  role_name: string
  role_type: 'OPERATOR' | 'CLIENT' | 'CARRIER'
}

interface Permission {
  perm_code: string
  perm_name: string
  module: string
  module_name: string
  perm_type: 'MENU' | 'ACTION'
  scope: 'OPERATOR' | 'CLIENT' | 'CARRIER'
  sort_order: number
  description: string | null
}

interface PermissionGroup {
  module: string
  moduleName: string
  items: Permission[]
}

const ROLE_TYPE_MAP: Record<string, { label: string; color: string }> = {
  OPERATOR: { label: '运营端', color: 'bg-blue-100 text-blue-700' },
  CLIENT: { label: '客户端', color: 'bg-green-100 text-green-700' },
  CARRIER: { label: '承运商', color: 'bg-amber-100 text-amber-700' },
}

// ==================== 组件 ====================

export default function RoleManagement() {
  const { refreshPermissions } = useAuth()

  const [roles, setRoles] = useState<Role[]>([])
  const [catalog, setCatalog] = useState<Permission[]>([])
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [originalChecked, setOriginalChecked] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(true)
  const [loadingRolePerms, setLoadingRolePerms] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)

  const showToast = useCallback((text: string, ok: boolean) => {
    setToast({ text, ok })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // 角色列表 + 权限码字典
  useEffect(() => {
    const load = async () => {
      try {
        const [roleRes, permRes] = await Promise.all([
          fetch('/api/v1/system/roles', { headers: { ...getAuthHeaders() } }),
          fetch('/api/v1/system/permissions', { headers: { ...getAuthHeaders() } }),
        ])
        const roleJson = await roleRes.json()
        const permJson = await permRes.json()

        if (roleJson.code === 200) setRoles(roleJson.data || [])
        if (permJson.code === 200) setCatalog(permJson.data || [])

        if (roleJson.code === 200 && roleJson.data?.length > 0) {
          setSelectedRole(roleJson.data[0])
        }
      } catch (error) {
        console.error('加载角色权限失败:', error)
        showToast('加载失败，请刷新重试', false)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [showToast])

  // 选中角色变化 → 拉该角色已勾选的权限
  useEffect(() => {
    if (!selectedRole) return
    const load = async () => {
      setLoadingRolePerms(true)
      try {
        const res = await fetch(`/api/v1/system/roles/${selectedRole.id}/permissions`, {
          headers: { ...getAuthHeaders() },
        })
        const json = await res.json()
        if (json.code === 200) {
          const set = new Set<string>(json.data.permissions || [])
          setChecked(set)
          setOriginalChecked(new Set(set))
        }
      } catch (error) {
        console.error('加载角色权限失败:', error)
        showToast('加载角色权限失败', false)
      } finally {
        setLoadingRolePerms(false)
      }
    }
    load()
  }, [selectedRole, showToast])

  // 只展示与当前角色端别匹配的权限码
  // （运营角色不该看到 portal:* 这些客户门户的码）
  const groups: PermissionGroup[] = useMemo(() => {
    if (!selectedRole) return []
    const scoped = catalog.filter(p =>
      selectedRole.role_code === SUPER_ROLE_CODE ? true : p.scope === selectedRole.role_type
    )
    const map = new Map<string, PermissionGroup>()
    for (const p of scoped) {
      if (!map.has(p.module)) {
        map.set(p.module, { module: p.module, moduleName: p.module_name, items: [] })
      }
      map.get(p.module)!.items.push(p)
    }
    return [...map.values()]
  }, [catalog, selectedRole])

  const isSuperRole = selectedRole?.role_code === SUPER_ROLE_CODE
  const dirty = useMemo(() => {
    if (checked.size !== originalChecked.size) return true
    for (const code of checked) if (!originalChecked.has(code)) return true
    return false
  }, [checked, originalChecked])

  const toggle = (code: string) => {
    if (isSuperRole) return
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const toggleGroup = (group: PermissionGroup, selectAll: boolean) => {
    if (isSuperRole) return
    setChecked(prev => {
      const next = new Set(prev)
      for (const item of group.items) {
        if (selectAll) next.add(item.perm_code)
        else next.delete(item.perm_code)
      }
      return next
    })
  }

  const handleSave = async () => {
    if (!selectedRole || isSuperRole) return
    setSaving(true)
    try {
      const res = await fetch(`/api/v1/system/roles/${selectedRole.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ permissions: [...checked] }),
      })
      const json = await res.json()
      if (json.code === 200) {
        setOriginalChecked(new Set(checked))
        showToast(`已保存，${selectedRole.role_name} 现有 ${checked.size} 项权限`, true)
        // 万一改的是自己所属角色，顺手把本人权限刷新一下
        await refreshPermissions()
      } else {
        showToast(json.message || '保存失败', false)
      }
    } catch (error) {
      console.error('保存角色权限失败:', error)
      showToast('保存失败，请稍后重试', false)
    } finally {
      setSaving(false)
    }
  }

  // ==================== 渲染 ====================

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* 页头 */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">角色权限</h1>
          <p className="text-sm text-slate-500 mt-1">
            给角色勾选权限，保存后该角色下所有账号立即生效（最迟 1 分钟）
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving || isSuperRole}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl
            hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed
            transition-all duration-200 ease-in-out shadow-sm"
        >
          <Save className="w-4 h-4" />
          {saving ? '保存中...' : '保存权限'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 角色列表 */}
        <div className="lg:col-span-1 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-800">角色</h3>
            <span className="ml-auto text-xs text-slate-400">{roles.length}</span>
          </div>
          <div className="p-2 space-y-1">
            {roles.map(role => {
              const active = selectedRole?.id === role.id
              return (
                <button
                  key={role.id}
                  onClick={() => setSelectedRole(role)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200 ease-in-out
                    ${active ? 'bg-blue-50 shadow-[0_2px_8px_rgb(59,130,246,0.08)]' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${active ? 'font-medium text-blue-700' : 'text-slate-700'}`}>
                      {role.role_name}
                    </span>
                    {role.role_code === SUPER_ROLE_CODE && (
                      <Lock className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                      ${ROLE_TYPE_MAP[role.role_type]?.color || 'bg-gray-100 text-gray-600'}`}>
                      {ROLE_TYPE_MAP[role.role_type]?.label || role.role_type}
                    </span>
                    <span className="text-xs text-slate-400 truncate">{role.role_code}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 权限勾选 */}
        <div className="lg:col-span-3 space-y-4">
          {isSuperRole && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2">
              <Lock className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                系统管理员拥有全部权限，且不可修改 —— 这是防止把自己锁在系统外面的最后一道保险。
              </p>
            </div>
          )}

          {loadingRolePerms ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : (
            groups.map(group => {
              const allChecked = group.items.every(i => checked.has(i.perm_code) || isSuperRole)
              return (
                <div
                  key={group.module}
                  className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-slate-800">{group.moduleName}</h3>
                    <span className="text-xs text-slate-400">
                      {group.items.filter(i => checked.has(i.perm_code) || isSuperRole).length}
                      {' / '}
                      {group.items.length}
                    </span>
                    {!isSuperRole && (
                      <button
                        onClick={() => toggleGroup(group, !allChecked)}
                        className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors duration-200"
                      >
                        {allChecked ? '全不选' : '全选'}
                      </button>
                    )}
                  </div>

                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {group.items.map(item => {
                      const on = isSuperRole || checked.has(item.perm_code)
                      return (
                        <button
                          key={item.perm_code}
                          onClick={() => toggle(item.perm_code)}
                          disabled={isSuperRole}
                          title={item.description || item.perm_code}
                          className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left
                            transition-all duration-200 ease-in-out
                            ${on ? 'bg-blue-50/70' : 'bg-slate-50 hover:bg-slate-100'}
                            ${isSuperRole ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          <span
                            className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0
                              transition-all duration-200
                              ${on ? 'bg-blue-600' : 'bg-white border border-slate-300'}`}
                          >
                            {on && <Check className="w-3 h-3 text-white" />}
                          </span>
                          <span className="min-w-0">
                            <span className={`block text-xs ${on ? 'text-blue-800 font-medium' : 'text-slate-700'}`}>
                              {item.perm_name}
                            </span>
                            <span className="block text-xs text-slate-400 truncate">{item.perm_code}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* 轻提示 */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg text-sm z-50
            transition-all duration-200 ease-in-out
            ${toast.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
