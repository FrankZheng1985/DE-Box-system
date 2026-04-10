import { useState, useEffect } from 'react'
import { Save, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api, { ApiResponse } from '../utils/api'

interface AccountInfo {
  name: string
  email: string
  phone: string
  company: string
  address: string
  contactPerson: string
}

export default function Settings() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const [form, setForm] = useState<AccountInfo>({
    name: '',
    email: '',
    phone: '',
    company: '',
    address: '',
    contactPerson: '',
  })

  useEffect(() => {
    loadAccount()
  }, [])

  const loadAccount = async () => {
    try {
      const res = await api.get<ApiResponse<any>>('/system/settings/account')
      if (res.code === 200 && res.data) {
        setForm({
          name: res.data.name || user?.name || '',
          email: res.data.email || user?.email || '',
          phone: res.data.phone || '',
          company: res.data.company || '',
          address: res.data.address || '',
          contactPerson: res.data.contactPerson || '',
        })
      }
    } catch (err) {
      // 如果API不存在，使用user信息填充
      setForm(prev => ({
        ...prev,
        name: user?.name || '',
        email: user?.email || '',
      }))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage({ type: '', text: '' })

    try {
      const res = await api.put<ApiResponse<any>>('/system/settings/account', form)
      if (res.code === 200) {
        setMessage({ type: 'success', text: '保存成功' })
      } else {
        setMessage({ type: 'error', text: res.message || '保存失败' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (field: keyof AccountInfo, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-xl p-6 animate-pulse">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-4">
            <div className="h-3 bg-gray-200 rounded w-16 mb-2" />
            <div className="h-9 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">账户信息</h2>

        {message.text && (
          <div className={`px-4 py-2 rounded-lg text-xs mb-4 ${
            message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-600' : 'bg-red-50 border border-red-200 text-red-600'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">姓名</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">邮箱</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">电话</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">公司名称</label>
            <input
              type="text"
              value={form.company}
              onChange={(e) => handleChange('company', e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">联系人</label>
            <input
              type="text"
              value={form.contactPerson}
              onChange={(e) => handleChange('contactPerson', e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">地址</label>
            <textarea
              value={form.address}
              onChange={(e) => handleChange('address', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-4 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              保存修改
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
