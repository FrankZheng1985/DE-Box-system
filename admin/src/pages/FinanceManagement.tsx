import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Wallet, DollarSign, CreditCard, TrendingUp, Percent, Eye, ChevronLeft, ChevronRight,
  Plus, CheckCircle, AlertCircle, Ban, Banknote, BarChart3, Download, Calendar,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import Modal from '../components/Modal'
import { formatDate } from '../utils/format'

// ==================== 类型定义 ====================

interface FinanceSummary {
  monthRevenue: number
  arOutstanding: number
  apOutstanding: number
  marginPct: string | number
}

// 对应 GET /finance/receivables|payables 返回行，字段名与 financial_records 一致。
// 不要加 [key: string]: any —— 正是它让 row.bill_no 这种查无此字段的写法
// 通过了类型检查，弹窗里的单号一直是空白（踩坑 033）
interface BillRow {
  id: string
  record_number: string
  order_id: string | null
  order_number: string | null
  type: 'RECEIVABLE' | 'PAYABLE'
  counterparty_type: string | null
  counterparty_id: string | null
  counterparty_name: string | null
  amount: string | number
  currency: string
  payment_status: string
  due_date: string | null
  paid_date: string | null
  paid_amount: string | number | null
  auto_generated?: boolean
  remarks: string | null
  created_at?: string
}

// 对应 GET /finance/profit/by-client 返回行；NUMERIC/COUNT 字段是字符串（踩坑 002）
interface ClientProfit {
  id: string
  company_name: string
  client_code: string
  total_revenue: string | number
  total_cost: string | number
  gross_profit: string | number
  margin_pct: string | number
  order_count: string | number
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
  // 存订单 UUID（order_id 是 uuid 列），界面上显示的是订单号
  orderId: string
  amount: string
  currency: string
  dueDate: string
  remarks: string
}

// 作废表单
interface VoidForm {
  reason: string
}

// ==================== 常量 ====================

const TABS = [
  { key: 'receivable', labelKey: 'finance.receivable' },
  { key: 'payable', labelKey: 'finance.payable' },
  { key: 'profit', labelKey: 'finance.profitAnalysis' },
  { key: 'aging', labelKey: 'finance.agingAnalysis' },
  { key: 'report', labelKey: 'finance.reports' },
]

const INITIAL_PAYMENT_FORM: PaymentForm = { amount: '', paymentDate: '', remarks: '' }
const INITIAL_CREATE_FORM: CreateRecordForm = {
  type: 'RECEIVABLE', orderId: '', amount: '', currency: 'EUR',
  dueDate: '', remarks: '',
}
const INITIAL_VOID_FORM: VoidForm = { reason: '' }

// PostgreSQL NUMERIC 经 API 返回是字符串（踩坑 002），统一在这里 Number() 转换
function fmt(amount: string | number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(amount))
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
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[12%]" /><col className="w-[14%]" /><col className="w-[12%]" />
          <col className="w-[12%]" /><col className="w-[10%]" /><col className="w-[12%]" /><col className="w-[28%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-100">
            {[t('finance.colBillNo'), nameLabel, t('common.relatedOrder'), t('common.amount'), t('common.status'), t('finance.colDueDate'), t('common.actions')].map((h, i) => (
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
            <tr><td colSpan={7} className="px-4 py-16 text-center text-sm text-slate-500">{t('common.noData')}</td></tr>
          ) : rows.map(r => (
            <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
              <td className="px-4 py-3 text-xs text-slate-900 font-medium">{r.record_number || '-'}</td>
              <td className="px-4 py-3 text-xs text-slate-600 truncate">{r.counterparty_name || '-'}</td>
              <td className="px-4 py-3 text-xs text-blue-600 cursor-pointer hover:underline" onClick={() => r.order_id && onView(r)}>{r.order_number || '-'}</td>
              <td className="px-4 py-3 text-xs text-slate-900 font-medium text-right">{fmt(r.amount)}</td>
              <td className="px-4 py-3 text-center"><StatusBadge status={r.payment_status} type="payment" /></td>
              <td className="px-4 py-3 text-xs text-slate-500 text-center">{formatDate(r.due_date)}</td>
              <td className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => onView(r)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                    title={t('common.view')}
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {/* 记录收款/审核付款 按钮 - 仅未付或部分付款状态显示 */}
                  {(r.payment_status === 'UNPAID' || r.payment_status === 'PARTIAL') && (
                    <button
                      onClick={() => onPayment(r)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-all duration-200"
                      title={nameLabel === t('common.client') ? t('finance.recordReceipt') : t('finance.approvePayment')}
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      {nameLabel === t('common.client') ? t('finance.receipt') : t('finance.payment')}
                    </button>
                  )}
                  {/* 作废按钮 - 仅未付款状态显示 */}
                  {r.payment_status === 'UNPAID' && (
                    <button
                      onClick={() => onVoid(r)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-all duration-200"
                      title={t('master.void')}
                    >
                      <Ban className="w-3.5 h-3.5" />
                      {t('master.void')}
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

function ReportTab() {
  const { t } = useTranslation()
  const [reportType, setReportType] = useState('revenue')
  const [timeRange, setTimeRange] = useState('month')
  const [monthlyData, setMonthlyData] = useState<{month: string; revenue: number}[]>([])
  const [loadingReport, setLoadingReport] = useState(true)

  // 从真实订单数据计算月度营收
  useEffect(() => {
    (async () => {
      setLoadingReport(true)
      try {
        // 获取最近6个月已完成订单的营收
        const months: {month: string; revenue: number}[] = []
        const now = new Date()
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const monthLabel = t('finance.monthShort', { month: d.getMonth() + 1 })
          const from = d.toISOString().slice(0, 10)
          const to = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
          try {
            // 月度营收统计全部业务类型（旧版硬编码 CURTAIN_SIDE，迁移 105 之后查不到任何单）
            const res = await api.get<any>(`/orders?status=COMPLETED&dateFrom=${from}&dateTo=${to}&pageSize=100`)
            const orders = Array.isArray(res.data) ? res.data : []
            const total = orders.reduce((sum: number, o: any) => sum + (parseFloat(o.client_price) || 0), 0)
            months.push({ month: monthLabel, revenue: total })
          } catch { months.push({ month: monthLabel, revenue: 0 }) }
        }
        setMonthlyData(months)
      } catch (e) { console.error('加载月度数据失败:', e) }
      finally { setLoadingReport(false) }
    })()
  }, [])

  const maxRevenue = Math.max(...monthlyData.map(d => d.revenue), 1)

  return (
    <div className="p-6 space-y-6">
      {/* 报表生成表单 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
        <div className="flex-1 min-w-0">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
            {t('finance.reportType')}
          </label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
          >
            <option value="revenue">{t('finance.reportRevenue')}</option>
            <option value="cost">{t('finance.reportCost')}</option>
            <option value="profit">{t('finance.profitAnalysis')}</option>
          </select>
        </div>
        <div className="flex-1 min-w-0">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            {t('finance.dateRange')}
          </label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
          >
            <option value="month">{t('finance.rangeThisMonth')}</option>
            <option value="last_month">{t('finance.rangeLastMonth')}</option>
            <option value="quarter">{t('finance.rangeThisQuarter')}</option>
            <option value="year">{t('finance.rangeThisYear')}</option>
          </select>
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all duration-200">
          <BarChart3 className="w-4 h-4" />
          {t('finance.generateReport')}
        </button>
      </div>

      {/* 简易柱状图：近6个月收入 */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-4">{t('finance.revenueTrendTitle')}</h3>
        {loadingReport ? (
          <div className="flex items-end gap-3 h-48 px-2">
            {Array.from({length: 6}).map((_, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="h-4 w-16 bg-slate-100 rounded animate-pulse" />
                <div className="w-full flex justify-center" style={{height:'140px'}}>
                  <div className="w-full max-w-[48px] rounded-t-lg bg-slate-100 animate-pulse" style={{height:`${30+Math.random()*50}%`}} />
                </div>
                <div className="h-3 w-8 bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
        <div className="flex items-end gap-4 h-64 px-4 pt-8 pb-2">
          {monthlyData.map((d) => {
            const heightPct = Math.max(Math.round((d.revenue / maxRevenue) * 100), d.revenue > 0 ? 8 : 2)
            return (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-3 min-w-0">
                <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                  {d.revenue > 0 ? fmt(d.revenue) : '-'}
                </span>
                <div className="w-full flex justify-center" style={{ height: '160px' }}>
                  <div
                    className="w-full max-w-[52px] rounded-t-lg transition-all duration-300"
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: d.revenue > 0 ? '#3B82F6' : '#E2E8F0'
                    }}
                    title={`${d.month}: ${fmt(d.revenue)}`}
                  />
                </div>
                <span className="text-xs font-medium text-slate-500">{d.month}</span>
              </div>
            )
          })}
        </div>
        )}
      </div>

      {/* 最近报表 */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('finance.recentReports')}</h3>
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
                <th className="text-xs font-medium text-slate-500 px-4 py-2.5 text-left">{t('finance.colReportName')}</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-2.5 text-left">{t('common.type')}</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-2.5 text-center">{t('finance.colGeneratedAt')}</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-2.5 text-center">{t('common.status')}</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-2.5 text-center">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                  {t('finance.noReports')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

export default function FinanceManagement() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('receivable')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('')
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
  // 提交失败就地显示在弹窗里：只发会自动消失的 toast 的话，
  // 用户看到的就是"点了没反应"（弹窗不关、列表不变）
  const [createError, setCreateError] = useState('')
  // 关联订单搜索选择器（同 CMR 上传弹窗的做法）
  const [orderSearch, setOrderSearch] = useState('')
  const [orderOptions, setOrderOptions] = useState<{ id: string; order_number: string; client_name: string }[]>([])
  const [orderSearching, setOrderSearching] = useState(false)
  const [selectedOrderLabel, setSelectedOrderLabel] = useState('')

  // 订单搜索防抖
  useEffect(() => {
    if (!orderSearch.trim() || createForm.orderId) {
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
  }, [orderSearch, createForm.orderId])

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
        const statusParam = paymentStatusFilter ? `&paymentStatus=${paymentStatusFilter}` : ''
        const res = await api.get<any>(`${endpoint}?page=${page}&pageSize=${pageSize}${statusParam}`)
        if (res.code === 200) {
          const rows = Array.isArray(res.data) ? res.data : (res.data?.items || [])
          setBillRows(rows.map((r: any) => ({ ...r, name: r[nameKey] || r.counterparty_name || '-' })))
          setTotal(res.pagination?.total || res.data?.pagination?.total || rows.length)
        }
      } else if (activeTab === 'profit') {
        const res = await api.get<ApiResponse<ClientProfit[]>>('/finance/profit/by-client')
        if (res.code === 200) setProfits(Array.isArray(res.data) ? res.data : [])
      } else if (activeTab === 'aging') {
        const res = await api.get<any>('/finance/aging/receivable')
        if (res.code === 200 && res.data) {
          // API 返回对象 { "0_30": "8040", "31_60": "0", ... }，转换为数组
          const d = res.data
          if (Array.isArray(d)) {
            setAging(d)
          } else {
            setAging([
              { range: '0-30', amount: parseFloat(d['0_30']) || 0, count: 0 },
              { range: '31-60', amount: parseFloat(d['31_60']) || 0, count: 0 },
              { range: '61-90', amount: parseFloat(d['61_90']) || 0, count: 0 },
              { range: '90+', amount: parseFloat(d['90_plus']) || 0, count: 0 },
            ].filter(a => a.amount > 0 || true)) // 保留所有
          }
        }
      }
    } catch (err) {
      console.error('获取财务数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [activeTab, page, paymentStatusFilter])

  // ==================== 收款/付款操作 ====================

  const openPaymentModal = (row: BillRow) => {
    setPaymentModal({ open: true, row })
    setPaymentForm(INITIAL_PAYMENT_FORM)
  }

  const handlePayment = async () => {
    if (!paymentModal.row) return
    const amount = Number(paymentForm.amount)
    if (!amount || amount <= 0) {
      setToast({ type: 'error', message: t('finance.errReceiptAmount') })
      return
    }

    setPaymentSubmitting(true)
    try {
      await api.put<ApiResponse<unknown>>(`/finance/${paymentModal.row.id}/payment`, { amount })
      setToast({ type: 'success', message: t('finance.receiptSaved') })
      setPaymentModal({ open: false, row: null })
      loadData()
      // 刷新汇总
      api.get<ApiResponse<FinanceSummary>>('/finance/summary')
        .then(res => { if (res.code === 200) setSummary(res.data) })
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message || t('common.operateFailed') })
    } finally {
      setPaymentSubmitting(false)
    }
  }

  // ==================== 创建财务记录 ====================

  const openCreateModal = (type: 'RECEIVABLE' | 'PAYABLE') => {
    setCreateForm({ ...INITIAL_CREATE_FORM, type })
    setCreateError('')
    setOrderSearch('')
    setOrderOptions([])
    setSelectedOrderLabel('')
    setCreateModal(true)
  }

  const closeCreateModal = () => {
    setCreateModal(false)
    setCreateError('')
    setOrderSearch('')
    setOrderOptions([])
    setSelectedOrderLabel('')
  }

  const handleCreateRecord = async () => {
    setCreateError('')
    // 对手方由后端按订单推导（应收对客户、应付对承运商），所以订单是必填的
    if (!createForm.orderId) {
      setCreateError(t('finance.errOrderRequired'))
      return
    }
    if (!createForm.amount || Number(createForm.amount) <= 0) {
      setCreateError(t('finance.errAmount'))
      return
    }
    if (!createForm.dueDate) {
      setCreateError(t('finance.errDueDate'))
      return
    }

    setCreateSubmitting(true)
    try {
      const payload = {
        type: createForm.type,
        orderId: createForm.orderId,
        amount: Number(createForm.amount),
        currency: createForm.currency || 'EUR',
        dueDate: createForm.dueDate,
        remarks: createForm.remarks.trim() || undefined,
      }
      const res = await api.post<ApiResponse<unknown>>('/finance/records', payload)
      // api 客户端对非 2xx 会抛异常，这里再兜一道业务码，避免失败被当成功
      if (res.code !== 200 && res.code !== 201) {
        setCreateError(res.message || t('finance.createFailed'))
        return
      }
      setToast({
        type: 'success',
        message: t('finance.recordCreated', {
          type: createForm.type === 'RECEIVABLE' ? t('finance.arShort') : t('finance.apShort'),
        }),
      })
      closeCreateModal()
      loadData()
      // 刷新汇总
      api.get<ApiResponse<FinanceSummary>>('/finance/summary')
        .then(res => { if (res.code === 200) setSummary(res.data) })
    } catch (err: any) {
      setCreateError(err?.message || t('finance.createFailed'))
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
      setToast({ type: 'error', message: t('finance.errVoidReason') })
      return
    }

    setVoidSubmitting(true)
    try {
      await api.put<ApiResponse<unknown>>(`/finance/${voidModal.row.id}/void`, { reason: voidForm.reason.trim() })
      setToast({ type: 'success', message: t('finance.voided') })
      setVoidModal({ open: false, row: null })
      loadData()
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message || t('quotation.voidFailed') })
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
          <h1 className="text-xl font-semibold text-slate-900">{t('finance.pageTitle')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openCreateModal('RECEIVABLE')}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            {t('finance.createReceivable')}
          </button>
          <button
            onClick={() => openCreateModal('PAYABLE')}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-xl transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            {t('finance.createPayable')}
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t('finance.statMonthRevenue')} value={summary ? fmt(summary.monthRevenue) : '-'} icon={<DollarSign className="w-5 h-5" />} color="green" />
        <StatCard title={t('finance.statArOutstanding')} value={summary ? fmt(summary.arOutstanding) : '-'} icon={<CreditCard className="w-5 h-5" />} color="blue" />
        <StatCard title={t('finance.statApOutstanding')} value={summary ? fmt(summary.apOutstanding) : '-'} icon={<TrendingUp className="w-5 h-5" />} color="yellow" />
        <StatCard title={t('finance.statAvgMargin')} value={summary ? `${Number(summary.marginPct || 0).toFixed(1)}%` : '-'} icon={<Percent className="w-5 h-5" />} color="purple" />
      </div>

      {/* Tab 标签栏 */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setPage(1) }}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all duration-200 ${
              activeTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>{t(tab.labelKey)}</button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
        {/* 应收/应付 导出按钮 + 共用表格 */}
        {(activeTab === 'receivable' || activeTab === 'payable') && (
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            {/* 状态子 Tab */}
            <div className="flex gap-1 bg-slate-50 rounded-lg p-0.5">
              {[
                { key: '', labelKey: 'common.all' },
                { key: 'UNPAID', labelKey: 'status.UNPAID' },
                { key: 'PARTIAL', labelKey: 'statusByType.payment.PARTIAL' },
                { key: 'PAID', labelKey: 'status.PAID' },
                { key: 'VOID', labelKey: 'status.VOID' },
              ].map(s => (
                <button
                  key={s.key}
                  onClick={() => { setPaymentStatusFilter(s.key); setPage(1) }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                    paymentStatusFilter === s.key
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >{t(s.labelKey)}</button>
              ))}
            </div>
            <button
              onClick={() => window.open(`/api/v1/finance/export/${activeTab === 'receivable' ? 'receivables' : 'payables'}`, '_blank')}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-all duration-200"
            >
              <Download className="w-3.5 h-3.5" />
              {t('common.export')}
            </button>
          </div>
        )}
        {(activeTab === 'receivable' || activeTab === 'payable') && (
          <BillTable
            rows={billRows}
            loading={loading}
            nameLabel={activeTab === 'receivable' ? t('common.client') : t('common.carrier')}
            onPayment={openPaymentModal}
            onVoid={openVoidModal}
            onView={(row) => navigate(`/finance/${row.id}`)}
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
              <p className="text-sm text-slate-500 text-center py-16">{t('finance.noProfitData')}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {profits.map(p => (
                  <div key={p.id} className="border border-slate-100 rounded-xl p-4 hover:shadow-md transition-all duration-200">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">{p.company_name}</h3>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-slate-500">{t('finance.revenueLabel')}</span> <span className="text-slate-900 font-medium">{fmt(Number(p.total_revenue))}</span></div>
                      <div><span className="text-slate-500">{t('finance.costLabel')}</span> <span className="text-slate-900 font-medium">{fmt(Number(p.total_cost))}</span></div>
                      <div><span className="text-slate-500">{t('finance.profitLabel')}</span> <span className="text-green-600 font-medium">{fmt(Number(p.gross_profit))}</span></div>
                      <div><span className="text-slate-500">{t('finance.marginLabel')}</span> <span className="text-purple-600 font-medium">{Number(p.margin_pct ?? 0).toFixed(1)}%</span></div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">{t('finance.orderCountLabel')}: {p.order_count}</p>
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
              <p className="text-sm text-slate-500 text-center py-16">{t('finance.noAgingData')}</p>
            ) : (
              <div className="space-y-4">
                {aging.map(a => (
                  <div key={a.range} className="flex items-center gap-4">
                    <span className="text-xs text-slate-600 w-20 shrink-0">{t('finance.agingDays', { range: a.range })}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${
                        a.range === '90+' ? 'bg-red-400' : a.range === '61-90' ? 'bg-orange-400' : a.range === '31-60' ? 'bg-amber-400' : 'bg-green-400'
                      }`} style={{ width: `${Math.max((a.amount / maxAgingAmt) * 100, 2)}%` }} />
                    </div>
                    <div className="text-right w-32 shrink-0">
                      <span className="text-xs font-medium text-slate-900">{fmt(a.amount)}</span>
                      <span className="text-xs text-slate-400 ml-2">{t('finance.entryCount', { count: a.count })}</span>
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

      {/* ==================== 收款/付款弹窗 ==================== */}
      <Modal
        isOpen={paymentModal.open}
        onClose={() => setPaymentModal({ open: false, row: null })}
        title={activeTab === 'receivable' ? t('finance.recordReceipt') : t('finance.approvePayment')}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setPaymentModal({ open: false, row: null })}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handlePayment}
              disabled={paymentSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {paymentSubmitting ? t('common.submitting') : t('common.confirm')}
            </button>
          </div>
        }
      >
        {paymentModal.row && (
          <div className="space-y-4">
            {/* 账单信息概览 */}
            <div className="bg-slate-50 rounded-xl p-3 space-y-1">
              <p className="text-xs text-slate-500">{t('finance.colBillNo')}: <span className="text-slate-900 font-medium">{paymentModal.row.record_number}</span></p>
              <p className="text-xs text-slate-500">{t('financeDetail.billAmount')}: <span className="text-slate-900 font-medium">{fmt(paymentModal.row.amount)}</span></p>
            </div>

            {/* 收款金额 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {activeTab === 'receivable' ? t('finance.receiptAmount') : t('finance.paymentAmount')} (EUR){' '}
                <span className="text-red-500">*</span>
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
                {activeTab === 'receivable' ? t('finance.receiptDate') : t('financeDetail.paidDate')}
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
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('common.remark')}</label>
              <textarea
                value={paymentForm.remarks}
                onChange={e => setPaymentForm(prev => ({ ...prev, remarks: e.target.value }))}
                placeholder={t('finance.remarksPlaceholder')}
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
        onClose={closeCreateModal}
        title={t('finance.createRecordTitle', {
          type: createForm.type === 'RECEIVABLE' ? t('finance.arShort') : t('finance.apShort'),
        })}
        size="md"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={closeCreateModal}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleCreateRecord}
              disabled={createSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {createSubmitting ? t('common.submitting') : t('finance.confirmCreate')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* 失败原因就地显示，不靠会自动消失的 toast */}
          {createError && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-600">{createError}</p>
            </div>
          )}

          {/* 类型切换 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('common.type')}</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={createForm.type === 'RECEIVABLE'}
                  onChange={() => setCreateForm(prev => ({ ...prev, type: 'RECEIVABLE' }))}
                />
                <span className="text-sm text-slate-700">{t('finance.receivable')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={createForm.type === 'PAYABLE'}
                  onChange={() => setCreateForm(prev => ({ ...prev, type: 'PAYABLE' }))}
                />
                <span className="text-sm text-slate-700">{t('finance.payable')}</span>
              </label>
            </div>
          </div>

          {/* 关联订单：搜索选择，提交的是订单 UUID（order_id 是 uuid 列，填订单号会 500） */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('finance.orderNoLabel')} <span className="text-red-500">*</span>
            </label>
            {selectedOrderLabel ? (
              <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
                <span className="text-sm text-blue-700">{selectedOrderLabel}</span>
                <button
                  type="button"
                  onClick={() => {
                    setCreateForm(prev => ({ ...prev, orderId: '' }))
                    setSelectedOrderLabel('')
                    setOrderSearch('')
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 transition-all duration-200"
                >
                  {t('finance.reselectOrder')}
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={orderSearch}
                  onChange={e => setOrderSearch(e.target.value)}
                  placeholder={t('finance.orderSearchPlaceholder')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
                />
                {orderSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {orderOptions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {orderOptions.map(o => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => {
                          setCreateForm(prev => ({ ...prev, orderId: o.id }))
                          setSelectedOrderLabel(`${o.order_number}${o.client_name ? ` · ${o.client_name}` : ''}`)
                          setOrderOptions([])
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 transition-all duration-200"
                      >
                        <span className="text-slate-800">{o.order_number}</span>
                        {o.client_name && <span className="text-slate-400 ml-2">{o.client_name}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-1">{t('finance.orderPickHint')}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* 金额 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('common.amount')} <span className="text-red-500">*</span>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('common.currency')}</label>
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
              {t('finance.colDueDate')} <span className="text-red-500">*</span>
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
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('common.remark')}</label>
            <textarea
              value={createForm.remarks}
              onChange={e => setCreateForm(prev => ({ ...prev, remarks: e.target.value }))}
              placeholder={t('finance.remarksPlaceholder')}
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
        title={t('finance.voidTitle')}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setVoidModal({ open: false, row: null })}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleVoid}
              disabled={voidSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {voidSubmitting ? t('confirmDialog.processing') : t('quotation.voidConfirm')}
            </button>
          </div>
        }
      >
        {voidModal.row && (
          <div className="space-y-4">
            <div className="bg-red-50 rounded-xl p-3 border border-red-100">
              <p className="text-sm text-red-700">
                {t('finance.voidAboutTo')} <span className="font-semibold">{voidModal.row.record_number}</span>
                {t('finance.voidAmountPart')} <span className="font-semibold">{fmt(voidModal.row.amount)}</span>
                {t('finance.voidIrreversible')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('finance.voidReason')} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={voidForm.reason}
                onChange={e => setVoidForm({ reason: e.target.value })}
                placeholder={t('finance.errVoidReason')}
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
