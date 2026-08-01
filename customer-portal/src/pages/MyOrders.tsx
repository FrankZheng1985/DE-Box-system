import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, RefreshCw, FolderOpen, X, Download, FileText } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { BUSINESS_TYPES, getStatusLabel, getStatusStyle } from '../constants/businessTypes'

// 订单文件（与后端 GET /orders/:id/files 统一视图一致）
interface OrderFileItem {
  id: string
  file_category: string
  file_name: string
  file_url: string
  file_type: string
  uploaded_at: string
  sign_status?: string
  source: 'ORDER_FILE' | 'CMR_DOC'
}

const FILE_CATEGORY_LABELS: Record<string, string> = {
  LOADING_PHOTO: '装车图',
  CMR: 'CMR 单据',
  POD_PROOF: '签收凭证',
  OTHER: '其他',
}

interface Order {
  id: string
  order_number: string
  business_type: string
  pickup_city: string
  delivery_city: string
  status: string
  transport_type: string
  cargo_weight_kg: number
  client_price: number
  currency: string
  delivery_date: string
  tracking_number: string | null
  created_at: string
}

export default function MyOrders() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  // 订单文件弹窗
  const [filesOrder, setFilesOrder] = useState<Order | null>(null)
  const [orderFiles, setOrderFiles] = useState<OrderFileItem[]>([])
  const [filesLoading, setFilesLoading] = useState(false)

  const openFilesModal = async (order: Order) => {
    setFilesOrder(order)
    setFilesLoading(true)
    try {
      const res = await api.get<ApiResponse<OrderFileItem[]>>(`/orders/${order.id}/files`)
      setOrderFiles(res.data || [])
    } catch (err) {
      console.error('加载订单文件失败:', err)
      setOrderFiles([])
    } finally {
      setFilesLoading(false)
    }
  }

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
          <table className="w-full table-fixed min-w-[820px]">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[15%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-slate-500 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 font-medium">订单号</th>
                <th className="text-left px-3 py-2.5 font-medium">路线</th>
                <th className="text-center px-3 py-2.5 font-medium">状态</th>
                <th className="text-center px-3 py-2.5 font-medium">类型</th>
                <th className="text-left px-3 py-2.5 font-medium">跟踪号</th>
                <th className="text-right px-3 py-2.5 font-medium">重量(kg)</th>
                <th className="text-right px-3 py-2.5 font-medium">报价</th>
                <th className="text-center px-3 py-2.5 font-medium">预计到达</th>
                <th className="text-center px-3 py-2.5 font-medium">创建日期</th>
                <th className="text-center px-3 py-2.5 font-medium">文件</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-3 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-sm text-slate-400">
                    暂无订单数据
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const isLocal = order.business_type === BUSINESS_TYPES.LOCAL_DELIVERY
                  return (
                    <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="text-left px-3 py-2.5 text-xs font-medium text-primary-600">
                        {order.order_number || '-'}
                      </td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">
                        {order.pickup_city || '-'} → {order.delivery_city || '-'}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ${getStatusStyle(order.status)}`}>
                          {getStatusLabel(order.business_type, order.status)}
                        </span>
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-600">
                        {isLocal ? '本地派送' : order.transport_type || '-'}
                      </td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 font-mono truncate" title={order.tracking_number || undefined}>
                        {order.tracking_number || '-'}
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
                      <td className="text-center px-3 py-2.5">
                        <button
                          onClick={() => openFilesModal(order)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                          title="查看订单文件"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </button>
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

      {/* ===== 订单文件弹窗 ===== */}
      {filesOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setFilesOrder(null) }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-slate-900">
                订单文件 · {filesOrder.order_number}
              </h3>
              <button
                onClick={() => setFilesOrder(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              {filesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : orderFiles.length === 0 ? (
                <div className="py-8 text-center">
                  <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">该订单暂无文件</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orderFiles.map((file) => (
                    <div
                      key={`${file.source}-${file.id}`}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-800 truncate" title={file.file_name}>
                            {file.file_name}
                          </span>
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                            {FILE_CATEGORY_LABELS[file.file_category] || file.file_category}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {file.uploaded_at ? new Date(file.uploaded_at).toLocaleString('zh-CN') : '-'}
                        </p>
                      </div>
                      <a
                        href={file.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 text-xs text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        下载
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
