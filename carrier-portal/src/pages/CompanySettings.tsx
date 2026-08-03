import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const [info, setInfo] = useState<CompanyInfo>(emptyInfo)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // 成败单独存布尔值，别再靠文案里有没有"成功"两个字判断（P9）
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const res = await api.get<ApiResponse<Partial<CompanyInfo>>>('/system/settings/company')
      if (res.code === 200 && res.data) {
        // 只挑本表单认识的字段（/settings/company 已经只返回这几个，
        // 这层保留着当护栏，接口以后加字段也不会串进表单）
        const next = { ...emptyInfo }
        for (const key of Object.keys(emptyInfo) as (keyof CompanyInfo)[]) {
          if (res.data[key] !== undefined && res.data[key] !== null) next[key] = String(res.data[key])
        }
        setInfo(next)
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
    setMessage(null)
    try {
      // 走 /settings/company（不是 /settings/account）——后者只认
      // email/phone/displayName/language 四个字段，其余六个会被静默丢掉
      const res = await api.put<ApiResponse>('/system/settings/company', info)
      if (res.code === 200) {
        setMessage({ text: t('companySettings.success'), ok: true })
      }
    } catch (error) {
      console.error('保存失败:', error)
      setMessage({ text: t('companySettings.errorFailed'), ok: false })
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
        <h1 className="text-xl font-semibold text-slate-900">{t('companySettings.title')}</h1>
        <div className="bg-white rounded-2xl p-6 animate-pulse h-96" />
      </div>
    )
  }

  // label/placeholder 都按 companySettings.<字段名> / <字段名>Placeholder 取语言包
  const fieldKeys: (keyof CompanyInfo)[] = [
    'companyName',
    'contactPerson',
    'email',
    'phone',
    'address',
    'taxNumber',
    'bankName',
    'bankAccount',
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">{t('companySettings.title')}</h1>

      <div className="max-w-2xl">
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <div className="flex items-center gap-2 mb-5">
            <Settings className="w-5 h-5 text-green-600" />
            <h2 className="text-sm font-semibold text-slate-900">{t('companySettings.sectionTitle')}</h2>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {message && (
              <div className={`text-sm px-4 py-3 rounded-xl ${message.ok ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                {message.text}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fieldKeys.map((key) => (
                <div key={key} className={key === 'address' ? 'sm:col-span-2' : ''}>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{t(`companySettings.${key}`)}</label>
                  <input
                    type="text"
                    value={info[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    placeholder={t(`companySettings.${key}Placeholder`)}
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
                {saving ? t('companySettings.saving') : t('companySettings.save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
