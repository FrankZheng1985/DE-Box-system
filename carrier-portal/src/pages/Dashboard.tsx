import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Truck, CheckCircle, Euro, ArrowRight } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'

interface DashboardStats {
  pendingCount: number
  inTransitCount: number
  monthlyCompleted: number
  monthlyRevenue: number
}

interface TaskItem {
  id: string
  orderNo: string
  route: string
  status: string
  createdAt: string
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats>({
    pendingCount: 0,
    inTransitCount: 0,
    monthlyCompleted: 0,
    monthlyRevenue: 0,
  })
  const [pendingTasks, setPendingTasks] = useState<TaskItem[]>([])
  const [activeTasks, setActiveTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboard()
  }, [])

  const fetchDashboard = async () => {
    try {
      const res = await api.get<ApiResponse<any>>('/dashboard/carrier')
      if (res.code === 200 && res.data) {
        const s = res.data.stats || {}
        setStats({
          pendingCount: parseInt(s.pending_accept || s.pendingCount || 0),
          inTransitCount: parseInt(s.in_transit || s.inTransitCount || 0),
          monthlyCompleted: parseInt(s.month_completed || s.monthlyCompleted || 0),
          monthlyRevenue: parseFloat(s.month_earnings || s.monthlyRevenue || 0),
        })
        setPendingTasks((res.data.pendingTasks || []).map((t: any) => ({
          id: t.id, orderNo: t.order_number || t.orderNo, route: `${t.from_city || '?'} → ${t.to_city || '?'}`,
          status: t.status, createdAt: t.pickup_date || t.createdAt
        })))
        setActiveTasks((res.data.activeTasks || []).map((t: any) => ({
          id: t.id, orderNo: t.order_number || t.orderNo, route: `${t.from_city || '?'} → ${t.to_city || '?'}`,
          status: t.status, createdAt: t.created_at || t.createdAt
        })))
      }
    } catch (error) {
      console.error('获取仪表盘数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    { label: '待接单', value: stats.pendingCount, icon: ClipboardList, color: 'amber' },
    { label: '运输中', value: stats.inTransitCount, icon: Truck, color: 'blue' },
    { label: '本月完成', value: stats.monthlyCompleted, icon: CheckCircle, color: 'green' },
    { label: '本月收入', value: `€${stats.monthlyRevenue.toLocaleString()}`, icon: Euro, color: 'purple' },
  ]

  const colorMap: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-5 animate-pulse h-28" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">概览</h1>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{card.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{card.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[card.color]}`}>
                <card.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 待接单 & 运输中 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 待接单 */}
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">待接单</h2>
            <button
              onClick={() => navigate('/tasks')}
              className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
            >
              查看全部 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="p-5 space-y-3">
            {pendingTasks.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">暂无待接单任务</p>
            ) : (
              pendingTasks.slice(0, 5).map((task) => (
                <div key={task.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{task.orderNo}</p>
                    <p className="text-xs text-slate-500">{task.route}</p>
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-lg">待接单</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 运输中 */}
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">运输中</h2>
            <button
              onClick={() => navigate('/tasks')}
              className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
            >
              查看全部 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="p-5 space-y-3">
            {activeTasks.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">暂无运输中任务</p>
            ) : (
              activeTasks.slice(0, 5).map((task) => (
                <div key={task.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{task.orderNo}</p>
                    <p className="text-xs text-slate-500">{task.route}</p>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-lg">运输中</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
