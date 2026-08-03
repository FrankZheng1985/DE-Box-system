import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api, { ApiResponse } from '../utils/api'
import NotificationPreferences from '../components/NotificationPreferences'

interface AccountInfo {
  name: string
  email: string
  phone: string
  company: string
  address: string
  contactPerson: string
}

export default function Settings() {
  const { t } = useTranslation()
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
      // 个人账号信息和公司资料分别来自两个接口：
      // /settings/account 管本人的 email/phone/显示名，
      // /settings/company 管本公司的名称/地址/联系人（写 clients 表）
      const [acc, company] = await Promise.all([
        api.get<ApiResponse<any>>('/system/settings/account'),
        api.get<ApiResponse<any>>('/system/settings/company').catch(() => null),
      ])
      if (acc.code === 200 && acc.data) {
        setForm({
          // 后端字段叫 display_name，原来读 res.data.name 永远是 undefined
          name: acc.data.display_name || acc.data.name || user?.name || '',
          email: acc.data.email || user?.email || '',
          phone: acc.data.phone || '',
          company: company?.data?.companyName || '',
          address: company?.data?.address || '',
          contactPerson: company?.data?.contactPerson || '',
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
      // 分两个接口存：个人信息进 users，公司资料进 clients。
      // 原来公司名/地址/联系人一起发给 /settings/account，那个接口不认这几个
      // 字段，发了就被丢掉——页面照弹「保存成功」，刷新就没了。
      const [res, companyRes] = await Promise.all([
        api.put<ApiResponse<any>>('/system/settings/account', {
          email: form.email,
          phone: form.phone,
          displayName: form.name,
        }),
        api.put<ApiResponse<any>>('/system/settings/company', {
          companyName: form.company,
          address: form.address,
          contactPerson: form.contactPerson,
        }).catch(() => null),
      ])
      if (companyRes && companyRes.code !== 200) {
        setMessage({ type: 'error', text: companyRes.message || t('settings.saveFailed') })
        return
      }
      if (res.code === 200) {
        setMessage({ type: 'success', text: t('settings.saveSuccess') })
      } else {
        setMessage({ type: 'error', text: res.message || t('settings.saveFailed') })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || t('settings.saveFailed') })
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
    <div className="max-w-lg mx-auto space-y-4">
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">{t('settings.accountInfo')}</h2>

        {message.text && (
          <div className={`px-4 py-2 rounded-lg text-xs mb-4 ${
            message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-600' : 'bg-red-50 border border-red-200 text-red-600'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('settings.name')}</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('settings.email')}</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('settings.phone')}</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('settings.company')}</label>
            <input
              type="text"
              value={form.company}
              onChange={(e) => handleChange('company', e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('settings.contactPerson')}</label>
            <input
              type="text"
              value={form.contactPerson}
              onChange={(e) => handleChange('contactPerson', e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('settings.address')}</label>
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
              {t('settings.save')}
            </button>
          </div>
        </form>
      </div>

      {/* 通知设置（需求 8） */}
      <NotificationPreferences />
    </div>
  )
}
