import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, Search, Plus, Eye, Edit, ChevronLeft, ChevronRight,
  Send, CheckCircle, XCircle, Clock, TrendingUp, ShoppingCart, AlertCircle, Ban,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import Modal from '../components/Modal'
import { BUSINESS_TYPE_LABELS } from '../constants/businessTypes'
import ConfirmDialog from '../components/ConfirmDialog'

// ==================== 类型定义 ====================

interface Quotation {
  id: string
  quote_number: string
  client_name: string
  route: string
  business_type: string
  amount: number
  currency: string
  version: number
  valid_until: string
  status: string
  created_at: string
}

interface QuotationStats {
  monthly_total: number
  pending_reply: number
  accepted: number
  rejected: number
  conversion_rate: number
}

// ==================== 常量 ====================

const STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'PENDING_QUOTE', label: '待报价' },
  { key: 'DRAFT', label: '草稿' },
  { key: 'SENT', label: '已报价' },
  { key: 'ACCEPTED', label: '已接受' },
  { key: 'REJECTED', label: '已拒绝' },
  { key: 'EXPIRED', label: '已过期' },
]

// 中文名统一用共享常量 BUSINESS_TYPE_LABELS，这里只配颜色
// （旧版键是小写 curtain_side/container，和库里的大写值永远匹配不上）
const BUSINESS_TYPE_STYLES: Record<string, string> = {
  TRUCK_LTL: 'bg-blue-100 text-blue-700',
  TRUCK_FTL: 'bg-purple-100 text-purple-700',
  LOCAL_DELIVERY: 'bg-green-100 text-green-700',
}

function formatCurrency(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount)
}

// ==================== Toast 通知组件 ====================

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed top-6 right-6 z-[60] animate-[slideIn_300ms_ease-out]">
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
        type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
      }`}>
        {type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
        {message}
      </div>
    </div>
  )
}

// ==================== 组件 ====================

export default function QuotationManagement() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [stats, setStats] = useState<QuotationStats>({ monthly_total: 0, pending_reply: 0, accepted: 0, rejected: 0, conversion_rate: 0 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  // Toast 通知
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // 操作弹窗状态
  const [rejectModal, setRejectModal] = useState<{ open: boolean; quotation: Quotation | null }>({ open: false, quotation: null })
  const [rejectReason, setRejectReason] = useState('')

  // 作废确认
  const [voidTarget, setVoidTarget] = useState<Quotation | null>(null)
  const [acceptModal, setAcceptModal] = useState<{ open: boolean; quotation: Quotation | null }>({ open: false, quotation: null })
  const [convertModal, setConvertModal] = useState<{ open: boolean; quotation: Quotation | null }>({ open: false, quotation: null })
  const [submitting, setSubmitting] = useState(false)

  // 获取统计
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get<ApiResponse<QuotationStats>>('/quotations/stats')
        if (res.code === 200 && res.data) setStats(res.data)
      } catch (err) {
        console.error('获取报价统计失败:', err)
      }
    }
    fetchStats()
  }, [])

  // 获取列表
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<Quotation[]>>(
        `/quotations?status=${statusFilter}&search=${encodeURIComponent(search)}&page=${page}&pageSize=${pageSize}`
      )
      if (res.code === 200) {
        const list = Array.isArray(res.data) ? res.data : ((res.data as any)?.items || [])
        setQuotations(list)
        setTotal(res.pagination?.total || (res.data as any)?.pagination?.total || 0)
      }
    } catch (err) {
      console.error('获取报价列表失败:', err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search, page])

  useEffect(() => {
    fetchList()
  }, [statusFilter, page, fetchList])

  const handleSearch = () => {
    setPage(1)
    fetchList()
  }

  // 刷新列表和统计
  const refreshData = async () => {
    await fetchList()
    try {
      const res = await api.get<ApiResponse<QuotationStats>>('/quotations/stats')
      if (res.code === 200 && res.data) setStats(res.data)
    } catch (err) {
      console.error('刷新统计失败:', err)
    }
  }

  // ==================== 操作：作废报价 ====================
  const handleVoid = async (reason?: string) => {
    if (!voidTarget) return
    const res = await api.post<ApiResponse<any>>(`/quotations/${voidTarget.id}/void`, { reason })
    if (res.code === 200) {
      setToast({ message: res.message || '报价已作废', type: 'success' })
      setVoidTarget(null)
      await refreshData()
    } else {
      throw new Error(res.message || '作废失败')
    }
  }

  // ==================== 操作：发送报价 ====================
  const handleSend = async (quotation: Quotation) => {
    setSubmitting(true)
    try {
      const res = await api.post<ApiResponse<any>>(`/quotations/${quotation.id}/send`)
      if (res.code === 200) {
        setToast({ message: '报价已发送', type: 'success' })
        await refreshData()
      } else {
        setToast({ message: res.message || '发送失败', type: 'error' })
      }
    } catch (err: any) {
      console.error('发送报价失败:', err)
      setToast({ message: err.message || '发送失败，请稍后重试', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  // ==================== 操作：接受报价 ====================
  const handleAccept = async () => {
    const quotation = acceptModal.quotation
    if (!quotation) return
    setSubmitting(true)
    try {
      const res = await api.post<ApiResponse<any>>(`/quotations/${quotation.id}/accept`)
      if (res.code === 200) {
        setToast({ message: '报价已接受', type: 'success' })
        setAcceptModal({ open: false, quotation: null })
        await refreshData()
      } else {
        setToast({ message: res.message || '操作失败', type: 'error' })
      }
    } catch (err: any) {
      console.error('接受报价失败:', err)
      setToast({ message: err.message || '操作失败，请稍后重试', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  // ==================== 操作：拒绝报价 ====================
  const handleReject = async () => {
    const quotation = rejectModal.quotation
    if (!quotation) return
    if (!rejectReason.trim()) {
      setToast({ message: '请填写拒绝原因', type: 'error' })
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post<ApiResponse<any>>(`/quotations/${quotation.id}/reject`, {
        reason: rejectReason.trim(),
      })
      if (res.code === 200) {
        setToast({ message: '报价已拒绝', type: 'success' })
        setRejectModal({ open: false, quotation: null })
        setRejectReason('')
        await refreshData()
      } else {
        setToast({ message: res.message || '操作失败', type: 'error' })
      }
    } catch (err: any) {
      console.error('拒绝报价失败:', err)
      setToast({ message: err.message || '操作失败，请稍后重试', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  // ==================== 操作：一键下单 ====================
  const handleConvertToOrder = async () => {
    const quotation = convertModal.quotation
    if (!quotation) return
    setSubmitting(true)
    try {
      const res = await api.post<ApiResponse<{ orderId: string }>>(`/quotations/${quotation.id}/convert-order`, {
        cargoDescription: quotation.route || '待补充',
        cargoWeightKg: 0,
        cargoQuantity: 1,
      })
      if (res.code === 200 && res.data) {
        setToast({ message: '订单创建成功，正在跳转...', type: 'success' })
        setConvertModal({ open: false, quotation: null })
        // 跳转到新创建的订单详情页
        setTimeout(() => {
          navigate(`/orders/${res.data.orderId}`)
        }, 800)
      } else {
        setToast({ message: res.message || '创建订单失败', type: 'error' })
      }
    } catch (err: any) {
      console.error('一键下单失败:', err)
      setToast({ message: err.message || '创建订单失败，请稍后重试', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  // 根据报价状态返回可用的操作按钮
  function renderRowActions(q: Quotation) {
    const s = q.status?.toUpperCase()

    return (
      <div className="flex items-center justify-center gap-1">
        {/* 查看按钮（始终显示） */}
        <button
          onClick={() => navigate(`/quotations/${q.id}`)}
          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
          title="查看"
        >
          <Eye className="w-4 h-4" />
        </button>

        {/* 编辑按钮（草稿和待报价显示） */}
        {(s === 'DRAFT' || s === 'PENDING_QUOTE') && (
          <button
            onClick={() => navigate(`/quotations/${q.id}/edit`)}
            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200"
            title="编辑"
          >
            <Edit className="w-4 h-4" />
          </button>
        )}

        {/* DRAFT 状态：发送按钮 */}
        {s === 'DRAFT' && (
          <button
            onClick={() => handleSend(q)}
            disabled={submitting}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200 disabled:opacity-40"
            title="发送"
          >
            <Send className="w-4 h-4" />
          </button>
        )}

        {/* SENT 状态：接受 + 拒绝 */}
        {s === 'SENT' && (
          <>
            <button
              onClick={() => setAcceptModal({ open: true, quotation: q })}
              className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200"
              title="接受"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setRejectModal({ open: true, quotation: q }); setRejectReason('') }}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
              title="拒绝"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </>
        )}

        {/* ACCEPTED 状态：一键下单 */}
        {s === 'ACCEPTED' && (
          <button
            onClick={() => setConvertModal({ open: true, quotation: q })}
            className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all duration-200"
            title="一键下单"
          >
            <ShoppingCart className="w-4 h-4" />
          </button>
        )}

        {/* 作废按钮（除 ACCEPTED/CANCELLED/CONVERTED 外都可作废） */}
        {!['ACCEPTED', 'CANCELLED', 'CONVERTED'].includes(s) && (
          <button
            onClick={() => setVoidTarget(q)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
            title="作废"
          >
            <Ban className="w-4 h-4" />
          </button>
        )}
      </div>
    )
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Toast 通知 */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* 页面标题 */}
      <div className="flex items-center gap-4">
        <div className="p-2 bg-blue-50 rounded-xl">
          <FileText className="w-5 h-5 text-blue-600" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">询价报价管理</h1>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title="本月报价" value={stats.monthly_total} icon={<Send className="w-5 h-5" />} color="blue" />
        <StatCard title="待回复" value={stats.pending_reply} icon={<Clock className="w-5 h-5" />} color="yellow" />
        <StatCard title="已接受" value={stats.accepted} icon={<CheckCircle className="w-5 h-5" />} color="green" />
        <StatCard title="已拒绝" value={stats.rejected} icon={<XCircle className="w-5 h-5" />} color="red" />
        <StatCard title="转化率" value={`${Number(stats.conversion_rate || 0).toFixed(1)}%`} icon={<TrendingUp className="w-5 h-5" />} color="purple" />
      </div>

      {/* 搜索栏 + 新建按钮 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索报价编号、客户名称..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
          />
        </div>
        <button
          onClick={() => navigate('/quotes/create')}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          新建报价
        </button>
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
              <col className="w-[12%]" /><col className="w-[13%]" /><col className="w-[14%]" />
              <col className="w-[10%]" /><col className="w-[12%]" /><col className="w-[7%]" />
              <col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[12%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">报价编号</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">客户</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">路线</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">业务类型</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">报价金额</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">版本</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">有效期</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">状态</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">暂无报价数据</p>
                  </td>
                </tr>
              ) : (
                quotations.map(q => (
                  <tr key={q.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                    <td className="px-4 py-3 text-xs text-slate-900 font-medium">{q.quote_number}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{q.client_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{q.route || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium ${BUSINESS_TYPE_STYLES[q.business_type] || 'bg-gray-100 text-gray-600'}`}>
                        {(BUSINESS_TYPE_LABELS as Record<string, string>)[q.business_type] || q.business_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-900 font-medium text-right">
                      {formatCurrency(q.amount, q.currency || 'EUR')}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 text-center">V{q.version || 1}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 text-center">{q.valid_until?.split('T')[0] || '-'}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={q.status} type="quotation" /></td>
                    <td className="px-4 py-3 text-center">
                      {renderRowActions(q)}
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

      {/* ==================== 接受确认弹窗 ==================== */}
      <Modal
        isOpen={acceptModal.open}
        onClose={() => setAcceptModal({ open: false, quotation: null })}
        title="确认接受报价"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setAcceptModal({ open: false, quotation: null })}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handleAccept}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '处理中...' : '确认接受'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            确定要接受以下报价吗？
          </p>
          {acceptModal.quotation && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">报价编号</span>
                <span className="text-sm font-medium text-slate-900">{acceptModal.quotation.quote_number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">客户</span>
                <span className="text-sm text-slate-700">{acceptModal.quotation.client_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">金额</span>
                <span className="text-sm font-medium text-slate-900">
                  {formatCurrency(acceptModal.quotation.amount, acceptModal.quotation.currency || 'EUR')}
                </span>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ==================== 拒绝弹窗 ==================== */}
      <Modal
        isOpen={rejectModal.open}
        onClose={() => { setRejectModal({ open: false, quotation: null }); setRejectReason('') }}
        title="拒绝报价"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => { setRejectModal({ open: false, quotation: null }); setRejectReason('') }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handleReject}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '处理中...' : '确认拒绝'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            确定要拒绝报价 <span className="font-medium text-slate-900">{rejectModal.quotation?.quote_number}</span> 吗？
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              拒绝原因 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请输入拒绝原因..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* ==================== 一键下单弹窗 ==================== */}
      <Modal
        isOpen={convertModal.open}
        onClose={() => setConvertModal({ open: false, quotation: null })}
        title="一键下单"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setConvertModal({ open: false, quotation: null })}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handleConvertToOrder}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '创建中...' : '确认创建订单'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            将以下报价转为正式订单，报价中的客户、路线、价格信息将自动带入。
          </p>
          {convertModal.quotation && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">报价编号</span>
                <span className="text-sm font-medium text-slate-900">{convertModal.quotation.quote_number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">客户</span>
                <span className="text-sm text-slate-700">{convertModal.quotation.client_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">路线</span>
                <span className="text-sm text-slate-700">{convertModal.quotation.route || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">业务类型</span>
                <span className="text-sm text-slate-700">
                  {(BUSINESS_TYPE_LABELS as Record<string, string>)[convertModal.quotation.business_type] || convertModal.quotation.business_type}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">报价金额</span>
                  <span className="text-sm font-semibold text-blue-600">
                    {formatCurrency(convertModal.quotation.amount, convertModal.quotation.currency || 'EUR')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* 作废报价确认弹窗 */}
      <ConfirmDialog
        isOpen={voidTarget !== null}
        onClose={() => setVoidTarget(null)}
        onConfirm={handleVoid}
        title="作废报价"
        message={'作废后，该报价将不可再接受或转为订单。历史数据会完整保留，可在"已作废"筛选中查看。'}
        targetLabel={voidTarget?.quote_number}
        requireReason
        reasonPlaceholder="请填写作废原因，例如：客户取消询价、报价错误等"
        variant="danger"
        confirmText="确认作废"
        warningText="此操作不可撤销，请谨慎操作"
      />
    </div>
  )
}
