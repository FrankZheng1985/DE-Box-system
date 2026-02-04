import { useState } from 'react'
import { 
  Search, 
  Plus, 
  Download, 
  Filter, 
  Eye, 
  Edit, 
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
  Building2,
  Receipt,
  Send,
  History,
  Plus as PlusIcon,
  Minus,
  Truck,
  Package,
  Calendar,
  User,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Banknote,
  Link as LinkIcon,
  Copy,
  Loader2,
  AlertTriangle
} from 'lucide-react'
import { createPayable, updatePayable, deletePayable as deletePayableApi, recordPayablePayment } from '../utils/api'

// ==================== 类型定义 ====================

interface BillItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  tmsRef?: string // 关联运输单号
  orderRef?: string // 关联订单号
}

interface PaymentRecord {
  id: string
  date: string
  amount: number
  method: string
  reference: string
  remark: string
  operator: string
}

interface BillData {
  id: string
  billNo: string
  supplierId: string
  supplierName: string
  supplierAddress: string
  supplierTaxId: string
  supplierContact: string
  supplierPhone: string
  supplierEmail: string
  supplierBankInfo: string
  billDate: string
  dueDate: string
  items: BillItem[]
  subtotal: number
  taxRate: number
  taxAmount: number
  totalAmount: number
  paidAmount: number
  currency: string
  status: 'draft' | 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled'
  paymentTerms: number
  remark: string
  payments: PaymentRecord[]
  relatedTMS: string[]
  relatedOrders: string[] // 关联订单号
  createdBy: string
  createdAt: string
  supplierInvoiceNo: string // 供应商发票号
}

// ==================== 模拟数据 ====================

const mockBills: BillData[] = [
  {
    id: '1',
    billNo: 'BILL-2024-0001',
    supplierId: 'S001',
    supplierName: 'DHL物流服务',
    supplierAddress: 'DHL-Straße 1, 53113 Bonn, Germany',
    supplierTaxId: 'DE119246592',
    supplierContact: 'Michael Schmidt',
    supplierPhone: '+49 228 123456',
    supplierEmail: 'accounting@dhl.de',
    supplierBankInfo: 'Deutsche Bank | IBAN: DE89 3704 0044 0123 4567 00',
    supplierInvoiceNo: 'DHL-INV-20240108',
    billDate: '2024-01-08',
    dueDate: '2024-02-08',
    items: [
      { id: '1', description: '欧洲陆运服务 - 柏林至巴黎', quantity: 1, unitPrice: 5500, amount: 5500, tmsRef: 'TMS-2024-0018', orderRef: 'ORD-2024-0018' },
      { id: '2', description: '仓储中转服务', quantity: 3, unitPrice: 500, amount: 1500, tmsRef: 'TMS-2024-0018', orderRef: 'ORD-2024-0018' },
      { id: '3', description: '清关代理费', quantity: 1, unitPrice: 1500, amount: 1500, tmsRef: 'TMS-2024-0018', orderRef: 'ORD-2024-0018' },
    ],
    subtotal: 8500,
    taxRate: 19,
    taxAmount: 1615,
    totalAmount: 10115,
    paidAmount: 10115,
    currency: 'EUR',
    status: 'paid',
    paymentTerms: 30,
    remark: '',
    payments: [
      { id: '1', date: '2024-02-05', amount: 10115, method: '银行转账', reference: 'PAY-20240205-001', remark: '全额付款', operator: '张会计' }
    ],
    relatedTMS: ['TMS-2024-0018'],
    relatedOrders: ['ORD-2024-0018'],
    createdBy: '王会计',
    createdAt: '2024-01-10 09:30'
  },
  {
    id: '2',
    billNo: 'BILL-2024-0002',
    supplierId: 'S002',
    supplierName: 'UPS快递服务',
    supplierAddress: 'UPS-Str. 50, 40721 Hilden, Germany',
    supplierTaxId: 'DE812581628',
    supplierContact: 'Thomas Weber',
    supplierPhone: '+49 2103 123456',
    supplierEmail: 'billing@ups.de',
    supplierBankInfo: 'Commerzbank | IBAN: DE89 3704 0044 0987 6543 00',
    supplierInvoiceNo: 'UPS-2024-0156',
    billDate: '2024-01-12',
    dueDate: '2024-02-12',
    items: [
      { id: '1', description: '国际快递服务 - 德国至中国', quantity: 25, unitPrice: 180, amount: 4500, tmsRef: 'TMS-2024-0015', orderRef: 'ORD-2024-0015' },
      { id: '2', description: '特殊包装服务', quantity: 10, unitPrice: 85, amount: 850, tmsRef: 'TMS-2024-0015', orderRef: 'ORD-2024-0015' },
      { id: '3', description: '保险费', quantity: 1, unitPrice: 850, amount: 850, tmsRef: 'TMS-2024-0015', orderRef: 'ORD-2024-0015' },
    ],
    subtotal: 6200,
    taxRate: 19,
    taxAmount: 1178,
    totalAmount: 7378,
    paidAmount: 0,
    currency: 'EUR',
    status: 'pending',
    paymentTerms: 30,
    remark: '',
    payments: [],
    relatedTMS: ['TMS-2024-0015'],
    relatedOrders: ['ORD-2024-0015'],
    createdBy: '李会计',
    createdAt: '2024-01-14 11:20'
  },
  {
    id: '3',
    billNo: 'BILL-2024-0003',
    supplierId: 'S003',
    supplierName: 'FedEx国际快递',
    supplierAddress: 'FedEx Tower, Frankfurt Airport, 60549 Frankfurt',
    supplierTaxId: 'DE113850988',
    supplierContact: 'Anna Müller',
    supplierPhone: '+49 69 123456',
    supplierEmail: 'ap@fedex.de',
    supplierBankInfo: 'Deutsche Bank | IBAN: DE89 3704 0044 0555 6666 00',
    supplierInvoiceNo: 'FX-DE-2024-0089',
    billDate: '2024-01-05',
    dueDate: '2024-01-25',
    items: [
      { id: '1', description: '空运服务 - 法兰克福至纽约', quantity: 1, unitPrice: 8500, amount: 8500, tmsRef: 'TMS-2024-0010', orderRef: 'ORD-2024-0010' },
      { id: '2', description: '危险品处理费', quantity: 1, unitPrice: 1300, amount: 1300, tmsRef: 'TMS-2024-0010', orderRef: 'ORD-2024-0010' },
    ],
    subtotal: 9800,
    taxRate: 19,
    taxAmount: 1862,
    totalAmount: 11662,
    paidAmount: 0,
    currency: 'EUR',
    status: 'overdue',
    paymentTerms: 20,
    remark: '紧急付款！',
    payments: [],
    relatedTMS: ['TMS-2024-0010'],
    relatedOrders: ['ORD-2024-0010'],
    createdBy: '王会计',
    createdAt: '2024-01-08 15:45'
  },
  {
    id: '4',
    billNo: 'BILL-2024-0004',
    supplierId: 'S004',
    supplierName: '德铁物流',
    supplierAddress: 'Potsdamer Platz 2, 10785 Berlin',
    supplierTaxId: 'DE811569869',
    supplierContact: 'Klaus Richter',
    supplierPhone: '+49 30 297 0',
    supplierEmail: 'freight@dbschenker.com',
    supplierBankInfo: 'Sparkasse | IBAN: DE89 1005 0000 0123 4567 00',
    supplierInvoiceNo: 'DBS-2024-FRT-0234',
    billDate: '2024-01-15',
    dueDate: '2024-02-28',
    items: [
      { id: '1', description: '铁路运输 - 杜伊斯堡至成都', quantity: 1, unitPrice: 6500, amount: 6500, tmsRef: 'TMS-2024-0020', orderRef: 'ORD-2024-0020' },
      { id: '2', description: '集装箱租赁', quantity: 1, unitPrice: 1100, amount: 1100, tmsRef: 'TMS-2024-0020', orderRef: 'ORD-2024-0020' },
    ],
    subtotal: 7600,
    taxRate: 19,
    taxAmount: 1444,
    totalAmount: 9044,
    paidAmount: 0,
    currency: 'EUR',
    status: 'pending',
    paymentTerms: 45,
    remark: '',
    payments: [],
    relatedTMS: ['TMS-2024-0020'],
    relatedOrders: ['ORD-2024-0020'],
    createdBy: '李会计',
    createdAt: '2024-01-18 10:00'
  },
  {
    id: '5',
    billNo: 'BILL-2024-0005',
    supplierId: 'S005',
    supplierName: '马士基航运',
    supplierAddress: 'Esplanaden 50, 1098 Copenhagen K, Denmark',
    supplierTaxId: 'DK17320744',
    supplierContact: 'Erik Hansen',
    supplierPhone: '+45 3363 3363',
    supplierEmail: 'billing@maersk.com',
    supplierBankInfo: 'Nordea Bank | IBAN: DK50 2000 0123 4567 89',
    supplierInvoiceNo: 'MSK-EUR-2024-0567',
    billDate: '2024-01-10',
    dueDate: '2024-02-10',
    items: [
      { id: '1', description: '海运整柜 40HC - 汉堡至上海', quantity: 2, unitPrice: 6500, amount: 13000, tmsRef: 'TMS-2024-0012', orderRef: 'ORD-2024-0012' },
      { id: '2', description: '港口装卸费', quantity: 2, unitPrice: 1500, amount: 3000, tmsRef: 'TMS-2024-0012', orderRef: 'ORD-2024-0012' },
      { id: '3', description: '提单费', quantity: 2, unitPrice: 150, amount: 300, tmsRef: 'TMS-2024-0012', orderRef: 'ORD-2024-0012' },
      { id: '4', description: '海运保险', quantity: 1, unitPrice: 2200, amount: 2200, tmsRef: 'TMS-2024-0012', orderRef: 'ORD-2024-0012' },
    ],
    subtotal: 18500,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 18500,
    paidAmount: 10000,
    currency: 'EUR',
    status: 'partial',
    paymentTerms: 30,
    remark: '首付款已付，余款待付',
    payments: [
      { id: '1', date: '2024-01-25', amount: 10000, method: '银行转账', reference: 'PAY-20240125-003', remark: '首付款', operator: '张会计' }
    ],
    relatedTMS: ['TMS-2024-0012'],
    relatedOrders: ['ORD-2024-0012'],
    createdBy: '王会计',
    createdAt: '2024-01-12 14:30'
  },
  {
    id: '6',
    billNo: 'BILL-2024-0006',
    supplierId: 'S006',
    supplierName: '欧洲仓储服务',
    supplierAddress: 'Industriestraße 100, 50679 Köln',
    supplierTaxId: 'DE256789123',
    supplierContact: 'Peter Braun',
    supplierPhone: '+49 221 555666',
    supplierEmail: 'invoice@euro-warehouse.de',
    supplierBankInfo: 'Volksbank | IBAN: DE89 3706 0193 0012 3456 78',
    supplierInvoiceNo: 'EW-2024-JAN-088',
    billDate: '2024-01-20',
    dueDate: '2024-02-20',
    items: [
      { id: '1', description: '仓储服务 - 1月', quantity: 1, unitPrice: 3500, amount: 3500 },
      { id: '2', description: '装卸服务', quantity: 1, unitPrice: 800, amount: 800 },
      { id: '3', description: '分拣包装', quantity: 150, unitPrice: 8, amount: 1200 },
    ],
    subtotal: 5500,
    taxRate: 19,
    taxAmount: 1045,
    totalAmount: 6545,
    paidAmount: 0,
    currency: 'EUR',
    status: 'pending',
    paymentTerms: 30,
    remark: '月度仓储费用',
    payments: [],
    relatedTMS: [],
    relatedOrders: [],
    createdBy: '李会计',
    createdAt: '2024-01-22 09:15'
  }
]

// 供应商列表（用于下拉选择）
const supplierOptions = [
  { id: 'S001', name: 'DHL物流服务', taxId: 'DE119246592', bankInfo: 'Deutsche Bank | IBAN: DE89 3704 0044 0123 4567 00' },
  { id: 'S002', name: 'UPS快递服务', taxId: 'DE812581628', bankInfo: 'Commerzbank | IBAN: DE89 3704 0044 0987 6543 00' },
  { id: 'S003', name: 'FedEx国际快递', taxId: 'DE113850988', bankInfo: 'Deutsche Bank | IBAN: DE89 3704 0044 0555 6666 00' },
  { id: 'S004', name: '德铁物流', taxId: 'DE811569869', bankInfo: 'Sparkasse | IBAN: DE89 1005 0000 0123 4567 00' },
  { id: 'S005', name: '马士基航运', taxId: 'DK17320744', bankInfo: 'Nordea Bank | IBAN: DK50 2000 0123 4567 89' },
  { id: 'S006', name: '欧洲仓储服务', taxId: 'DE256789123', bankInfo: 'Volksbank | IBAN: DE89 3706 0193 0012 3456 78' },
]

// 待结算的TMS运输单数据（供应商成本）
interface PendingTMSCost {
  tmsNo: string
  orderNo: string
  transportMode: 'road' | 'sea' | 'air' | 'rail' | 'multimodal'
  supplierId: string
  supplierName: string
  route: string
  completedDate: string
  costItems: {
    description: string
    amount: number
  }[]
  totalCost: number
  invoicedAmount: number // 已开票金额
  status: 'pending' | 'partial' | 'invoiced'
}

const pendingTMSCosts: PendingTMSCost[] = [
  {
    tmsNo: 'TMS-2024-0035',
    orderNo: 'ORD-2024-0035',
    transportMode: 'road',
    supplierId: 'S001',
    supplierName: 'DHL物流服务',
    route: '柏林 → 慕尼黑',
    completedDate: '2024-01-18',
    costItems: [
      { description: '陆运服务费', amount: 2800 },
      { description: '燃油附加费', amount: 280 },
      { description: '保险费', amount: 150 }
    ],
    totalCost: 3230,
    invoicedAmount: 0,
    status: 'pending'
  },
  {
    tmsNo: 'TMS-2024-0036',
    orderNo: 'ORD-2024-0036',
    transportMode: 'sea',
    supplierId: 'S005',
    supplierName: '马士基航运',
    route: '汉堡 → 上海',
    completedDate: '2024-01-20',
    costItems: [
      { description: '海运费（40GP集装箱）', amount: 3500 },
      { description: '港杂费', amount: 450 },
      { description: '文件费', amount: 85 },
      { description: 'THC费用', amount: 320 }
    ],
    totalCost: 4355,
    invoicedAmount: 0,
    status: 'pending'
  },
  {
    tmsNo: 'TMS-2024-0037',
    orderNo: 'ORD-2024-0037',
    transportMode: 'air',
    supplierId: 'S003',
    supplierName: 'FedEx国际快递',
    route: '法兰克福 → 纽约',
    completedDate: '2024-01-22',
    costItems: [
      { description: '空运费', amount: 5800 },
      { description: '燃油附加费', amount: 870 },
      { description: '安检费', amount: 120 },
      { description: '操作费', amount: 200 }
    ],
    totalCost: 6990,
    invoicedAmount: 0,
    status: 'pending'
  },
  {
    tmsNo: 'TMS-2024-0038',
    orderNo: 'ORD-2024-0038',
    transportMode: 'road',
    supplierId: 'S002',
    supplierName: 'UPS快递服务',
    route: '杜塞尔多夫 → 阿姆斯特丹',
    completedDate: '2024-01-19',
    costItems: [
      { description: '快递服务费', amount: 1200 },
      { description: '特殊处理费', amount: 180 }
    ],
    totalCost: 1380,
    invoicedAmount: 0,
    status: 'pending'
  },
  {
    tmsNo: 'TMS-2024-0039',
    orderNo: 'ORD-2024-0039',
    transportMode: 'rail',
    supplierId: 'S004',
    supplierName: '德铁物流',
    route: '汉堡 → 华沙',
    completedDate: '2024-01-21',
    costItems: [
      { description: '铁路运输费', amount: 2200 },
      { description: '装卸费', amount: 350 },
      { description: '仓储中转费', amount: 280 }
    ],
    totalCost: 2830,
    invoicedAmount: 1500,
    status: 'partial'
  },
  {
    tmsNo: 'TMS-2024-0040',
    orderNo: 'ORD-2024-0040',
    transportMode: 'sea',
    supplierId: 'S005',
    supplierName: '马士基航运',
    route: '不来梅 → 深圳',
    completedDate: '2024-01-23',
    costItems: [
      { description: '海运费（2x20GP）', amount: 5600 },
      { description: '港杂费', amount: 680 },
      { description: '文件费', amount: 85 },
      { description: 'THC费用', amount: 520 },
      { description: 'VGM费用', amount: 60 }
    ],
    totalCost: 6945,
    invoicedAmount: 0,
    status: 'pending'
  }
]

// 运输方式标签映射
const transportModeLabels: Record<string, { label: string; color: string }> = {
  road: { label: '陆运', color: 'bg-green-100 text-green-700' },
  sea: { label: '海运', color: 'bg-blue-100 text-blue-700' },
  air: { label: '空运', color: 'bg-purple-100 text-purple-700' },
  rail: { label: '铁运', color: 'bg-orange-100 text-orange-700' },
  multimodal: { label: '多式联运', color: 'bg-indigo-100 text-indigo-700' }
}

// ==================== 辅助映射 ====================

const statusMap: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  draft: { label: '草稿', color: 'bg-gray-100 text-gray-600', icon: FileText },
  pending: { label: '待付款', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  partial: { label: '部分付款', color: 'bg-orange-100 text-orange-700', icon: Clock },
  paid: { label: '已付清', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  overdue: { label: '已逾期', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  cancelled: { label: '已取消', color: 'bg-gray-100 text-gray-500', icon: X },
}

// ==================== 组件 ====================

export default function PayableManagement() {
  // 状态管理
  const [searchKeyword, setSearchKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [selectedBill, setSelectedBill] = useState<BillData | null>(null)
  const [detailTab, setDetailTab] = useState<'basic' | 'items' | 'payments' | 'history'>('basic')
  
  // 本地账单数据状态
  const [bills, setBills] = useState<BillData[]>(mockBills)
  
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
  
  // 付款登记弹窗
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    billId: '',
    amount: 0,
    maxAmount: 0,
    method: '银行转账',
    reference: '',
    date: new Date().toISOString().split('T')[0],
    remark: ''
  })
  
  // TMS运输单选择弹窗
  const [showTMSSelectModal, setShowTMSSelectModal] = useState(false)
  const [selectedTMSList, setSelectedTMSList] = useState<string[]>([])
  const [tmsSearchKeyword, setTmsSearchKeyword] = useState('')
  const [tmsSupplierFilter, setTmsSupplierFilter] = useState('all')
  
  // 表单数据
  const [formData, setFormData] = useState({
    supplierId: '',
    supplierInvoiceNo: '',
    billDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    taxRate: 19,
    paymentTerms: 30,
    remark: '',
    items: [{ description: '', quantity: 1, unitPrice: 0, tmsRef: '' }] as Array<{
      description: string
      quantity: number
      unitPrice: number
      tmsRef: string
    }>
  })
  
  const pageSize = 10
  
  // 筛选账单
  const filteredBills = bills.filter(bill => {
    const matchSearch = bill.billNo.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       bill.supplierName.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       bill.supplierInvoiceNo.toLowerCase().includes(searchKeyword.toLowerCase())
    const matchStatus = statusFilter === 'all' || bill.status === statusFilter
    const matchSupplier = supplierFilter === 'all' || bill.supplierId === supplierFilter
    return matchSearch && matchStatus && matchSupplier
  })
  
  const totalPages = Math.ceil(filteredBills.length / pageSize)
  const paginatedBills = filteredBills.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // 统计数据
  const stats = {
    total: bills.length,
    totalAmount: bills.reduce((sum, bill) => sum + bill.totalAmount, 0),
    paidAmount: bills.reduce((sum, bill) => sum + bill.paidAmount, 0),
    unpaidAmount: bills.reduce((sum, bill) => sum + (bill.totalAmount - bill.paidAmount), 0),
    overdueCount: bills.filter(i => i.status === 'overdue').length,
    overdueAmount: bills.filter(i => i.status === 'overdue').reduce((sum, bill) => sum + (bill.totalAmount - bill.paidAmount), 0),
  }

  // 打开创建账单弹窗
  const handleCreate = () => {
    setModalMode('create')
    setFormData({
      supplierId: '',
      supplierInvoiceNo: '',
      billDate: new Date().toISOString().split('T')[0],
      dueDate: '',
      taxRate: 19,
      paymentTerms: 30,
      remark: '',
      items: [{ description: '', quantity: 1, unitPrice: 0, tmsRef: '' }]
    })
    setSelectedTMSList([])
    setShowModal(true)
  }
  
  // 打开TMS选择弹窗
  const handleOpenTMSSelect = () => {
    setTmsSearchKeyword('')
    setTmsSupplierFilter('all')
    setShowTMSSelectModal(true)
  }
  
  // 切换TMS选择
  const toggleTMSSelection = (tmsNo: string) => {
    const tms = pendingTMSCosts.find(t => t.tmsNo === tmsNo)
    if (!tms) return
    
    setSelectedTMSList(prev => {
      if (prev.includes(tmsNo)) {
        return prev.filter(no => no !== tmsNo)
      } else {
        // 检查是否同一供应商（如果已有选择）
        if (prev.length > 0) {
          const firstTMS = pendingTMSCosts.find(t => t.tmsNo === prev[0])
          if (firstTMS && firstTMS.supplierId !== tms.supplierId) {
            alert('只能选择同一供应商的运输单')
            return prev
          }
        }
        return [...prev, tmsNo]
      }
    })
  }
  
  // 确认TMS选择并填充表单
  const handleConfirmTMSSelection = () => {
    if (selectedTMSList.length === 0) {
      alert('请至少选择一条运输单')
      return
    }
    
    const selectedTMSData = pendingTMSCosts.filter(t => selectedTMSList.includes(t.tmsNo))
    const firstTMS = selectedTMSData[0]
    const supplier = supplierOptions.find(s => s.id === firstTMS.supplierId)
    
    // 生成明细行
    const items: Array<{ description: string; quantity: number; unitPrice: number; tmsRef: string }> = []
    selectedTMSData.forEach(tms => {
      const pendingAmount = tms.totalCost - tms.invoicedAmount
      tms.costItems.forEach(item => {
        const ratio = pendingAmount / tms.totalCost
        items.push({
          description: item.description,
          quantity: 1,
          unitPrice: Math.round(item.amount * ratio * 100) / 100,
          tmsRef: tms.tmsNo
        })
      })
    })
    
    // 计算到期日
    const billDate = new Date()
    const dueDate = new Date(billDate)
    dueDate.setDate(dueDate.getDate() + formData.paymentTerms)
    
    // 填充表单
    setFormData({
      ...formData,
      supplierId: firstTMS.supplierId,
      supplierInvoiceNo: '',
      billDate: billDate.toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
      remark: `关联TMS运输单: ${selectedTMSList.join(', ')}`,
      items: items
    })
    
    setShowTMSSelectModal(false)
  }
  
  // 获取筛选后的TMS列表
  const filteredTMSCosts = pendingTMSCosts.filter(tms => {
    const matchSearch = tms.tmsNo.toLowerCase().includes(tmsSearchKeyword.toLowerCase()) ||
                       tms.orderNo.toLowerCase().includes(tmsSearchKeyword.toLowerCase()) ||
                       tms.supplierName.toLowerCase().includes(tmsSearchKeyword.toLowerCase()) ||
                       tms.route.toLowerCase().includes(tmsSearchKeyword.toLowerCase())
    const matchSupplier = tmsSupplierFilter === 'all' || tms.supplierId === tmsSupplierFilter
    // 只显示有待结算金额的
    const hasPending = tms.totalCost > tms.invoicedAmount
    return matchSearch && matchSupplier && hasPending
  })
  
  // 计算已选TMS的待结算总金额
  const selectedTMSTotalAmount = selectedTMSList.reduce((sum, tmsNo) => {
    const tms = pendingTMSCosts.find(t => t.tmsNo === tmsNo)
    return sum + (tms ? (tms.totalCost - tms.invoicedAmount) : 0)
  }, 0)

  // 打开查看账单弹窗
  const handleView = (bill: BillData) => {
    setModalMode('view')
    setSelectedBill(bill)
    setDetailTab('basic')
    setShowModal(true)
  }

  // 打开编辑账单弹窗
  const handleEdit = (bill: BillData) => {
    setModalMode('edit')
    setSelectedBill(bill)
    setFormData({
      supplierId: bill.supplierId,
      supplierInvoiceNo: bill.supplierInvoiceNo,
      billDate: bill.billDate,
      dueDate: bill.dueDate,
      taxRate: bill.taxRate,
      paymentTerms: bill.paymentTerms,
      remark: bill.remark,
      items: bill.items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        tmsRef: item.tmsRef || ''
      }))
    })
    setShowModal(true)
  }

  // 删除账单
  const handleDelete = async (bill: BillData) => {
    // 只能删除草稿状态的账单
    if (bill.status !== 'draft') {
      showToast('只能删除草稿状态的账单', 'error')
      return
    }
    
    if (!confirm(`确定要删除账单 ${bill.billNo} 吗？此操作不可恢复。`)) {
      return
    }
    
    try {
      const response = await deletePayableApi(bill.id)
      
      if (response.errCode === 200) {
        setBills(prev => prev.filter(b => b.id !== bill.id))
        showToast(`账单 ${bill.billNo} 已删除`, 'success')
      } else {
        showToast(response.msg || '删除失败', 'error')
      }
    } catch (error: any) {
      console.error('删除账单失败:', error)
      // 本地删除
      setBills(prev => prev.filter(b => b.id !== bill.id))
      showToast(`账单 ${bill.billNo} 已删除`, 'success')
    }
  }

  // 打开付款登记弹窗
  const handleOpenPaymentModal = (bill: BillData) => {
    const remaining = bill.totalAmount - bill.paidAmount
    setPaymentForm({
      billId: bill.id,
      amount: remaining,
      maxAmount: remaining,
      method: '银行转账',
      reference: '',
      date: new Date().toISOString().split('T')[0],
      remark: ''
    })
    setSelectedBill(bill)
    setShowPaymentModal(true)
  }

  // 提交付款登记
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedBill) return
    
    if (paymentForm.amount <= 0) {
      showToast('请输入有效的付款金额', 'error')
      return
    }
    
    if (paymentForm.amount > paymentForm.maxAmount) {
      showToast('付款金额不能超过待付款金额', 'error')
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const response = await recordPayablePayment(selectedBill.id, {
        amount: paymentForm.amount,
        paymentDate: paymentForm.date,
        paymentMethod: paymentForm.method,
        reference: paymentForm.reference,
        remark: paymentForm.remark
      })
      
      // 创建新的付款记录
      const newPayment: PaymentRecord = {
        id: Date.now().toString(),
        date: paymentForm.date,
        amount: paymentForm.amount,
        method: paymentForm.method,
        reference: paymentForm.reference || `PAY-${Date.now()}`,
        remark: paymentForm.remark,
        operator: '当前用户'
      }
      
      // 计算新的已付金额和状态
      const newPaidAmount = selectedBill.paidAmount + paymentForm.amount
      const newStatus = newPaidAmount >= selectedBill.totalAmount ? 'paid' : 'partial'
      
      // 更新本地数据
      setBills(prev => prev.map(bill => 
        bill.id === selectedBill.id
          ? {
              ...bill,
              paidAmount: newPaidAmount,
              status: newStatus,
              payments: [...bill.payments, newPayment]
            }
          : bill
      ))
      
      // 更新当前选中的账单
      setSelectedBill(prev => prev ? {
        ...prev,
        paidAmount: newPaidAmount,
        status: newStatus,
        payments: [...prev.payments, newPayment]
      } : null)
      
      showToast(`已付款 €${paymentForm.amount.toLocaleString('de-DE')}`, 'success')
      setShowPaymentModal(false)
    } catch (error: any) {
      console.error('付款登记失败:', error)
      // 即使API失败，也在本地更新
      const newPayment: PaymentRecord = {
        id: Date.now().toString(),
        date: paymentForm.date,
        amount: paymentForm.amount,
        method: paymentForm.method,
        reference: paymentForm.reference || `PAY-${Date.now()}`,
        remark: paymentForm.remark,
        operator: '当前用户'
      }
      
      const newPaidAmount = selectedBill.paidAmount + paymentForm.amount
      const newStatus = newPaidAmount >= selectedBill.totalAmount ? 'paid' : 'partial'
      
      setBills(prev => prev.map(bill => 
        bill.id === selectedBill.id
          ? {
              ...bill,
              paidAmount: newPaidAmount,
              status: newStatus,
              payments: [...bill.payments, newPayment]
            }
          : bill
      ))
      
      setSelectedBill(prev => prev ? {
        ...prev,
        paidAmount: newPaidAmount,
        status: newStatus,
        payments: [...prev.payments, newPayment]
      } : null)
      
      showToast(`已付款 €${paymentForm.amount.toLocaleString('de-DE')}`, 'success')
      setShowPaymentModal(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 添加账单明细行
  const addBillItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { description: '', quantity: 1, unitPrice: 0, tmsRef: '' }]
    })
  }

  // 删除账单明细行
  const removeBillItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    })
  }

  // 更新账单明细
  const updateBillItem = (index: number, field: string, value: string | number) => {
    const newItems = [...formData.items]
    newItems[index] = { ...newItems[index], [field]: value }
    setFormData({ ...formData, items: newItems })
  }

  // 计算表单小计和税额
  const formSubtotal = formData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
  const formTaxAmount = formSubtotal * formData.taxRate / 100
  const formTotal = formSubtotal + formTaxAmount

  // 供应商选择变更
  const handleSupplierChange = (supplierId: string) => {
    setFormData({ ...formData, supplierId })
    const supplier = supplierOptions.find(s => s.id === supplierId)
    if (supplier) {
      const billDate = new Date(formData.billDate)
      billDate.setDate(billDate.getDate() + formData.paymentTerms)
      setFormData({ 
        ...formData, 
        supplierId,
        dueDate: billDate.toISOString().split('T')[0]
      })
    }
  }

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 表单验证
    if (!formData.supplierId) {
      showToast('请选择供应商', 'error')
      return
    }
    
    if (formData.items.length === 0 || !formData.items[0].description) {
      showToast('请至少添加一项账单明细', 'error')
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const supplier = supplierOptions.find(s => s.id === formData.supplierId)
      
      // 计算金额
      const subtotal = formData.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
      const taxAmount = Math.round(subtotal * formData.taxRate) / 100
      const totalAmount = subtotal + taxAmount
      
      if (modalMode === 'create') {
        // 生成新账单号
        const newBillNo = `BILL-${new Date().getFullYear()}-${String(bills.length + 1).padStart(4, '0')}`
        
        // 创建新账单
        const newBill: BillData = {
          id: Date.now().toString(),
          billNo: newBillNo,
          supplierId: formData.supplierId,
          supplierName: supplier?.name || '',
          supplierAddress: supplier?.address || '',
          supplierTaxId: supplier?.taxId || '',
          supplierContact: supplier?.contact || '',
          supplierPhone: supplier?.phone || '',
          supplierEmail: supplier?.email || '',
          supplierBankInfo: supplier?.bankInfo || '',
          supplierInvoiceNo: formData.supplierInvoiceNo,
          billDate: formData.billDate,
          dueDate: formData.dueDate,
          items: formData.items.map((item, index) => ({
            id: (index + 1).toString(),
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.quantity * item.unitPrice,
            tmsRef: item.tmsRef
          })),
          subtotal,
          taxRate: formData.taxRate,
          taxAmount,
          totalAmount,
          paidAmount: 0,
          currency: 'EUR',
          status: 'pending',
          paymentTerms: formData.paymentTerms,
          remark: formData.remark,
          payments: [],
          relatedTMS: formData.items.filter(i => i.tmsRef).map(i => i.tmsRef),
          relatedOrders: [],
          createdBy: '当前用户',
          createdAt: new Date().toLocaleString('zh-CN')
        }
        
        setBills(prev => [newBill, ...prev])
        showToast(`账单 ${newBillNo} 创建成功`, 'success')
      } else {
        // 更新账单
        if (!selectedBill) return
        
        setBills(prev => prev.map(bill => 
          bill.id === selectedBill.id
            ? {
                ...bill,
                supplierId: formData.supplierId,
                supplierName: supplier?.name || bill.supplierName,
                supplierInvoiceNo: formData.supplierInvoiceNo,
                billDate: formData.billDate,
                dueDate: formData.dueDate,
                items: formData.items.map((item, index) => ({
                  id: (index + 1).toString(),
                  description: item.description,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  amount: item.quantity * item.unitPrice,
                  tmsRef: item.tmsRef
                })),
                subtotal,
                taxRate: formData.taxRate,
                taxAmount,
                totalAmount,
                paymentTerms: formData.paymentTerms,
                remark: formData.remark,
                relatedTMS: formData.items.filter(i => i.tmsRef).map(i => i.tmsRef),
              }
            : bill
        ))
        showToast(`账单 ${selectedBill.billNo} 更新成功`, 'success')
      }
      
      setShowModal(false)
    } catch (error: any) {
      console.error('操作失败:', error)
      showToast(error.message || '操作失败，请重试', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 导出功能
  const handleExport = () => {
    const headers = ['账单号', '供应商', '供应商发票号', '账单日期', '到期日', '账单金额', '已付金额', '未付金额', '状态']
    const rows = filteredBills.map(bill => [
      bill.billNo,
      bill.supplierName,
      bill.supplierInvoiceNo,
      bill.billDate,
      bill.dueDate,
      bill.totalAmount,
      bill.paidAmount,
      bill.totalAmount - bill.paidAmount,
      statusMap[bill.status].label
    ])
    
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `应付账款_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">应付账款管理</h1>
          <p className="text-gray-500 mt-1">管理供应商账单、付款和对账</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExport} className="btn btn-md btn-secondary">
            <Download className="w-4 h-4" />
            导出
          </button>
          <button onClick={handleCreate} className="btn btn-md btn-primary">
            <Plus className="w-4 h-4" />
            录入账单
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Receipt className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">账单总额</p>
              <p className="text-xl font-bold text-gray-900">€{stats.totalAmount.toLocaleString('de-DE')}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">已付款</p>
              <p className="text-xl font-bold text-green-600">€{stats.paidAmount.toLocaleString('de-DE')}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">待付款</p>
              <p className="text-xl font-bold text-yellow-600">€{stats.unpaidAmount.toLocaleString('de-DE')}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-100 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">逾期账单</p>
              <p className="text-xl font-bold text-red-600">{stats.overdueCount} 张</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-100 rounded-lg">
              <AlertCircle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">逾期金额</p>
              <p className="text-xl font-bold text-orange-600">€{stats.overdueAmount.toLocaleString('de-DE')}</p>
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
              placeholder="搜索账单号、供应商、发票号..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部供应商</option>
              {supplierOptions.map(supplier => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部状态</option>
              <option value="draft">草稿</option>
              <option value="pending">待付款</option>
              <option value="partial">部分付款</option>
              <option value="paid">已付清</option>
              <option value="overdue">已逾期</option>
            </select>
          </div>
        </div>
      </div>

      {/* 账单表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">账单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">供应商</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">供应商发票号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">账单日期</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">到期日</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">账单金额</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">已付/未付</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedBills.map((bill) => {
                const StatusIcon = statusMap[bill.status].icon
                const unpaid = bill.totalAmount - bill.paidAmount
                return (
                  <tr key={bill.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-blue-600 cursor-pointer hover:text-blue-700" onClick={() => handleView(bill)}>
                        {bill.billNo}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-900">{bill.supplierName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{bill.supplierInvoiceNo}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{bill.billDate}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{bill.dueDate}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      €{bill.totalAmount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="space-y-0.5">
                        <p className="text-sm text-green-600">已付 €{bill.paidAmount.toLocaleString('de-DE')}</p>
                        {unpaid > 0 && (
                          <p className="text-sm text-red-600">未付 €{unpaid.toLocaleString('de-DE')}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMap[bill.status].color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusMap[bill.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleView(bill)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="查看"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {bill.status !== 'paid' && bill.status !== 'cancelled' && (
                          <button
                            onClick={() => handleOpenPaymentModal(bill)}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                            title="付款登记"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {(bill.status === 'draft' || bill.status === 'pending') && (
                          <>
                            <button
                              onClick={() => handleEdit(bill)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="编辑"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(bill)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
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
            共 {filteredBills.length} 条记录
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

      {/* 账单详情/创建/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Receipt className="w-5 h-5 text-orange-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {modalMode === 'create' ? '录入账单' : modalMode === 'edit' ? '编辑账单' : `账单详情 - ${selectedBill?.billNo}`}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {modalMode === 'view' && selectedBill ? (
              <>
                {/* 账单概览卡片 */}
                <div className="grid grid-cols-4 gap-4 p-6 border-b border-gray-100 bg-gray-50 shrink-0">
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">账单金额</p>
                    <p className="text-xl font-bold text-gray-900">€{selectedBill.totalAmount.toLocaleString('de-DE')}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">已付款</p>
                    <p className="text-xl font-bold text-green-600">€{selectedBill.paidAmount.toLocaleString('de-DE')}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">待付款</p>
                    <p className="text-xl font-bold text-red-600">€{(selectedBill.totalAmount - selectedBill.paidAmount).toLocaleString('de-DE')}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">付款进度</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full" 
                          style={{ width: `${(selectedBill.paidAmount / selectedBill.totalAmount) * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium">{Math.round((selectedBill.paidAmount / selectedBill.totalAmount) * 100)}%</span>
                    </div>
                  </div>
                </div>

                {/* 标签页 */}
                <div className="flex border-b border-gray-100 px-6 bg-gray-50 shrink-0">
                  <button onClick={() => setDetailTab('basic')} className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${detailTab === 'basic' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    基本信息
                  </button>
                  <button onClick={() => setDetailTab('items')} className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${detailTab === 'items' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    账单明细 ({selectedBill.items.length})
                  </button>
                  <button onClick={() => setDetailTab('payments')} className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${detailTab === 'payments' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    付款记录 ({selectedBill.payments.length})
                  </button>
                  <button onClick={() => setDetailTab('history')} className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${detailTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    操作历史
                  </button>
                </div>

                {/* 标签页内容 */}
                <div className="flex-1 overflow-y-auto p-6">
                  {detailTab === 'basic' && (
                    <div className="grid grid-cols-2 gap-6">
                      {/* 账单信息 */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <Receipt className="w-4 h-4 text-orange-600" />
                          账单信息
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-500">账单号</span>
                            <span className="text-sm font-medium text-gray-900">{selectedBill.billNo}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-500">供应商发票号</span>
                            <span className="text-sm font-medium text-gray-900">{selectedBill.supplierInvoiceNo}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-500">账单日期</span>
                            <span className="text-sm text-gray-900">{selectedBill.billDate}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-500">到期日</span>
                            <span className="text-sm text-gray-900">{selectedBill.dueDate}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-500">账期</span>
                            <span className="text-sm text-gray-900">{selectedBill.paymentTerms} 天</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-500">状态</span>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMap[selectedBill.status].color}`}>
                              {statusMap[selectedBill.status].label}
                            </span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-500">录入人</span>
                            <span className="text-sm text-gray-900">{selectedBill.createdBy}</span>
                          </div>
                          <div className="flex justify-between py-2">
                            <span className="text-sm text-gray-500">录入时间</span>
                            <span className="text-sm text-gray-900">{selectedBill.createdAt}</span>
                          </div>
                        </div>
                      </div>

                      {/* 供应商信息 */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-blue-600" />
                          供应商信息
                        </h4>
                        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                          <div>
                            <p className="text-lg font-semibold text-gray-900">{selectedBill.supplierName}</p>
                            <p className="text-sm text-gray-500">税号: {selectedBill.supplierTaxId}</p>
                          </div>
                          <div className="flex items-start gap-2 text-sm text-gray-600">
                            <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                            {selectedBill.supplierAddress}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <User className="w-4 h-4 text-gray-400" />
                            {selectedBill.supplierContact}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone className="w-4 h-4 text-gray-400" />
                            {selectedBill.supplierPhone}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Mail className="w-4 h-4 text-gray-400" />
                            {selectedBill.supplierEmail}
                          </div>
                        </div>

                        {/* 金额汇总 */}
                        <h4 className="text-sm font-semibold text-gray-900 mt-6 mb-4 flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-green-600" />
                          金额汇总
                        </h4>
                        <div className="bg-orange-50 rounded-lg p-4 space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">小计</span>
                            <span className="text-sm font-medium">€{selectedBill.subtotal.toLocaleString('de-DE')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">税额 ({selectedBill.taxRate}%)</span>
                            <span className="text-sm font-medium">€{selectedBill.taxAmount.toLocaleString('de-DE')}</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-orange-200">
                            <span className="text-base font-semibold text-gray-900">合计</span>
                            <span className="text-base font-bold text-orange-600">€{selectedBill.totalAmount.toLocaleString('de-DE')}</span>
                          </div>
                        </div>

                        {/* 收款银行 */}
                        <h4 className="text-sm font-semibold text-gray-900 mt-6 mb-4 flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-purple-600" />
                          付款银行
                        </h4>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-sm text-gray-700">{selectedBill.supplierBankInfo}</p>
                        </div>
                      </div>

                      {/* 关联信息 - 跨两列显示 */}
                      {(selectedBill.relatedOrders.length > 0 || selectedBill.relatedTMS.length > 0) && (
                        <div className="col-span-2 mt-6 pt-6 border-t border-gray-200">
                          <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <LinkIcon className="w-4 h-4 text-purple-600" />
                            关联信息
                          </h4>
                          <div className="grid grid-cols-2 gap-4">
                            {/* 关联订单 */}
                            {selectedBill.relatedOrders.length > 0 && (
                              <div className="bg-blue-50 rounded-lg p-4">
                                <p className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-2">
                                  <Package className="w-4 h-4" />
                                  关联订单
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {selectedBill.relatedOrders.map(orderNo => (
                                    <span key={orderNo} className="inline-flex items-center px-2.5 py-1 rounded bg-blue-100 text-blue-700 text-xs font-medium">
                                      {orderNo}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* 关联运输单 */}
                            {selectedBill.relatedTMS.length > 0 && (
                              <div className="bg-purple-50 rounded-lg p-4">
                                <p className="text-sm font-medium text-purple-800 mb-2 flex items-center gap-2">
                                  <Truck className="w-4 h-4" />
                                  关联运输单
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {selectedBill.relatedTMS.map(tmsNo => (
                                    <span key={tmsNo} className="inline-flex items-center px-2.5 py-1 rounded bg-purple-100 text-purple-700 text-xs font-medium">
                                      {tmsNo}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === 'items' && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Package className="w-4 h-4 text-blue-600" />
                        账单明细
                      </h4>
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">描述</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">关联订单</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">关联运输单</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">数量</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">单价</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">金额</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selectedBill.items.map((item, index) => (
                            <tr key={item.id}>
                              <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                              <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                              <td className="px-4 py-3">
                                {item.orderRef && (
                                  <span className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 cursor-pointer">
                                    <Package className="w-3 h-3" />
                                    {item.orderRef}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {item.tmsRef && (
                                  <span className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 cursor-pointer">
                                    <Truck className="w-3 h-3" />
                                    {item.tmsRef}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-900">{item.quantity}</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-900">€{item.unitPrice.toLocaleString('de-DE')}</td>
                              <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">€{item.amount.toLocaleString('de-DE')}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50">
                          <tr>
                            <td colSpan={6} className="px-4 py-3 text-sm font-medium text-gray-900 text-right">小计</td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">€{selectedBill.subtotal.toLocaleString('de-DE')}</td>
                          </tr>
                          <tr>
                            <td colSpan={6} className="px-4 py-3 text-sm text-gray-600 text-right">税额 ({selectedBill.taxRate}%)</td>
                            <td className="px-4 py-3 text-sm text-gray-900 text-right">€{selectedBill.taxAmount.toLocaleString('de-DE')}</td>
                          </tr>
                          <tr>
                            <td colSpan={6} className="px-4 py-3 text-base font-semibold text-gray-900 text-right">合计</td>
                            <td className="px-4 py-3 text-base font-bold text-orange-600 text-right">€{selectedBill.totalAmount.toLocaleString('de-DE')}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {detailTab === 'payments' && (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                          <Banknote className="w-4 h-4 text-green-600" />
                          付款记录
                        </h4>
                        {selectedBill.status !== 'paid' && selectedBill.status !== 'cancelled' && (
                          <button 
                            onClick={() => handleOpenPaymentModal(selectedBill)}
                            className="btn btn-sm btn-primary"
                          >
                            <Plus className="w-4 h-4" />
                            登记付款
                          </button>
                        )}
                      </div>
                      
                      {selectedBill.payments.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-lg">
                          <Send className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500">暂无付款记录</p>
                        </div>
                      ) : (
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">付款日期</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">付款方式</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">参考号</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">付款金额</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">备注</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作人</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {selectedBill.payments.map((payment) => (
                              <tr key={payment.id}>
                                <td className="px-4 py-3 text-sm text-gray-900">{payment.date}</td>
                                <td className="px-4 py-3 text-sm text-gray-900">{payment.method}</td>
                                <td className="px-4 py-3 text-sm text-blue-600">{payment.reference}</td>
                                <td className="px-4 py-3 text-sm text-right font-medium text-red-600">-€{payment.amount.toLocaleString('de-DE')}</td>
                                <td className="px-4 py-3 text-sm text-gray-500">{payment.remark}</td>
                                <td className="px-4 py-3 text-sm text-gray-500">{payment.operator}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-green-50">
                            <tr>
                              <td colSpan={3} className="px-4 py-3 text-sm font-medium text-gray-900">累计付款</td>
                              <td className="px-4 py-3 text-sm font-bold text-green-600 text-right">€{selectedBill.paidAmount.toLocaleString('de-DE')}</td>
                              <td colSpan={2}></td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  )}

                  {detailTab === 'history' && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <History className="w-4 h-4 text-purple-600" />
                        操作历史
                      </h4>
                      <div className="space-y-4">
                        <div className="flex gap-4">
                          <div className="w-2 h-2 mt-2 bg-blue-500 rounded-full"></div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">账单录入</p>
                            <p className="text-xs text-gray-500">{selectedBill.createdAt} · {selectedBill.createdBy}</p>
                          </div>
                        </div>
                        {selectedBill.payments.map((payment, index) => (
                          <div key={index} className="flex gap-4">
                            <div className="w-2 h-2 mt-2 bg-green-500 rounded-full"></div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">付款 €{payment.amount.toLocaleString('de-DE')}</p>
                              <p className="text-xs text-gray-500">{payment.date} · {payment.operator} · {payment.remark}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 底部操作按钮 */}
                <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center shrink-0">
                  <div className="flex gap-2">
                    <button className="btn btn-sm btn-secondary">
                      <Copy className="w-4 h-4" />
                      复制
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {selectedBill.status !== 'paid' && selectedBill.status !== 'cancelled' && (
                      <button 
                        onClick={() => handleOpenPaymentModal(selectedBill)}
                        className="btn btn-sm btn-primary"
                      >
                        <Send className="w-4 h-4" />
                        登记付款
                      </button>
                    )}
                    <button onClick={() => setShowModal(false)} className="btn btn-sm btn-secondary">
                      关闭
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // 创建/编辑表单
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* 从TMS导入按钮（仅创建模式显示） */}
                  {modalMode === 'create' && (
                    <div className="rounded-lg border-2 border-dashed border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-100 rounded-lg">
                            <Truck className="w-5 h-5 text-purple-600" />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-purple-800">从TMS运输单导入</h4>
                            <p className="text-xs text-purple-600">选择已完成的运输单，自动填充供应商成本账单</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleOpenTMSSelect}
                          className="btn btn-md bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          <LinkIcon className="w-4 h-4" />
                          选择运输单
                        </button>
                      </div>
                      {selectedTMSList.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-purple-200">
                          <p className="text-xs text-purple-700 mb-2">已选择 {selectedTMSList.length} 条运输单：</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedTMSList.map(tmsNo => {
                              const tms = pendingTMSCosts.find(t => t.tmsNo === tmsNo)
                              return (
                                <span key={tmsNo} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                                  {tmsNo}
                                  <span className="text-purple-500">({tms?.supplierName})</span>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedTMSList(prev => prev.filter(no => no !== tmsNo))}
                                    className="hover:text-purple-900"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              )
                            })}
                          </div>
                          <p className="text-xs text-purple-600 mt-2">
                            待结算总金额：<span className="font-bold">€{selectedTMSTotalAmount.toLocaleString('de-DE')}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* 账单信息 */}
                  <div className="rounded-lg border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-4">
                    <h4 className="text-sm font-semibold text-orange-800 mb-4 flex items-center gap-2">
                      <Receipt className="w-4 h-4" />
                      账单信息
                    </h4>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">供应商 <span className="text-red-500">*</span></label>
                        <select
                          value={formData.supplierId}
                          onChange={(e) => handleSupplierChange(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          required
                        >
                          <option value="">选择供应商</option>
                          {supplierOptions.map(supplier => (
                            <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">供应商发票号 <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={formData.supplierInvoiceNo}
                          onChange={(e) => setFormData({ ...formData, supplierInvoiceNo: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          placeholder="供应商发票编号"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">税率 (%)</label>
                        <select
                          value={formData.taxRate}
                          onChange={(e) => setFormData({ ...formData, taxRate: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        >
                          <option value={0}>0%</option>
                          <option value={7}>7%</option>
                          <option value={19}>19%</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">账单日期 <span className="text-red-500">*</span></label>
                        <input
                          type="date"
                          value={formData.billDate}
                          onChange={(e) => setFormData({ ...formData, billDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">账期 (天)</label>
                        <select
                          value={formData.paymentTerms}
                          onChange={(e) => setFormData({ ...formData, paymentTerms: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        >
                          <option value={7}>7天</option>
                          <option value={14}>14天</option>
                          <option value={30}>30天</option>
                          <option value={45}>45天</option>
                          <option value={60}>60天</option>
                          <option value={90}>90天</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">到期日 <span className="text-red-500">*</span></label>
                        <input
                          type="date"
                          value={formData.dueDate}
                          onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* 账单明细 */}
                  <div className="rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        账单明细
                      </h4>
                      <button
                        type="button"
                        onClick={addBillItem}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        添加行
                      </button>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="text-xs text-gray-500 uppercase">
                          <th className="text-left pb-2 font-medium">描述 <span className="text-red-500">*</span></th>
                          <th className="text-left pb-2 font-medium w-28">关联TMS</th>
                          <th className="text-right pb-2 font-medium w-20">数量</th>
                          <th className="text-right pb-2 font-medium w-28">单价 (€)</th>
                          <th className="text-right pb-2 font-medium w-28">金额</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="space-y-2">
                        {formData.items.map((item, index) => (
                          <tr key={index} className="bg-white">
                            <td className="pr-2 pb-2">
                              <input
                                type="text"
                                placeholder="费用描述"
                                value={item.description}
                                onChange={(e) => updateBillItem(index, 'description', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                required
                              />
                            </td>
                            <td className="pr-2 pb-2">
                              <input
                                type="text"
                                placeholder="TMS-XXX"
                                value={item.tmsRef}
                                onChange={(e) => updateBillItem(index, 'tmsRef', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                              />
                            </td>
                            <td className="pr-2 pb-2">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateBillItem(index, 'quantity', Number(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right"
                              />
                            </td>
                            <td className="pr-2 pb-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) => updateBillItem(index, 'unitPrice', Number(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right"
                              />
                            </td>
                            <td className="pr-2 pb-2 text-right font-medium text-gray-900">
                              €{(item.quantity * item.unitPrice).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="pb-2">
                              {formData.items.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeBillItem(index)}
                                  className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    
                    {/* 金额汇总 */}
                    <div className="mt-4 pt-4 border-t border-blue-200">
                      <div className="flex justify-end">
                        <div className="w-64 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">小计</span>
                            <span className="font-medium">€{formSubtotal.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">税额 ({formData.taxRate}%)</span>
                            <span className="font-medium">€{formTaxAmount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-base font-semibold pt-2 border-t border-blue-200">
                            <span className="text-gray-900">合计</span>
                            <span className="text-orange-600">€{formTotal.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 备注 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                    <textarea
                      value={formData.remark}
                      onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                      placeholder="账单备注信息..."
                    />
                  </div>
                </div>

                {/* 表单按钮 */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
                  <button type="button" onClick={() => setShowModal(false)} className="btn btn-md btn-secondary">
                    取消
                  </button>
                  <button type="submit" className="btn btn-md btn-primary">
                    {modalMode === 'create' ? '录入账单' : '保存修改'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 付款登记弹窗 */}
      {showPaymentModal && selectedBill && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Send className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">付款登记</h3>
                  <p className="text-sm text-gray-500">{selectedBill.billNo} - {selectedBill.supplierName}</p>
                </div>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <form onSubmit={handleSubmitPayment} className="p-6 space-y-4">
              {/* 账单信息概览 */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500">账单金额</p>
                  <p className="text-lg font-bold text-gray-900">€{selectedBill.totalAmount.toLocaleString('de-DE')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">已付款</p>
                  <p className="text-lg font-bold text-green-600">€{selectedBill.paidAmount.toLocaleString('de-DE')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">待付款</p>
                  <p className="text-lg font-bold text-red-600">€{paymentForm.maxAmount.toLocaleString('de-DE')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">付款金额 (€) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="0.01"
                    max={paymentForm.maxAmount}
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">付款日期 <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={paymentForm.date}
                    onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">付款方式</label>
                  <select
                    value={paymentForm.method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="银行转账">银行转账</option>
                    <option value="支票">支票</option>
                    <option value="现金">现金</option>
                    <option value="信用卡">信用卡</option>
                    <option value="PayPal">PayPal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">交易参考号</label>
                  <input
                    type="text"
                    value={paymentForm.reference}
                    onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="银行流水号/交易号"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  value={paymentForm.remark}
                  onChange={(e) => setPaymentForm({ ...paymentForm, remark: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                  placeholder="付款备注..."
                />
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setShowPaymentModal(false)} className="btn btn-md btn-secondary">
                  取消
                </button>
                <button type="submit" className="btn btn-md btn-primary">
                  <CheckCircle className="w-4 h-4" />
                  确认付款
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TMS运输单选择弹窗 */}
      {showTMSSelectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Truck className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">选择运输单</h3>
                  <p className="text-sm text-gray-500">选择已完成的运输单生成供应商账单</p>
                </div>
              </div>
              <button onClick={() => setShowTMSSelectModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {/* 搜索和筛选 */}
            <div className="px-6 py-4 border-b border-gray-100 flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索运输单号、订单号、供应商、路线..."
                  value={tmsSearchKeyword}
                  onChange={(e) => setTmsSearchKeyword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <select
                value={tmsSupplierFilter}
                onChange={(e) => setTmsSupplierFilter(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="all">全部供应商</option>
                {supplierOptions.map(supplier => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </div>
            
            {/* 运输单列表 */}
            <div className="flex-1 overflow-y-auto p-6">
              {filteredTMSCosts.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>没有找到待结算的运输单</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {filteredTMSCosts.map(tms => {
                    const isSelected = selectedTMSList.includes(tms.tmsNo)
                    const pendingAmount = tms.totalCost - tms.invoicedAmount
                    const modeInfo = transportModeLabels[tms.transportMode]
                    
                    return (
                      <div
                        key={tms.tmsNo}
                        onClick={() => toggleTMSSelection(tms.tmsNo)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected 
                            ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200' 
                            : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/30'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="w-4 h-4 text-purple-600 rounded"
                            />
                            <span className="font-semibold text-gray-900">{tms.tmsNo}</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${modeInfo.color}`}>
                              {modeInfo.label}
                            </span>
                          </div>
                          {tms.status === 'partial' && (
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                              部分结算
                            </span>
                          )}
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-gray-600">
                            <Package className="w-4 h-4" />
                            <span>订单: {tms.orderNo}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Building2 className="w-4 h-4" />
                            <span>{tms.supplierName}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <MapPin className="w-4 h-4" />
                            <span>{tms.route}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Calendar className="w-4 h-4" />
                            <span>完成日期: {tms.completedDate}</span>
                          </div>
                        </div>
                        
                        {/* 费用明细预览 */}
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs text-gray-500 mb-1">费用明细：</p>
                          <div className="text-xs text-gray-600 space-y-0.5">
                            {tms.costItems.slice(0, 3).map((item, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span className="truncate mr-2">{item.description}</span>
                                <span>€{item.amount.toLocaleString('de-DE')}</span>
                              </div>
                            ))}
                            {tms.costItems.length > 3 && (
                              <div className="text-gray-400">+{tms.costItems.length - 3}项...</div>
                            )}
                          </div>
                        </div>
                        
                        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
                          <span className="text-sm text-gray-500">待结算金额</span>
                          <span className="text-lg font-bold text-purple-600">
                            €{pendingAmount.toLocaleString('de-DE')}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            
            {/* 底部操作栏 */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between rounded-b-xl">
              <div className="text-sm text-gray-600">
                {selectedTMSList.length > 0 ? (
                  <>
                    已选择 <span className="font-bold text-purple-600">{selectedTMSList.length}</span> 条运输单，
                    待结算总金额: <span className="font-bold text-purple-600">€{selectedTMSTotalAmount.toLocaleString('de-DE')}</span>
                  </>
                ) : (
                  '请选择要结算的运输单（同一供应商）'
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowTMSSelectModal(false)}
                  className="btn btn-md btn-secondary"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmTMSSelection}
                  disabled={selectedTMSList.length === 0}
                  className="btn btn-md btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="w-4 h-4" />
                  确认选择 ({selectedTMSList.length})
                </button>
              </div>
            </div>
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
