import { useState, useEffect } from 'react'
import { Truck, Check, X, RefreshCw } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'

interface Order {
  id: string
  orderNo: string
  originCity: string
  destinationCity: string
  containerType: string
  weight: number
  status: string
  createdAt: string
}

const tabs = [
  { key: 'all', label: '全部' },
  { key: 'ASSIGNED', label: '待接单' },
  { key: 'IN_TRANSIT', label: '执行中' },
  { key: 'DELIVERED', label: '已完成' },
]

const statusMap: Record<string, { label: string; className: string }> = {
  ASSIGNED: { label: '待接单', className: 'bg-amber-100 text-amber-700' },
  ACCEPTED: { label: '已接单', className: 'bg-blue-100 text-blue-700' },
  IN_TRANSIT: { label: '运输中', className: 'bg-blue-100 text-blue-700' },
  DELIVERED: { label: '已送达', className: 'bg-green-100 text-green-700' },
  COMPLETED: { label: '已完成', className: 'bg-green-100 text-green-700' },
  REJECTED: { label: '已拒单', className: 'bg-red-100 text-red-700' },
}

export default function TransportTasks() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('all')
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    fetchOrders()
  }, [activeTab])

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (user?.linkedEntityId) params.set('carrierId', user.linkedEntityId)
      if (activeTab !== 'all') params.set('status', activeTab)
      const res = await api.get<ApiResponse<Order[]>>(`/orders?${params.toString()}`)
      if (res.code === 200) {
        setOrders(Array.isArray(res.data) ? res.data : [])
      }
    } catch (error) {
      console.error('获取订单失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async (id: string) => {
    try {
      await api.post<ApiResponse>(`/orders/${id}/accept`)
      fetchOrders()
    } catch (error) {
      console.error('接单失败:', error)
    }
  }

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) return
    try {
      await api.post<ApiResponse>(`/orders/${rejectId}/reject`, { reason: rejectReason })
      setRejectId(null)
      setRejectReason('')
      fetchOrders()
    } catch (error) {
      console.error('拒单失败:', error)
    }
  }

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await api.put<ApiResponse>(`/orders/${id}/delivery-status`, { status })
      fetchOrders()
    } catch (error) {
      console.error('更新状态失败:', error)
    }
  }

  const getStatus = (status: string) => statusMap[status] || { label: status, className: 'bg-gray-100 text-gray-600' }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">运输任务</h1>
        <button onClick={fetchOrders} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-2 border-b border-slate-200 pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-all duration-200 -mb-px
              ${activeTab === tab.key
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-x-auto">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-[15%]" />
            <col className="w-[22%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[29%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">订单号</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">路线</th>
              <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">类型</th>
              <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">重量</th>
              <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">状态</th>
              <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-slate-400">加载中...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-slate-400">暂无数据</td></tr>
            ) : (
              orders.map((order) => {
                const s = getStatus(order.status)
                return (
                  <tr key={order.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="text-left text-xs text-slate-900 px-4 py-3 font-medium">{order.orderNo}</td>
                    <td className="text-left text-xs text-slate-600 px-4 py-3 truncate">{order.originCity} → {order.destinationCity}</td>
                    <td className="text-center text-xs text-slate-600 px-4 py-3">{order.containerType || '-'}</td>
                    <td className="text-right text-xs text-slate-600 px-4 py-3">{order.weight ? `${order.weight}t` : '-'}</td>
                    <td className="text-center px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-lg ${s.className}`}>{s.label}</span>
                    </td>
                    <td className="text-center px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {order.status === 'ASSIGNED' && (
                          <>
                            <button onClick={() => handleAccept(order.id)} className="text-xs bg-green-50 text-green-600 hover:bg-green-100 px-3 py-1 rounded-lg transition-colors flex items-center gap-1">
                              <Check className="w-3 h-3" /> 接单
                            </button>
                            <button onClick={() => setRejectId(order.id)} className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1 rounded-lg transition-colors flex items-center gap-1">
                              <X className="w-3 h-3" /> 拒单
                            </button>
                          </>
                        )}
                        {(order.status === 'ACCEPTED' || order.status === 'IN_TRANSIT') && (
                          <button
                            onClick={() => handleUpdateStatus(order.id, order.status === 'ACCEPTED' ? 'IN_TRANSIT' : 'DELIVERED')}
                            className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1 rounded-lg transition-colors flex items-center gap-1"
                          >
                            <Truck className="w-3 h-3" />
                            {order.status === 'ACCEPTED' ? '开始运输' : '确认送达'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 拒单弹窗 */}
      {rejectId && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">拒单原因</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请输入拒单原因..."
              className="w-full border border-slate-200 rounded-xl p-3 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setRejectId(null); setRejectReason('') }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">取消</button>
              <button onClick={handleReject} disabled={!rejectReason.trim()} className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50">确认拒单</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
