import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Search, RefreshCw, FolderOpen, X, Download, FileText, Upload } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { formatMoney, formatNumber, formatDate, formatDateTime } from '../utils/format'
import { BUSINESS_TYPES, getStatusLabel, getStatusStyle } from '../constants/businessTypes'
import OrderImportModal from '../components/OrderImportModal'

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

interface Order {
  id: string
  order_number: string
  customer_ref: string | null
  business_type: string
  pickup_city: string
  pod: string | null
  final_destination: string | null
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

/**
 * 路线取值：集装箱单的两头是「卸货港 → 最终目的地」，不是装卸货城市
 * （集装箱单能填提柜地点之后，读 pickup_city 会显示成「Hamburg → -」）
 */
function routeFrom(order: Order): string {
  const value = order.business_type === BUSINESS_TYPES.TRUCK_FTL
    ? order.pod || order.pickup_city
    : order.pickup_city
  return value || '-'
}

function routeTo(order: Order): string {
  const value = order.business_type === BUSINESS_TYPES.TRUCK_FTL
    ? order.final_destination || order.delivery_city
    : order.delivery_city
  return value || '-'
}

export default function MyOrders() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [notice, setNotice] = useState('')
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
              placeholder={t('orders.searchPlaceholder')}
              className="pl-8 pr-3 h-8 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none w-48"
            />
          </div>
          <button onClick={handleSearch} className="h-8 px-3 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 transition-colors">
            {t('common.search')}
          </button>
          <button onClick={loadOrders} className="h-8 px-2 text-slate-500 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission('portal:order_import') && (
            <button
              onClick={() => { setNotice(''); setShowImport(true) }}
              className="h-8 px-3 text-xs text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-200 ease-in-out flex items-center gap-1"
            >
              <Upload className="w-4 h-4" />
              {t('orderImport.entry')}
            </button>
          )}
          <button
            onClick={() => navigate('/orders/create')}
            className="h-8 px-3 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            {t('nav.createOrder')}
          </button>
        </div>
      </div>

      {notice && (
        <div className="px-3 py-2 bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg">
          {notice}
        </div>
      )}

      {showImport && (
        <OrderImportModal
          onClose={() => setShowImport(false)}
          onImported={(count) => {
            setShowImport(false)
            setNotice(t('orderImport.successNotice', { count }))
            loadOrders()
          }}
        />
      )}

      {/* 表格 */}
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[900px]">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[11%]" />
              <col className="w-[13%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-slate-500 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 font-medium">{t('common.orderNo')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('orders.customerRef')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('common.route')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.status')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.type')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('orders.trackingNo')}</th>
                <th className="text-right px-3 py-2.5 font-medium">{t('orders.weightKg')}</th>
                <th className="text-right px-3 py-2.5 font-medium">{t('orders.price')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('orders.eta')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.createdAt')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.files')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-3 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-8 text-sm text-slate-400">
                    {t('orders.empty')}
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
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate" title={order.customer_ref || undefined}>
                        {order.customer_ref || '-'}
                      </td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">
                        {routeFrom(order)} → {routeTo(order)}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ${getStatusStyle(order.status)}`}>
                          {getStatusLabel(t, order.business_type, order.status)}
                        </span>
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-600">
                        {isLocal ? t('businessType.LOCAL_DELIVERY') : order.transport_type || t('common.empty')}
                      </td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 font-mono truncate" title={order.tracking_number || undefined}>
                        {order.tracking_number || '-'}
                      </td>
                      <td className="text-right px-3 py-2.5 text-xs text-slate-600">
                        {order.cargo_weight_kg ? formatNumber(order.cargo_weight_kg) : t('common.empty')}
                      </td>
                      <td className="text-right px-3 py-2.5 text-xs text-slate-600">
                        {order.client_price ? formatMoney(order.client_price, order.currency || 'EUR') : t('common.empty')}
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                        {formatDate(order.delivery_date)}
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <button
                          onClick={() => openFilesModal(order)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                          title={t('orders.viewFiles')}
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
            <span className="text-xs text-slate-500">{t('common.totalCount', { count: total })}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-50"
              >
                {t('common.prevPage')}
              </button>
              <span className="text-xs text-slate-600 px-2">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-50"
              >
                {t('common.nextPage')}
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
                {t('orders.filesTitle')} · {filesOrder.order_number}
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
                  <p className="text-sm text-slate-400">{t('orders.noFiles')}</p>
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
                            {t(`fileCategory.${file.file_category}`, { defaultValue: file.file_category })}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {formatDateTime(file.uploaded_at)}
                        </p>
                      </div>
                      <a
                        href={file.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 text-xs text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {t('common.download')}
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
