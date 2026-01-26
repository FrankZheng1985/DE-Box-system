import { 
  Package, 
  Truck, 
  Users, 
  Building2, 
  Wallet, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'

interface StatCard {
  title: string
  value: string
  change: string
  trend: 'up' | 'down'
  icon: React.ComponentType<{ className?: string }>
  color: string
}

const stats: StatCard[] = [
  {
    title: '今日订单',
    value: '128',
    change: '+12%',
    trend: 'up',
    icon: Package,
    color: 'bg-blue-500'
  },
  {
    title: '运输中',
    value: '45',
    change: '+8%',
    trend: 'up',
    icon: Truck,
    color: 'bg-green-500'
  },
  {
    title: '活跃客户',
    value: '256',
    change: '+5%',
    trend: 'up',
    icon: Users,
    color: 'bg-purple-500'
  },
  {
    title: '供应商',
    value: '32',
    change: '+2',
    trend: 'up',
    icon: Building2,
    color: 'bg-orange-500'
  },
  {
    title: '本月收入',
    value: '€125,800',
    change: '+18%',
    trend: 'up',
    icon: Wallet,
    color: 'bg-emerald-500'
  },
  {
    title: '待收款',
    value: '€45,200',
    change: '-5%',
    trend: 'down',
    icon: TrendingUp,
    color: 'bg-red-500'
  },
]

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">系统概览</h1>
        <p className="text-gray-500 mt-1">欢迎使用德国Box运输管理系统</p>
      </div>
      
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className={`p-3 ${stat.color} rounded-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div className={`flex items-center text-sm font-medium ${
                stat.trend === 'up' ? 'text-green-600' : 'text-red-600'
              }`}>
                {stat.change}
                {stat.trend === 'up' ? (
                  <ArrowUpRight className="w-4 h-4 ml-1" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 ml-1" />
                )}
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-500">{stat.title}</h3>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>
      
      {/* 快捷操作 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 最近订单 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">最近订单</h2>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-medium text-gray-900">ORD-2024-{String(item).padStart(4, '0')}</p>
                  <p className="text-sm text-gray-500">客户 {item}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900">€{(Math.random() * 1000).toFixed(2)}</p>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    已完成
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* 运输状态 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">运输状态</h2>
          <div className="space-y-4">
            {[
              { status: '待发货', count: 12, color: 'bg-yellow-100 text-yellow-800' },
              { status: '运输中', count: 45, color: 'bg-blue-100 text-blue-800' },
              { status: '已送达', count: 128, color: 'bg-green-100 text-green-800' },
              { status: '异常', count: 3, color: 'bg-red-100 text-red-800' },
            ].map((item, index) => (
              <div key={index} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${item.color}`}>
                    {item.status}
                  </span>
                </div>
                <span className="text-lg font-semibold text-gray-900">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
