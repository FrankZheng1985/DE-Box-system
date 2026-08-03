import { useState, useEffect, useCallback } from 'react'
import {
  FileCheck, Search, Eye, Download, ChevronLeft, ChevronRight,
  ClipboardList, CheckCircle, Clock, AlertTriangle, Plus, Pen, ShieldAlert,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import { formatDate } from '../utils/format'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import Modal from '../components/Modal'

/** 路线由后端的 from_city / to_city 拼出来（没有现成的 route 字段） */
function routeText(cmr: { from_city: string | null; to_city: string | null }): string {
  const parts = [cmr.from_city, cmr.to_city].filter(Boolean)
  return parts.length ? parts.join(' → ') : '-'
}

// ==================== 类型定义 ====================

interface CMR {
  id: string
  cmr_number: string
  order_number: string
  client_name: string
  from_city: string | null
  to_city: string | null
  sign_status: string
  has_damage_note: boolean
  damage_note: string
  uploaded_at: string
}

interface CMRStats {
  total: number
  // 后端 /cmr/stats 返回的是 completed（不是 signed），
  // 写错导致「已签署完成」卡片一直是空白（踩坑 033）
  completed: number
  pending: number
  damaged: number
}

// ==================== 常量 ====================

/**
 * 状态筛选 Tab（P9 踩坑 036 收尾）
 *
 * key 就是发给后端的查询值，必须能在数据库里原样搜到：
 * - 「待签署」覆盖三个真实状态，逗号分隔多值，后端用 = ANY() 匹配
 * - 「有异常」筛的是货损标记 has_damage_note，不是签署状态，
 *   所以单独走 hasDamage 参数（原来往 signStatus 里塞 'exception'，永远查不到）
 */
const STATUS_TABS = [
  { key: '', labelKey: 'common.all' },
  { key: 'UNSIGNED,SENDER_SIGNED,RECEIVER_SIGNED', labelKey: 'cmr.tabPending' },
  { key: 'COMPLETED', labelKey: 'status.COMPLETED' },
  { key: 'DAMAGE', labelKey: 'cmr.tabException' },
]

/** 「有异常」不是签署状态，用这个哨兵值切到 hasDamage 参数 */
const DAMAGE_TAB_KEY = 'DAMAGE'

const SIGN_STATUS_OPTIONS = [
  { value: 'UNSIGNED', labelKey: 'status.UNSIGNED' },
  { value: 'SENDER_SIGNED', labelKey: 'status.SENDER_SIGNED' },
  { value: 'RECEIVER_SIGNED', labelKey: 'status.RECEIVER_SIGNED' },
  { value: 'COMPLETED', labelKey: 'statusByType.cmr.COMPLETED' },
]

const FILE_TYPE_OPTIONS = [
  { value: 'PDF', labelKey: 'cmr.fileTypePdf' },
  { value: 'IMAGE', labelKey: 'cmr.fileTypeImage' },
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

export default function CMRManagement() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [cmrList, setCmrList] = useState<CMR[]>([])
  const [stats, setStats] = useState<CMRStats>({ total: 0, completed: 0, pending: 0, damaged: 0 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  // Toast 状态
  const [toast, setToast] = useState('')

  // 查看 CMR 详情 Modal 状态
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [viewTarget, setViewTarget] = useState<CMR | null>(null)

  // 上传 CMR Modal 状态
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadForm, setUploadForm] = useState({ orderId: '', cmrNumber: '', fileType: 'PDF', remark: '' })
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadSubmitting, setUploadSubmitting] = useState(false)

  // 上传弹窗里的订单搜索选择器（替代原来手粘 UUID）
  const [orderSearch, setOrderSearch] = useState('')
  const [orderOptions, setOrderOptions] = useState<{ id: string; order_number: string; client_name: string }[]>([])
  const [orderSearching, setOrderSearching] = useState(false)
  const [selectedOrderLabel, setSelectedOrderLabel] = useState('')

  const closeUploadModal = () => {
    setUploadModalOpen(false)
    setUploadForm({ orderId: '', cmrNumber: '', fileType: 'PDF', remark: '' })
    setUploadFile(null)
    setOrderSearch('')
    setOrderOptions([])
    setSelectedOrderLabel('')
  }

  // 订单搜索防抖
  useEffect(() => {
    if (!orderSearch.trim() || uploadForm.orderId) {
      setOrderOptions([])
      return
    }
    const timer = setTimeout(async () => {
      setOrderSearching(true)
      try {
        const res = await api.get<ApiResponse<{ id: string; order_number: string; client_name: string }[]>>(
          `/orders?search=${encodeURIComponent(orderSearch.trim())}&pageSize=8`
        )
        setOrderOptions(res.data || [])
      } catch (err) {
        console.error('搜索订单失败:', err)
        setOrderOptions([])
      } finally {
        setOrderSearching(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [orderSearch, uploadForm.orderId])

  // 更新签署状态 Modal
  const [signModalOpen, setSignModalOpen] = useState(false)
  const [signTarget, setSignTarget] = useState<CMR | null>(null)
  const [signStatus, setSignStatus] = useState('')
  const [signSubmitting, setSignSubmitting] = useState(false)

  // 标记货损 Modal
  const [damageModalOpen, setDamageModalOpen] = useState(false)
  const [damageTarget, setDamageTarget] = useState<CMR | null>(null)
  const [damageNote, setDamageNote] = useState('')
  const [damageSubmitting, setDamageSubmitting] = useState(false)

  // 获取统计
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<CMRStats>>('/cmr/stats')
      if (res.code === 200 && res.data) setStats(res.data)
    } catch (err) {
      console.error('获取CMR统计失败:', err)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // 获取列表
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<CMR[]>>(
        `/cmr?${statusFilter === DAMAGE_TAB_KEY ? 'hasDamage=true' : `signStatus=${statusFilter}`}` +
        `&search=${encodeURIComponent(search)}&page=${page}&pageSize=${pageSize}`
      )
      if (res.code === 200) {
        const list = Array.isArray(res.data) ? res.data : ((res.data as any)?.items || [])
        setCmrList(list)
        setTotal(res.pagination?.total || (res.data as any)?.pagination?.total || 0)
      }
    } catch (err) {
      console.error('获取CMR列表失败:', err)
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

  // ========== 上传 CMR ==========
  const handleUploadSubmit = async () => {
    if (!uploadForm.orderId.trim()) return
    setUploadSubmitting(true)
    try {
      // 使用 FormData 支持文件上传
      const formData = new FormData()
      formData.append('orderId', uploadForm.orderId.trim())
      formData.append('cmrNumber', uploadForm.cmrNumber.trim())
      formData.append('fileType', uploadForm.fileType)
      if (uploadFile) {
        formData.append('file', uploadFile)
      }

      const token = localStorage.getItem('eu_tms_auth')
      const authData = token ? JSON.parse(token) : null
      const response = await fetch('/api/v1/cmr/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authData?.token || ''}` },
        body: formData,
      })
      const res = await response.json()

      if (res.code === 200) {
        setToast(t('cmr.uploaded'))
        closeUploadModal()
        refreshAll()
      }
    } catch (err) {
      console.error('上传CMR失败:', err)
    } finally {
      setUploadSubmitting(false)
    }
  }

  // ========== 更新签署状态 ==========
  const openSignModal = (cmr: CMR) => {
    setSignTarget(cmr)
    setSignStatus(cmr.sign_status || 'UNSIGNED')
    setSignModalOpen(true)
  }

  const handleSignSubmit = async () => {
    if (!signTarget) return
    setSignSubmitting(true)
    try {
      const res = await api.put<ApiResponse<unknown>>(`/cmr/${signTarget.id}/sign-status`, { signStatus })
      if (res.code === 200) {
        setToast(t('cmr.signUpdated'))
        setSignModalOpen(false)
        setSignTarget(null)
        refreshAll()
      }
    } catch (err) {
      console.error('更新签署状态失败:', err)
    } finally {
      setSignSubmitting(false)
    }
  }

  // ========== 标记货损 ==========
  const openDamageModal = (cmr: CMR) => {
    setDamageTarget(cmr)
    setDamageNote(cmr.damage_note || '')
    setDamageModalOpen(true)
  }

  const handleDamageSubmit = async () => {
    if (!damageTarget || !damageNote.trim()) return
    setDamageSubmitting(true)
    try {
      const res = await api.put<ApiResponse<unknown>>(`/cmr/${damageTarget.id}/damage`, { damageNote: damageNote.trim() })
      if (res.code === 200) {
        setToast(t('cmr.damageRecorded'))
        setDamageModalOpen(false)
        setDamageTarget(null)
        setDamageNote('')
        refreshAll()
      }
    } catch (err) {
      console.error('标记货损失败:', err)
    } finally {
      setDamageSubmitting(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Toast 提示 */}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}

      {/* 页面标题 + 上传按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-green-50 rounded-xl">
            <FileCheck className="w-5 h-5 text-green-600" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">{t('cmr.pageTitle')}</h1>
        </div>
        <button
          onClick={() => setUploadModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('cmr.upload')}
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t('cmr.statTotal')} value={stats.total} icon={<ClipboardList className="w-5 h-5" />} color="blue" />
        <StatCard title={t('cmr.statCompleted')} value={stats.completed} icon={<CheckCircle className="w-5 h-5" />} color="green" />
        <StatCard title={t('cmr.tabPending')} value={stats.pending} icon={<Clock className="w-5 h-5" />} color="yellow" />
        <StatCard title={t('cmr.statDamaged')} value={stats.damaged} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
      </div>

      {/* 搜索栏 */}
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder={t('cmr.searchPlaceholder')}
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
              <col className="w-[12%]" /><col className="w-[11%]" /><col className="w-[12%]" />
              <col className="w-[14%]" /><col className="w-[11%]" /><col className="w-[8%]" />
              <col className="w-[11%]" /><col className="w-[21%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('cmr.colNumber')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('common.relatedOrder')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('common.client')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('common.route')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('cmr.colSignStatus')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('cmr.colDamage')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('cmr.colUploadedAt')}</th>
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
              ) : cmrList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <FileCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">{t('cmr.empty')}</p>
                  </td>
                </tr>
              ) : (
                cmrList.map(cmr => (
                  <tr key={cmr.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                    <td className="px-4 py-3 text-xs text-slate-900 font-medium">{cmr.cmr_number}</td>
                    <td className="px-4 py-3 text-xs text-blue-600">{cmr.order_number || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{cmr.client_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{routeText(cmr)}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={cmr.sign_status} type="cmr" /></td>
                    <td className="px-4 py-3 text-center">
                      {cmr.has_damage_note ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium bg-red-100 text-red-700">{t('cmr.statDamaged')}</span>
                      ) : (
                        <span className="text-xs text-slate-400">{t('common.none')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 text-center">{formatDate(cmr.uploaded_at)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => { setViewTarget(cmr); setViewModalOpen(true) }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                          title={t('common.view')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => window.open(`/api/v1/cmr/${cmr.id}/download`, '_blank')}
                          className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200"
                          title={t('common.download')}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openSignModal(cmr)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200"
                          title={t('cmr.updateSignStatus')}
                        >
                          <Pen className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openDamageModal(cmr)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                          title={t('cmr.markDamage')}
                        >
                          <ShieldAlert className="w-4 h-4" />
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

      {/* ==================== 上传 CMR Modal ==================== */}
      <Modal
        isOpen={uploadModalOpen}
        onClose={closeUploadModal}
        title={t('cmr.upload')}
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={closeUploadModal}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleUploadSubmit}
              disabled={uploadSubmitting || !uploadForm.orderId.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {uploadSubmitting ? t('common.submitting') : t('common.submit')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* 关联订单（搜索选择，替代手粘 UUID） */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('common.relatedOrder')} <span className="text-red-500">*</span>
            </label>
            {uploadForm.orderId ? (
              <div className="flex items-center justify-between px-4 py-2.5 border border-blue-200 bg-blue-50/50 rounded-xl">
                <span className="text-sm text-slate-800 font-medium">{selectedOrderLabel}</span>
                <button
                  onClick={() => { setUploadForm(prev => ({ ...prev, orderId: '' })); setSelectedOrderLabel(''); setOrderSearch('') }}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  {t('cmr.reselect')}
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={orderSearch}
                  onChange={e => setOrderSearch(e.target.value)}
                  placeholder={t('cmr.orderSearchPlaceholder')}
                  className="w-full min-w-[320px] px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
                />
                {orderSearch.trim() && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {orderSearching ? (
                      <div className="px-4 py-3 text-xs text-slate-400">{t('cmr.searching')}</div>
                    ) : orderOptions.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-slate-400">{t('cmr.noMatchingOrder')}</div>
                    ) : (
                      orderOptions.map(o => (
                        <button
                          key={o.id}
                          onClick={() => {
                            setUploadForm(prev => ({ ...prev, orderId: o.id }))
                            setSelectedOrderLabel(`${o.order_number}（${o.client_name || '-'}）`)
                            setOrderOptions([])
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors duration-150"
                        >
                          <span className="text-sm font-medium text-slate-800">{o.order_number}</span>
                          <span className="text-xs text-slate-400 ml-2">{o.client_name || '-'}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CMR 编号 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('cmr.colNumber')}</label>
            <input
              type="text"
              value={uploadForm.cmrNumber}
              onChange={e => setUploadForm(prev => ({ ...prev, cmrNumber: e.target.value }))}
              placeholder={t('cmr.numberPlaceholder')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 文件类型 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('cmr.fileType')}</label>
            <select
              value={uploadForm.fileType}
              onChange={e => setUploadForm(prev => ({ ...prev, fileType: e.target.value }))}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              {FILE_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* 文件上传 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('common.upload')} <span className="text-slate-400 font-normal">{t('cmr.uploadHint')}</span>
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 file:mr-4 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 cursor-pointer"
              />
              {uploadFile && (
                <p className="mt-1.5 text-xs text-green-600">
                  {t('cmr.selectedFile')}: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </div>
          </div>

          {/* 备注 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('common.remark')}</label>
            <textarea
              value={uploadForm.remark}
              onChange={e => setUploadForm(prev => ({ ...prev, remark: e.target.value }))}
              placeholder={t('cmr.remarksPlaceholder')}
              rows={3}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* ==================== 更新签署状态 Modal ==================== */}
      <Modal
        isOpen={signModalOpen}
        onClose={() => { setSignModalOpen(false); setSignTarget(null) }}
        title={t('cmr.updateSignStatus')}
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setSignModalOpen(false); setSignTarget(null) }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSignSubmit}
              disabled={signSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {signSubmitting ? t('common.updating') : t('common.confirmUpdate')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {signTarget && (
            <div className="px-3 py-2 bg-slate-50 rounded-xl text-xs text-slate-600">
              CMR: <span className="font-medium text-slate-900">{signTarget.cmr_number}</span>
              {signTarget.order_number && <> | {t('docType.order')}: <span className="font-medium text-slate-900">{signTarget.order_number}</span></>}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('cmr.colSignStatus')}</label>
            <select
              value={signStatus}
              onChange={e => setSignStatus(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              {SIGN_STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* ==================== 标记货损 Modal ==================== */}
      <Modal
        isOpen={damageModalOpen}
        onClose={() => { setDamageModalOpen(false); setDamageTarget(null); setDamageNote('') }}
        title={t('cmr.markDamage')}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setDamageModalOpen(false); setDamageTarget(null); setDamageNote('') }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleDamageSubmit}
              disabled={damageSubmitting || !damageNote.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {damageSubmitting ? t('common.submitting') : t('cmr.confirmMark')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {damageTarget && (
            <div className="px-3 py-2 bg-slate-50 rounded-xl text-xs text-slate-600">
              CMR: <span className="font-medium text-slate-900">{damageTarget.cmr_number}</span>
              {damageTarget.order_number && <> | {t('docType.order')}: <span className="font-medium text-slate-900">{damageTarget.order_number}</span></>}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('cmr.damageNote')} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={damageNote}
              onChange={e => setDamageNote(e.target.value)}
              placeholder={t('cmr.damagePlaceholder')}
              rows={4}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* ==================== 查看 CMR 详情 Modal ==================== */}
      <Modal
        isOpen={viewModalOpen}
        onClose={() => { setViewModalOpen(false); setViewTarget(null) }}
        title={t('cmr.detailTitle')}
        size="md"
        footer={
          <div className="flex justify-end">
            <button
              onClick={() => { setViewModalOpen(false); setViewTarget(null) }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              {t('common.close')}
            </button>
          </div>
        }
      >
        {viewTarget && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-slate-500">{t('cmr.colNumber')}</span>
                <p className="text-sm font-medium text-slate-900">{viewTarget.cmr_number}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500">{t('common.relatedOrder')}</span>
                <p className="text-sm font-medium text-slate-900">{viewTarget.order_number || '-'}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500">{t('common.client')}</span>
                <p className="text-sm font-medium text-slate-900">{viewTarget.client_name}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500">{t('common.route')}</span>
                <p className="text-sm font-medium text-slate-900">{routeText(viewTarget)}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500">{t('cmr.colSignStatus')}</span>
                <p className="text-sm"><StatusBadge status={viewTarget.sign_status} type="cmr" /></p>
              </div>
              <div>
                <span className="text-xs text-slate-500">{t('cmr.colUploadedAt')}</span>
                <p className="text-sm font-medium text-slate-900">{formatDate(viewTarget.uploaded_at)}</p>
              </div>
            </div>
            {viewTarget.has_damage_note && (
              <div className="mt-2 p-3 bg-red-50 rounded-xl">
                <span className="text-xs font-medium text-red-700">{t('cmr.damageNoteLabel')}</span>
                <p className="text-sm text-red-600 mt-1">{viewTarget.damage_note || t('cmr.noDamageDetail')}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
