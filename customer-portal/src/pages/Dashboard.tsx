import { useAuth } from '../contexts/AuthContext'
import { Package, Truck, CheckCircle, Clock } from 'lucide-react'

export default function Dashboard() {
  const { user } = useAuth()

  const stats = [
    { label: '全部订单', value: '0', icon: Package, color: 'bg-blue-500' },
    { label: '运输中', value: '0', icon: Truck, color: 'bg-yellow-500' },
    { label: '已完成', value: '0', icon: CheckCircle, color: 'bg-green-500' },
    { label: '待处理', value: '0', icon: Clock, color: 'bg-gray-500' },
  ]

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold">
          欢迎回来，{user?.name || user?.username}！
        </h1>
        <p className="text-primary-100 mt-1">
          这里是您的物流服务概览
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl p-5 shadow-sm border border-gray-100"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {stat.value}
                </p>
              </div>
              <div className={`${stat.color} p-3 rounded-xl`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">最近订单</h2>
        </div>
        <div className="p-8 text-center text-gray-500">
          <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p>暂无订单数据</p>
        </div>
      </div>
    </div>
  )
}
