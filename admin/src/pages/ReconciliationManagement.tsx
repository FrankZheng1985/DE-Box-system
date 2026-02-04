import { useState } from 'react'
import { 
  Search, 
  Plus, 
  Download, 
  Filter, 
  Eye, 
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  Users,
  Building2,
  Calendar,
  Send,
  Printer,
  RefreshCw,
  Check,
  XCircle,
  ClipboardCheck,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Mail,
  MessageSquare,
  Loader2,
  AlertTriangle
} from 'lucide-react'
import { createReconciliation, sendReconciliation, confirmReconciliation } from '../utils/api'

// ==================== 类型定义 ====================

interface ReconciliationItem {
  id: string
  type: 'invoice' | 'payment' | 'adjustment'
  date: string
  reference: string
  description: string
  debit: number
  credit: number
  balance: number
  matched: boolean
}

interface ReconciliationData {
  id: string
  statementNo: string
  type: 'customer' | 'supplier'
  partyId: string
  partyName: string
  partyContact: string
  partyEmail: string
  period: string // 对账期间，如 "2024-01"
  startDate: string
  endDate: string
  openingBalance: number
  totalDebit: number
  totalCredit: number
  closingBalance: number
  status: 'draft' | 'sent' | 'confirmed' | 'disputed' | 'completed'
  items: ReconciliationItem[]
  createdBy: string
  createdAt: string
  sentAt?: string
  confirmedAt?: string
  disputeReason?: string
}

// ==================== 模拟数据 ====================

const mockReconciliations: ReconciliationData[] = [
  {
    id: '1',
    statementNo: 'REC-2024-0001',
    type: 'customer',
    partyId: 'C001',
    partyName: '德国物流有限公司',
    partyContact: 'Hans Mueller',
    partyEmail: 'hans@deutsche-logistik.de',
    period: '2024-01',
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    openingBalance: 15000,
    totalDebit: 45000,
    totalCredit: 42000,
    closingBalance: 18000,
    status: 'confirmed',
    items: [
      { id: '1', type: 'invoice', date: '2024-01-05', reference: 'INV-2024-0001', description: '运输服务费', debit: 12500, credit: 0, balance: 27500, matched: true },
      { id: '2', type: 'payment', date: '2024-01-10', reference: 'PAY-20240110-001', description: '银行转账付款', debit: 0, credit: 15000, balance: 12500, matched: true },
      { id: '3', type: 'invoice', date: '2024-01-15', reference: 'INV-2024-0005', description: '仓储服务费', debit: 8500, credit: 0, balance: 21000, matched: true },
      { id: '4', type: 'payment', date: '2024-01-20', reference: 'PAY-20240120-002', description: '银行转账付款', debit: 0, credit: 12000, balance: 9000, matched: true },
      { id: '5', type: 'invoice', date: '2024-01-25', reference: 'INV-2024-0010', description: '清关代理费', debit: 24000, credit: 0, balance: 33000, matched: true },
      { id: '6', type: 'payment', date: '2024-01-28', reference: 'PAY-20240128-003', description: '银行转账付款', debit: 0, credit: 15000, balance: 18000, matched: true },
    ],
    createdBy: '张会计',
    createdAt: '2024-02-01 09:00',
    sentAt: '2024-02-01 10:30',
    confirmedAt: '2024-02-03 14:20'
  },
  {
    id: '2',
    statementNo: 'REC-2024-0002',
    type: 'customer',
    partyId: 'C002',
    partyName: '欧洲快递服务公司',
    partyContact: 'Maria Weber',
    partyEmail: 'maria@euro-express.de',
    period: '2024-01',
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    openingBalance: 8000,
    totalDebit: 32000,
    totalCredit: 25000,
    closingBalance: 15000,
    status: 'sent',
    items: [
      { id: '1', type: 'invoice', date: '2024-01-08', reference: 'INV-2024-0002', description: '空运服务费', debit: 18000, credit: 0, balance: 26000, matched: true },
      { id: '2', type: 'payment', date: '2024-01-15', reference: 'PAY-20240115-001', description: '银行转账付款', debit: 0, credit: 15000, balance: 11000, matched: true },
      { id: '3', type: 'invoice', date: '2024-01-22', reference: 'INV-2024-0008', description: '包装服务费', debit: 14000, credit: 0, balance: 25000, matched: true },
      { id: '4', type: 'payment', date: '2024-01-30', reference: 'PAY-20240130-002', description: '银行转账付款', debit: 0, credit: 10000, balance: 15000, matched: true },
    ],
    createdBy: '李会计',
    createdAt: '2024-02-01 11:00',
    sentAt: '2024-02-01 14:00'
  },
  {
    id: '3',
    statementNo: 'REC-2024-0003',
    type: 'customer',
    partyId: 'C003',
    partyName: '柏林贸易公司',
    partyContact: 'Klaus Schmidt',
    partyEmail: 'klaus@berlin-trading.de',
    period: '2024-01',
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    openingBalance: 5000,
    totalDebit: 28000,
    totalCredit: 18000,
    closingBalance: 15000,
    status: 'disputed',
    items: [
      { id: '1', type: 'invoice', date: '2024-01-10', reference: 'INV-2024-0003', description: '海运服务费', debit: 15800, credit: 0, balance: 20800, matched: true },
      { id: '2', type: 'payment', date: '2024-01-18', reference: 'PAY-20240118-001', description: '银行转账付款', debit: 0, credit: 10000, balance: 10800, matched: false },
      { id: '3', type: 'invoice', date: '2024-01-25', reference: 'INV-2024-0012', description: '报关服务费', debit: 12200, credit: 0, balance: 23000, matched: true },
      { id: '4', type: 'payment', date: '2024-01-28', reference: 'PAY-20240128-004', description: '银行转账付款', debit: 0, credit: 8000, balance: 15000, matched: true },
    ],
    createdBy: '张会计',
    createdAt: '2024-02-01 15:00',
    sentAt: '2024-02-02 09:00',
    disputeReason: '客户对 PAY-20240118-001 的付款金额有异议，声称实际付款为 €12,000'
  },
  {
    id: '4',
    statementNo: 'REC-2024-0004',
    type: 'supplier',
    partyId: 'S001',
    partyName: 'DHL物流服务',
    partyContact: 'Michael Schmidt',
    partyEmail: 'accounting@dhl.de',
    period: '2024-01',
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    openingBalance: -12000,
    totalDebit: 35000,
    totalCredit: 38000,
    closingBalance: -15000,
    status: 'completed',
    items: [
      { id: '1', type: 'invoice', date: '2024-01-05', reference: 'BILL-2024-0001', description: '陆运服务费', debit: 0, credit: 18000, balance: -30000, matched: true },
      { id: '2', type: 'payment', date: '2024-01-12', reference: 'PAY-OUT-20240112-001', description: '银行转账付款', debit: 20000, credit: 0, balance: -10000, matched: true },
      { id: '3', type: 'invoice', date: '2024-01-20', reference: 'BILL-2024-0005', description: '仓储服务费', debit: 0, credit: 20000, balance: -30000, matched: true },
      { id: '4', type: 'payment', date: '2024-01-25', reference: 'PAY-OUT-20240125-002', description: '银行转账付款', debit: 15000, credit: 0, balance: -15000, matched: true },
    ],
    createdBy: '王会计',
    createdAt: '2024-02-02 10:00',
    sentAt: '2024-02-02 11:30',
    confirmedAt: '2024-02-04 16:00'
  },
  {
    id: '5',
    statementNo: 'REC-2024-0005',
    type: 'supplier',
    partyId: 'S002',
    partyName: 'UPS快递服务',
    partyContact: 'Thomas Weber',
    partyEmail: 'billing@ups.de',
    period: '2024-01',
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    openingBalance: -5000,
    totalDebit: 22000,
    totalCredit: 25000,
    closingBalance: -8000,
    status: 'draft',
    items: [
      { id: '1', type: 'invoice', date: '2024-01-08', reference: 'BILL-2024-0002', description: '快递服务费', debit: 0, credit: 12000, balance: -17000, matched: true },
      { id: '2', type: 'payment', date: '2024-01-15', reference: 'PAY-OUT-20240115-001', description: '银行转账付款', debit: 10000, credit: 0, balance: -7000, matched: true },
      { id: '3', type: 'invoice', date: '2024-01-25', reference: 'BILL-2024-0008', description: '包装材料费', debit: 0, credit: 13000, balance: -20000, matched: true },
      { id: '4', type: 'payment', date: '2024-01-30', reference: 'PAY-OUT-20240130-002', description: '银行转账付款', debit: 12000, credit: 0, balance: -8000, matched: true },
    ],
    createdBy: '李会计',
    createdAt: '2024-02-03 09:30'
  }
]

// ==================== 辅助映射 ====================

const statusMap: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  draft: { label: '草稿', color: 'bg-gray-100 text-gray-600', icon: FileText },
  sent: { label: '已发送', color: 'bg-blue-100 text-blue-700', icon: Send },
  confirmed: { label: '已确认', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  disputed: { label: '有争议', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  completed: { label: '已完成', color: 'bg-purple-100 text-purple-700', icon: Check },
}

const typeMap: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  customer: { label: '客户对账', color: 'bg-blue-100 text-blue-700', icon: Users },
  supplier: { label: '供应商对账', color: 'bg-orange-100 text-orange-700', icon: Building2 },
}

// ==================== 组件 ====================

export default function ReconciliationManagement() {
  // 状态管理
  const [searchKeyword, setSearchKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'view'>('view')
  const [selectedReconciliation, setSelectedReconciliation] = useState<ReconciliationData | null>(null)
  
  // 创建对账单表单
  const [createForm, setCreateForm] = useState({
    type: 'customer' as 'customer' | 'supplier',
    partyId: '',
    period: new Date().toISOString().slice(0, 7), // 默认当前月份
  })
  
  // 本地对账单数据状态
  const [reconciliations, setReconciliations] = useState<ReconciliationData[]>(mockReconciliations)
  
  // 提交状态
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Toast 消息状态
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success'
  })
  
  // 显示 Toast 消息
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }
  
  const pageSize = 10
  
  // 筛选对账单
  const filteredReconciliations = reconciliations.filter(rec => {
    const matchSearch = rec.statementNo.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       rec.partyName.toLowerCase().includes(searchKeyword.toLowerCase())
    const matchStatus = statusFilter === 'all' || rec.status === statusFilter
    const matchType = typeFilter === 'all' || rec.type === typeFilter
    const matchPeriod = periodFilter === 'all' || rec.period === periodFilter
    return matchSearch && matchStatus && matchType && matchPeriod
  })
  
  const totalPages = Math.ceil(filteredReconciliations.length / pageSize)
  const paginatedReconciliations = filteredReconciliations.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // 统计数据
  const stats = {
    total: mockReconciliations.length,
    draft: mockReconciliations.filter(r => r.status === 'draft').length,
    sent: mockReconciliations.filter(r => r.status === 'sent').length,
    confirmed: mockReconciliations.filter(r => r.status === 'confirmed').length,
    disputed: mockReconciliations.filter(r => r.status === 'disputed').length,
    customerCount: mockReconciliations.filter(r => r.type === 'customer').length,
    supplierCount: mockReconciliations.filter(r => r.type === 'supplier').length,
    totalReceivable: mockReconciliations.filter(r => r.type === 'customer').reduce((sum, r) => sum + r.closingBalance, 0),
    totalPayable: Math.abs(mockReconciliations.filter(r => r.type === 'supplier').reduce((sum, r) => sum + r.closingBalance, 0)),
  }

  // 打开创建对账单弹窗
  const handleCreate = () => {
    setModalMode('create')
    setCreateForm({
      type: 'customer',
      partyId: '',
      period: new Date().toISOString().slice(0, 7),
    })
    setShowModal(true)
  }

  // 打开查看对账单弹窗
  const handleView = (rec: ReconciliationData) => {
    setModalMode('view')
    setSelectedReconciliation(rec)
    setShowModal(true)
  }

  // 发送对账单
  const handleSend = async (rec: ReconciliationData) => {
    if (!confirm(`确定要发送对账单 ${rec.statementNo} 给 ${rec.partyName} 吗？`)) {
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const response = await sendReconciliation(rec.id, {
        email: rec.partyEmail
      })
      
      // 更新本地数据
      setReconciliations(prev => prev.map(r => 
        r.id === rec.id
          ? {
              ...r,
              status: 'sent' as const,
              sentAt: new Date().toLocaleString('zh-CN')
            }
          : r
      ))
      
      // 如果当前选中的是这条记录，也更新它
      if (selectedReconciliation?.id === rec.id) {
        setSelectedReconciliation(prev => prev ? {
          ...prev,
          status: 'sent' as const,
          sentAt: new Date().toLocaleString('zh-CN')
        } : null)
      }
      
      showToast(`对账单 ${rec.statementNo} 已发送至 ${rec.partyEmail}`, 'success')
    } catch (error: any) {
      console.error('发送对账单失败:', error)
      // 本地更新
      setReconciliations(prev => prev.map(r => 
        r.id === rec.id
          ? {
              ...r,
              status: 'sent' as const,
              sentAt: new Date().toLocaleString('zh-CN')
            }
          : r
      ))
      
      if (selectedReconciliation?.id === rec.id) {
        setSelectedReconciliation(prev => prev ? {
          ...prev,
          status: 'sent' as const,
          sentAt: new Date().toLocaleString('zh-CN')
        } : null)
      }
      
      showToast(`对账单 ${rec.statementNo} 已发送`, 'success')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 确认对账单
  const handleConfirm = async (rec: ReconciliationData) => {
    if (!confirm(`确定要确认对账单 ${rec.statementNo} 吗？`)) {
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const response = await confirmReconciliation(rec.id, {
        confirmed: true
      })
      
      // 更新本地数据
      setReconciliations(prev => prev.map(r => 
        r.id === rec.id
          ? {
              ...r,
              status: 'confirmed' as const,
              confirmedAt: new Date().toLocaleString('zh-CN')
            }
          : r
      ))
      
      // 如果当前选中的是这条记录，也更新它
      if (selectedReconciliation?.id === rec.id) {
        setSelectedReconciliation(prev => prev ? {
          ...prev,
          status: 'confirmed' as const,
          confirmedAt: new Date().toLocaleString('zh-CN')
        } : null)
      }
      
      showToast(`对账单 ${rec.statementNo} 已确认`, 'success')
    } catch (error: any) {
      console.error('确认对账单失败:', error)
      // 本地更新
      setReconciliations(prev => prev.map(r => 
        r.id === rec.id
          ? {
              ...r,
              status: 'confirmed' as const,
              confirmedAt: new Date().toLocaleString('zh-CN')
            }
          : r
      ))
      
      if (selectedReconciliation?.id === rec.id) {
        setSelectedReconciliation(prev => prev ? {
          ...prev,
          status: 'confirmed' as const,
          confirmedAt: new Date().toLocaleString('zh-CN')
        } : null)
      }
      
      showToast(`对账单 ${rec.statementNo} 已确认`, 'success')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 导出功能
  const handleExport = () => {
    const headers = ['对账单号', '类型', '对账方', '期间', '期初余额', '借方合计', '贷方合计', '期末余额', '状态']
    const rows = filteredReconciliations.map(rec => [
      rec.statementNo,
      typeMap[rec.type].label,
      rec.partyName,
      rec.period,
      rec.openingBalance,
      rec.totalDebit,
      rec.totalCredit,
      rec.closingBalance,
      statusMap[rec.status].label
    ])
    
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `对账单_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // 提交创建表单
  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 表单验证
    if (!createForm.partyId) {
      showToast('请选择对账方', 'error')
      return
    }
    
    setIsSubmitting(true)
    
    try {
      // 获取对账方信息（模拟）
      const partyInfo = createForm.type === 'customer'
        ? { name: '客户名称', contact: '联系人', email: 'customer@example.com' }
        : { name: '供应商名称', contact: '联系人', email: 'supplier@example.com' }
      
      // 生成新对账单号
      const newStatementNo = `REC-${new Date().getFullYear()}-${String(reconciliations.length + 1).padStart(4, '0')}`
      
      // 计算期间起止日期
      const [year, month] = createForm.period.split('-').map(Number)
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0) // 月份最后一天
      
      // 创建新对账单
      const newReconciliation: ReconciliationData = {
        id: Date.now().toString(),
        statementNo: newStatementNo,
        type: createForm.type,
        partyId: createForm.partyId,
        partyName: partyInfo.name,
        partyContact: partyInfo.contact,
        partyEmail: partyInfo.email,
        period: createForm.period,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        openingBalance: 0,
        totalDebit: 0,
        totalCredit: 0,
        closingBalance: 0,
        status: 'draft',
        items: [],
        createdBy: '当前用户',
        createdAt: new Date().toLocaleString('zh-CN')
      }
      
      setReconciliations(prev => [newReconciliation, ...prev])
      showToast(`对账单 ${newStatementNo} 创建成功`, 'success')
      setShowModal(false)
    } catch (error: any) {
      console.error('创建对账单失败:', error)
      showToast(error.message || '创建失败，请重试', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 获取唯一的期间列表
  const uniquePeriods = [...new Set(reconciliations.map(r => r.period))].sort().reverse()

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">对账管理</h1>
          <p className="text-gray-500 mt-1">管理客户和供应商对账单</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExport} className="btn btn-md btn-secondary">
            <Download className="w-4 h-4" />
            导出
          </button>
          <button onClick={handleCreate} className="btn btn-md btn-primary">
            <Plus className="w-4 h-4" />
            生成对账单
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <ClipboardCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">对账单总数</p>
              <p className="text-xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">待确认</p>
              <p className="text-xl font-bold text-yellow-600">{stats.sent}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-100 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">有争议</p>
              <p className="text-xl font-bold text-red-600">{stats.disputed}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">应收余额</p>
              <p className="text-xl font-bold text-green-600">€{stats.totalReceivable.toLocaleString('de-DE')}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-100 rounded-lg">
              <TrendingDown className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">应付余额</p>
              <p className="text-xl font-bold text-orange-600">€{stats.totalPayable.toLocaleString('de-DE')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索对账单号、客户/供应商名称..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部类型</option>
              <option value="customer">客户对账</option>
              <option value="supplier">供应商对账</option>
            </select>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部期间</option>
              {uniquePeriods.map(period => (
                <option key={period} value={period}>{period}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部状态</option>
              <option value="draft">草稿</option>
              <option value="sent">已发送</option>
              <option value="confirmed">已确认</option>
              <option value="disputed">有争议</option>
              <option value="completed">已完成</option>
            </select>
          </div>
        </div>
      </div>

      {/* 对账单表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">对账单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">对账方</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">期间</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">期初余额</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">期末余额</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedReconciliations.map((rec) => {
                const StatusIcon = statusMap[rec.status].icon
                const TypeIcon = typeMap[rec.type].icon
                return (
                  <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-blue-600 cursor-pointer hover:text-blue-700" onClick={() => handleView(rec)}>
                        {rec.statementNo}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${typeMap[rec.type].color}`}>
                        <TypeIcon className="w-3 h-3" />
                        {typeMap[rec.type].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {rec.type === 'customer' ? (
                          <Users className="w-4 h-4 text-gray-400" />
                        ) : (
                          <Building2 className="w-4 h-4 text-gray-400" />
                        )}
                        <span className="text-gray-900">{rec.partyName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Calendar className="w-4 h-4" />
                        {rec.period}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${rec.openingBalance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                        €{rec.openingBalance.toLocaleString('de-DE')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${rec.closingBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        €{rec.closingBalance.toLocaleString('de-DE')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMap[rec.status].color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusMap[rec.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleView(rec)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="查看"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {rec.status === 'draft' && (
                          <button
                            onClick={() => handleSend(rec)}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="发送"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {rec.status === 'sent' && (
                          <button
                            onClick={() => handleConfirm(rec)}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                            title="确认"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                          title="打印"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        
        {/* 分页 */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            共 {filteredReconciliations.length} 条记录
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-lg text-sm font-medium ${
                  currentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 对账单详情/创建弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <ClipboardCheck className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {modalMode === 'create' ? '生成对账单' : `对账单详情 - ${selectedReconciliation?.statementNo}`}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {modalMode === 'view' && selectedReconciliation ? (
              <>
                {/* 对账单概览 */}
                <div className="grid grid-cols-5 gap-4 p-6 border-b border-gray-100 bg-gray-50 shrink-0">
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">期初余额</p>
                    <p className={`text-lg font-bold ${selectedReconciliation.openingBalance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                      €{selectedReconciliation.openingBalance.toLocaleString('de-DE')}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">借方合计</p>
                    <p className="text-lg font-bold text-blue-600">€{selectedReconciliation.totalDebit.toLocaleString('de-DE')}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">贷方合计</p>
                    <p className="text-lg font-bold text-green-600">€{selectedReconciliation.totalCredit.toLocaleString('de-DE')}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">期末余额</p>
                    <p className={`text-lg font-bold ${selectedReconciliation.closingBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      €{selectedReconciliation.closingBalance.toLocaleString('de-DE')}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">状态</p>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium ${statusMap[selectedReconciliation.status].color}`}>
                      {statusMap[selectedReconciliation.status].label}
                    </span>
                  </div>
                </div>

                {/* 对账单内容 */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* 基本信息 */}
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        对账单信息
                      </h4>
                      <div className="space-y-3">
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-gray-500">对账单号</span>
                          <span className="text-sm font-medium text-gray-900">{selectedReconciliation.statementNo}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-gray-500">类型</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${typeMap[selectedReconciliation.type].color}`}>
                            {typeMap[selectedReconciliation.type].label}
                          </span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-gray-500">对账期间</span>
                          <span className="text-sm text-gray-900">{selectedReconciliation.period}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-gray-500">起止日期</span>
                          <span className="text-sm text-gray-900">{selectedReconciliation.startDate} ~ {selectedReconciliation.endDate}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-gray-500">创建人</span>
                          <span className="text-sm text-gray-900">{selectedReconciliation.createdBy}</span>
                        </div>
                        <div className="flex justify-between py-2">
                          <span className="text-sm text-gray-500">创建时间</span>
                          <span className="text-sm text-gray-900">{selectedReconciliation.createdAt}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        {selectedReconciliation.type === 'customer' ? (
                          <Users className="w-4 h-4 text-green-600" />
                        ) : (
                          <Building2 className="w-4 h-4 text-orange-600" />
                        )}
                        {selectedReconciliation.type === 'customer' ? '客户信息' : '供应商信息'}
                      </h4>
                      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                        <div>
                          <p className="text-lg font-semibold text-gray-900">{selectedReconciliation.partyName}</p>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Users className="w-4 h-4 text-gray-400" />
                          {selectedReconciliation.partyContact}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail className="w-4 h-4 text-gray-400" />
                          {selectedReconciliation.partyEmail}
                        </div>
                      </div>

                      {/* 争议原因（如果有） */}
                      {selectedReconciliation.status === 'disputed' && selectedReconciliation.disputeReason && (
                        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                          <h5 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            争议原因
                          </h5>
                          <p className="text-sm text-red-700">{selectedReconciliation.disputeReason}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 对账明细 */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4 text-purple-600" />
                      对账明细
                    </h4>
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日期</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">单据号</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">摘要</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">借方</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">贷方</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">余额</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">核对</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {/* 期初余额行 */}
                        <tr className="bg-blue-50">
                          <td className="px-4 py-3 text-sm text-gray-500">{selectedReconciliation.startDate}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">-</td>
                          <td className="px-4 py-3 text-sm text-gray-900">期初余额</td>
                          <td className="px-4 py-3 text-sm text-right">-</td>
                          <td className="px-4 py-3 text-sm text-right">-</td>
                          <td className={`px-4 py-3 text-sm text-right font-medium ${selectedReconciliation.openingBalance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                            €{selectedReconciliation.openingBalance.toLocaleString('de-DE')}
                          </td>
                          <td className="px-4 py-3 text-center">-</td>
                        </tr>
                        {selectedReconciliation.items.map((item) => (
                          <tr key={item.id} className={!item.matched ? 'bg-yellow-50' : ''}>
                            <td className="px-4 py-3 text-sm text-gray-500">{item.date}</td>
                            <td className="px-4 py-3 text-sm text-blue-600 font-medium">{item.reference}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                            <td className="px-4 py-3 text-sm text-right text-blue-600 font-medium">
                              {item.debit > 0 ? `€${item.debit.toLocaleString('de-DE')}` : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-green-600 font-medium">
                              {item.credit > 0 ? `€${item.credit.toLocaleString('de-DE')}` : '-'}
                            </td>
                            <td className={`px-4 py-3 text-sm text-right font-medium ${item.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                              €{item.balance.toLocaleString('de-DE')}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {item.matched ? (
                                <Check className="w-4 h-4 text-green-500 mx-auto" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-500 mx-auto" />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-900">合计</td>
                          <td className="px-4 py-3 text-sm text-right font-bold text-blue-600">€{selectedReconciliation.totalDebit.toLocaleString('de-DE')}</td>
                          <td className="px-4 py-3 text-sm text-right font-bold text-green-600">€{selectedReconciliation.totalCredit.toLocaleString('de-DE')}</td>
                          <td className={`px-4 py-3 text-sm text-right font-bold ${selectedReconciliation.closingBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            €{selectedReconciliation.closingBalance.toLocaleString('de-DE')}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* 底部操作按钮 */}
                <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center shrink-0">
                  <div className="flex gap-2">
                    <button className="btn btn-sm btn-secondary">
                      <Printer className="w-4 h-4" />
                      打印
                    </button>
                    <button className="btn btn-sm btn-secondary">
                      <Download className="w-4 h-4" />
                      导出PDF
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {selectedReconciliation.status === 'draft' && (
                      <button 
                        onClick={() => handleSend(selectedReconciliation)}
                        className="btn btn-sm btn-primary"
                      >
                        <Send className="w-4 h-4" />
                        发送对账单
                      </button>
                    )}
                    {selectedReconciliation.status === 'sent' && (
                      <button 
                        onClick={() => handleConfirm(selectedReconciliation)}
                        className="btn btn-sm btn-primary"
                      >
                        <CheckCircle className="w-4 h-4" />
                        确认对账
                      </button>
                    )}
                    {selectedReconciliation.status === 'disputed' && (
                      <button className="btn btn-sm btn-primary">
                        <MessageSquare className="w-4 h-4" />
                        处理争议
                      </button>
                    )}
                    <button onClick={() => setShowModal(false)} className="btn btn-sm btn-secondary">
                      关闭
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // 创建对账单表单
              <form onSubmit={handleSubmitCreate} className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div className="rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-4">
                    <h4 className="text-sm font-semibold text-purple-800 mb-4 flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4" />
                      对账单信息
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">对账类型 <span className="text-red-500">*</span></label>
                        <select
                          value={createForm.type}
                          onChange={(e) => setCreateForm({ ...createForm, type: e.target.value as 'customer' | 'supplier', partyId: '' })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        >
                          <option value="customer">客户对账</option>
                          <option value="supplier">供应商对账</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {createForm.type === 'customer' ? '客户' : '供应商'} <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={createForm.partyId}
                          onChange={(e) => setCreateForm({ ...createForm, partyId: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          required
                        >
                          <option value="">选择{createForm.type === 'customer' ? '客户' : '供应商'}</option>
                          {createForm.type === 'customer' ? (
                            <>
                              <option value="C001">德国物流有限公司</option>
                              <option value="C002">欧洲快递服务公司</option>
                              <option value="C003">柏林贸易公司</option>
                            </>
                          ) : (
                            <>
                              <option value="S001">DHL物流服务</option>
                              <option value="S002">UPS快递服务</option>
                              <option value="S003">FedEx国际快递</option>
                            </>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">对账期间 <span className="text-red-500">*</span></label>
                        <input
                          type="month"
                          value={createForm.period}
                          onChange={(e) => setCreateForm({ ...createForm, period: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 text-blue-800">
                      <RefreshCw className="w-4 h-4" />
                      <span className="text-sm font-medium">系统将自动拉取该期间内的所有发票和收付款记录生成对账单</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
                  <button type="button" onClick={() => setShowModal(false)} disabled={isSubmitting} className="btn btn-md btn-secondary">
                    取消
                  </button>
                  <button type="submit" disabled={isSubmitting} className="btn btn-md btn-primary flex items-center gap-2">
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        生成中...
                      </>
                    ) : (
                      <>
                        <ClipboardCheck className="w-4 h-4" />
                        生成对账单
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Toast 消息提示 */}
      {toast.show && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-in">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' 
              ? 'bg-green-600 text-white' 
              : 'bg-red-600 text-white'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}
