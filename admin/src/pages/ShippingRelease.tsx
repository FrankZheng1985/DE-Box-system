import { useState, useEffect, useCallback } from 'react'
import {
  Ship, Search, Eye, Edit, ChevronLeft, ChevronRight,
  CheckCircle, Mail, Send, Clock, Ban, RefreshCw,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import Modal from '../components/Modal'

// ==================== 类型定义 ====================

interface ShippingReleaseItem {
  id: string
  order_id: string
  order_no: string
  client_name: string
  shipping_line: string
  bl_number: string
  container_no: string
  release_status: string
  updated_at: string
}

interface ReleaseStats {
  not_required: number
  pending_mail: number
  mailed: number
  pending_release: number
  released: number
}

// ==================== 常量 ====================

const STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'pending_mail', label: '正本待邮寄' },
  { key: 'mailed', label: '正本已邮寄' },
  { key: 'pending_release', label: '待放行' },
  { key: 'released', label: '已放行' },
]

const RELEASE_STATUS_OPTIONS = [
  { value: 'NOT_REQUIRED', label: '无需放单' },
  { value: 'ORIGINAL_PENDING', label: '正本待邮寄' },
  { value: 'ORIGINAL_SENT', label: '正本已邮寄' },
  { value: 'PENDING_RELEASE', label: '待放行' },
  { value: 'RELEASED', label: '已放行' },
]

// ==================== Toast 组件 ====================

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-[fadeIn_200ms_ease-out]">
      <div className="px-6 py-3 bg-green-500 text-white text-sm font-medium rounded-xl shadow-lg">
        {message}
      </div>
    </div>
  )
}

// ==================== 组件 ====================

export default function ShippingRelease() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ShippingReleaseItem[]>([])
  const [stats, setStats] = useState<ReleaseStats>({ not_required: 0, pending_mail: 0, mailed: 0, pending_release: 0, released: 0 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  // Toast 状态
  const [toast, setToast] = useState('')

  // 更新状态 Modal
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [statusTarget, setStatusTarget] = useState<ShippingReleaseItem | null>(null)
  const [statusForm, setStatusForm] = useState({
    releaseStatus: 'NOT_REQUIRED',
    courierService: '',
    courierAddress: '',
    releaseValidUntil: '',
  })
  const [statusSubmitting, setStatusSubmitting] = useState(false)

  // 获取统计
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<ReleaseStats>>('/shipping-releases/stats')
      if (res.code === 200 && res.data) setStats(res.data)
    } catch (err) {
      console.error('获取放单统计失败:', err)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // 获取列表
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<{ items: ShippingReleaseItem[]; pagination: { total: number } }>>(
        `/shipping-releases?status=${statusFilter}&search=${encodeURIComponent(search)}&page=${page}&pageSize=${pageSize}`
      )
      if (res.code === 200 && res.data) {
        setItems(res.data.items || [])
        setTotal(res.data.pagination?.total || 0)
      }
    } catch (err) {
      console.error('获取放单列表失败:', err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search, page])

  useEffect(() => {
    fetchList()
  }, [statusFilter, page])

  const handleSearch = () => {
    setPage(1)
    fetchList()
  }

  // 刷新列表和统计
  const refreshAll = () => {
    fetchList()
    fetchStats()
  }

  // ========== 更新放单状态 ==========
  const openStatusModal = (item: ShippingReleaseItem) => {
    setStatusTarget(item)
    setStatusForm({
      releaseStatus: item.release_status || 'NOT_REQUIRED',
      courierService: '',
      courierAddress: '',
      releaseValidUntil: '',
    })
    setStatusModalOpen(true)
  }

  const handleStatusSubmit = async () => {
    if (!statusTarget) return
    setStatusSubmitting(true)
    try {
      // 用 order_id 或 order_no 作为路径参数
      const orderId = statusTarget.order_id || statusTarget.id
      const res = await api.put<ApiResponse<unknown>>(`/shipping-releases/${orderId}/status`, {
        releaseStatus: statusForm.releaseStatus,
        ...(statusForm.releaseStatus === 'ORIGINAL_SENT' && {
          courierService: statusForm.courierService.trim(),
          courierAddress: statusForm.courierAddress.trim(),
        }),
        ...(statusForm.releaseStatus === 'RELEASED' && {
          releaseValidUntil: statusForm.releaseValidUntil || undefined,
        }),
      })
      if (res.code === 200) {
        setToast('放单状态已更新')
        setStatusModalOpen(false)
        setStatusTarget(null)
        refreshAll()
      }
    } catch (err) {
      console.error('更新放单状态失败:', err)
    } finally {
      setStatusSubmitting(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Toast 提示 */}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}

      {/* 页面标题 */}
      <div className="flex items-center gap-4">
        <div className="p-2 bg-indigo-50 rounded-xl">
          <Ship className="w-5 h-5 text-indigo-600" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">船司放单</h1>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title="无需放单" value={stats.not_required} icon={<Ban className="w-5 h-5" />} color="blue" />
        <StatCard title="正本待邮寄" value={stats.pending_mail} icon={<Mail className="w-5 h-5" />} color="yellow" />
        <StatCard title="正本已邮寄" value={stats.mailed} icon={<Send className="w-5 h-5" />} color="blue" />
        <StatCard title="待放行" value={stats.pending_release} icon={<Clock className="w-5 h-5" />} color="purple" />
        <StatCard title="船司放行" value={stats.released} icon={<CheckCircle className="w-5 h-5" />} color="green" />
      </div>

      {/* 搜索栏 */}
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="搜索订单号、提单号、柜号..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
        />
      </div>

      {/* 状态 Tab */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setStatusFilter(tab.key); setPage(1) }}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all duration-200 ${
              statusFilter === tab.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 表格 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[12%]" /><col className="w-[13%]" /><col className="w-[13%]" />
              <col className="w-[13%]" /><col className="w-[12%]" /><col className="w-[12%]" />
              <col className="w-[12%]" /><col className="w-[13%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">关联订单</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">客户</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">船司</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">提单号</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">柜号</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">放单状态</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">最近更新</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <Ship className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">暂无放单数据</p>
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                    <td className="px-4 py-3 text-xs text-blue-600 font-medium">{item.order_no || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{item.client_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{item.shipping_line || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-900 font-medium">{item.bl_number || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{item.container_no || '-'}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={item.release_status} type="release" /></td>
                    <td className="px-4 py-3 text-xs text-slate-500 text-center">{item.updated_at?.split('T')[0] || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200" title="查看">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openStatusModal(item)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200"
                          title="更新状态"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">共 {total} 条记录</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-600">{page} / {totalPages || 1}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ==================== 更新放单状态 Modal ==================== */}
      <Modal
        isOpen={statusModalOpen}
        onClose={() => { setStatusModalOpen(false); setStatusTarget(null) }}
        title="更新放单状态"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setStatusModalOpen(false); setStatusTarget(null) }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handleStatusSubmit}
              disabled={statusSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {statusSubmitting ? '更新中...' : '确认更新'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {statusTarget && (
            <div className="px-3 py-2 bg-slate-50 rounded-xl text-xs text-slate-600">
              订单: <span className="font-medium text-slate-900">{statusTarget.order_no}</span>
              {statusTarget.bl_number && <> | 提单: <span className="font-medium text-slate-900">{statusTarget.bl_number}</span></>}
            </div>
          )}

          {/* 放单状态 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              放单状态 <span className="text-red-500">*</span>
            </label>
            <select
              value={statusForm.releaseStatus}
              onChange={e => setStatusForm(prev => ({ ...prev, releaseStatus: e.target.value }))}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              {RELEASE_STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 正本已邮寄时显示快递信息 */}
          {statusForm.releaseStatus === 'ORIGINAL_SENT' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">快递服务商</label>
                <input
                  type="text"
                  value={statusForm.courierService}
                  onChange={e => setStatusForm(prev => ({ ...prev, courierService: e.target.value }))}
                  placeholder="如: DHL, FedEx, UPS..."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">寄送地址</label>
                <input
                  type="text"
                  value={statusForm.courierAddress}
                  onChange={e => setStatusForm(prev => ({ ...prev, courierAddress: e.target.value }))}
                  placeholder="输入寄送地址"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
                />
              </div>
            </>
          )}

          {/* 已放行时显示有效期 */}
          {statusForm.releaseStatus === 'RELEASED' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">放行有效期</label>
              <input
                type="date"
                value={statusForm.releaseValidUntil}
                onChange={e => setStatusForm(prev => ({ ...prev, releaseValidUntil: e.target.value }))}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
