import { useState } from 'react'
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  Receipt,
  PiggyBank,
  DollarSign,
  Calendar,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  Users,
  Building2,
  ArrowRight,
  Banknote,
  BarChart3,
  CircleDollarSign,
  ClipboardCheck,
  Send,
  Download,
  Plus,
  Eye,
  RefreshCw,
  Target,
  Percent,
  CalendarDays
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

// ==================== 模拟数据 ====================

// 财务统计数据
const financeStats = {
  monthlyIncome: 125800,
  monthlyIncomeChange: 18,
  monthlyExpense: 68500,
  monthlyExpenseChange: 8,
  receivableTotal: 145200,
  receivableOverdue: 23800,
  payableTotal: 89100,
  payableDue: 32100,
  profit: 57300,
  profitMargin: 45.5,
}

// 最近应收发票
const recentReceivables = [
  { id: '1', invoiceNo: 'INV-2024-0015', customer: '德国物流有限公司', amount: 12500, dueDate: '2024-02-15', status: 'normal', daysToDue: 22 },
  { id: '2', invoiceNo: 'INV-2024-0014', customer: '欧洲快递服务公司', amount: 8900, dueDate: '2024-02-10', status: 'normal', daysToDue: 17 },
  { id: '3', invoiceNo: 'INV-2024-0013', customer: '柏林贸易公司', amount: 15800, dueDate: '2024-01-20', status: 'overdue', daysToDue: -5 },
  { id: '4', invoiceNo: 'INV-2024-0012', customer: '法兰克福进出口', amount: 8000, dueDate: '2024-01-10', status: 'overdue', daysToDue: -15 },
  { id: '5', invoiceNo: 'INV-2024-0011', customer: '慕尼黑电子商务', amount: 5600, dueDate: '2024-02-20', status: 'normal', daysToDue: 27 },
]

// 最近应付账单
const recentPayables = [
  { id: '1', billNo: 'BILL-2024-0008', supplier: 'DHL物流服务', amount: 8500, dueDate: '2024-02-20', status: 'pending', daysToDue: 27 },
  { id: '2', billNo: 'BILL-2024-0007', supplier: 'UPS快递服务', amount: 6200, dueDate: '2024-02-15', status: 'pending', daysToDue: 22 },
  { id: '3', billNo: 'BILL-2024-0006', supplier: 'FedEx国际快递', amount: 9800, dueDate: '2024-01-25', status: 'overdue', daysToDue: -3 },
  { id: '4', billNo: 'BILL-2024-0005', supplier: '德铁物流', amount: 7600, dueDate: '2024-02-28', status: 'pending', daysToDue: 35 },
  { id: '5', billNo: 'BILL-2024-0004', supplier: '马士基航运', amount: 18500, dueDate: '2024-02-05', status: 'pending', daysToDue: 12 },
]

// 最近交易记录
const recentTransactions = [
  { id: '1', type: 'income', description: '收款 - 德国物流有限公司', reference: 'INV-2024-0010', amount: 5280.00, date: '2024-01-24 14:30', method: '银行转账' },
  { id: '2', type: 'expense', description: '付款 - DHL物流服务', reference: 'BILL-2024-0003', amount: -1850.00, date: '2024-01-24 11:20', method: '银行转账' },
  { id: '3', type: 'income', description: '收款 - 柏林贸易公司', reference: 'INV-2024-0009', amount: 3200.00, date: '2024-01-23 16:45', method: '银行转账' },
  { id: '4', type: 'expense', description: '付款 - 仓储费用', reference: 'BILL-2024-0002', amount: -980.00, date: '2024-01-23 10:15', method: '银行转账' },
  { id: '5', type: 'income', description: '收款 - 慕尼黑电子商务', reference: 'INV-2024-0008', amount: 1560.00, date: '2024-01-22 09:30', method: '银行转账' },
  { id: '6', type: 'expense', description: '付款 - UPS快递服务', reference: 'BILL-2024-0001', amount: -2100.00, date: '2024-01-21 15:00', method: '银行转账' },
]

// 待处理事项
const pendingItems = [
  { id: '1', type: 'receivable', title: '应收逾期提醒', description: '柏林贸易公司 INV-2024-0013 已逾期5天', amount: 15800, urgent: true },
  { id: '2', type: 'receivable', title: '应收逾期提醒', description: '法兰克福进出口 INV-2024-0012 已逾期15天', amount: 8000, urgent: true },
  { id: '3', type: 'payable', title: '付款到期提醒', description: 'FedEx国际快递 BILL-2024-0006 已逾期3天', amount: 9800, urgent: true },
  { id: '4', type: 'reconciliation', title: '对账待确认', description: '德国物流有限公司 1月对账单待确认', amount: 45000, urgent: false },
  { id: '5', type: 'invoice', title: '发票待审核', description: '3张新发票待审核开具', amount: 28500, urgent: false },
]

// 月度收支趋势
const monthlyTrend = [
  { month: '8月', income: 98000, expense: 52000 },
  { month: '9月', income: 105000, expense: 58000 },
  { month: '10月', income: 112000, expense: 62000 },
  { month: '11月', income: 108000, expense: 55000 },
  { month: '12月', income: 118000, expense: 65000 },
  { month: '1月', income: 125800, expense: 68500 },
]

// 客户应收排名
const topReceivableCustomers = [
  { name: '法兰克福进出口', amount: 32000, percentage: 22 },
  { name: '柏林贸易公司', amount: 28500, percentage: 19.6 },
  { name: '德国物流有限公司', amount: 25800, percentage: 17.8 },
  { name: '欧洲快递服务公司', amount: 22400, percentage: 15.4 },
  { name: '慕尼黑电子商务', amount: 18500, percentage: 12.7 },
]

// ==================== 组件 ====================

export default function FinanceManagement() {
  const [dateRange, setDateRange] = useState('month')
  const navigate = useNavigate()

  // 计算最大收入用于图表缩放
  const maxValue = Math.max(...monthlyTrend.map(m => Math.max(m.income, m.expense)))

  // 导出财务报表
  const handleExportReport = () => {
    const headers = ['月份', '收入', '支出', '利润']
    const rows = monthlyTrend.map(m => [
      m.month,
      m.income,
      m.expense,
      m.income - m.expense
    ])
    
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `财务报表_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // 处理紧急事项
  const handlePendingItem = (item: typeof pendingItems[0]) => {
    if (item.type === 'receivable') {
      navigate('/finance/invoices')
    } else if (item.type === 'payable') {
      navigate('/finance/payables')
    } else if (item.type === 'reconciliation') {
      navigate('/finance/reconciliation')
    } else if (item.type === 'invoice') {
      navigate('/finance/invoices')
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">财务管理中心</h1>
          <p className="text-gray-500 mt-1">全面管控企业财务状况，实时掌握资金动态</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="week">本周</option>
            <option value="month">本月</option>
            <option value="quarter">本季度</option>
            <option value="year">本年度</option>
          </select>
          <button onClick={handleExportReport} className="btn btn-md btn-secondary">
            <Download className="w-4 h-4" />
            导出报表
          </button>
          <Link to="/finance/invoices" className="btn btn-md btn-primary">
            <FileText className="w-4 h-4" />
            财务报告
          </Link>
        </div>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 本月收入 */}
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg p-5 text-white">
          <div className="flex items-start justify-between">
            <div className="p-2 bg-white/20 rounded-lg">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="flex items-center text-sm font-medium text-green-100">
              +{financeStats.monthlyIncomeChange}%
              <ArrowUpRight className="w-4 h-4 ml-1" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-medium text-green-100">本月收入</h3>
            <p className="text-2xl font-bold mt-1">€{financeStats.monthlyIncome.toLocaleString('de-DE')}</p>
          </div>
        </div>

        {/* 本月支出 */}
        <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg p-5 text-white">
          <div className="flex items-start justify-between">
            <div className="p-2 bg-white/20 rounded-lg">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div className="flex items-center text-sm font-medium text-red-100">
              +{financeStats.monthlyExpenseChange}%
              <ArrowUpRight className="w-4 h-4 ml-1" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-medium text-red-100">本月支出</h3>
            <p className="text-2xl font-bold mt-1">€{financeStats.monthlyExpense.toLocaleString('de-DE')}</p>
          </div>
        </div>

        {/* 应收账款 */}
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg p-5 text-white">
          <div className="flex items-start justify-between">
            <div className="p-2 bg-white/20 rounded-lg">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="text-xs text-blue-100 bg-white/20 px-2 py-0.5 rounded">
              逾期 €{financeStats.receivableOverdue.toLocaleString('de-DE')}
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-medium text-blue-100">应收账款</h3>
            <p className="text-2xl font-bold mt-1">€{financeStats.receivableTotal.toLocaleString('de-DE')}</p>
          </div>
        </div>

        {/* 应付账款 */}
        <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl shadow-lg p-5 text-white">
          <div className="flex items-start justify-between">
            <div className="p-2 bg-white/20 rounded-lg">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="text-xs text-orange-100 bg-white/20 px-2 py-0.5 rounded">
              到期 €{financeStats.payableDue.toLocaleString('de-DE')}
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-medium text-orange-100">应付账款</h3>
            <p className="text-2xl font-bold mt-1">€{financeStats.payableTotal.toLocaleString('de-DE')}</p>
          </div>
        </div>

        {/* 本月利润 */}
        <div className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl shadow-lg p-5 text-white">
          <div className="flex items-start justify-between">
            <div className="p-2 bg-white/20 rounded-lg">
              <PiggyBank className="w-5 h-5" />
            </div>
            <div className="flex items-center text-sm font-medium text-purple-100">
              {financeStats.profitMargin}%
              <Percent className="w-3 h-3 ml-1" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-medium text-purple-100">本月利润</h3>
            <p className="text-2xl font-bold mt-1">€{financeStats.profit.toLocaleString('de-DE')}</p>
          </div>
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
          <Target className="w-4 h-4 text-blue-600" />
          快捷操作
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <Link to="/finance/invoices" className="flex flex-col items-center p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all group">
            <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <span className="mt-2 text-xs text-gray-600 group-hover:text-blue-600">开具发票</span>
          </Link>
          <Link to="/finance/invoices" className="flex flex-col items-center p-3 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-all group">
            <div className="p-2 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
              <Banknote className="w-5 h-5 text-green-600" />
            </div>
            <span className="mt-2 text-xs text-gray-600 group-hover:text-green-600">收款登记</span>
          </Link>
          <Link to="/finance/payables" className="flex flex-col items-center p-3 rounded-lg border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition-all group">
            <div className="p-2 bg-orange-100 rounded-lg group-hover:bg-orange-200 transition-colors">
              <Send className="w-5 h-5 text-orange-600" />
            </div>
            <span className="mt-2 text-xs text-gray-600 group-hover:text-orange-600">付款登记</span>
          </Link>
          <Link to="/finance/reconciliation" className="flex flex-col items-center p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all group">
            <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
              <ClipboardCheck className="w-5 h-5 text-purple-600" />
            </div>
            <span className="mt-2 text-xs text-gray-600 group-hover:text-purple-600">对账管理</span>
          </Link>
          <Link to="/crm/customers" className="flex flex-col items-center p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all group">
            <div className="p-2 bg-indigo-100 rounded-lg group-hover:bg-indigo-200 transition-colors">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <span className="mt-2 text-xs text-gray-600 group-hover:text-indigo-600">客户信用</span>
          </Link>
          <Link to="/suppliers" className="flex flex-col items-center p-3 rounded-lg border border-gray-200 hover:border-teal-300 hover:bg-teal-50 transition-all group">
            <div className="p-2 bg-teal-100 rounded-lg group-hover:bg-teal-200 transition-colors">
              <Building2 className="w-5 h-5 text-teal-600" />
            </div>
            <span className="mt-2 text-xs text-gray-600 group-hover:text-teal-600">供应商账务</span>
          </Link>
          <Link to="/finance/invoices" className="flex flex-col items-center p-3 rounded-lg border border-gray-200 hover:border-cyan-300 hover:bg-cyan-50 transition-all group">
            <div className="p-2 bg-cyan-100 rounded-lg group-hover:bg-cyan-200 transition-colors">
              <BarChart3 className="w-5 h-5 text-cyan-600" />
            </div>
            <span className="mt-2 text-xs text-gray-600 group-hover:text-cyan-600">财务分析</span>
          </Link>
          <Link to="/finance/reconciliation" className="flex flex-col items-center p-3 rounded-lg border border-gray-200 hover:border-rose-300 hover:bg-rose-50 transition-all group">
            <div className="p-2 bg-rose-100 rounded-lg group-hover:bg-rose-200 transition-colors">
              <CalendarDays className="w-5 h-5 text-rose-600" />
            </div>
            <span className="mt-2 text-xs text-gray-600 group-hover:text-rose-600">账期管理</span>
          </Link>
        </div>
      </div>

      {/* 待处理事项 */}
      {pendingItems.filter(item => item.urgent).length > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl border border-red-200 p-4">
          <h3 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            待处理紧急事项 ({pendingItems.filter(item => item.urgent).length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingItems.filter(item => item.urgent).map(item => (
              <div key={item.id} className="bg-white rounded-lg p-3 border border-red-200 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {item.type === 'receivable' && <Receipt className="w-4 h-4 text-blue-600" />}
                    {item.type === 'payable' && <CreditCard className="w-4 h-4 text-orange-600" />}
                    <span className="text-sm font-medium text-gray-900">{item.title}</span>
                  </div>
                  <span className="text-sm font-bold text-red-600">€{item.amount.toLocaleString('de-DE')}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{item.description}</p>
                <button 
                  onClick={() => handlePendingItem(item)}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  立即处理 →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 主要内容区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 收支趋势图 */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              收支趋势
            </h2>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-green-500 rounded"></span>
                收入
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-red-400 rounded"></span>
                支出
              </span>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {monthlyTrend.map((month, index) => (
                <div key={month.month} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 w-10">{month.month}</span>
                    <div className="flex-1 mx-4 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-5 bg-gradient-to-r from-green-400 to-green-500 rounded-r-full transition-all duration-500"
                          style={{ width: `${(month.income / maxValue) * 100}%` }}
                        ></div>
                        <span className="text-xs text-gray-500 whitespace-nowrap">€{month.income.toLocaleString('de-DE')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-5 bg-gradient-to-r from-red-300 to-red-400 rounded-r-full transition-all duration-500"
                          style={{ width: `${(month.expense / maxValue) * 100}%` }}
                        ></div>
                        <span className="text-xs text-gray-500 whitespace-nowrap">€{month.expense.toLocaleString('de-DE')}</span>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold ${month.income - month.expense >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {month.income - month.expense >= 0 ? '+' : ''}€{(month.income - month.expense).toLocaleString('de-DE')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 客户应收排名 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              应收款排名
            </h2>
            <Link to="/finance/invoices" className="text-sm text-blue-600 hover:text-blue-700">查看全部</Link>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {topReceivableCustomers.map((customer, index) => (
                <div key={customer.name} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    index === 0 ? 'bg-yellow-100 text-yellow-700' :
                    index === 1 ? 'bg-gray-100 text-gray-600' :
                    index === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-50 text-gray-500'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 truncate">{customer.name}</span>
                      <span className="text-sm font-semibold text-gray-900">€{customer.amount.toLocaleString('de-DE')}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div 
                        className="h-1.5 bg-blue-500 rounded-full transition-all duration-500" 
                        style={{ width: `${customer.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 应收应付列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 应收账款列表 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-600" />
              最近应收发票
            </h2>
            <Link to="/finance/invoices" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              查看全部 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentReceivables.map((item) => (
              <div key={item.id} className="px-6 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${item.status === 'overdue' ? 'bg-red-500' : 'bg-green-500'}`}></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.customer}</p>
                      <p className="text-xs text-gray-500">{item.invoiceNo} · 到期 {item.dueDate}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">€{item.amount.toLocaleString('de-DE')}</p>
                    <p className={`text-xs ${item.daysToDue < 0 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {item.daysToDue < 0 ? `逾期 ${Math.abs(item.daysToDue)} 天` : `${item.daysToDue} 天后到期`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
            <Link to="/finance/invoices" className="btn btn-sm btn-primary w-full justify-center">
              <Plus className="w-4 h-4" />
              开具新发票
            </Link>
          </div>
        </div>

        {/* 应付账款列表 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-orange-600" />
              最近应付账单
            </h2>
            <Link to="/finance/payables" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              查看全部 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentPayables.map((item) => (
              <div key={item.id} className="px-6 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${item.status === 'overdue' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.supplier}</p>
                      <p className="text-xs text-gray-500">{item.billNo} · 到期 {item.dueDate}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">€{item.amount.toLocaleString('de-DE')}</p>
                    <p className={`text-xs ${item.daysToDue < 0 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {item.daysToDue < 0 ? `逾期 ${Math.abs(item.daysToDue)} 天` : `${item.daysToDue} 天后到期`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
            <Link to="/finance/payables" className="btn btn-sm btn-secondary w-full justify-center">
              <Send className="w-4 h-4" />
              付款登记
            </Link>
          </div>
        </div>
      </div>

      {/* 最近交易记录 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-blue-600" />
            最近交易记录
          </h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => window.location.reload()} 
              className="btn btn-sm btn-secondary"
            >
              <RefreshCw className="w-4 h-4" />
              刷新
            </button>
            <Link to="/finance/invoices" className="text-sm text-blue-600 hover:text-blue-700">查看全部</Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">描述</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">关联单据</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">支付方式</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">金额</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentTransactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      transaction.type === 'income' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {transaction.type === 'income' ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {transaction.type === 'income' ? '收入' : '支出'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{transaction.description}</td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-blue-600 hover:text-blue-700 cursor-pointer">{transaction.reference}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{transaction.method}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{transaction.date}</td>
                  <td className={`px-6 py-4 text-right font-semibold ${
                    transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {transaction.amount >= 0 ? '+' : ''}€{Math.abs(transaction.amount).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                      <Eye className="w-4 h-4" />
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
