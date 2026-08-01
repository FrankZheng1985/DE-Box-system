import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, RefreshCw } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'

interface Order {
  id: string
  order_number: string
  pickup_city: string
  delivery_city: string
  status: string
  transport_type: string
  cargo_weight_kg: number
  client_price: number
  currency: string
  delivery_date: string
  created_at: string
}

const statusMap: Record<string, { label: string; style: string }> = {
  pending: { label: '待处理', style: 'bg-gray-100 text-gray-600' },
  confirmed: { label: '已确认', style: 'bg-blue-100 text-blue-700' },
  in_transit: { label: '运输中', style: 'bg-amber-100 text-amber-700' },
  delivered: { label: '已送达', style: 'bg-green-100 text-green-700' },
  completed: { label: '已完成', style: 'bg-green-100 text-green-700' },
  cancelled: { label: '已取消', style: 'bg-red-100 text-red-700' },
}

export default function MyOrders() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  useEffect(() => {
    loadOrders()
  }, [page])

  const loadOrders = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (keyword) params.set('keyword', keyword)
      const res = await api.get<ApiResponse<Order[]>>(`/orders?${params}`)
      if (res.code === 200) {
        setOrders(res.data || [])
        setTotal(res.pagination?.total || 0)
      }
    } catch (err) {
      console.error('加载订单失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    setPage(1)
    loadOrders()
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="搜索订单号..."
              className="pl-8 pr-3 h-8 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none w-48"
            />
          </div>
          <button onClick={handleSearch} className="h-8 px-3 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 transition-colors">
            搜索
          </button>
          <button onClick={loadOrders} className="h-8 px-2 text-slate-500 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={() => navigate('/orders/create')}
          className="h-8 px-3 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          新建订单
        </button>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[700px]">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[20%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-slate-500 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 font-medium">订单号</th>
                <th className="text-left px-3 py-2.5 font-medium">路线</th>
                <th className="text-center px-3 py-2.5 font-medium">状态</th>
                <th className="text-center px-3 py-2.5 font-medium">类型</th>
                <th className="text-right px-3 py-2.5 font-medium">重量(kg)</th>
                <th className="text-right px-3 py-2.5 font-medium">报价</th>
                <th className="text-center px-3 py-2.5 font-medium">预计到达</th>
                <th className="text-center px-3 py-2.5 font-medium">创建日期</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-3 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-sm text-slate-400">
                    暂无订单数据
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const statusKey = (order.status || '').toLowerCase()
                  const st = statusMap[statusKey] || { label: order.status, style: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="text-left px-3 py-2.5 text-xs font-medium text-primary-600">
                        {order.order_number || '-'}
                      </td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">
                        {order.pickup_city || '-'} → {order.delivery_city || '-'}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ${st.style}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-600">
                        {order.transport_type || '-'}
                      </td>
                      <td className="text-right px-3 py-2.5 text-xs text-slate-600">
                        {order.cargo_weight_kg ? Number(order.cargo_weight_kg).toLocaleString() : '-'}
                      </td>
                      <td className="text-right px-3 py-2.5 text-xs text-slate-600">
                        {order.client_price ? `${order.currency || 'EUR'} ${Number(order.client_price).toLocaleString()}` : '-'}
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                        {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('zh-CN') : '-'}
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                        {order.created_at ? new Date(order.created_at).toLocaleDateString('zh-CN') : '-'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-slate-500">共 {total} 条</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-50"
              >
                上一页
              </button>
              <span className="text-xs text-slate-600 px-2">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
