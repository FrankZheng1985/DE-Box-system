import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, Truck, CheckCircle, AlertTriangle } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { getStatusLabel, getStatusStyle } from '../constants/businessTypes'

interface DashboardStats {
  totalOrders: number
  inTransit: number
  completed: number
  abnormal: number
}

interface RecentOrder {
  id: string
  orderNo: string
  route: string
  status: string
  createdAt: string
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats>({ totalOrders: 0, inTransit: 0, completed: 0, abnormal: 0 })
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const res = await api.get<ApiResponse<any>>('/dashboard/client')
      if (res.code === 200 && res.data) {
        const s = res.data.stats || res.data
        setStats({
          totalOrders: Number(s.total_orders || s.totalOrders || 0),
          inTransit: Number(s.in_transit || s.inTransit || 0),
          completed: Number(s.completed || 0),
          abnormal: Number(s.exceptions || s.abnormal || 0),
        })
        setRecentOrders(res.data.recentOrders || [])
      }
    } catch (err) {
      console.error('加载仪表板数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    { label: '总订单', value: stats.totalOrders, icon: Package, color: 'bg-blue-100 text-blue-700' },
    { label: '运输中', value: stats.inTransit, icon: Truck, color: 'bg-amber-100 text-amber-700' },
    { label: '已完成', value: stats.completed, icon: CheckCircle, color: 'bg-green-100 text-green-700' },
    { label: '异常', value: stats.abnormal, icon: AlertTriangle, color: 'bg-red-100 text-red-700' },
  ]

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-16 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-12" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-500">{card.label}</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.color}`}>
                <card.icon className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{card.value}</div>
          </div>
        ))}
      </div>

      {/* 最近订单 */}
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-slate-900">最近订单</h2>
          <button
            onClick={() => navigate('/orders')}
            className="text-xs text-primary-600 hover:text-primary-700"
          >
            查看全部
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[25%]" />
              <col className="w-[30%]" />
              <col className="w-[20%]" />
              <col className="w-[25%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-slate-500 border-b border-gray-100">
                <th className="text-left px-4 py-2 font-medium">订单号</th>
                <th className="text-left px-4 py-2 font-medium">路线</th>
                <th className="text-center px-4 py-2 font-medium">状态</th>
                <th className="text-center px-4 py-2 font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-sm text-slate-400">
                    暂无订单数据
                  </td>
                </tr>
              ) : (
                recentOrders.map((order: any) => {
                  return (
                  <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/orders`)}>
                    <td className="text-left px-4 py-2.5 text-xs font-medium text-primary-600">
                      {order.order_number || order.orderNo || '-'}
                    </td>
                    <td className="text-left px-4 py-2.5 text-xs text-slate-600">
                      {order.from_city || '-'} → {order.to_city || '-'}
                    </td>
                    <td className="text-center px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ${getStatusStyle(order.status)}`}>
                        {getStatusLabel(order.business_type, order.status)}
                      </span>
                    </td>
                    <td className="text-center px-4 py-2.5 text-xs text-slate-500">
                      {order.created_at ? new Date(order.created_at).toLocaleDateString('zh-CN') : '-'}
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
