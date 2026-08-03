import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package,
  Truck,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  Clock,
  Send,
  CreditCard,
  FileText,
  ChevronRight,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import api from '../utils/api'
import { formatMoney } from '../utils/format'
import { getBusinessTypeLabel, getStatusLabel } from '../constants/businessTypes'

// Dashboard API 返回的数据结构
interface DashboardData {
  stats: {
    todayNew: number
    /** 今日新增 - 昨日新增，可能为负 */
    todayVsYesterday: number
    inTransit: number
    /** 在途且 3 天内预计到达 */
    arrivingSoon: number
    /** 在途但已超过预计到达日 */
    overdueInTransit: number
    monthCompleted: number
    /** 本月完成 / 本月新建，百分比 */
    monthCompletionRate: number
    exceptions: number
    monthRevenue: number
    profitMargin: number
  }
  statusDistribution: Array<{ status: string; count: number | string }>
  pendingItems: {
    pendingReview: number
    pendingAssign: number
    exceptions: number
    /** 未结清应收笔数（原来这里显示的是写死的「2 个账单待确认」） */
    unpaidReceivables: number
    /** 30 天内资质到期的承运商数，口径同 cron 的资质到期提醒 */
    expiringCarriers: number
  }
  recentOrders: Array<{
    id: string
    order_number: string
    business_type: string
    status: string
    client_name: string
    carrier_name: string
    from_city: string
    to_city: string
    client_price: number
    currency: string
    created_at: string
  }>
}

/** 带正负号的差值，0 和正数显示 +N，负数显示 -N */
function formatSignedDelta(value: number): string {
  return value >= 0 ? `+${value}` : String(value)
}

// 业务类型名统一用共享常量（旧版这里放的是 FTL/LTL 运输类型值，
// 拿去匹配 business_type 永远对不上，列表一直显示原始英文）

export default function Dashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchDashboard()
  }, [])

  const fetchDashboard = async () => {
    try {
      setLoading(true)
      const res = await api.get<{ code: number; data: DashboardData }>('/dashboard/operator')
      if (res.data) {
        setData(res.data)
      }
    } catch (err: any) {
      console.error('获取仪表板数据失败:', err)
      setError(err.message || t('common.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  // 加载骨架屏
  if (loading) {
    return <DashboardSkeleton />
  }

  // 错误状态
  if (error) {
    return (
      <div className="p-4 lg:p-6">
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
          {error}
          <button
            onClick={fetchDashboard}
            className="ml-3 underline hover:no-underline"
          >
            {t('dashboard.retry')}
          </button>
        </div>
      </div>
    )
  }

  const stats = data?.stats
  const recentOrders = data?.recentOrders || []
  const pending = data?.pendingItems

  // 待处理事项列表
  const todoItems = [
    {
      text: t('dashboard.todoPendingReview', { count: pending?.pendingReview || 0 }),
      icon: Clock,
      color: '#F59E0B',
      onClick: () => navigate('/orders?status=PENDING_REVIEW'),
    },
    {
      text: t('dashboard.todoPendingAssign', { count: pending?.pendingAssign || 0 }),
      icon: Send,
      color: '#F97316',
      onClick: () => navigate('/orders?status=PENDING_ASSIGN'),
    },
    {
      text: t('dashboard.todoExceptions', { count: pending?.exceptions || 0 }),
      icon: AlertTriangle,
      color: '#EF4444',
      onClick: () => navigate('/orders?status=EXCEPTION'),
    },
    {
      text: t('dashboard.todoUnpaidReceivables', { count: pending?.unpaidReceivables || 0 }),
      icon: CreditCard,
      color: '#8B5CF6',
      onClick: () => navigate('/finance'),
    },
    {
      text: t('dashboard.todoCarrierExpiring', { count: pending?.expiringCarriers || 0 }),
      icon: FileText,
      color: '#3B82F6',
      onClick: () => navigate('/carriers'),
    },
  ]

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t('dashboard.pageTitle')}</h1>
      </div>

      {/* 统计卡片 - 5个一行 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title={t('dashboard.cardTodayNew')}
          value={stats?.todayNew ?? 0}
          subtitle={t('dashboard.cardTodayNewSub', {
            delta: formatSignedDelta(stats?.todayVsYesterday ?? 0),
          })}
          icon={Package}
          iconColor="#4472C4"
          iconBg="rgba(68,114,196,0.1)"
        />
        <StatCard
          title={t('dashboard.cardInTransit')}
          value={stats?.inTransit ?? 0}
          // 有逾期未到的就先报这个 —— 比「即将到达」更需要人立刻处理
          subtitle={
            (stats?.overdueInTransit ?? 0) > 0
              ? t('dashboard.cardInTransitOverdue', { count: stats?.overdueInTransit ?? 0 })
              : t('dashboard.cardInTransitSub', { count: stats?.arrivingSoon ?? 0 })
          }
          icon={Truck}
          iconColor="#F97316"
          iconBg="rgba(249,115,22,0.1)"
        />
        <StatCard
          title={t('dashboard.cardMonthCompleted')}
          value={stats?.monthCompleted ?? 0}
          subtitle={t('dashboard.cardMonthCompletedSub', {
            rate: Number(stats?.monthCompletionRate ?? 0).toFixed(1),
          })}
          icon={CheckCircle}
          iconColor="#10B981"
          iconBg="rgba(16,185,129,0.1)"
        />
        <StatCard
          title={t('dashboard.cardExceptions')}
          value={stats?.exceptions ?? 0}
          subtitle={t('dashboard.cardExceptionsSub')}
          icon={AlertTriangle}
          iconColor="#EF4444"
          iconBg="rgba(239,68,68,0.1)"
        />
        <StatCard
          title={t('dashboard.cardMonthRevenue')}
          value={stats?.monthRevenue ? `€${Math.round(stats.monthRevenue / 1000)}K` : '€0'}
          subtitle={t('dashboard.cardMonthRevenueSub', { rate: stats?.profitMargin ?? 0 })}
          icon={DollarSign}
          iconColor="#1F4E79"
          iconBg="rgba(31,78,121,0.1)"
        />
      </div>

      {/* 中间区域：订单状态分布 + 待处理事项 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 左侧：订单状态分布（占2列） */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-sm font-semibold text-slate-900 mb-4">{t('dashboard.statusChartTitle')}</div>
          <div className="flex items-end justify-around gap-4 h-48">
            {(data?.statusDistribution || []).map((item, idx) => {
              // count 是 BIGINT，后端返回字符串（踩坑 002），先转数字再算高度
              const maxCount = Math.max(
                ...(data?.statusDistribution || []).map((s) => Number(s.count) || 0),
                1
              )
              const heightPercent = (Number(item.count) || 0) / maxCount * 100
              const colors = ['#F59E0B', '#3B82F6', '#F97316', '#8B5CF6', '#4472C4', '#10B981']
              const color = colors[idx % colors.length]
              return (
                <div key={item.status} className="flex flex-col items-center gap-2 flex-1">
                  <div className="w-full flex flex-col items-center justify-end h-28">
                    <div
                      className="w-10 rounded-t-md transition-all duration-300"
                      style={{
                        backgroundColor: color,
                        height: `${Math.max(heightPercent, 8)}%`,
                      }}
                    />
                  </div>
                  <div className="text-base font-bold" style={{ color }}>{Number(item.count) || 0}</div>
                  <div className="text-xs text-slate-500">
                    {t(`truckStatus.${item.status}`, { defaultValue: item.status })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 右侧：待处理事项 */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-sm font-semibold text-slate-900 mb-4">{t('dashboard.todoTitle')}</div>
          <div className="space-y-0">
            {todoItems.map((item, idx) => (
              <div
                key={idx}
                onClick={item.onClick}
                className="flex items-center gap-2.5 py-2.5 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-slate-50/50 -mx-2 px-2 rounded transition-colors"
              >
                <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: item.color }} />
                <span className="flex-1 text-sm text-slate-700">{item.text}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 最近订单表格 */}
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm font-semibold text-slate-900">{t('dashboard.recentOrders')}</span>
          <button
            onClick={() => navigate('/orders')}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('common.viewAll')}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[22%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="bg-gray-50/80">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b-2 border-gray-200">
                  {t('common.orderNo')}
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b-2 border-gray-200">
                  {t('common.client')}
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b-2 border-gray-200">
                  {t('common.route')}
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider border-b-2 border-gray-200">
                  {t('common.status')}
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider border-b-2 border-gray-200">
                  {t('common.type')}
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider border-b-2 border-gray-200">
                  {t('common.amount')}
                </th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.slice(0, 5).map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                >
                  <td className="px-3 py-2.5 text-sm font-medium border-b border-gray-50">
                    <button
                      onClick={() => navigate(`/orders/${order.id}`)}
                      className="text-blue-600 hover:text-blue-800 hover:underline text-left"
                      title={order.order_number}
                    >
                      {order.order_number}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-700 border-b border-gray-50 truncate">
                    {order.client_name}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 border-b border-gray-50 truncate">
                    {order.from_city} → {order.to_city}
                  </td>
                  <td className="px-3 py-2.5 text-center border-b border-gray-50">
                    <StatusBadge status={order.status} label={getStatusLabel(t, order.business_type, order.status)} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-center text-slate-600 border-b border-gray-50">
                    {getBusinessTypeLabel(t, order.business_type)}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-right font-medium text-slate-900 border-b border-gray-50">
                    {formatMoney(order.client_price, order.currency)}
                  </td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">
                    {t('order.emptyTitle')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// 骨架屏组件
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* 标题骨架 */}
      <div>
        <div className="h-7 w-32 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* 统计卡片骨架 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse" />
            <div className="space-y-2 flex-1">
              <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
              <div className="h-6 w-12 bg-gray-200 rounded animate-pulse" />
              <div className="h-2.5 w-20 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      {/* 中间区域骨架 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="flex items-end justify-around gap-4 h-48">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2 flex-1">
                <div className="w-full flex flex-col items-center justify-end h-28">
                  <div
                    className="w-10 rounded-t-md bg-gray-100 animate-pulse"
                    style={{ height: `${30 + Math.random() * 50}%` }}
                  />
                </div>
                <div className="h-4 w-6 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 w-10 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 py-2">
                <div className="w-4 h-4 bg-gray-100 rounded animate-pulse" />
                <div className="h-3.5 flex-1 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 表格骨架 */}
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
          <div className="h-7 w-20 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="px-5 pb-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2">
              <div className="h-3.5 w-28 bg-gray-100 rounded animate-pulse" />
              <div className="h-3.5 w-24 bg-gray-100 rounded animate-pulse" />
              <div className="h-3.5 w-36 bg-gray-100 rounded animate-pulse" />
              <div className="h-5 w-14 bg-gray-100 rounded-full animate-pulse" />
              <div className="h-3.5 w-10 bg-gray-100 rounded animate-pulse" />
              <div className="h-3.5 w-16 bg-gray-100 rounded animate-pulse ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
