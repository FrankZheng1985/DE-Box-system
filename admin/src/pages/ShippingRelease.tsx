import { useState, useEffect, useCallback } from 'react'
import {
  Ship, Search, Eye, ChevronLeft, ChevronRight,
  CheckCircle, Mail, Send, Clock, Ban, RefreshCw,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import Modal from '../components/Modal'

// ==================== 类型定义 ====================

interface ShippingReleaseItem {
  id: string
  order_id: string
  order_number: string
  client_name: string
  shipping_line: string
  bl_number: string
  container_no: string
  release_status: string
  updated_at: string
}

interface ReleaseStats {
  not_required: number
  // 后端 /shipping-release/stats 返回的是 original_pending / original_sent，
  // 前端原来写 pending_mail / mailed，两张卡片一直是空白（踩坑 033）
  original_pending: number
  original_sent: number
  pending_release: number
  released: number
}

// ==================== 常量 ====================

const STATUS_TABS = [
  { key: '', labelKey: 'common.all' },
  { key: 'ORIGINAL_PENDING', labelKey: 'status.ORIGINAL_PENDING' },
  { key: 'ORIGINAL_SENT', labelKey: 'status.ORIGINAL_SENT' },
  { key: 'PENDING_RELEASE', labelKey: 'status.PENDING_RELEASE' },
  { key: 'RELEASED', labelKey: 'clearanceStatus.CLEARED' },
]

const RELEASE_STATUS_OPTIONS = [
  { value: 'NOT_REQUIRED', labelKey: 'status.NOT_REQUIRED' },
  { value: 'ORIGINAL_PENDING', labelKey: 'status.ORIGINAL_PENDING' },
  { value: 'ORIGINAL_SENT', labelKey: 'status.ORIGINAL_SENT' },
  { value: 'PENDING_RELEASE', labelKey: 'status.PENDING_RELEASE' },
  { value: 'RELEASED', labelKey: 'clearanceStatus.CLEARED' },
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
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ShippingReleaseItem[]>([])
  const [stats, setStats] = useState<ReleaseStats>({ not_required: 0, original_pending: 0, original_sent: 0, pending_release: 0, released: 0 })
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
      const res = await api.get<ApiResponse<ShippingReleaseItem[]>>(
        `/shipping-releases?status=${statusFilter}&search=${encodeURIComponent(search)}&page=${page}&pageSize=${pageSize}`
      )
      if (res.code === 200) {
        const list = Array.isArray(res.data) ? res.data : ((res.data as any)?.items || [])
        setItems(list)
        setTotal(res.pagination?.total || (res.data as any)?.pagination?.total || 0)
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
      // 用 order_id 或 order_number 作为路径参数
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
        setToast(t('shippingRelease.updated'))
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
        <h1 className="text-xl font-semibold text-slate-900">{t('shippingRelease.pageTitle')}</h1>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title={t('status.NOT_REQUIRED')} value={stats.not_required} icon={<Ban className="w-5 h-5" />} color="blue" />
        <StatCard title={t('status.ORIGINAL_PENDING')} value={stats.original_pending} icon={<Mail className="w-5 h-5" />} color="yellow" />
        <StatCard title={t('status.ORIGINAL_SENT')} value={stats.original_sent} icon={<Send className="w-5 h-5" />} color="blue" />
        <StatCard title={t('status.PENDING_RELEASE')} value={stats.pending_release} icon={<Clock className="w-5 h-5" />} color="purple" />
        <StatCard title={t('shippingRelease.statReleased')} value={stats.released} icon={<CheckCircle className="w-5 h-5" />} color="green" />
      </div>

      {/* 搜索栏 */}
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder={t('shippingRelease.searchPlaceholder')}
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
              <col className="w-[12%]" /><col className="w-[13%]" /><col className="w-[13%]" />
              <col className="w-[13%]" /><col className="w-[12%]" /><col className="w-[12%]" />
              <col className="w-[12%]" /><col className="w-[13%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('common.relatedOrder')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('common.client')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('field.shippingLine')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('field.blNumber')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('field.containerNo')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('order.colReleaseStatus')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('shippingRelease.colUpdatedAt')}</th>
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
                    <Ship className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">{t('shippingRelease.empty')}</p>
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                    <td className="px-4 py-3 text-xs text-blue-600 font-medium">{item.order_number || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{item.client_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{item.shipping_line || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-900 font-medium">{item.bl_number || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{item.container_no || '-'}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={item.release_status} type="release" /></td>
                    <td className="px-4 py-3 text-xs text-slate-500 text-center">{item.updated_at?.split('T')[0] || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200" title={t('common.view')}>
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openStatusModal(item)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200"
                          title={t('customs.updateStatus')}
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

      {/* ==================== 更新放单状态 Modal ==================== */}
      <Modal
        isOpen={statusModalOpen}
        onClose={() => { setStatusModalOpen(false); setStatusTarget(null) }}
        title={t('shippingRelease.updateTitle')}
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
              disabled={statusSubmitting}
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
              {statusTarget.bl_number && <> | {t('field.blNumber')}: <span className="font-medium text-slate-900">{statusTarget.bl_number}</span></>}
            </div>
          )}

          {/* 放单状态 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('order.colReleaseStatus')} <span className="text-red-500">*</span>
            </label>
            <select
              value={statusForm.releaseStatus}
              onChange={e => setStatusForm(prev => ({ ...prev, releaseStatus: e.target.value }))}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              {RELEASE_STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* 正本已邮寄时显示快递信息 */}
          {statusForm.releaseStatus === 'ORIGINAL_SENT' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('shippingRelease.courier')}</label>
                <input
                  type="text"
                  value={statusForm.courierService}
                  onChange={e => setStatusForm(prev => ({ ...prev, courierService: e.target.value }))}
                  placeholder={t('shippingRelease.courierPlaceholder')}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('shippingRelease.courierAddress')}</label>
                <input
                  type="text"
                  value={statusForm.courierAddress}
                  onChange={e => setStatusForm(prev => ({ ...prev, courierAddress: e.target.value }))}
                  placeholder={t('shippingRelease.courierAddressPlaceholder')}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
                />
              </div>
            </>
          )}

          {/* 已放行时显示有效期 */}
          {statusForm.releaseStatus === 'RELEASED' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('shippingRelease.validUntil')}</label>
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
