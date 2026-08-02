import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, Send } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'

// 值是后端认的大写枚举，文案走 gpsStatus.* 语言包
const STATUS_VALUES = ['LOADING', 'IN_TRANSIT', 'BORDER_CROSSING', 'CUSTOMS', 'UNLOADING', 'DELIVERED']

export default function GPSReport() {
  const { t } = useTranslation()
  const [orderId, setOrderId] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [status, setStatus] = useState('IN_TRANSIT')
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // 成败单独存布尔值，别再靠文案里有没有"成功"两个字判断（P9）
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderId || !city.trim() || !country.trim()) {
      setMessage({ text: t('gps.errorRequired'), ok: false })
      return
    }

    setSubmitting(true)
    setMessage(null)
    try {
      const res = await api.post<ApiResponse>('/gps/report', {
        orderId,
        city: city.trim(),
        country: country.trim(),
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        status,
        remark: remark.trim(),
      })
      if (res.code === 200) {
        setMessage({ text: t('gps.success'), ok: true })
        setOrderId('')
        setCity('')
        setCountry('')
        setLatitude('')
        setLongitude('')
        setStatus('IN_TRANSIT')
        setRemark('')
      }
    } catch (error) {
      console.error('GPS上报失败:', error)
      setMessage({ text: t('gps.errorFailed'), ok: false })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">{t('gps.title')}</h1>

      <div className="max-w-xl">
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <div className="flex items-center gap-2 mb-5">
            <MapPin className="w-5 h-5 text-green-600" />
            <h2 className="text-sm font-semibold text-slate-900">{t('gps.formTitle')}</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {message && (
              <div className={`text-sm px-4 py-3 rounded-xl ${message.ok ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                {message.text}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('gps.orderIdLabel')} {t('common.required')}</label>
              <input
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder={t('gps.orderIdPlaceholder')}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('gps.cityLabel')} {t('common.required')}</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={t('gps.cityPlaceholder')}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('gps.countryLabel')} {t('common.required')}</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder={t('gps.countryPlaceholder')}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('gps.latitudeLabel')}</label>
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder={t('gps.latitudePlaceholder')}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('gps.longitudeLabel')}</label>
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder={t('gps.longitudePlaceholder')}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('common.status')}</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
              >
                {STATUS_VALUES.map((value) => (
                  <option key={value} value={value}>{t(`gpsStatus.${value}`)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('common.remark')}</label>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder={t('gps.remarkPlaceholder')}
                rows={3}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {submitting ? t('gps.submitting') : t('gps.submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
