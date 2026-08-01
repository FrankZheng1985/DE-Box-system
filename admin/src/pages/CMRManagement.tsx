import { useState, useEffect, useCallback } from 'react'
import {
  FileCheck, Search, Eye, Download, ChevronLeft, ChevronRight,
  ClipboardList, CheckCircle, Clock, AlertTriangle, Plus, Pen, ShieldAlert,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import Modal from '../components/Modal'

// ==================== 类型定义 ====================

interface CMR {
  id: string
  cmr_number: string
  order_no: string
  client_name: string
  route: string
  sign_status: string
  has_damage: boolean
  damage_note: string
  upload_time: string
}

interface CMRStats {
  total: number
  signed: number
  pending: number
  damaged: number
}

// ==================== 常量 ====================

const STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待签署' },
  { key: 'completed', label: '已完成' },
  { key: 'exception', label: '有异常' },
]

const SIGN_STATUS_OPTIONS = [
  { value: 'UNSIGNED', label: '未签署' },
  { value: 'SENDER_SIGNED', label: '发件方已签' },
  { value: 'RECEIVER_SIGNED', label: '收件方已签' },
  { value: 'COMPLETED', label: '签署完成' },
]

const FILE_TYPE_OPTIONS = [
  { value: 'PDF', label: 'PDF' },
  { value: 'IMAGE', label: '图片' },
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
  const [loading, setLoading] = useState(true)
  const [cmrList, setCmrList] = useState<CMR[]>([])
  const [stats, setStats] = useState<CMRStats>({ total: 0, signed: 0, pending: 0, damaged: 0 })
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
        `/cmr?signStatus=${statusFilter}&search=${encodeURIComponent(search)}&page=${page}&pageSize=${pageSize}`
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
        setToast('CMR 上传成功')
        setUploadModalOpen(false)
        setUploadForm({ orderId: '', cmrNumber: '', fileType: 'PDF', remark: '' })
        setUploadFile(null)
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
        setToast('签署状态已更新')
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
        setToast('货损信息已记录')
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
          <h1 className="text-xl font-semibold text-slate-900">CMR 运单管理</h1>
        </div>
        <button
          onClick={() => setUploadModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          上传 CMR
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="CMR总数" value={stats.total} icon={<ClipboardList className="w-5 h-5" />} color="blue" />
        <StatCard title="已签署完成" value={stats.signed} icon={<CheckCircle className="w-5 h-5" />} color="green" />
        <StatCard title="待签署" value={stats.pending} icon={<Clock className="w-5 h-5" />} color="yellow" />
        <StatCard title="有货损" value={stats.damaged} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
      </div>

      {/* 搜索栏 */}
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="搜索CMR编号、订单号..."
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
              <col className="w-[12%]" /><col className="w-[11%]" /><col className="w-[12%]" />
              <col className="w-[14%]" /><col className="w-[11%]" /><col className="w-[8%]" />
              <col className="w-[11%]" /><col className="w-[21%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">CMR编号</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">关联订单</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">客户</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">路线</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">签署状态</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">货损</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">上传时间</th>
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
              ) : cmrList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <FileCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">暂无CMR数据</p>
                  </td>
                </tr>
              ) : (
                cmrList.map(cmr => (
                  <tr key={cmr.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                    <td className="px-4 py-3 text-xs text-slate-900 font-medium">{cmr.cmr_number}</td>
                    <td className="px-4 py-3 text-xs text-blue-600">{cmr.order_no || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{cmr.client_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{cmr.route || '-'}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={cmr.sign_status} type="cmr" /></td>
                    <td className="px-4 py-3 text-center">
                      {cmr.has_damage ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium bg-red-100 text-red-700">有货损</span>
                      ) : (
                        <span className="text-xs text-slate-400">无</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 text-center">{cmr.upload_time?.split('T')[0] || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => { setViewTarget(cmr); setViewModalOpen(true) }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                          title="查看"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => window.open(`/api/v1/cmr/${cmr.id}/download`, '_blank')}
                          className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200"
                          title="下载"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openSignModal(cmr)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200"
                          title="更新签署状态"
                        >
                          <Pen className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openDamageModal(cmr)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                          title="标记货损"
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

      {/* ==================== 上传 CMR Modal ==================== */}
      <Modal
        isOpen={uploadModalOpen}
        onClose={() => { setUploadModalOpen(false); setUploadForm({ orderId: '', cmrNumber: '', fileType: 'PDF', remark: '' }) }}
        title="上传 CMR"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setUploadModalOpen(false); setUploadForm({ orderId: '', cmrNumber: '', fileType: 'PDF', remark: '' }) }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handleUploadSubmit}
              disabled={uploadSubmitting || !uploadForm.orderId.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {uploadSubmitting ? '提交中...' : '提交'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* 关联订单ID */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              关联订单ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={uploadForm.orderId}
              onChange={e => setUploadForm(prev => ({ ...prev, orderId: e.target.value }))}
              placeholder="输入订单UUID或订单号"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* CMR 编号 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">CMR 编号</label>
            <input
              type="text"
              value={uploadForm.cmrNumber}
              onChange={e => setUploadForm(prev => ({ ...prev, cmrNumber: e.target.value }))}
              placeholder="输入CMR编号"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 文件类型 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">文件类型</label>
            <select
              value={uploadForm.fileType}
              onChange={e => setUploadForm(prev => ({ ...prev, fileType: e.target.value }))}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              {FILE_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 文件上传 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              上传文件 <span className="text-slate-400 font-normal">(PDF/JPG/PNG, 最大20MB)</span>
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
                  已选择: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </div>
          </div>

          {/* 备注 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">备注</label>
            <textarea
              value={uploadForm.remark}
              onChange={e => setUploadForm(prev => ({ ...prev, remark: e.target.value }))}
              placeholder="输入备注信息..."
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
        title="更新签署状态"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setSignModalOpen(false); setSignTarget(null) }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handleSignSubmit}
              disabled={signSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {signSubmitting ? '更新中...' : '确认更新'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {signTarget && (
            <div className="px-3 py-2 bg-slate-50 rounded-xl text-xs text-slate-600">
              CMR: <span className="font-medium text-slate-900">{signTarget.cmr_number}</span>
              {signTarget.order_no && <> | 订单: <span className="font-medium text-slate-900">{signTarget.order_no}</span></>}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">签署状态</label>
            <select
              value={signStatus}
              onChange={e => setSignStatus(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              {SIGN_STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* ==================== 标记货损 Modal ==================== */}
      <Modal
        isOpen={damageModalOpen}
        onClose={() => { setDamageModalOpen(false); setDamageTarget(null); setDamageNote('') }}
        title="标记货损"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setDamageModalOpen(false); setDamageTarget(null); setDamageNote('') }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handleDamageSubmit}
              disabled={damageSubmitting || !damageNote.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {damageSubmitting ? '提交中...' : '确认标记'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {damageTarget && (
            <div className="px-3 py-2 bg-slate-50 rounded-xl text-xs text-slate-600">
              CMR: <span className="font-medium text-slate-900">{damageTarget.cmr_number}</span>
              {damageTarget.order_no && <> | 订单: <span className="font-medium text-slate-900">{damageTarget.order_no}</span></>}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              货损说明 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={damageNote}
              onChange={e => setDamageNote(e.target.value)}
              placeholder="请描述货损情况..."
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
        title="CMR 详情"
        size="md"
        footer={
          <div className="flex justify-end">
            <button
              onClick={() => { setViewModalOpen(false); setViewTarget(null) }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              关闭
            </button>
          </div>
        }
      >
        {viewTarget && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-slate-500">CMR 编号</span>
                <p className="text-sm font-medium text-slate-900">{viewTarget.cmr_number}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500">关联订单</span>
                <p className="text-sm font-medium text-slate-900">{viewTarget.order_no || '-'}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500">客户</span>
                <p className="text-sm font-medium text-slate-900">{viewTarget.client_name}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500">路线</span>
                <p className="text-sm font-medium text-slate-900">{viewTarget.route || '-'}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500">签署状态</span>
                <p className="text-sm"><StatusBadge status={viewTarget.sign_status} type="cmr" /></p>
              </div>
              <div>
                <span className="text-xs text-slate-500">上传时间</span>
                <p className="text-sm font-medium text-slate-900">{viewTarget.upload_time?.split('T')[0] || '-'}</p>
              </div>
            </div>
            {viewTarget.has_damage && (
              <div className="mt-2 p-3 bg-red-50 rounded-xl">
                <span className="text-xs font-medium text-red-700">货损说明：</span>
                <p className="text-sm text-red-600 mt-1">{viewTarget.damage_note || '无详细说明'}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
