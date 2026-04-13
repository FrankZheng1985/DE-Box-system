import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Wallet, DollarSign, CreditCard, TrendingUp, Percent, Eye, ChevronLeft, ChevronRight,
  Plus, CheckCircle, AlertCircle, Ban, Banknote, BarChart3, Download, FileText, Calendar,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import Modal from '../components/Modal'

// ==================== 类型定义 ====================

interface FinanceSummary {
  monthly_revenue: number
  receivable_balance: number
  payable_balance: number
  avg_margin: number
}

interface BillRow {
  id: string
  bill_no: string
  name: string        // 客户名 或 承运商名
  order_no: string
  amount: number
  status: string
  due_date: string
}

interface ClientProfit {
  client_name: string
  revenue: number
  cost: number
  profit: number
  margin: number
  order_count: number
}

interface AgingData { range: string; amount: number; count: number }

// 收款/付款表单
interface PaymentForm {
  amount: string
  paymentDate: string
  remarks: string
}

// 创建财务记录表单
interface CreateRecordForm {
  type: 'RECEIVABLE' | 'PAYABLE'
  orderId: string
  amount: string
  currency: string
  dueDate: string
  counterpartyType: string
  counterpartyId: string
  remarks: string
}

// 作废表单
interface VoidForm {
  reason: string
}

// ==================== 常量 ====================

const TABS = [
  { key: 'receivable', label: '应收账款' },
  { key: 'payable', label: '应付账款' },
  { key: 'profit', label: '利润分析' },
  { key: 'aging', label: '账龄分析' },
  { key: 'report', label: '报表' },
]

const INITIAL_PAYMENT_FORM: PaymentForm = { amount: '', paymentDate: '', remarks: '' }
const INITIAL_CREATE_FORM: CreateRecordForm = {
  type: 'RECEIVABLE', orderId: '', amount: '', currency: 'EUR',
  dueDate: '', counterpartyType: '', counterpartyId: '', remarks: '',
}
const INITIAL_VOID_FORM: VoidForm = { reason: '' }

function fmt(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount)
}

// ==================== 账单表格（应收/应付共用，含操作按钮） ====================

function BillTable({
  rows, loading, nameLabel, onPayment, onVoid, onView,
}: {
  rows: BillRow[]
  loading: boolean
  nameLabel: string
  onPayment: (row: BillRow) => void
  onVoid: (row: BillRow) => void
  onView: (row: BillRow) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[12%]" /><col className="w-[14%]" /><col className="w-[12%]" />
          <col className="w-[12%]" /><col className="w-[10%]" /><col className="w-[12%]" /><col className="w-[28%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-100">
            {['账单号', nameLabel, '关联订单', '金额', '状态', '到期日', '操作'].map((h, i) => (
              <th key={i} className={`text-xs font-medium text-slate-500 px-4 py-3 ${i === 3 ? 'text-right' : i >= 4 ? 'text-center' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b border-slate-50">
              {Array.from({ length: 7 }).map((_, j) => (
                <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
              ))}
            </tr>
          )) : rows.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-16 text-center text-sm text-slate-500">暂无数据</td></tr>
          ) : rows.map(r => (
            <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
              <td className="px-4 py-3 text-xs text-slate-900 font-medium">{r.bill_no}</td>
              <td className="px-4 py-3 text-xs text-slate-600 truncate">{r.name}</td>
              <td className="px-4 py-3 text-xs text-blue-600">{r.order_no || '-'}</td>
              <td className="px-4 py-3 text-xs text-slate-900 font-medium text-right">{fmt(r.amount)}</td>
              <td className="px-4 py-3 text-center"><StatusBadge status={r.status} type="payment" /></td>
              <td className="px-4 py-3 text-xs text-slate-500 text-center">{r.due_date?.split('T')[0] || '-'}</td>
              <td className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => onView(r)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                    title="查看"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {/* 记录收款/审核付款 按钮 - 仅未付或部分付款状态显示 */}
                  {(r.status === 'UNPAID' || r.status === 'PARTIAL') && (
                    <button
                      onClick={() => onPayment(r)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-all duration-200"
                      title={nameLabel === '客户' ? '记录收款' : '审核付款'}
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      {nameLabel === '客户' ? '收款' : '付款'}
                    </button>
                  )}
                  {/* 作废按钮 - 仅未付款状态显示 */}
                  {r.status === 'UNPAID' && (
                    <button
                      onClick={() => onVoid(r)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-all duration-200"
                      title="作废"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      作废
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ==================== 报表 Tab ====================

const MONTHLY_DATA = [
  { month: '11月', revenue: 85000 },
  { month: '12月', revenue: 92000 },
  { month: '1月', revenue: 78000 },
  { month: '2月', revenue: 105000 },
  { month: '3月', revenue: 98000 },
  { month: '4月', revenue: 112000 },
]

const RECENT_REPORTS = [
  { name: '2026年3月运营收入报表', type: '运营收入', date: '2026-04-02', status: '已生成' },
  { name: '2026年Q1利润分析', type: '利润分析', date: '2026-04-01', status: '已生成' },
  { name: '2026年3月运输成本报表', type: '运输成本', date: '2026-04-01', status: '已生成' },
  { name: '2026年2月运营收入报表', type: '运营收入', date: '2026-03-02', status: '已生成' },
]

function ReportTab() {
  const [reportType, setReportType] = useState('revenue')
  const [timeRange, setTimeRange] = useState('month')

  const maxRevenue = Math.max(...MONTHLY_DATA.map(d => d.revenue))

  return (
    <div className="p-6 space-y-6">
      {/* 报表生成表单 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
        <div className="flex-1 min-w-0">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
            报表类型
          </label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
          >
            <option value="revenue">运营收入</option>
            <option value="cost">运输成本</option>
            <option value="profit">利润分析</option>
          </select>
        </div>
        <div className="flex-1 min-w-0">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            时间范围
          </label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
          >
            <option value="month">本月</option>
            <option value="last_month">上月</option>
            <option value="quarter">本季</option>
            <option value="year">本年</option>
          </select>
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all duration-200">
          <BarChart3 className="w-4 h-4" />
          生成报表
        </button>
      </div>

      {/* 简易柱状图：近6个月收入 */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-4">近 6 个月营收趋势</h3>
        <div className="flex items-end gap-3 h-48 px-2">
          {MONTHLY_DATA.map((d) => {
            const heightPct = Math.round((d.revenue / maxRevenue) * 100)
            return (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-medium text-slate-700">
                  {fmt(d.revenue)}
                </span>
                <div className="w-full flex justify-center" style={{ height: '140px' }}>
                  <div
                    className="w-full max-w-[48px] rounded-t-lg bg-blue-500 hover:bg-blue-600 transition-all duration-200"
                    style={{ height: `${heightPct}%` }}
                    title={`${d.month}: ${fmt(d.revenue)}`}
                  />
                </div>
                <span className="text-xs text-slate-500">{d.month}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 最近报表 */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">最近生成的报表</h3>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[35%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[12%]" />
              <col className="w-[13%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-xs font-medium text-slate-500 px-4 py-2.5 text-left">报表名称</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-2.5 text-left">类型</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-2.5 text-center">生成日期</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-2.5 text-center">状态</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-2.5 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {RECENT_REPORTS.map((r, idx) => (
                <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                  <td className="px-4 py-2.5 text-xs text-slate-900 font-medium flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    {r.name}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{r.type}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 text-center">{r.date}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200" title="下载">
                      <Download className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

export default function FinanceManagement() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('receivable')
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [billRows, setBillRows] = useState<BillRow[]>([])
  const [profits, setProfits] = useState<ClientProfit[]>([])
  const [aging, setAging] = useState<AgingData[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  // Toast 通知
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // 收款/付款弹窗
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; row: BillRow | null }>({ open: false, row: null })
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(INITIAL_PAYMENT_FORM)
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)

  // 创建财务记录弹窗
  const [createModal, setCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState<CreateRecordForm>(INITIAL_CREATE_FORM)
  const [createSubmitting, setCreateSubmitting] = useState(false)

  // 作废弹窗
  const [voidModal, setVoidModal] = useState<{ open: boolean; row: BillRow | null }>({ open: false, row: null })
  const [voidForm, setVoidForm] = useState<VoidForm>(INITIAL_VOID_FORM)
  const [voidSubmitting, setVoidSubmitting] = useState(false)

  // Toast 自动消失
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  // 获取财务汇总
  useEffect(() => {
    api.get<ApiResponse<FinanceSummary>>('/finance/summary')
      .then(res => { if (res.code === 200) setSummary(res.data) })
      .catch(err => console.error('获取财务汇总失败:', err))
  }, [])

  // 根据 tab 加载数据
  const loadData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'receivable' || activeTab === 'payable') {
        const endpoint = activeTab === 'receivable' ? '/finance/receivables' : '/finance/payables'
        const nameKey = activeTab === 'receivable' ? 'client_name' : 'carrier_name'
        const res = await api.get<ApiResponse<{ items: any[]; pagination: { total: number } }>>(
          `${endpoint}?page=${page}&pageSize=${pageSize}`
        )
        if (res.code === 200 && res.data) {
          setBillRows((res.data.items || []).map((r: any) => ({ ...r, name: r[nameKey] || '-' })))
          setTotal(res.data.pagination?.total || 0)
        }
      } else if (activeTab === 'profit') {
        const res = await api.get<ApiResponse<ClientProfit[]>>('/finance/profit/by-client')
        if (res.code === 200) setProfits(res.data || [])
      } else if (activeTab === 'aging') {
        const res = await api.get<ApiResponse<AgingData[]>>('/finance/aging/receivable')
        if (res.code === 200) setAging(res.data || [])
      }
    } catch (err) {
      console.error('获取财务数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [activeTab, page])

  // ==================== 收款/付款操作 ====================

  const openPaymentModal = (row: BillRow) => {
    setPaymentModal({ open: true, row })
    setPaymentForm(INITIAL_PAYMENT_FORM)
  }

  const handlePayment = async () => {
    if (!paymentModal.row) return
    const amount = Number(paymentForm.amount)
    if (!amount || amount <= 0) {
      setToast({ type: 'error', message: '收款金额必须大于 0' })
      return
    }

    setPaymentSubmitting(true)
    try {
      await api.put<ApiResponse<unknown>>(`/finance/${paymentModal.row.id}/payment`, { amount })
      setToast({ type: 'success', message: '收款记录已保存' })
      setPaymentModal({ open: false, row: null })
      loadData()
      // 刷新汇总
      api.get<ApiResponse<FinanceSummary>>('/finance/summary')
        .then(res => { if (res.code === 200) setSummary(res.data) })
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message || '操作失败' })
    } finally {
      setPaymentSubmitting(false)
    }
  }

  // ==================== 创建财务记录 ====================

  const openCreateModal = (type: 'RECEIVABLE' | 'PAYABLE') => {
    setCreateForm({ ...INITIAL_CREATE_FORM, type })
    setCreateModal(true)
  }

  const handleCreateRecord = async () => {
    if (!createForm.amount || Number(createForm.amount) <= 0) {
      setToast({ type: 'error', message: '金额必须大于 0' })
      return
    }
    if (!createForm.dueDate) {
      setToast({ type: 'error', message: '请选择到期日' })
      return
    }

    setCreateSubmitting(true)
    try {
      const payload = {
        type: createForm.type,
        orderId: createForm.orderId.trim() || undefined,
        amount: Number(createForm.amount),
        currency: createForm.currency || 'EUR',
        dueDate: createForm.dueDate,
        counterpartyType: createForm.counterpartyType.trim() || undefined,
        counterpartyId: createForm.counterpartyId.trim() || undefined,
        remarks: createForm.remarks.trim() || undefined,
      }
      await api.post<ApiResponse<unknown>>('/finance/records', payload)
      setToast({ type: 'success', message: `${createForm.type === 'RECEIVABLE' ? '应收' : '应付'}记录创建成功` })
      setCreateModal(false)
      loadData()
      // 刷新汇总
      api.get<ApiResponse<FinanceSummary>>('/finance/summary')
        .then(res => { if (res.code === 200) setSummary(res.data) })
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message || '创建失败' })
    } finally {
      setCreateSubmitting(false)
    }
  }

  // ==================== 作废操作 ====================

  const openVoidModal = (row: BillRow) => {
    setVoidModal({ open: true, row })
    setVoidForm(INITIAL_VOID_FORM)
  }

  const handleVoid = async () => {
    if (!voidModal.row) return
    if (!voidForm.reason.trim()) {
      setToast({ type: 'error', message: '请输入作废原因' })
      return
    }

    setVoidSubmitting(true)
    try {
      await api.put<ApiResponse<unknown>>(`/finance/${voidModal.row.id}/void`, { reason: voidForm.reason.trim() })
      setToast({ type: 'success', message: '账单已作废' })
      setVoidModal({ open: false, row: null })
      loadData()
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message || '作废失败' })
    } finally {
      setVoidSubmitting(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)
  const maxAgingAmt = Math.max(...aging.map(a => a.amount), 1)

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Toast 通知 */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-[slideInFromRight_300ms_ease-out] ${
          toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* 页面标题 + 创建按钮 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-green-50 rounded-xl"><Wallet className="w-5 h-5 text-green-600" /></div>
          <h1 className="text-xl font-semibold text-slate-900">财务管理</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openCreateModal('RECEIVABLE')}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            创建应收
          </button>
          <button
            onClick={() => openCreateModal('PAYABLE')}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-xl transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            创建应付
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="本月营收" value={summary ? fmt(summary.monthly_revenue) : '-'} icon={<DollarSign className="w-5 h-5" />} color="green" />
        <StatCard title="应收余额" value={summary ? fmt(summary.receivable_balance) : '-'} icon={<CreditCard className="w-5 h-5" />} color="blue" />
        <StatCard title="应付余额" value={summary ? fmt(summary.payable_balance) : '-'} icon={<TrendingUp className="w-5 h-5" />} color="yellow" />
        <StatCard title="平均毛利率" value={summary ? `${Number(summary.avg_margin || 0).toFixed(1)}%` : '-'} icon={<Percent className="w-5 h-5" />} color="purple" />
      </div>

      {/* Tab 标签栏 */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setPage(1) }}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all duration-200 ${
              activeTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>{tab.label}</button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
        {/* 应收/应付 导出按钮 + 共用表格 */}
        {(activeTab === 'receivable' || activeTab === 'payable') && (
          <div className="flex items-center justify-end px-4 pt-4 pb-2">
            <button
              onClick={() => window.open(`/api/v1/finance/export/${activeTab === 'receivable' ? 'receivables' : 'payables'}`, '_blank')}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-all duration-200"
            >
              <Download className="w-3.5 h-3.5" />
              导出
            </button>
          </div>
        )}
        {(activeTab === 'receivable' || activeTab === 'payable') && (
          <BillTable
            rows={billRows}
            loading={loading}
            nameLabel={activeTab === 'receivable' ? '客户' : '承运商'}
            onPayment={openPaymentModal}
            onVoid={openVoidModal}
            onView={(row) => navigate(`/orders?search=${encodeURIComponent(row.order_no)}`)}
          />
        )}

        {/* 利润分析 */}
        {activeTab === 'profit' && (
          <div className="p-6">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />)}
              </div>
            ) : profits.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-16">暂无利润数据</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {profits.map(p => (
                  <div key={p.client_name} className="border border-slate-100 rounded-xl p-4 hover:shadow-md transition-all duration-200">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">{p.client_name}</h3>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-slate-500">营收:</span> <span className="text-slate-900 font-medium">{fmt(p.revenue)}</span></div>
                      <div><span className="text-slate-500">成本:</span> <span className="text-slate-900 font-medium">{fmt(p.cost)}</span></div>
                      <div><span className="text-slate-500">利润:</span> <span className="text-green-600 font-medium">{fmt(p.profit)}</span></div>
                      <div><span className="text-slate-500">毛利率:</span> <span className="text-purple-600 font-medium">{p.margin ? Number(p.margin).toFixed(1) : '0'}%</span></div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">订单数: {p.order_count}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 账龄分析 */}
        {activeTab === 'aging' && (
          <div className="p-6">
            {loading ? (
              <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : aging.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-16">暂无账龄数据</p>
            ) : (
              <div className="space-y-4">
                {aging.map(a => (
                  <div key={a.range} className="flex items-center gap-4">
                    <span className="text-xs text-slate-600 w-20 shrink-0">{a.range}天</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${
                        a.range === '90+' ? 'bg-red-400' : a.range === '61-90' ? 'bg-orange-400' : a.range === '31-60' ? 'bg-amber-400' : 'bg-green-400'
                      }`} style={{ width: `${Math.max((a.amount / maxAgingAmt) * 100, 2)}%` }} />
                    </div>
                    <div className="text-right w-32 shrink-0">
                      <span className="text-xs font-medium text-slate-900">{fmt(a.amount)}</span>
                      <span className="text-xs text-slate-400 ml-2">({a.count}笔)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 报表 */}
        {activeTab === 'report' && <ReportTab />}

        {/* 分页（仅应收/应付 Tab） */}
        {(activeTab === 'receivable' || activeTab === 'payable') && total > 0 && (
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

      {/* ==================== 收款/付款弹窗 ==================== */}
      <Modal
        isOpen={paymentModal.open}
        onClose={() => setPaymentModal({ open: false, row: null })}
        title={activeTab === 'receivable' ? '记录收款' : '审核付款'}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setPaymentModal({ open: false, row: null })}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handlePayment}
              disabled={paymentSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {paymentSubmitting ? '提交中...' : '确认'}
            </button>
          </div>
        }
      >
        {paymentModal.row && (
          <div className="space-y-4">
            {/* 账单信息概览 */}
            <div className="bg-slate-50 rounded-xl p-3 space-y-1">
              <p className="text-xs text-slate-500">账单号: <span className="text-slate-900 font-medium">{paymentModal.row.bill_no}</span></p>
              <p className="text-xs text-slate-500">账单金额: <span className="text-slate-900 font-medium">{fmt(paymentModal.row.amount)}</span></p>
            </div>

            {/* 收款金额 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {activeTab === 'receivable' ? '收款金额' : '付款金额'} (EUR) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={paymentForm.amount}
                onChange={e => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
              />
            </div>

            {/* 收款日期 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {activeTab === 'receivable' ? '收款日期' : '付款日期'}
              </label>
              <input
                type="date"
                value={paymentForm.paymentDate}
                onChange={e => setPaymentForm(prev => ({ ...prev, paymentDate: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
              />
            </div>

            {/* 备注 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
              <textarea
                value={paymentForm.remarks}
                onChange={e => setPaymentForm(prev => ({ ...prev, remarks: e.target.value }))}
                placeholder="可选备注信息"
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none transition-all duration-200"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ==================== 创建财务记录弹窗 ==================== */}
      <Modal
        isOpen={createModal}
        onClose={() => setCreateModal(false)}
        title={`创建${createForm.type === 'RECEIVABLE' ? '应收' : '应付'}记录`}
        size="md"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setCreateModal(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handleCreateRecord}
              disabled={createSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {createSubmitting ? '提交中...' : '确认创建'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* 类型切换 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">类型</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={createForm.type === 'RECEIVABLE'}
                  onChange={() => setCreateForm(prev => ({ ...prev, type: 'RECEIVABLE' }))}
                />
                <span className="text-sm text-slate-700">应收账款</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={createForm.type === 'PAYABLE'}
                  onChange={() => setCreateForm(prev => ({ ...prev, type: 'PAYABLE' }))}
                />
                <span className="text-sm text-slate-700">应付账款</span>
              </label>
            </div>
          </div>

          {/* 关联订单 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">关联订单号</label>
            <input
              type="text"
              value={createForm.orderId}
              onChange={e => setCreateForm(prev => ({ ...prev, orderId: e.target.value }))}
              placeholder="输入订单编号"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* 金额 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                金额 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={createForm.amount}
                onChange={e => setCreateForm(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
              />
            </div>

            {/* 币种 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">币种</label>
              <select
                value={createForm.currency}
                onChange={e => setCreateForm(prev => ({ ...prev, currency: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="CNY">CNY</option>
              </select>
            </div>
          </div>

          {/* 到期日 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              到期日 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={createForm.dueDate}
              onChange={e => setCreateForm(prev => ({ ...prev, dueDate: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 备注 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
            <textarea
              value={createForm.remarks}
              onChange={e => setCreateForm(prev => ({ ...prev, remarks: e.target.value }))}
              placeholder="可选备注信息"
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none transition-all duration-200"
            />
          </div>
        </div>
      </Modal>

      {/* ==================== 作废确认弹窗 ==================== */}
      <Modal
        isOpen={voidModal.open}
        onClose={() => setVoidModal({ open: false, row: null })}
        title="作废账单"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setVoidModal({ open: false, row: null })}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handleVoid}
              disabled={voidSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {voidSubmitting ? '处理中...' : '确认作废'}
            </button>
          </div>
        }
      >
        {voidModal.row && (
          <div className="space-y-4">
            <div className="bg-red-50 rounded-xl p-3 border border-red-100">
              <p className="text-sm text-red-700">
                即将作废账单 <span className="font-semibold">{voidModal.row.bill_no}</span>，金额 <span className="font-semibold">{fmt(voidModal.row.amount)}</span>。此操作不可撤销。
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                作废原因 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={voidForm.reason}
                onChange={e => setVoidForm({ reason: e.target.value })}
                placeholder="请输入作废原因"
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none transition-all duration-200"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
