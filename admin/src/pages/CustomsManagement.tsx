import { useState, useEffect, useCallback } from 'react'
import {
  Shield, Search, Eye, ChevronLeft, ChevronRight,
  Clock, RefreshCw, CheckCircle, AlertTriangle, FileUp, Settings,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import Modal from '../components/Modal'

// ==================== 类型定义 ====================

interface CustomsItem {
  id: string
  order_id: string
  order_no: string
  client_name: string
  destination: string
  clearance_status: string
  broker_name: string
  document_count: number
  updated_at: string
}

interface CustomsStats {
  pending: number
  in_progress: number
  cleared: number
  exception: number
}

// ==================== 常量 ====================

const STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待清关' },
  { key: 'in_progress', label: '清关中' },
  { key: 'cleared', label: '已放行' },
  { key: 'exception', label: '异常' },
]

const CLEARANCE_STATUS_OPTIONS = [
  { value: 'PENDING', label: '待清关' },
  { value: 'IN_PROGRESS', label: '清关中' },
  { value: 'CLEARED', label: '已放行' },
  { value: 'EXCEPTION', label: '异常' },
]

const DOC_TYPE_OPTIONS = [
  { value: '报关单', label: '报关单' },
  { value: '商业发票', label: '商业发票' },
  { value: '装箱单', label: '装箱单' },
  { value: '原产地证', label: '原产地证' },
  { value: '其他', label: '其他' },
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

export default function CustomsManagement() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<CustomsItem[]>([])
  const [stats, setStats] = useState<CustomsStats>({ pending: 0, in_progress: 0, cleared: 0, exception: 0 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  // Toast 状态
  const [toast, setToast] = useState('')

  // 更新清关状态 Modal
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [statusTarget, setStatusTarget] = useState<CustomsItem | null>(null)
  const [statusForm, setStatusForm] = useState({
    status: 'PENDING',
    customsBroker: '',
    exceptionReason: '',
  })
  const [statusSubmitting, setStatusSubmitting] = useState(false)

  // 上传文件 Modal
  const [docModalOpen, setDocModalOpen] = useState(false)
  const [docTarget, setDocTarget] = useState<CustomsItem | null>(null)
  const [docForm, setDocForm] = useState({
    fileName: '',
    fileType: '报关单',
  })
  const [docSubmitting, setDocSubmitting] = useState(false)

  // 获取统计
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<CustomsStats>>('/customs/stats')
      if (res.code === 200 && res.data) setStats(res.data)
    } catch (err) {
      console.error('获取清关统计失败:', err)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // 获取列表
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<{ items: CustomsItem[]; pagination: { total: number } }>>(
        `/customs?status=${statusFilter}&search=${encodeURIComponent(search)}&page=${page}&pageSize=${pageSize}`
      )
      if (res.code === 200 && res.data) {
        setItems(res.data.items || [])
        setTotal(res.data.pagination?.total || 0)
      }
    } catch (err) {
      console.error('获取清关列表失败:', err)
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

  // ========== 更新清关状态 ==========
  const openStatusModal = (item: CustomsItem) => {
    setStatusTarget(item)
    setStatusForm({
      status: item.clearance_status?.toUpperCase() || 'PENDING',
      customsBroker: item.broker_name || '',
      exceptionReason: '',
    })
    setStatusModalOpen(true)
  }

  const handleStatusSubmit = async () => {
    if (!statusTarget) return
    setStatusSubmitting(true)
    try {
      const orderId = statusTarget.order_id || statusTarget.id

      if (statusForm.status === 'EXCEPTION') {
        // 异常情况走单独接口
        const res = await api.post<ApiResponse<unknown>>(`/customs/${orderId}/exception`, {
          reason: statusForm.exceptionReason.trim(),
        })
        if (res.code === 200) {
          setToast('已标记为异常')
          setStatusModalOpen(false)
          setStatusTarget(null)
          refreshAll()
        }
      } else {
        // 正常状态更新
        const res = await api.put<ApiResponse<unknown>>(`/customs/${orderId}/status`, {
          status: statusForm.status,
          customsBroker: statusForm.customsBroker.trim(),
        })
        if (res.code === 200) {
          setToast('清关状态已更新')
          setStatusModalOpen(false)
          setStatusTarget(null)
          refreshAll()
        }
      }
    } catch (err) {
      console.error('更新清关状态失败:', err)
    } finally {
      setStatusSubmitting(false)
    }
  }

  // ========== 上传文件（元数据） ==========
  const openDocModal = (item: CustomsItem) => {
    setDocTarget(item)
    setDocForm({ fileName: '', fileType: '报关单' })
    setDocModalOpen(true)
  }

  const handleDocSubmit = async () => {
    if (!docTarget || !docForm.fileName.trim()) return
    setDocSubmitting(true)
    try {
      const orderId = docTarget.order_id || docTarget.id
      const res = await api.post<ApiResponse<unknown>>(`/customs/${orderId}/documents`, {
        fileName: docForm.fileName.trim(),
        fileType: docForm.fileType,
      })
      if (res.code === 200) {
        setToast('文件信息已提交')
        setDocModalOpen(false)
        setDocTarget(null)
        setDocForm({ fileName: '', fileType: '报关单' })
        refreshAll()
      }
    } catch (err) {
      console.error('上传文件失败:', err)
    } finally {
      setDocSubmitting(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Toast 提示 */}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}

      {/* 页面标题 */}
      <div className="flex items-center gap-4">
        <div className="p-2 bg-amber-50 rounded-xl">
          <Shield className="w-5 h-5 text-amber-600" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">清关管理</h1>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="待清关" value={stats.pending} icon={<Clock className="w-5 h-5" />} color="yellow" />
        <StatCard title="清关中" value={stats.in_progress} icon={<RefreshCw className="w-5 h-5" />} color="blue" />
        <StatCard title="已放行" value={stats.cleared} icon={<CheckCircle className="w-5 h-5" />} color="green" />
        <StatCard title="异常" value={stats.exception} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
      </div>

      {/* 搜索栏 */}
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="搜索订单号、客户名称..."
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
              <col className="w-[11%]" /><col className="w-[13%]" /><col className="w-[12%]" />
              <col className="w-[11%]" /><col className="w-[13%]" /><col className="w-[9%]" />
              <col className="w-[11%]" /><col className="w-[20%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">关联订单</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">客户</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">目的地</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">清关状态</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">报关行</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">文件数</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">更新时间</th>
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
                    <Shield className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">暂无清关数据</p>
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                    <td className="px-4 py-3 text-xs text-blue-600 font-medium">{item.order_no || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{item.client_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{item.destination || '-'}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={item.clearance_status} type="clearance" /></td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{item.broker_name || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-900 font-medium text-right">{item.document_count ?? 0}</td>
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
                          <Settings className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openDocModal(item)}
                          className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200"
                          title="上传文件"
                        >
                          <FileUp className="w-4 h-4" />
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

      {/* ==================== 更新清关状态 Modal ==================== */}
      <Modal
        isOpen={statusModalOpen}
        onClose={() => { setStatusModalOpen(false); setStatusTarget(null) }}
        title="更新清关状态"
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
              disabled={statusSubmitting || (statusForm.status === 'EXCEPTION' && !statusForm.exceptionReason.trim())}
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
              {statusTarget.client_name && <> | 客户: <span className="font-medium text-slate-900">{statusTarget.client_name}</span></>}
            </div>
          )}

          {/* 清关状态 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              清关状态 <span className="text-red-500">*</span>
            </label>
            <select
              value={statusForm.status}
              onChange={e => setStatusForm(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              {CLEARANCE_STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 报关行 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">报关行</label>
            <input
              type="text"
              value={statusForm.customsBroker}
              onChange={e => setStatusForm(prev => ({ ...prev, customsBroker: e.target.value }))}
              placeholder="输入报关行名称"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 异常原因（仅异常状态时显示） */}
          {statusForm.status === 'EXCEPTION' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                异常原因 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={statusForm.exceptionReason}
                onChange={e => setStatusForm(prev => ({ ...prev, exceptionReason: e.target.value }))}
                placeholder="请描述异常原因..."
                rows={3}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 resize-none"
              />
            </div>
          )}
        </div>
      </Modal>

      {/* ==================== 上传文件 Modal ==================== */}
      <Modal
        isOpen={docModalOpen}
        onClose={() => { setDocModalOpen(false); setDocTarget(null); setDocForm({ fileName: '', fileType: '报关单' }) }}
        title="上传文件"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setDocModalOpen(false); setDocTarget(null); setDocForm({ fileName: '', fileType: '报关单' }) }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handleDocSubmit}
              disabled={docSubmitting || !docForm.fileName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {docSubmitting ? '提交中...' : '提交'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {docTarget && (
            <div className="px-3 py-2 bg-slate-50 rounded-xl text-xs text-slate-600">
              订单: <span className="font-medium text-slate-900">{docTarget.order_no}</span>
              {docTarget.client_name && <> | 客户: <span className="font-medium text-slate-900">{docTarget.client_name}</span></>}
            </div>
          )}

          {/* 文件名 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              文件名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={docForm.fileName}
              onChange={e => setDocForm(prev => ({ ...prev, fileName: e.target.value }))}
              placeholder="输入文件名称"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 文件类型 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">文件类型</label>
            <select
              value={docForm.fileType}
              onChange={e => setDocForm(prev => ({ ...prev, fileType: e.target.value }))}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              {DOC_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="px-3 py-2 bg-amber-50 rounded-xl text-xs text-amber-700">
            注意：当前仅提交文件元数据，实际文件上传功能将在后续版本实现。
          </div>
        </div>
      </Modal>
    </div>
  )
}
