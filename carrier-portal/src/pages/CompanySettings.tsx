import { useState, useEffect } from 'react'
import { Settings, Save } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'

interface CompanyInfo {
  companyName: string
  contactPerson: string
  email: string
  phone: string
  address: string
  taxNumber: string
  bankName: string
  bankAccount: string
}

const emptyInfo: CompanyInfo = {
  companyName: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  taxNumber: '',
  bankName: '',
  bankAccount: '',
}

export default function CompanySettings() {
  const [info, setInfo] = useState<CompanyInfo>(emptyInfo)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const res = await api.get<ApiResponse<CompanyInfo>>('/system/settings/account')
      if (res.code === 200 && res.data) {
        setInfo({ ...emptyInfo, ...res.data })
      }
    } catch (error) {
      console.error('获取公司信息失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const res = await api.put<ApiResponse>('/system/settings/account', info)
      if (res.code === 200) {
        setMessage('保存成功')
      }
    } catch (error) {
      console.error('保存失败:', error)
      setMessage('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (field: keyof CompanyInfo, value: string) => {
    setInfo((prev) => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-slate-900">公司设置</h1>
        <div className="bg-white rounded-2xl p-6 animate-pulse h-96" />
      </div>
    )
  }

  const fields: { key: keyof CompanyInfo; label: string; placeholder: string }[] = [
    { key: 'companyName', label: '公司名称', placeholder: '请输入公司全称' },
    { key: 'contactPerson', label: '联系人', placeholder: '请输入联系人姓名' },
    { key: 'email', label: '邮箱', placeholder: '请输入联系邮箱' },
    { key: 'phone', label: '电话', placeholder: '请输入联系电话' },
    { key: 'address', label: '地址', placeholder: '请输入公司地址' },
    { key: 'taxNumber', label: '税号', placeholder: '请输入公司税号' },
    { key: 'bankName', label: '开户银行', placeholder: '请输入开户银行名称' },
    { key: 'bankAccount', label: '银行账号', placeholder: '请输入银行账号' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">公司设置</h1>

      <div className="max-w-2xl">
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <div className="flex items-center gap-2 mb-5">
            <Settings className="w-5 h-5 text-green-600" />
            <h2 className="text-sm font-semibold text-slate-900">公司信息</h2>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {message && (
              <div className={`text-sm px-4 py-3 rounded-xl ${message.includes('成功') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                {message}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.map((field) => (
                <div key={field.key} className={field.key === 'address' ? 'sm:col-span-2' : ''}>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{field.label}</label>
                  <input
                    type="text"
                    value={info[field.key]}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
                  />
                </div>
              ))}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? '保存中...' : '保存设置'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
