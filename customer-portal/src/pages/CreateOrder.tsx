import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'

export default function CreateOrder() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    origin: '',
    destination: '',
    transportType: 'FTL',
    cargoDescription: '',
    totalWeight: '',
    totalVolume: '',
    packageCount: '',
    pickupDate: '',
    deliveryDate: '',
    specialRequirements: '',
    contactName: '',
    contactPhone: '',
  })

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.origin || !form.destination) {
      setError('请填写起运地和目的地')
      return
    }

    setLoading(true)
    setError('')

    try {
      const payload = {
        ...form,
        totalWeight: form.totalWeight ? Number(form.totalWeight) : undefined,
        totalVolume: form.totalVolume ? Number(form.totalVolume) : undefined,
        packageCount: form.packageCount ? Number(form.packageCount) : undefined,
      }
      const res = await api.post<ApiResponse<any>>('/orders', payload)
      if (res.code === 200 || res.code === 201) {
        setSuccess(true)
        setTimeout(() => navigate('/orders'), 1500)
      } else {
        setError(res.message || '创建失败')
      }
    } catch (err: any) {
      setError(err.message || '创建订单失败')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <Save className="w-6 h-6 text-green-600" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">订单创建成功</h2>
        <p className="text-sm text-slate-500">正在跳转...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* 顶部 */}
      <button
        onClick={() => navigate('/orders')}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-4 h-4" />
        返回订单列表
      </button>

      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">新建运输订单</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-xs mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 路线信息 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">起运地 *</label>
              <input
                type="text"
                value={form.origin}
                onChange={(e) => handleChange('origin', e.target.value)}
                placeholder="如：上海"
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">目的地 *</label>
              <input
                type="text"
                value={form.destination}
                onChange={(e) => handleChange('destination', e.target.value)}
                placeholder="如：汉堡"
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* 运输类型 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">运输类型</label>
            <select
              value={form.transportType}
              onChange={(e) => handleChange('transportType', e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none bg-white"
            >
              <option value="FTL">整车 (FTL)</option>
              <option value="LTL">拼车 (LTL)</option>
              <option value="FCL">整箱 (FCL)</option>
              <option value="LCL">拼箱 (LCL)</option>
            </select>
          </div>

          {/* 货物信息 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">货物描述</label>
            <textarea
              value={form.cargoDescription}
              onChange={(e) => handleChange('cargoDescription', e.target.value)}
              placeholder="请描述货物类型、名称等信息"
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">总重量 (kg)</label>
              <input
                type="number"
                value={form.totalWeight}
                onChange={(e) => handleChange('totalWeight', e.target.value)}
                placeholder="0"
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">总体积 (m3)</label>
              <input
                type="number"
                value={form.totalVolume}
                onChange={(e) => handleChange('totalVolume', e.target.value)}
                placeholder="0"
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">件数</label>
              <input
                type="number"
                value={form.packageCount}
                onChange={(e) => handleChange('packageCount', e.target.value)}
                placeholder="0"
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* 日期 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">期望提货日期</label>
              <input
                type="date"
                value={form.pickupDate}
                onChange={(e) => handleChange('pickupDate', e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">期望交付日期</label>
              <input
                type="date"
                value={form.deliveryDate}
                onChange={(e) => handleChange('deliveryDate', e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* 联系人 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">联系人姓名</label>
              <input
                type="text"
                value={form.contactName}
                onChange={(e) => handleChange('contactName', e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">联系电话</label>
              <input
                type="tel"
                value={form.contactPhone}
                onChange={(e) => handleChange('contactPhone', e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* 特殊要求 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">特殊要求</label>
            <textarea
              value={form.specialRequirements}
              onChange={(e) => handleChange('specialRequirements', e.target.value)}
              placeholder="如有特殊要求请在此说明"
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          {/* 提交按钮 */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => navigate('/orders')}
              className="h-9 px-4 text-xs text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="h-9 px-4 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              提交订单
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
