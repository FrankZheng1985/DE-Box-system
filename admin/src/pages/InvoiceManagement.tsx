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
  Printer,
  Send,
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
  Calendar,
  User,
  Building,
  Package,
  Truck,
  Receipt,
  Banknote,
  CreditCard,
  History,
  Plus as PlusIcon,
  Minus,
  RefreshCw,
  Link as LinkIcon,
  Mail,
  Phone,
  MapPin,
  Copy,
  ExternalLink,
  Loader2,
  AlertTriangle
} from 'lucide-react'
import { createInvoice, updateInvoice, deleteInvoice as deleteInvoiceApi, recordInvoicePayment } from '../utils/api'

// ==================== 类型定义 ====================

interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  orderRef?: string // 关联订单号
  tmsRef?: string // 关联运输单号
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

interface InvoiceData {
  id: string
  invoiceNo: string
  type: 'normal' | 'proforma' | 'credit' // 正式发票、形式发票、红字发票
  customerId: string
  customerName: string
  customerAddress: string
  customerTaxId: string
  customerContact: string
  customerPhone: string
  customerEmail: string
  invoiceDate: string
  dueDate: string
  items: InvoiceItem[]
  subtotal: number
  taxRate: number
  taxAmount: number
  totalAmount: number
  paidAmount: number
  currency: string
  status: 'draft' | 'sent' | 'unpaid' | 'partial' | 'paid' | 'overdue' | 'cancelled'
  paymentTerms: number
  bankInfo: string
  remark: string
  payments: PaymentRecord[]
  relatedOrders: string[]
  createdBy: string
  createdAt: string
}

// ==================== 模拟数据 ====================

const mockInvoices: InvoiceData[] = [
  {
    id: '1',
    invoiceNo: 'INV-2024-0001',
    type: 'normal',
    customerId: 'C001',
    customerName: '德国物流有限公司',
    customerAddress: 'Hauptstraße 123, 10115 Berlin, Germany',
    customerTaxId: 'DE123456789',
    customerContact: 'Hans Mueller',
    customerPhone: '+49 30 12345678',
    customerEmail: 'hans@deutsche-logistik.de',
    invoiceDate: '2024-01-15',
    dueDate: '2024-02-15',
    items: [
      { id: '1', description: '欧洲内陆运输服务 - 柏林至巴黎', quantity: 1, unitPrice: 8500, amount: 8500, orderRef: 'ORD-2024-0012', tmsRef: 'TMS-2024-0018' },
      { id: '2', description: '清关代理服务', quantity: 1, unitPrice: 2500, amount: 2500 },
      { id: '3', description: '仓储服务（7天）', quantity: 7, unitPrice: 214.29, amount: 1500 },
    ],
    subtotal: 12500,
    taxRate: 19,
    taxAmount: 2375,
    totalAmount: 14875,
    paidAmount: 14875,
    currency: 'EUR',
    status: 'paid',
    paymentTerms: 30,
    bankInfo: 'Commerzbank | IBAN: DE89 3704 0044 0532 0130 00 | BIC: COBADEFFXXX',
    remark: '',
    payments: [
      { id: '1', date: '2024-02-10', amount: 14875, method: '银行转账', reference: 'TRANSFER-20240210-001', remark: '全额付款', operator: '张会计' }
    ],
    relatedOrders: ['ORD-2024-0012'],
    createdBy: '李会计',
    createdAt: '2024-01-15 09:30'
  },
  {
    id: '2',
    invoiceNo: 'INV-2024-0002',
    type: 'normal',
    customerId: 'C002',
    customerName: '欧洲快递服务公司',
    customerAddress: 'Münchner Str. 456, Munich, Germany',
    customerTaxId: 'DE987654321',
    customerContact: 'Maria Weber',
    customerPhone: '+49 89 9876543',
    customerEmail: 'maria@euro-express.de',
    invoiceDate: '2024-01-14',
    dueDate: '2024-02-14',
    items: [
      { id: '1', description: '空运服务 - 慕尼黑至上海', quantity: 1, unitPrice: 6500, amount: 6500, orderRef: 'ORD-2024-0011', tmsRef: 'TMS-2024-0017' },
      { id: '2', description: '特殊包装服务', quantity: 1, unitPrice: 1200, amount: 1200 },
      { id: '3', description: '保险费', quantity: 1, unitPrice: 1200, amount: 1200 },
    ],
    subtotal: 8900,
    taxRate: 19,
    taxAmount: 1691,
    totalAmount: 10591,
    paidAmount: 0,
    currency: 'EUR',
    status: 'unpaid',
    paymentTerms: 30,
    bankInfo: 'Commerzbank | IBAN: DE89 3704 0044 0532 0130 00 | BIC: COBADEFFXXX',
    remark: '请在到期日前付款',
    payments: [],
    relatedOrders: ['ORD-2024-0011'],
    createdBy: '李会计',
    createdAt: '2024-01-14 14:20'
  },
  {
    id: '3',
    invoiceNo: 'INV-2024-0003',
    type: 'normal',
    customerId: 'C003',
    customerName: '柏林贸易公司',
    customerAddress: 'Friedrichstraße 789, 10117 Berlin, Germany',
    customerTaxId: 'DE456789123',
    customerContact: 'Klaus Schmidt',
    customerPhone: '+49 30 5556666',
    customerEmail: 'klaus@berlin-trading.de',
    invoiceDate: '2024-01-10',
    dueDate: '2024-01-25',
    items: [
      { id: '1', description: '海运整柜 FCL - 汉堡至深圳', quantity: 2, unitPrice: 5500, amount: 11000, orderRef: 'ORD-2024-0008' },
      { id: '2', description: '拖车服务', quantity: 2, unitPrice: 850, amount: 1700 },
      { id: '3', description: '报关服务', quantity: 2, unitPrice: 1550, amount: 3100 },
    ],
    subtotal: 15800,
    taxRate: 19,
    taxAmount: 3002,
    totalAmount: 18802,
    paidAmount: 10000,
    currency: 'EUR',
    status: 'partial',
    paymentTerms: 15,
    bankInfo: 'Commerzbank | IBAN: DE89 3704 0044 0532 0130 00 | BIC: COBADEFFXXX',
    remark: '首付款已收，余款待付',
    payments: [
      { id: '1', date: '2024-01-18', amount: 10000, method: '银行转账', reference: 'TRANSFER-20240118-002', remark: '首付款', operator: '张会计' }
    ],
    relatedOrders: ['ORD-2024-0008'],
    createdBy: '李会计',
    createdAt: '2024-01-10 11:00'
  },
  {
    id: '4',
    invoiceNo: 'INV-2024-0004',
    type: 'normal',
    customerId: 'C004',
    customerName: '慕尼黑电子商务',
    customerAddress: 'Karlsplatz 10, 80335 Munich, Germany',
    customerTaxId: 'DE789123456',
    customerContact: 'Anna Bauer',
    customerPhone: '+49 89 1112222',
    customerEmail: 'anna@munich-ecommerce.de',
    invoiceDate: '2024-01-08',
    dueDate: '2024-01-18',
    items: [
      { id: '1', description: '快递服务 - 德国全境派送', quantity: 50, unitPrice: 85, amount: 4250 },
      { id: '2', description: '包装材料', quantity: 50, unitPrice: 12, amount: 600 },
      { id: '3', description: '上门取件服务', quantity: 5, unitPrice: 150, amount: 750 },
    ],
    subtotal: 5600,
    taxRate: 19,
    taxAmount: 1064,
    totalAmount: 6664,
    paidAmount: 0,
    currency: 'EUR',
    status: 'overdue',
    paymentTerms: 10,
    bankInfo: 'Commerzbank | IBAN: DE89 3704 0044 0532 0130 00 | BIC: COBADEFFXXX',
    remark: '',
    payments: [],
    relatedOrders: ['ORD-2024-0005', 'ORD-2024-0006'],
    createdBy: '王会计',
    createdAt: '2024-01-08 16:45'
  },
  {
    id: '5',
    invoiceNo: 'INV-2024-0005',
    type: 'normal',
    customerId: 'C005',
    customerName: '法兰克福进出口',
    customerAddress: 'Zeil 125, 60313 Frankfurt, Germany',
    customerTaxId: 'DE321654987',
    customerContact: 'Thomas Wagner',
    customerPhone: '+49 69 7778888',
    customerEmail: 'thomas@frankfurt-import.de',
    invoiceDate: '2024-01-05',
    dueDate: '2024-02-05',
    items: [
      { id: '1', description: '铁路运输 - 杜伊斯堡至成都', quantity: 1, unitPrice: 25000, amount: 25000, orderRef: 'ORD-2024-0003' },
      { id: '2', description: '集装箱租赁', quantity: 1, unitPrice: 4000, amount: 4000 },
      { id: '3', description: '保险服务', quantity: 1, unitPrice: 3000, amount: 3000 },
    ],
    subtotal: 32000,
    taxRate: 19,
    taxAmount: 6080,
    totalAmount: 38080,
    paidAmount: 38080,
    currency: 'EUR',
    status: 'paid',
    paymentTerms: 30,
    bankInfo: 'Commerzbank | IBAN: DE89 3704 0044 0532 0130 00 | BIC: COBADEFFXXX',
    remark: '',
    payments: [
      { id: '1', date: '2024-01-25', amount: 20000, method: '银行转账', reference: 'TRANSFER-20240125-001', remark: '首付款', operator: '张会计' },
      { id: '2', date: '2024-02-03', amount: 18080, method: '银行转账', reference: 'TRANSFER-20240203-001', remark: '尾款', operator: '张会计' }
    ],
    relatedOrders: ['ORD-2024-0003'],
    createdBy: '李会计',
    createdAt: '2024-01-05 10:15'
  },
  {
    id: '6',
    invoiceNo: 'INV-2024-0006',
    type: 'proforma',
    customerId: 'C006',
    customerName: '汉堡国际物流',
    customerAddress: 'Hafenstr. 50, 20457 Hamburg, Germany',
    customerTaxId: 'DE654987321',
    customerContact: 'Peter Richter',
    customerPhone: '+49 40 3334444',
    customerEmail: 'peter@hamburg-intl.de',
    invoiceDate: '2024-01-03',
    dueDate: '2024-02-03',
    items: [
      { id: '1', description: '海运拼柜 LCL - 汉堡至宁波', quantity: 15, unitPrice: 800, amount: 12000 },
      { id: '2', description: '仓储及装卸', quantity: 1, unitPrice: 3500, amount: 3500 },
      { id: '3', description: '文件处理费', quantity: 1, unitPrice: 500, amount: 500 },
    ],
    subtotal: 16000,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 16000,
    paidAmount: 0,
    currency: 'EUR',
    status: 'draft',
    paymentTerms: 30,
    bankInfo: 'Commerzbank | IBAN: DE89 3704 0044 0532 0130 00 | BIC: COBADEFFXXX',
    remark: '形式发票，待确认后开具正式发票',
    payments: [],
    relatedOrders: [],
    createdBy: '王会计',
    createdAt: '2024-01-03 14:30'
  }
]

// 客户列表（用于下拉选择）
const customerOptions = [
  { id: 'C001', name: '德国物流有限公司', taxId: 'DE123456789', address: 'Hauptstraße 123, 10115 Berlin', contact: 'Hans Mueller', phone: '+49 30 12345678', email: 'hans@deutsche-logistik.de' },
  { id: 'C002', name: '欧洲快递服务公司', taxId: 'DE987654321', address: 'Münchner Str. 456, Munich', contact: 'Maria Weber', phone: '+49 89 9876543', email: 'maria@euro-express.de' },
  { id: 'C003', name: '柏林贸易公司', taxId: 'DE456789123', address: 'Friedrichstraße 789, Berlin', contact: 'Klaus Schmidt', phone: '+49 30 5556666', email: 'klaus@berlin-trading.de' },
  { id: 'C004', name: '慕尼黑电子商务', taxId: 'DE789123456', address: 'Karlsplatz 10, Munich', contact: 'Anna Bauer', phone: '+49 89 1112222', email: 'anna@munich-ecommerce.de' },
  { id: 'C005', name: '法兰克福进出口', taxId: 'DE321654987', address: 'Zeil 125, Frankfurt', contact: 'Thomas Wagner', phone: '+49 69 7778888', email: 'thomas@frankfurt-import.de' },
]

// 待开票订单列表（模拟数据）
interface PendingOrder {
  id: string
  orderNo: string
  customerId: string
  customerName: string
  transportMode: string
  route: string
  orderDate: string
  completedDate: string
  totalAmount: number
  invoicedAmount: number
  status: 'pending' | 'partial' | 'invoiced'
  services: Array<{
    description: string
    quantity: number
    unitPrice: number
    amount: number
  }>
  tmsRef?: string
}

const pendingOrders: PendingOrder[] = [
  {
    id: 'ORD001',
    orderNo: 'ORD-2024-0025',
    customerId: 'C001',
    customerName: '德国物流有限公司',
    transportMode: '陆运',
    route: '柏林 → 汉堡',
    orderDate: '2024-01-20',
    completedDate: '2024-01-22',
    totalAmount: 3500,
    invoicedAmount: 0,
    status: 'pending',
    services: [
      { description: '陆运服务 - 柏林至汉堡', quantity: 1, unitPrice: 2800, amount: 2800 },
      { description: '装卸服务', quantity: 1, unitPrice: 700, amount: 700 },
    ],
    tmsRef: 'TMS-2024-0030'
  },
  {
    id: 'ORD002',
    orderNo: 'ORD-2024-0026',
    customerId: 'C001',
    customerName: '德国物流有限公司',
    transportMode: '海运',
    route: '汉堡 → 上海',
    orderDate: '2024-01-18',
    completedDate: '2024-01-23',
    totalAmount: 8500,
    invoicedAmount: 0,
    status: 'pending',
    services: [
      { description: '海运整柜 FCL - 汉堡至上海', quantity: 1, unitPrice: 6500, amount: 6500 },
      { description: '港口操作费', quantity: 1, unitPrice: 1200, amount: 1200 },
      { description: '报关服务', quantity: 1, unitPrice: 800, amount: 800 },
    ],
    tmsRef: 'TMS-2024-0028'
  },
  {
    id: 'ORD003',
    orderNo: 'ORD-2024-0027',
    customerId: 'C002',
    customerName: '欧洲快递服务公司',
    transportMode: '空运',
    route: '法兰克福 → 北京',
    orderDate: '2024-01-19',
    completedDate: '2024-01-21',
    totalAmount: 12000,
    invoicedAmount: 0,
    status: 'pending',
    services: [
      { description: '空运服务 - 法兰克福至北京', quantity: 1, unitPrice: 9500, amount: 9500 },
      { description: '紧急处理费', quantity: 1, unitPrice: 1500, amount: 1500 },
      { description: '保险费', quantity: 1, unitPrice: 1000, amount: 1000 },
    ],
    tmsRef: 'TMS-2024-0029'
  },
  {
    id: 'ORD004',
    orderNo: 'ORD-2024-0028',
    customerId: 'C003',
    customerName: '柏林贸易公司',
    transportMode: '海运',
    route: '鹿特丹 → 深圳',
    orderDate: '2024-01-15',
    completedDate: '2024-01-22',
    totalAmount: 15800,
    invoicedAmount: 8000,
    status: 'partial',
    services: [
      { description: '海运整柜 FCL - 鹿特丹至深圳', quantity: 2, unitPrice: 5500, amount: 11000 },
      { description: '拖车服务', quantity: 2, unitPrice: 1200, amount: 2400 },
      { description: '报关代理', quantity: 2, unitPrice: 1200, amount: 2400 },
    ],
    tmsRef: 'TMS-2024-0025'
  },
  {
    id: 'ORD005',
    orderNo: 'ORD-2024-0029',
    customerId: 'C004',
    customerName: '慕尼黑电子商务',
    transportMode: '陆运',
    route: '慕尼黑 → 华沙',
    orderDate: '2024-01-21',
    completedDate: '2024-01-23',
    totalAmount: 4200,
    invoicedAmount: 0,
    status: 'pending',
    services: [
      { description: '跨境陆运 - 慕尼黑至华沙', quantity: 1, unitPrice: 3500, amount: 3500 },
      { description: '货物跟踪服务', quantity: 1, unitPrice: 300, amount: 300 },
      { description: '文件处理费', quantity: 1, unitPrice: 400, amount: 400 },
    ],
    tmsRef: 'TMS-2024-0031'
  },
  {
    id: 'ORD006',
    orderNo: 'ORD-2024-0030',
    customerId: 'C005',
    customerName: '法兰克福进出口',
    transportMode: '多式联运',
    route: '法兰克福 → 广州',
    orderDate: '2024-01-17',
    completedDate: '2024-01-24',
    totalAmount: 22000,
    invoicedAmount: 0,
    status: 'pending',
    services: [
      { description: '多式联运 - 法兰克福至广州', quantity: 1, unitPrice: 18000, amount: 18000 },
      { description: '中转仓储（3天）', quantity: 3, unitPrice: 500, amount: 1500 },
      { description: '全程保险', quantity: 1, unitPrice: 1500, amount: 1500 },
      { description: '清关代理', quantity: 1, unitPrice: 1000, amount: 1000 },
    ],
    tmsRef: 'TMS-2024-0027'
  },
]

// ==================== 辅助映射 ====================

const statusMap: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  draft: { label: '草稿', color: 'bg-gray-100 text-gray-600', icon: FileText },
  sent: { label: '已发送', color: 'bg-blue-100 text-blue-700', icon: Send },
  unpaid: { label: '待付款', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  partial: { label: '部分付款', color: 'bg-orange-100 text-orange-700', icon: Clock },
  paid: { label: '已付清', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  overdue: { label: '已逾期', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  cancelled: { label: '已取消', color: 'bg-gray-100 text-gray-500', icon: X },
}

const typeMap: Record<string, { label: string; color: string }> = {
  normal: { label: '正式发票', color: 'bg-blue-100 text-blue-700' },
  proforma: { label: '形式发票', color: 'bg-purple-100 text-purple-700' },
  credit: { label: '红字发票', color: 'bg-red-100 text-red-700' },
}

// ==================== 组件 ====================

export default function InvoiceManagement() {
  // 状态管理
  const [searchKeyword, setSearchKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null)
  const [detailTab, setDetailTab] = useState<'basic' | 'items' | 'payments' | 'history'>('basic')
  
  // 本地发票数据状态
  const [invoices, setInvoices] = useState<InvoiceData[]>(mockInvoices)
  
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
  
  // 收款登记弹窗
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    invoiceId: '',
    amount: 0,
    maxAmount: 0,
    method: '银行转账',
    reference: '',
    date: new Date().toISOString().split('T')[0],
    remark: ''
  })
  
  // 订单选择弹窗
  const [showOrderSelectModal, setShowOrderSelectModal] = useState(false)
  const [selectedOrders, setSelectedOrders] = useState<string[]>([])
  const [orderSearchKeyword, setOrderSearchKeyword] = useState('')
  const [orderCustomerFilter, setOrderCustomerFilter] = useState('all')
  
  // 表单数据
  const [formData, setFormData] = useState({
    type: 'normal' as 'normal' | 'proforma' | 'credit',
    customerId: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    taxRate: 19,
    paymentTerms: 30,
    remark: '',
    items: [{ description: '', quantity: 1, unitPrice: 0, orderRef: '', tmsRef: '' }] as Array<{
      description: string
      quantity: number
      unitPrice: number
      orderRef: string
      tmsRef: string
    }>
  })
  
  const pageSize = 10
  
  // 筛选发票
  const filteredInvoices = invoices.filter(invoice => {
    const matchSearch = invoice.invoiceNo.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       invoice.customerName.toLowerCase().includes(searchKeyword.toLowerCase())
    const matchStatus = statusFilter === 'all' || invoice.status === statusFilter
    const matchType = typeFilter === 'all' || invoice.type === typeFilter
    return matchSearch && matchStatus && matchType
  })
  
  const totalPages = Math.ceil(filteredInvoices.length / pageSize)
  const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // 统计数据
  const stats = {
    total: invoices.length,
    totalAmount: invoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
    paidAmount: invoices.reduce((sum, inv) => sum + inv.paidAmount, 0),
    unpaidAmount: invoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.paidAmount), 0),
    overdueCount: invoices.filter(i => i.status === 'overdue').length,
    overdueAmount: invoices.filter(i => i.status === 'overdue').reduce((sum, inv) => sum + (inv.totalAmount - inv.paidAmount), 0),
  }

  // 打开创建发票弹窗
  const handleCreate = () => {
    setModalMode('create')
    setFormData({
      type: 'normal',
      customerId: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: '',
      taxRate: 19,
      paymentTerms: 30,
      remark: '',
      items: [{ description: '', quantity: 1, unitPrice: 0, orderRef: '', tmsRef: '' }]
    })
    setSelectedOrders([])
    setShowModal(true)
  }
  
  // 打开订单选择弹窗
  const handleOpenOrderSelect = () => {
    setOrderSearchKeyword('')
    setOrderCustomerFilter('all')
    setSelectedOrders([])
    setShowOrderSelectModal(true)
  }
  
  // 筛选待开票订单
  const filteredPendingOrders = pendingOrders.filter(order => {
    const matchSearch = order.orderNo.toLowerCase().includes(orderSearchKeyword.toLowerCase()) ||
                       order.customerName.toLowerCase().includes(orderSearchKeyword.toLowerCase()) ||
                       order.route.toLowerCase().includes(orderSearchKeyword.toLowerCase())
    const matchCustomer = orderCustomerFilter === 'all' || order.customerId === orderCustomerFilter
    const notFullyInvoiced = order.status !== 'invoiced'
    return matchSearch && matchCustomer && notFullyInvoiced
  })
  
  // 切换订单选择
  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    )
  }
  
  // 确认选择订单并填充发票
  const handleConfirmOrderSelection = () => {
    if (selectedOrders.length === 0) {
      alert('请至少选择一个订单')
      return
    }
    
    // 获取选中的订单
    const orders = pendingOrders.filter(o => selectedOrders.includes(o.id))
    
    // 检查是否为同一客户
    const customerIds = [...new Set(orders.map(o => o.customerId))]
    if (customerIds.length > 1) {
      alert('选择的订单必须属于同一客户，请重新选择')
      return
    }
    
    const customerId = customerIds[0]
    
    // 构建发票明细项
    const invoiceItems: Array<{
      description: string
      quantity: number
      unitPrice: number
      orderRef: string
      tmsRef: string
    }> = []
    
    orders.forEach(order => {
      order.services.forEach(service => {
        invoiceItems.push({
          description: service.description,
          quantity: service.quantity,
          unitPrice: service.unitPrice,
          orderRef: order.orderNo,
          tmsRef: order.tmsRef || ''
        })
      })
    })
    
    // 计算到期日（基于账期）
    const invoiceDate = new Date()
    const dueDate = new Date(invoiceDate)
    dueDate.setDate(dueDate.getDate() + 30)
    
    // 更新表单数据
    setFormData({
      type: 'normal',
      customerId: customerId,
      invoiceDate: invoiceDate.toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
      taxRate: 19,
      paymentTerms: 30,
      remark: `关联订单: ${orders.map(o => o.orderNo).join(', ')}`,
      items: invoiceItems
    })
    
    setShowOrderSelectModal(false)
  }

  // 打开查看发票弹窗
  const handleView = (invoice: InvoiceData) => {
    setModalMode('view')
    setSelectedInvoice(invoice)
    setDetailTab('basic')
    setShowModal(true)
  }

  // 打开编辑发票弹窗
  const handleEdit = (invoice: InvoiceData) => {
    setModalMode('edit')
    setSelectedInvoice(invoice)
    setFormData({
      type: invoice.type,
      customerId: invoice.customerId,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      taxRate: invoice.taxRate,
      paymentTerms: invoice.paymentTerms,
      remark: invoice.remark,
      items: invoice.items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        orderRef: item.orderRef || '',
        tmsRef: item.tmsRef || ''
      }))
    })
    setShowModal(true)
  }

  // 删除发票
  const handleDelete = async (invoice: InvoiceData) => {
    // 只能删除草稿状态的发票
    if (invoice.status !== 'draft') {
      showToast('只能删除草稿状态的发票', 'error')
      return
    }
    
    if (!confirm(`确定要删除发票 ${invoice.invoiceNo} 吗？此操作不可恢复。`)) {
      return
    }
    
    try {
      const response = await deleteInvoiceApi(invoice.id)
      
      if (response.errCode === 200) {
        setInvoices(prev => prev.filter(i => i.id !== invoice.id))
        showToast(`发票 ${invoice.invoiceNo} 已删除`, 'success')
      } else {
        showToast(response.msg || '删除失败', 'error')
      }
    } catch (error: any) {
      console.error('删除发票失败:', error)
      // 本地删除
      setInvoices(prev => prev.filter(i => i.id !== invoice.id))
      showToast(`发票 ${invoice.invoiceNo} 已删除`, 'success')
    }
  }

  // 打开收款登记弹窗
  const handleOpenPaymentModal = (invoice: InvoiceData) => {
    const remaining = invoice.totalAmount - invoice.paidAmount
    setPaymentForm({
      invoiceId: invoice.id,
      amount: remaining,
      maxAmount: remaining,
      method: '银行转账',
      reference: '',
      date: new Date().toISOString().split('T')[0],
      remark: ''
    })
    setSelectedInvoice(invoice)
    setShowPaymentModal(true)
  }

  // 提交收款登记
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedInvoice) return
    
    if (paymentForm.amount <= 0) {
      showToast('请输入有效的收款金额', 'error')
      return
    }
    
    if (paymentForm.amount > paymentForm.maxAmount) {
      showToast('收款金额不能超过待收款金额', 'error')
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const response = await recordInvoicePayment(selectedInvoice.id, {
        amount: paymentForm.amount,
        paymentDate: paymentForm.date,
        paymentMethod: paymentForm.method,
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
      const newPaidAmount = selectedInvoice.paidAmount + paymentForm.amount
      const newStatus = newPaidAmount >= selectedInvoice.totalAmount ? 'paid' : 'partial'
      
      // 更新本地数据
      setInvoices(prev => prev.map(inv => 
        inv.id === selectedInvoice.id
          ? {
              ...inv,
              paidAmount: newPaidAmount,
              status: newStatus,
              payments: [...inv.payments, newPayment]
            }
          : inv
      ))
      
      // 更新当前选中的发票
      setSelectedInvoice(prev => prev ? {
        ...prev,
        paidAmount: newPaidAmount,
        status: newStatus,
        payments: [...prev.payments, newPayment]
      } : null)
      
      showToast(`已收款 €${paymentForm.amount.toLocaleString('de-DE')}`, 'success')
      setShowPaymentModal(false)
    } catch (error: any) {
      console.error('收款登记失败:', error)
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
      
      const newPaidAmount = selectedInvoice.paidAmount + paymentForm.amount
      const newStatus = newPaidAmount >= selectedInvoice.totalAmount ? 'paid' : 'partial'
      
      setInvoices(prev => prev.map(inv => 
        inv.id === selectedInvoice.id
          ? {
              ...inv,
              paidAmount: newPaidAmount,
              status: newStatus,
              payments: [...inv.payments, newPayment]
            }
          : inv
      ))
      
      setSelectedInvoice(prev => prev ? {
        ...prev,
        paidAmount: newPaidAmount,
        status: newStatus,
        payments: [...prev.payments, newPayment]
      } : null)
      
      showToast(`已收款 €${paymentForm.amount.toLocaleString('de-DE')}`, 'success')
      setShowPaymentModal(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 添加发票明细行
  const addInvoiceItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { description: '', quantity: 1, unitPrice: 0, orderRef: '', tmsRef: '' }]
    })
  }

  // 删除发票明细行
  const removeInvoiceItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    })
  }

  // 更新发票明细
  const updateInvoiceItem = (index: number, field: string, value: string | number) => {
    const newItems = [...formData.items]
    newItems[index] = { ...newItems[index], [field]: value }
    setFormData({ ...formData, items: newItems })
  }

  // 计算表单小计和税额
  const formSubtotal = formData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
  const formTaxAmount = formSubtotal * formData.taxRate / 100
  const formTotal = formSubtotal + formTaxAmount

  // 客户选择变更
  const handleCustomerChange = (customerId: string) => {
    const customer = customerOptions.find(c => c.id === customerId)
    setFormData({ ...formData, customerId })
    // 可以根据客户的账期自动设置到期日
    if (customer) {
      const invoiceDate = new Date(formData.invoiceDate)
      invoiceDate.setDate(invoiceDate.getDate() + formData.paymentTerms)
      setFormData({ 
        ...formData, 
        customerId,
        dueDate: invoiceDate.toISOString().split('T')[0]
      })
    }
  }

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 表单验证
    if (!formData.customerId) {
      showToast('请选择客户', 'error')
      return
    }
    
    if (formData.items.length === 0 || !formData.items[0].description) {
      showToast('请至少添加一项发票明细', 'error')
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const customer = customerOptions.find(c => c.id === formData.customerId)
      
      // 构建发票数据
      const invoiceData = {
        type: formData.type,
        customerId: formData.customerId,
        customerName: customer?.name || '',
        invoiceDate: formData.invoiceDate,
        dueDate: formData.dueDate,
        taxRate: formData.taxRate,
        remark: formData.remark,
        items: formData.items.map((item, index) => ({
          id: (index + 1).toString(),
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.quantity * item.unitPrice,
          orderRef: item.orderRef,
          tmsRef: item.tmsRef
        }))
      }
      
      if (modalMode === 'create') {
        // 生成新发票号
        const newInvoiceNo = `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(4, '0')}`
        
        // 创建新发票
        const newInvoice: InvoiceData = {
          id: Date.now().toString(),
          invoiceNo: newInvoiceNo,
          type: formData.type,
          customerId: formData.customerId,
          customerName: customer?.name || '',
          customerAddress: customer?.address || '',
          customerTaxId: customer?.taxId || '',
          customerContact: customer?.contact || '',
          customerPhone: customer?.phone || '',
          customerEmail: customer?.email || '',
          invoiceDate: formData.invoiceDate,
          dueDate: formData.dueDate,
          items: invoiceData.items,
          subtotal: formSubtotal,
          taxRate: formData.taxRate,
          taxAmount: formTaxAmount,
          totalAmount: formTotal,
          paidAmount: 0,
          currency: 'EUR',
          status: 'draft',
          paymentTerms: formData.paymentTerms,
          bankInfo: 'Commerzbank | IBAN: DE89 3704 0044 0532 0130 00 | BIC: COBADEFFXXX',
          remark: formData.remark,
          payments: [],
          relatedOrders: formData.items.filter(i => i.orderRef).map(i => i.orderRef),
          createdBy: '当前用户',
          createdAt: new Date().toLocaleString('zh-CN')
        }
        
        setInvoices(prev => [newInvoice, ...prev])
        showToast(`发票 ${newInvoiceNo} 创建成功`, 'success')
      } else {
        // 更新发票
        if (!selectedInvoice) return
        
        setInvoices(prev => prev.map(inv => 
          inv.id === selectedInvoice.id
            ? {
                ...inv,
                type: formData.type,
                customerId: formData.customerId,
                customerName: customer?.name || inv.customerName,
                invoiceDate: formData.invoiceDate,
                dueDate: formData.dueDate,
                items: invoiceData.items,
                subtotal: formSubtotal,
                taxRate: formData.taxRate,
                taxAmount: formTaxAmount,
                totalAmount: formTotal,
                paymentTerms: formData.paymentTerms,
                remark: formData.remark,
                relatedOrders: formData.items.filter(i => i.orderRef).map(i => i.orderRef),
              }
            : inv
        ))
        showToast(`发票 ${selectedInvoice.invoiceNo} 更新成功`, 'success')
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
    const headers = ['发票号', '客户名称', '开票日期', '到期日', '发票金额', '已付金额', '未付金额', '状态']
    const rows = filteredInvoices.map(inv => [
      inv.invoiceNo,
      inv.customerName,
      inv.invoiceDate,
      inv.dueDate,
      inv.totalAmount,
      inv.paidAmount,
      inv.totalAmount - inv.paidAmount,
      statusMap[inv.status].label
    ])
    
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `应收发票_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">应收发票管理</h1>
          <p className="text-gray-500 mt-1">管理客户发票、收款和对账</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExport} className="btn btn-md btn-secondary">
            <Download className="w-4 h-4" />
            导出
          </button>
          <button onClick={handleCreate} className="btn btn-md btn-primary">
            <Plus className="w-4 h-4" />
            开具发票
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">发票总额</p>
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
              <p className="text-sm text-gray-500">已收款</p>
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
              <p className="text-sm text-gray-500">待收款</p>
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
              <p className="text-sm text-gray-500">逾期发票</p>
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
              placeholder="搜索发票号、客户名称..."
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
              <option value="normal">正式发票</option>
              <option value="proforma">形式发票</option>
              <option value="credit">红字发票</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部状态</option>
              <option value="draft">草稿</option>
              <option value="sent">已发送</option>
              <option value="unpaid">待付款</option>
              <option value="partial">部分付款</option>
              <option value="paid">已付清</option>
              <option value="overdue">已逾期</option>
            </select>
          </div>
        </div>
      </div>

      {/* 发票表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">发票号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">客户名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">开票日期</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">到期日</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">发票金额</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">已付/未付</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedInvoices.map((invoice) => {
                const StatusIcon = statusMap[invoice.status].icon
                const unpaid = invoice.totalAmount - invoice.paidAmount
                return (
                  <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-blue-600 cursor-pointer hover:text-blue-700" onClick={() => handleView(invoice)}>
                        {invoice.invoiceNo}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeMap[invoice.type].color}`}>
                        {typeMap[invoice.type].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-900">{invoice.customerName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{invoice.invoiceDate}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{invoice.dueDate}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      €{invoice.totalAmount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="space-y-0.5">
                        <p className="text-sm text-green-600">已付 €{invoice.paidAmount.toLocaleString('de-DE')}</p>
                        {unpaid > 0 && (
                          <p className="text-sm text-red-600">未付 €{unpaid.toLocaleString('de-DE')}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMap[invoice.status].color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusMap[invoice.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleView(invoice)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="查看"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                          <button
                            onClick={() => handleOpenPaymentModal(invoice)}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                            title="收款登记"
                          >
                            <Banknote className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                          title="打印"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                          title="发送"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        {invoice.status === 'draft' && (
                          <>
                            <button
                              onClick={() => handleEdit(invoice)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="编辑"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(invoice)}
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
            共 {filteredInvoices.length} 条记录
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

      {/* 发票详情/创建/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {modalMode === 'create' ? '开具发票' : modalMode === 'edit' ? '编辑发票' : `发票详情 - ${selectedInvoice?.invoiceNo}`}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {modalMode === 'view' && selectedInvoice ? (
              <>
                {/* 发票概览卡片 */}
                <div className="grid grid-cols-4 gap-4 p-6 border-b border-gray-100 bg-gray-50 shrink-0">
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">发票金额</p>
                    <p className="text-xl font-bold text-gray-900">€{selectedInvoice.totalAmount.toLocaleString('de-DE')}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">已收款</p>
                    <p className="text-xl font-bold text-green-600">€{selectedInvoice.paidAmount.toLocaleString('de-DE')}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">未收款</p>
                    <p className="text-xl font-bold text-red-600">€{(selectedInvoice.totalAmount - selectedInvoice.paidAmount).toLocaleString('de-DE')}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">收款进度</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full" 
                          style={{ width: `${(selectedInvoice.paidAmount / selectedInvoice.totalAmount) * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium">{Math.round((selectedInvoice.paidAmount / selectedInvoice.totalAmount) * 100)}%</span>
                    </div>
                  </div>
                </div>

                {/* 标签页 */}
                <div className="flex border-b border-gray-100 px-6 bg-gray-50 shrink-0">
                  <button onClick={() => setDetailTab('basic')} className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${detailTab === 'basic' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    基本信息
                  </button>
                  <button onClick={() => setDetailTab('items')} className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${detailTab === 'items' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    发票明细 ({selectedInvoice.items.length})
                  </button>
                  <button onClick={() => setDetailTab('payments')} className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${detailTab === 'payments' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    收款记录 ({selectedInvoice.payments.length})
                  </button>
                  <button onClick={() => setDetailTab('history')} className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${detailTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    操作历史
                  </button>
                </div>

                {/* 标签页内容 */}
                <div className="flex-1 overflow-y-auto p-6">
                  {detailTab === 'basic' && (
                    <div className="grid grid-cols-2 gap-6">
                      {/* 发票信息 */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-600" />
                          发票信息
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-500">发票号</span>
                            <span className="text-sm font-medium text-gray-900">{selectedInvoice.invoiceNo}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-500">发票类型</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeMap[selectedInvoice.type].color}`}>
                              {typeMap[selectedInvoice.type].label}
                            </span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-500">开票日期</span>
                            <span className="text-sm text-gray-900">{selectedInvoice.invoiceDate}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-500">到期日</span>
                            <span className="text-sm text-gray-900">{selectedInvoice.dueDate}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-500">账期</span>
                            <span className="text-sm text-gray-900">{selectedInvoice.paymentTerms} 天</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-500">状态</span>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMap[selectedInvoice.status].color}`}>
                              {statusMap[selectedInvoice.status].label}
                            </span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-500">创建人</span>
                            <span className="text-sm text-gray-900">{selectedInvoice.createdBy}</span>
                          </div>
                          <div className="flex justify-between py-2">
                            <span className="text-sm text-gray-500">创建时间</span>
                            <span className="text-sm text-gray-900">{selectedInvoice.createdAt}</span>
                          </div>
                        </div>
                      </div>

                      {/* 客户信息 */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <Building className="w-4 h-4 text-green-600" />
                          客户信息
                        </h4>
                        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                          <div>
                            <p className="text-lg font-semibold text-gray-900">{selectedInvoice.customerName}</p>
                            <p className="text-sm text-gray-500">税号: {selectedInvoice.customerTaxId}</p>
                          </div>
                          <div className="flex items-start gap-2 text-sm text-gray-600">
                            <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                            {selectedInvoice.customerAddress}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <User className="w-4 h-4 text-gray-400" />
                            {selectedInvoice.customerContact}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone className="w-4 h-4 text-gray-400" />
                            {selectedInvoice.customerPhone}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Mail className="w-4 h-4 text-gray-400" />
                            {selectedInvoice.customerEmail}
                          </div>
                        </div>

                        {/* 金额汇总 */}
                        <h4 className="text-sm font-semibold text-gray-900 mt-6 mb-4 flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-orange-600" />
                          金额汇总
                        </h4>
                        <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">小计</span>
                            <span className="text-sm font-medium">€{selectedInvoice.subtotal.toLocaleString('de-DE')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">税额 ({selectedInvoice.taxRate}%)</span>
                            <span className="text-sm font-medium">€{selectedInvoice.taxAmount.toLocaleString('de-DE')}</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-blue-200">
                            <span className="text-base font-semibold text-gray-900">合计</span>
                            <span className="text-base font-bold text-blue-600">€{selectedInvoice.totalAmount.toLocaleString('de-DE')}</span>
                          </div>
                        </div>

                        {/* 银行信息 */}
                        <h4 className="text-sm font-semibold text-gray-900 mt-6 mb-4 flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-purple-600" />
                          收款银行
                        </h4>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-sm text-gray-700">{selectedInvoice.bankInfo}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {detailTab === 'items' && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Package className="w-4 h-4 text-blue-600" />
                        发票明细
                      </h4>
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">描述</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">关联单据</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">数量</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">单价</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">金额</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selectedInvoice.items.map((item, index) => (
                            <tr key={item.id}>
                              <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                              <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                              <td className="px-4 py-3">
                                {item.orderRef && (
                                  <span className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 cursor-pointer">
                                    <LinkIcon className="w-3 h-3" />
                                    {item.orderRef}
                                  </span>
                                )}
                                {item.tmsRef && (
                                  <span className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 cursor-pointer ml-2">
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
                            <td colSpan={5} className="px-4 py-3 text-sm font-medium text-gray-900 text-right">小计</td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">€{selectedInvoice.subtotal.toLocaleString('de-DE')}</td>
                          </tr>
                          <tr>
                            <td colSpan={5} className="px-4 py-3 text-sm text-gray-600 text-right">税额 ({selectedInvoice.taxRate}%)</td>
                            <td className="px-4 py-3 text-sm text-gray-900 text-right">€{selectedInvoice.taxAmount.toLocaleString('de-DE')}</td>
                          </tr>
                          <tr>
                            <td colSpan={5} className="px-4 py-3 text-base font-semibold text-gray-900 text-right">合计</td>
                            <td className="px-4 py-3 text-base font-bold text-blue-600 text-right">€{selectedInvoice.totalAmount.toLocaleString('de-DE')}</td>
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
                          收款记录
                        </h4>
                        {selectedInvoice.status !== 'paid' && selectedInvoice.status !== 'cancelled' && (
                          <button 
                            onClick={() => handleOpenPaymentModal(selectedInvoice)}
                            className="btn btn-sm btn-primary"
                          >
                            <Plus className="w-4 h-4" />
                            登记收款
                          </button>
                        )}
                      </div>
                      
                      {selectedInvoice.payments.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-lg">
                          <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500">暂无收款记录</p>
                        </div>
                      ) : (
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">收款日期</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">收款方式</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">参考号</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">收款金额</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">备注</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作人</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {selectedInvoice.payments.map((payment) => (
                              <tr key={payment.id}>
                                <td className="px-4 py-3 text-sm text-gray-900">{payment.date}</td>
                                <td className="px-4 py-3 text-sm text-gray-900">{payment.method}</td>
                                <td className="px-4 py-3 text-sm text-blue-600">{payment.reference}</td>
                                <td className="px-4 py-3 text-sm text-right font-medium text-green-600">+€{payment.amount.toLocaleString('de-DE')}</td>
                                <td className="px-4 py-3 text-sm text-gray-500">{payment.remark}</td>
                                <td className="px-4 py-3 text-sm text-gray-500">{payment.operator}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-green-50">
                            <tr>
                              <td colSpan={3} className="px-4 py-3 text-sm font-medium text-gray-900">累计收款</td>
                              <td className="px-4 py-3 text-sm font-bold text-green-600 text-right">€{selectedInvoice.paidAmount.toLocaleString('de-DE')}</td>
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
                            <p className="text-sm font-medium text-gray-900">发票创建</p>
                            <p className="text-xs text-gray-500">{selectedInvoice.createdAt} · {selectedInvoice.createdBy}</p>
                          </div>
                        </div>
                        {selectedInvoice.payments.map((payment, index) => (
                          <div key={index} className="flex gap-4">
                            <div className="w-2 h-2 mt-2 bg-green-500 rounded-full"></div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">收款 €{payment.amount.toLocaleString('de-DE')}</p>
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
                      <Printer className="w-4 h-4" />
                      打印
                    </button>
                    <button className="btn btn-sm btn-secondary">
                      <Send className="w-4 h-4" />
                      发送
                    </button>
                    <button className="btn btn-sm btn-secondary">
                      <Copy className="w-4 h-4" />
                      复制
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {selectedInvoice.status !== 'paid' && selectedInvoice.status !== 'cancelled' && (
                      <button 
                        onClick={() => handleOpenPaymentModal(selectedInvoice)}
                        className="btn btn-sm btn-primary"
                      >
                        <Banknote className="w-4 h-4" />
                        登记收款
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
                  {/* 从订单导入按钮（仅创建模式显示） */}
                  {modalMode === 'create' && (
                    <div className="rounded-lg border-2 border-dashed border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-100 rounded-lg">
                            <Package className="w-5 h-5 text-purple-600" />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-purple-800">从订单导入</h4>
                            <p className="text-xs text-purple-600">选择已完成的订单，自动填充发票信息</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleOpenOrderSelect}
                          className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors flex items-center gap-2"
                        >
                          <LinkIcon className="w-4 h-4" />
                          选择订单
                        </button>
                      </div>
                      {selectedOrders.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-purple-200">
                          <p className="text-xs text-purple-700">
                            已选择 <span className="font-semibold">{selectedOrders.length}</span> 个订单：
                            {pendingOrders.filter(o => selectedOrders.includes(o.id)).map(o => o.orderNo).join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* 发票类型和客户信息 */}
                  <div className="rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
                    <h4 className="text-sm font-semibold text-blue-800 mb-4 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      发票信息
                    </h4>
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">发票类型 <span className="text-red-500">*</span></label>
                        <select
                          value={formData.type}
                          onChange={(e) => setFormData({ ...formData, type: e.target.value as 'normal' | 'proforma' | 'credit' })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        >
                          <option value="normal">正式发票</option>
                          <option value="proforma">形式发票</option>
                          <option value="credit">红字发票</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">客户 <span className="text-red-500">*</span></label>
                        <select
                          value={formData.customerId}
                          onChange={(e) => handleCustomerChange(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          required
                        >
                          <option value="">选择客户</option>
                          {customerOptions.map(customer => (
                            <option key={customer.id} value={customer.id}>{customer.name}</option>
                          ))}
                        </select>
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">开票日期 <span className="text-red-500">*</span></label>
                        <input
                          type="date"
                          value={formData.invoiceDate}
                          onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
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

                  {/* 发票明细 */}
                  <div className="rounded-lg border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-green-800 flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        发票明细
                      </h4>
                      <button
                        type="button"
                        onClick={addInvoiceItem}
                        className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        添加行
                      </button>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="text-xs text-gray-500 uppercase">
                          <th className="text-left pb-2 font-medium">描述 <span className="text-red-500">*</span></th>
                          <th className="text-left pb-2 font-medium w-28">关联订单</th>
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
                                placeholder="服务描述"
                                value={item.description}
                                onChange={(e) => updateInvoiceItem(index, 'description', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                required
                              />
                            </td>
                            <td className="pr-2 pb-2">
                              <input
                                type="text"
                                placeholder="ORD-XXX"
                                value={item.orderRef}
                                onChange={(e) => updateInvoiceItem(index, 'orderRef', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                              />
                            </td>
                            <td className="pr-2 pb-2">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateInvoiceItem(index, 'quantity', Number(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right"
                              />
                            </td>
                            <td className="pr-2 pb-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) => updateInvoiceItem(index, 'unitPrice', Number(e.target.value))}
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
                                  onClick={() => removeInvoiceItem(index)}
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
                    <div className="mt-4 pt-4 border-t border-green-200">
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
                          <div className="flex justify-between text-base font-semibold pt-2 border-t border-green-200">
                            <span className="text-gray-900">合计</span>
                            <span className="text-green-600">€{formTotal.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
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
                      placeholder="发票备注信息..."
                    />
                  </div>
                </div>

                {/* 表单按钮 */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
                  <button type="button" onClick={() => setShowModal(false)} className="btn btn-md btn-secondary">
                    取消
                  </button>
                  <button type="submit" className="btn btn-md btn-primary">
                    {modalMode === 'create' ? '开具发票' : '保存修改'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 收款登记弹窗 */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Banknote className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">收款登记</h3>
                  <p className="text-sm text-gray-500">{selectedInvoice.invoiceNo} - {selectedInvoice.customerName}</p>
                </div>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <form onSubmit={handleSubmitPayment} className="p-6 space-y-4">
              {/* 发票信息概览 */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500">发票金额</p>
                  <p className="text-lg font-bold text-gray-900">€{selectedInvoice.totalAmount.toLocaleString('de-DE')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">已收款</p>
                  <p className="text-lg font-bold text-green-600">€{selectedInvoice.paidAmount.toLocaleString('de-DE')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">待收款</p>
                  <p className="text-lg font-bold text-red-600">€{paymentForm.maxAmount.toLocaleString('de-DE')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">收款金额 (€) <span className="text-red-500">*</span></label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">收款日期 <span className="text-red-500">*</span></label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">收款方式</label>
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
                  placeholder="收款备注..."
                />
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setShowPaymentModal(false)} className="btn btn-md btn-secondary">
                  取消
                </button>
                <button type="submit" className="btn btn-md btn-primary">
                  <CheckCircle className="w-4 h-4" />
                  确认收款
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 订单选择弹窗 */}
      {showOrderSelectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Package className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">选择订单</h3>
                  <p className="text-sm text-gray-500">选择已完成的订单生成发票</p>
                </div>
              </div>
              <button
                onClick={() => setShowOrderSelectModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {/* 搜索和筛选 */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 shrink-0">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="搜索订单号、客户名称、路线..."
                    value={orderSearchKeyword}
                    onChange={(e) => setOrderSearchKeyword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <select
                  value={orderCustomerFilter}
                  onChange={(e) => setOrderCustomerFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm min-w-[180px]"
                >
                  <option value="all">全部客户</option>
                  {customerOptions.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {selectedOrders.length > 0 && (
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm text-purple-700">
                    已选择 <span className="font-semibold">{selectedOrders.length}</span> 个订单
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedOrders([])}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    清空选择
                  </button>
                </div>
              )}
            </div>
            
            {/* 订单列表 */}
            <div className="flex-1 overflow-y-auto p-6">
              {filteredPendingOrders.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">暂无待开票的订单</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredPendingOrders.map(order => {
                    const isSelected = selectedOrders.includes(order.id)
                    const remainingAmount = order.totalAmount - order.invoicedAmount
                    
                    return (
                      <div
                        key={order.id}
                        onClick={() => toggleOrderSelection(order.id)}
                        className={`rounded-lg border-2 p-4 cursor-pointer transition-all ${
                          isSelected 
                            ? 'border-purple-500 bg-purple-50' 
                            : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-4">
                            {/* 复选框 */}
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 ${
                              isSelected 
                                ? 'bg-purple-600 border-purple-600' 
                                : 'border-gray-300'
                            }`}>
                              {isSelected && (
                                <CheckCircle className="w-3 h-3 text-white" />
                              )}
                            </div>
                            
                            {/* 订单信息 */}
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="font-semibold text-gray-900">{order.orderNo}</span>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  order.transportMode === '海运' ? 'bg-blue-100 text-blue-700' :
                                  order.transportMode === '空运' ? 'bg-sky-100 text-sky-700' :
                                  order.transportMode === '陆运' ? 'bg-green-100 text-green-700' :
                                  'bg-purple-100 text-purple-700'
                                }`}>
                                  {order.transportMode}
                                </span>
                                {order.status === 'partial' && (
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                                    部分开票
                                  </span>
                                )}
                                {order.tmsRef && (
                                  <span className="text-xs text-gray-500 flex items-center gap-1">
                                    <Truck className="w-3 h-3" />
                                    {order.tmsRef}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <span className="flex items-center gap-1">
                                  <Building className="w-3.5 h-3.5" />
                                  {order.customerName}
                                </span>
                                <span>{order.route}</span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5" />
                                  {order.completedDate}
                                </span>
                              </div>
                              {/* 服务明细预览 */}
                              <div className="mt-2 text-xs text-gray-500">
                                服务项：{order.services.map(s => s.description).join('、')}
                              </div>
                            </div>
                          </div>
                          
                          {/* 金额信息 */}
                          <div className="text-right">
                            <div className="text-lg font-bold text-gray-900">
                              €{remainingAmount.toLocaleString('de-DE')}
                            </div>
                            <div className="text-xs text-gray-500">
                              {order.status === 'partial' ? (
                                <span>待开票 (总额€{order.totalAmount.toLocaleString('de-DE')})</span>
                              ) : (
                                <span>待开票金额</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            
            {/* 底部操作按钮 */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center shrink-0 bg-gray-50">
              <div className="text-sm text-gray-600">
                {selectedOrders.length > 0 && (
                  <span>
                    待开票总金额：
                    <span className="font-semibold text-purple-600">
                      €{pendingOrders
                        .filter(o => selectedOrders.includes(o.id))
                        .reduce((sum, o) => sum + (o.totalAmount - o.invoicedAmount), 0)
                        .toLocaleString('de-DE')}
                    </span>
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowOrderSelectModal(false)}
                  className="btn btn-md btn-secondary"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmOrderSelection}
                  disabled={selectedOrders.length === 0}
                  className="btn btn-md btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="w-4 h-4" />
                  确认选择 ({selectedOrders.length})
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
