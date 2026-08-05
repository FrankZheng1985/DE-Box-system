import { useState, useEffect, useCallback } from 'react'
import {
  Shield, Search, Eye, ChevronLeft, ChevronRight,
  Clock, RefreshCw, CheckCircle, AlertTriangle, FileUp, Settings,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import Modal from '../components/Modal'
import { formatDate } from '../utils/format'

// ==================== 类型定义 ====================

interface CustomsItem {
  id: string
  order_id: string
  order_number: string
  client_name: string
  destination: string
  status: string
  customs_broker: string
  doc_count: number | string
  updated_at: string
}

interface CustomsStats {
  pending: number
  in_progress: number
  cleared: number
  // 后端 /customs/stats 返回的是 exceptions（复数），
  // 写成单数导致「异常」卡片一直是空白（踩坑 033）
  exceptions: number
}

// ==================== 常量 ====================

const STATUS_TABS = [
  { key: '', labelKey: 'common.all' },
  { key: 'PENDING', labelKey: 'clearanceStatus.PENDING' },
  { key: 'IN_PROGRESS', labelKey: 'clearanceStatus.IN_PROGRESS' },
  { key: 'CLEARED', labelKey: 'clearanceStatus.CLEARED' },
  { key: 'EXCEPTION', labelKey: 'status.EXCEPTION' },
]

const CLEARANCE_STATUS_OPTIONS = [
  { value: 'PENDING', labelKey: 'clearanceStatus.PENDING' },
  { value: 'IN_PROGRESS', labelKey: 'clearanceStatus.IN_PROGRESS' },
  { value: 'CLEARED', labelKey: 'clearanceStatus.CLEARED' },
  { value: 'EXCEPTION', labelKey: 'status.EXCEPTION' },
]

const DOC_TYPE_OPTIONS = [
  // 值用 code 不用中文：customs_documents.file_type 以前存中文，
  // 一换语言就没法翻、也没法按类型统计。生产这张表当时是空的，直接换掉没有存量成本
  { value: 'CUSTOMS_DECLARATION', labelKey: 'customsDocType.CUSTOMS_DECLARATION' },
  { value: 'COMMERCIAL_INVOICE', labelKey: 'customsDocType.COMMERCIAL_INVOICE' },
  { value: 'PACKING_LIST', labelKey: 'customsDocType.PACKING_LIST' },
  { value: 'CERTIFICATE_OF_ORIGIN', labelKey: 'customsDocType.CERTIFICATE_OF_ORIGIN' },
  { value: 'OTHER', labelKey: 'customsDocType.OTHER' },
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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<CustomsItem[]>([])
  const [stats, setStats] = useState<CustomsStats>({ pending: 0, in_progress: 0, cleared: 0, exceptions: 0 })
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
    fileType: 'CUSTOMS_DECLARATION',
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
      const res = await api.get<ApiResponse<CustomsItem[]>>(
        `/customs?status=${statusFilter}&search=${encodeURIComponent(search)}&page=${page}&pageSize=${pageSize}`
      )
      if (res.code === 200) {
        const list = Array.isArray(res.data) ? res.data : ((res.data as any)?.items || [])
        setItems(list)
        setTotal(res.pagination?.total || (res.data as any)?.pagination?.total || 0)
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
      status: item.status?.toUpperCase() || 'PENDING',
      customsBroker: item.customs_broker || '',
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
          setToast(t('customs.markedException'))
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
          setToast(t('customs.statusUpdated'))
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
    setDocForm({ fileName: '', fileType: 'CUSTOMS_DECLARATION' })
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
        setToast(t('customs.docSubmitted'))
        setDocModalOpen(false)
        setDocTarget(null)
        setDocForm({ fileName: '', fileType: 'CUSTOMS_DECLARATION' })
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
        <h1 className="text-xl font-semibold text-slate-900">{t('customs.pageTitle')}</h1>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t('clearanceStatus.PENDING')} value={stats.pending} icon={<Clock className="w-5 h-5" />} color="yellow" />
        <StatCard title={t('clearanceStatus.IN_PROGRESS')} value={stats.in_progress} icon={<RefreshCw className="w-5 h-5" />} color="blue" />
        <StatCard title={t('clearanceStatus.CLEARED')} value={stats.cleared} icon={<CheckCircle className="w-5 h-5" />} color="green" />
        <StatCard title={t('status.EXCEPTION')} value={stats.exceptions} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
      </div>

      {/* 搜索栏 */}
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder={t('customs.searchPlaceholder')}
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
            {t(tab.labelKey)}
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
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('common.relatedOrder')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('common.client')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('field.destination')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('orderDetail.clearanceStatus')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('customs.colBroker')}</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">{t('customs.colDocCount')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.updatedAt')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.actions')}</th>
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
                    <p className="text-sm text-slate-500">{t('customs.empty')}</p>
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                    <td className="px-4 py-3 text-xs text-blue-600 font-medium">{item.order_number || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{item.client_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{item.destination || '-'}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={item.status} type="clearance" /></td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{item.customs_broker || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-900 font-medium text-right">{Number(item.doc_count) || 0}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 text-center">{formatDate(item.updated_at)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {/* 清关信息挂在订单上，查看即跳订单详情（原来这个按钮没有 onClick） */}
                        <button
                          onClick={() => item.order_id && navigate(`/orders/${item.order_id}`)}
                          disabled={!item.order_id}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                          title={t('common.view')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openStatusModal(item)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200"
                          title={t('customs.updateStatus')}
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openDocModal(item)}
                          className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200"
                          title={t('customs.uploadDoc')}
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
            <p className="text-xs text-slate-500">{t('common.totalCount', { count: total })}</p>
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
        title={t('customs.updateStatusTitle')}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setStatusModalOpen(false); setStatusTarget(null) }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleStatusSubmit}
              disabled={statusSubmitting || (statusForm.status === 'EXCEPTION' && !statusForm.exceptionReason.trim())}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {statusSubmitting ? t('common.updating') : t('common.confirmUpdate')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {statusTarget && (
            <div className="px-3 py-2 bg-slate-50 rounded-xl text-xs text-slate-600">
              {t('docType.order')}: <span className="font-medium text-slate-900">{statusTarget.order_number}</span>
              {statusTarget.client_name && <> | {t('common.client')}: <span className="font-medium text-slate-900">{statusTarget.client_name}</span></>}
            </div>
          )}

          {/* 清关状态 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('orderDetail.clearanceStatus')} <span className="text-red-500">*</span>
            </label>
            <select
              value={statusForm.status}
              onChange={e => setStatusForm(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              {CLEARANCE_STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* 报关行 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('customs.colBroker')}</label>
            <input
              type="text"
              value={statusForm.customsBroker}
              onChange={e => setStatusForm(prev => ({ ...prev, customsBroker: e.target.value }))}
              placeholder={t('customs.brokerPlaceholder')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 异常原因（仅异常状态时显示） */}
          {statusForm.status === 'EXCEPTION' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('customs.exceptionReason')} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={statusForm.exceptionReason}
                onChange={e => setStatusForm(prev => ({ ...prev, exceptionReason: e.target.value }))}
                placeholder={t('customs.exceptionReasonPlaceholder')}
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
        onClose={() => { setDocModalOpen(false); setDocTarget(null); setDocForm({ fileName: '', fileType: 'CUSTOMS_DECLARATION' }) }}
        title={t('customs.uploadDoc')}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setDocModalOpen(false); setDocTarget(null); setDocForm({ fileName: '', fileType: 'CUSTOMS_DECLARATION' }) }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleDocSubmit}
              disabled={docSubmitting || !docForm.fileName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {docSubmitting ? t('common.submitting') : t('common.submit')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {docTarget && (
            <div className="px-3 py-2 bg-slate-50 rounded-xl text-xs text-slate-600">
              {t('docType.order')}: <span className="font-medium text-slate-900">{docTarget.order_number}</span>
              {docTarget.client_name && <> | {t('common.client')}: <span className="font-medium text-slate-900">{docTarget.client_name}</span></>}
            </div>
          )}

          {/* 文件名 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('customs.fileName')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={docForm.fileName}
              onChange={e => setDocForm(prev => ({ ...prev, fileName: e.target.value }))}
              placeholder={t('customs.fileNamePlaceholder')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 文件类型 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('cmr.fileType')}</label>
            <select
              value={docForm.fileType}
              onChange={e => setDocForm(prev => ({ ...prev, fileType: e.target.value }))}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              {DOC_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
          </div>

          <div className="px-3 py-2 bg-amber-50 rounded-xl text-xs text-amber-700">
            {t('customs.uploadNotice')}
          </div>
        </div>
      </Modal>
    </div>
  )
}
