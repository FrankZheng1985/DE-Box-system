import { useState, useEffect } from 'react'
import { Plus, RefreshCw, Send, X } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS, type BusinessType } from '../constants/businessTypes'

interface Inquiry {
  id: string
  inquiry_number: string
  route_from: any
  route_to: any
  cargo_description: string
  status: string
  currency: string
  created_at: string
}

const statusMap: Record<string, { label: string; style: string }> = {
  pending_quote: { label: '待报价', style: 'bg-gray-100 text-gray-600' },
  pending: { label: '待报价', style: 'bg-gray-100 text-gray-600' },
  quoted: { label: '已报价', style: 'bg-blue-100 text-blue-700' },
  accepted: { label: '已接受', style: 'bg-green-100 text-green-700' },
  rejected: { label: '已拒绝', style: 'bg-red-100 text-red-700' },
  expired: { label: '已过期', style: 'bg-gray-100 text-gray-500' },
}

export default function InquiryList() {
  const { user } = useAuth()
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    businessType: BUSINESS_TYPES.TRUCK_LTL as BusinessType,
    origin: '',
    destination: '',
    cargoType: '',
    totalWeight: '',
    description: '',
  })

  useEffect(() => {
    loadInquiries()
  }, [])

  const loadInquiries = async () => {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<Inquiry[]>>('/inquiries')
      if (res.code === 200) {
        setInquiries(res.data || [])
      }
    } catch (err) {
      console.error('加载询价列表失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.origin || !form.destination) return

    setSubmitting(true)
    try {
      const res = await api.post<ApiResponse<any>>('/inquiries', {
        clientId: user?.linkedEntityId,
        businessType: form.businessType,
        transportType: form.businessType === BUSINESS_TYPES.LOCAL_DELIVERY ? null : 'FTL',
        routeFrom: { city: form.origin },
        routeTo: { city: form.destination },
        cargoDescription: form.cargoType || form.description,
        cargoWeightKg: form.totalWeight ? Number(form.totalWeight) : null,
        remarks: form.description,
      })
      if (res.code === 200 || res.code === 201) {
        setShowCreate(false)
        setForm({ businessType: BUSINESS_TYPES.TRUCK_LTL, origin: '', destination: '', cargoType: '', totalWeight: '', description: '' })
        loadInquiries()
      }
    } catch (err) {
      console.error('创建询价失败:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <button onClick={loadInquiries} className="h-8 px-2 text-slate-500 hover:bg-gray-100 rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowCreate(true)}
          className="h-8 px-3 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          新建询价
        </button>
      </div>

      {/* 新建询价弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">新建询价</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">服务类型 *</label>
                <select
                  value={form.businessType}
                  onChange={(e) => setForm(f => ({ ...f, businessType: e.target.value as BusinessType }))}
                  className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  {(Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[]).map((t) => (
                    <option key={t} value={t}>{BUSINESS_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">起运地 *</label>
                  <input
                    type="text"
                    value={form.origin}
                    onChange={(e) => setForm(f => ({ ...f, origin: e.target.value }))}
                    className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">目的地 *</label>
                  <input
                    type="text"
                    value={form.destination}
                    onChange={(e) => setForm(f => ({ ...f, destination: e.target.value }))}
                    className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">货物类型</label>
                  <input
                    type="text"
                    value={form.cargoType}
                    onChange={(e) => setForm(f => ({ ...f, cargoType: e.target.value }))}
                    className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">总重量 (kg)</label>
                  <input
                    type="number"
                    value={form.totalWeight}
                    onChange={(e) => setForm(f => ({ ...f, totalWeight: e.target.value }))}
                    className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">描述</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="h-8 px-3 text-xs text-slate-600 border border-gray-200 rounded-lg">
                  取消
                </button>
                <button type="submit" disabled={submitting} className="h-8 px-3 bg-primary-600 text-white text-xs rounded-lg flex items-center gap-1 disabled:opacity-50">
                  <Send className="w-3.5 h-3.5" />
                  提交询价
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 列表 */}
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[600px]">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[25%]" />
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[15%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-slate-500 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 font-medium">询价编号</th>
                <th className="text-left px-3 py-2.5 font-medium">路线</th>
                <th className="text-left px-3 py-2.5 font-medium">货物类型</th>
                <th className="text-center px-3 py-2.5 font-medium">状态</th>
                <th className="text-right px-3 py-2.5 font-medium">报价</th>
                <th className="text-center px-3 py-2.5 font-medium">创建日期</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : inquiries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-sm text-slate-400">暂无询价记录</td>
                </tr>
              ) : (
                inquiries.map((item) => {
                  const statusKey = (item.status || '').toLowerCase()
                  const st = statusMap[statusKey] || { label: item.status, style: 'bg-gray-100 text-gray-600' }
                  const fromCity = typeof item.route_from === 'object' ? item.route_from?.city : item.route_from
                  const toCity = typeof item.route_to === 'object' ? item.route_to?.city : item.route_to
                  return (
                    <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="text-left px-3 py-2.5 text-xs font-medium text-slate-900">{item.inquiry_number || '-'}</td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600">{fromCity || '-'} → {toCity || '-'}</td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600">{item.cargo_description || '-'}</td>
                      <td className="text-center px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ${st.style}`}>{st.label}</span>
                      </td>
                      <td className="text-right px-3 py-2.5 text-xs text-slate-600">-</td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString('zh-CN') : '-'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
