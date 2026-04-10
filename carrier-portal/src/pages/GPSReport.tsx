import { useState } from 'react'
import { MapPin, Send } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'

const statusOptions = [
  { value: 'LOADING', label: '装货中' },
  { value: 'IN_TRANSIT', label: '运输中' },
  { value: 'BORDER_CROSSING', label: '过境中' },
  { value: 'CUSTOMS', label: '清关中' },
  { value: 'UNLOADING', label: '卸货中' },
  { value: 'DELIVERED', label: '已送达' },
]

export default function GPSReport() {
  const [orderId, setOrderId] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [status, setStatus] = useState('IN_TRANSIT')
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderId || !city.trim() || !country.trim()) {
      setMessage('请填写必要信息（运输任务、城市、国家）')
      return
    }

    setSubmitting(true)
    setMessage('')
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
        setMessage('GPS 位置上报成功')
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
      setMessage('上报失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">GPS 上报</h1>

      <div className="max-w-xl">
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <div className="flex items-center gap-2 mb-5">
            <MapPin className="w-5 h-5 text-green-600" />
            <h2 className="text-sm font-semibold text-slate-900">手动上报位置</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {message && (
              <div className={`text-sm px-4 py-3 rounded-xl ${message.includes('成功') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                {message}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">运输任务ID *</label>
              <input
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="输入关联的订单ID"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">城市 *</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="例: Hamburg"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">国家 *</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="例: Germany"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">纬度</label>
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="例: 53.5511"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">经度</label>
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="例: 9.9937"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">状态</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">备注</label>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="可选备注信息"
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
              {submitting ? '提交中...' : '上报位置'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
