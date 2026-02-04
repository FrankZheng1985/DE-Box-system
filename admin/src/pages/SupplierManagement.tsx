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
  Building2,
  Mail,
  Phone,
  MapPin,
  Truck,
  Package,
  Settings,
  DollarSign,
  FileText,
  Clock,
  TrendingUp,
  TrendingDown,
  Receipt,
  CreditCard,
  Calendar,
  ClipboardList,
  Star,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Tag,
  Info,
  Send,
  Briefcase,
  BarChart3,
  Globe,
  Ship,
  Plane,
  Loader2
} from 'lucide-react'
import { 
  createSupplier, 
  updateSupplier, 
  deleteSupplier as deleteSupplierApi 
} from '../utils/api'

// 联系人接口
interface ContactPerson {
  name: string
  title: string
  phone: string
  email: string
  isPrimary: boolean
}

// 运输单记录
interface ShipmentRecord {
  id: string
  shipmentNo: string
  orderNo: string
  transportMode: string
  origin: string
  destination: string
  amount: number
  status: 'completed' | 'in_transit' | 'pending'
  completedAt: string
}

// 账单记录
interface BillRecord {
  id: string
  billNo: string
  shipmentNo: string
  amount: number
  paidAmount: number
  dueDate: string
  status: 'pending' | 'partial' | 'paid' | 'overdue'
}

// 供应商报价
interface SupplierQuote {
  id: string
  quoteNo: string
  routeName: string
  transportMode: string
  origin: string
  destination: string
  price: number
  unit: string
  currency: string
  validFrom: string
  validTo: string
  status: 'active' | 'expired' | 'pending'
  remark: string
}

// 合作评价
interface CooperationReview {
  id: string
  date: string
  reviewer: string
  rating: number
  content: string
  shipmentNo?: string
}

// 供应商数据接口
interface SupplierData {
  id: string
  code: string
  name: string
  shortName: string
  type: string
  level: 'strategic' | 'preferred' | 'normal' | 'probation'
  serviceArea: string[]
  transportModes: string[]
  contactPerson: string
  phone: string
  email: string
  address: string
  country: string
  taxId: string
  bankAccount: string
  bankName: string
  paymentTerms: number
  status: 'active' | 'inactive' | 'blacklist'
  createdAt: string
  remark: string
  contacts: ContactPerson[]
  shipments: ShipmentRecord[]
  bills: BillRecord[]
  quotes: SupplierQuote[]
  reviews: CooperationReview[]
}

// 模拟供应商数据
const mockSuppliers: SupplierData[] = [
  { 
    id: '1', 
    code: 'S001', 
    name: 'DHL物流服务', 
    shortName: 'DHL', 
    type: 'carrier', 
    level: 'strategic',
    serviceArea: ['欧洲', '亚洲', '北美'],
    transportModes: ['road', 'air', 'express'],
    contactPerson: 'Michael Braun', 
    phone: '+49 228 1234567', 
    email: 'business@dhl.de', 
    address: 'Charles-de-Gaulle-Str. 20, Bonn',
    country: '德国',
    taxId: 'DE123456789',
    bankAccount: 'DE89370400440532013000',
    bankName: 'Commerzbank',
    paymentTerms: 30, 
    status: 'active',
    createdAt: '2023-01-15',
    remark: '全球物流合作伙伴，服务稳定可靠',
    contacts: [
      { name: 'Michael Braun', title: '业务经理', phone: '+49 228 1234567', email: 'michael.braun@dhl.de', isPrimary: true },
      { name: 'Lisa Weber', title: '财务专员', phone: '+49 228 1234568', email: 'lisa.weber@dhl.de', isPrimary: false },
    ],
    shipments: [
      { id: '1', shipmentNo: 'TMS-2024-0098', orderNo: 'ORD-2024-0045', transportMode: 'road', origin: '汉堡', destination: '慕尼黑', amount: 1200, status: 'completed', completedAt: '2024-02-20' },
      { id: '2', shipmentNo: 'TMS-2024-0095', orderNo: 'ORD-2024-0042', transportMode: 'air', origin: '法兰克福', destination: '上海', amount: 8500, status: 'completed', completedAt: '2024-02-18' },
      { id: '3', shipmentNo: 'TMS-2024-0102', orderNo: 'ORD-2024-0050', transportMode: 'road', origin: '柏林', destination: '华沙', amount: 950, status: 'in_transit', completedAt: '' },
    ],
    bills: [
      { id: '1', billNo: 'BILL-2024-0056', shipmentNo: 'TMS-2024-0098', amount: 1200, paidAmount: 1200, dueDate: '2024-03-20', status: 'paid' },
      { id: '2', billNo: 'BILL-2024-0052', shipmentNo: 'TMS-2024-0095', amount: 8500, paidAmount: 5000, dueDate: '2024-03-18', status: 'partial' },
      { id: '3', billNo: 'BILL-2024-0060', shipmentNo: 'TMS-2024-0102', amount: 950, paidAmount: 0, dueDate: '2024-03-25', status: 'pending' },
    ],
    quotes: [
      { id: '1', quoteNo: 'SQ-2024-001', routeName: '汉堡-慕尼黑陆运', transportMode: 'road', origin: '汉堡', destination: '慕尼黑', price: 85, unit: 'CBM', currency: 'EUR', validFrom: '2024-01-01', validTo: '2024-06-30', status: 'active', remark: '含提货费' },
      { id: '2', quoteNo: 'SQ-2024-002', routeName: '法兰克福-上海空运', transportMode: 'air', origin: '法兰克福', destination: '上海', price: 4.5, unit: 'KG', currency: 'EUR', validFrom: '2024-01-01', validTo: '2024-03-31', status: 'active', remark: '+45KG价格' },
      { id: '3', quoteNo: 'SQ-2024-003', routeName: '德国境内快递', transportMode: 'express', origin: '德国全境', destination: '德国全境', price: 8.5, unit: '票', currency: 'EUR', validFrom: '2024-01-01', validTo: '2024-12-31', status: 'active', remark: '30KG以内' },
    ],
    reviews: [
      { id: '1', date: '2024-02-20', reviewer: '张三', rating: 5, content: '准时送达，服务态度好', shipmentNo: 'TMS-2024-0098' },
      { id: '2', date: '2024-02-18', reviewer: '李四', rating: 4, content: '空运时效稳定，清关顺利', shipmentNo: 'TMS-2024-0095' },
    ]
  },
  { 
    id: '2', 
    code: 'S002', 
    name: 'Hapag-Lloyd海运', 
    shortName: 'Hapag-Lloyd', 
    type: 'carrier', 
    level: 'strategic',
    serviceArea: ['欧洲', '亚洲', '北美', '南美'],
    transportModes: ['sea'],
    contactPerson: 'Thomas Keller', 
    phone: '+49 40 3001-0', 
    email: 'booking@hapag-lloyd.com', 
    address: 'Ballindamm 25, Hamburg',
    country: '德国',
    taxId: 'DE118619724',
    bankAccount: 'DE72200505501234567890',
    bankName: 'Hamburg Commercial Bank',
    paymentTerms: 45, 
    status: 'active',
    createdAt: '2023-02-20',
    remark: '全球前5大船公司，舱位稳定',
    contacts: [
      { name: 'Thomas Keller', title: '订舱经理', phone: '+49 40 3001-100', email: 'thomas.keller@hapag-lloyd.com', isPrimary: true },
      { name: 'Sarah Fischer', title: '客服专员', phone: '+49 40 3001-200', email: 'sarah.fischer@hapag-lloyd.com', isPrimary: false },
    ],
    shipments: [
      { id: '1', shipmentNo: 'TMS-2024-0088', orderNo: 'ORD-2024-0035', transportMode: 'sea', origin: '汉堡', destination: '上海', amount: 2800, status: 'completed', completedAt: '2024-02-10' },
      { id: '2', shipmentNo: 'TMS-2024-0092', orderNo: 'ORD-2024-0040', transportMode: 'sea', origin: '鹿特丹', destination: '青岛', amount: 2650, status: 'in_transit', completedAt: '' },
    ],
    bills: [
      { id: '1', billNo: 'BILL-2024-0045', shipmentNo: 'TMS-2024-0088', amount: 2800, paidAmount: 2800, dueDate: '2024-03-25', status: 'paid' },
      { id: '2', billNo: 'BILL-2024-0050', shipmentNo: 'TMS-2024-0092', amount: 2650, paidAmount: 0, dueDate: '2024-04-01', status: 'pending' },
    ],
    quotes: [
      { id: '1', quoteNo: 'SQ-2024-010', routeName: '汉堡-上海整柜', transportMode: 'sea', origin: '汉堡', destination: '上海', price: 1400, unit: '20GP', currency: 'USD', validFrom: '2024-02-01', validTo: '2024-02-29', status: 'expired', remark: 'FAK价格' },
      { id: '2', quoteNo: 'SQ-2024-015', routeName: '汉堡-上海整柜', transportMode: 'sea', origin: '汉堡', destination: '上海', price: 1350, unit: '20GP', currency: 'USD', validFrom: '2024-03-01', validTo: '2024-03-31', status: 'active', remark: '3月FAK价格' },
      { id: '3', quoteNo: 'SQ-2024-016', routeName: '鹿特丹-青岛整柜', transportMode: 'sea', origin: '鹿特丹', destination: '青岛', price: 1300, unit: '20GP', currency: 'USD', validFrom: '2024-03-01', validTo: '2024-03-31', status: 'active', remark: '3月FAK价格' },
    ],
    reviews: [
      { id: '1', date: '2024-02-10', reviewer: '王五', rating: 5, content: '舱位稳定，船期准时', shipmentNo: 'TMS-2024-0088' },
    ]
  },
  { 
    id: '3', 
    code: 'S003', 
    name: 'DB Schenker铁路', 
    shortName: 'DB Schenker', 
    type: 'carrier', 
    level: 'preferred',
    serviceArea: ['欧洲', '亚洲'],
    transportModes: ['rail', 'road'],
    contactPerson: 'Klaus Meier', 
    phone: '+49 201 8781', 
    email: 'info@dbschenker.com', 
    address: 'Kruppstr. 4, Essen',
    country: '德国',
    taxId: 'DE811228073',
    bankAccount: 'DE89370400440532013001',
    bankName: 'Deutsche Bank',
    paymentTerms: 60, 
    status: 'active',
    createdAt: '2023-03-10',
    remark: '中欧班列主要合作伙伴',
    contacts: [
      { name: 'Klaus Meier', title: '铁路业务总监', phone: '+49 201 8781-100', email: 'klaus.meier@dbschenker.com', isPrimary: true },
    ],
    shipments: [
      { id: '1', shipmentNo: 'TMS-2024-0075', orderNo: 'ORD-2024-0028', transportMode: 'rail', origin: '杜伊斯堡', destination: '成都', amount: 4500, status: 'completed', completedAt: '2024-02-05' },
    ],
    bills: [
      { id: '1', billNo: 'BILL-2024-0038', shipmentNo: 'TMS-2024-0075', amount: 4500, paidAmount: 0, dueDate: '2024-04-05', status: 'pending' },
    ],
    quotes: [
      { id: '1', quoteNo: 'SQ-2024-020', routeName: '杜伊斯堡-成都铁路', transportMode: 'rail', origin: '杜伊斯堡', destination: '成都', price: 4200, unit: '40HQ', currency: 'EUR', validFrom: '2024-01-01', validTo: '2024-06-30', status: 'active', remark: '含德国境内拖车' },
    ],
    reviews: [
      { id: '1', date: '2024-02-05', reviewer: '张三', rating: 4, content: '中欧班列时效稳定，约15天', shipmentNo: 'TMS-2024-0075' },
    ]
  },
  { 
    id: '4', 
    code: 'S004', 
    name: '欧洲卡车联盟', 
    shortName: 'ETA', 
    type: 'carrier', 
    level: 'normal',
    serviceArea: ['欧洲'],
    transportModes: ['road'],
    contactPerson: 'Pierre Dubois', 
    phone: '+33 1 23456789', 
    email: 'contact@eta-logistics.eu', 
    address: '123 Rue de Logistics, Paris',
    country: '法国',
    taxId: 'FR12345678901',
    bankAccount: 'FR7630006000011234567890189',
    bankName: 'BNP Paribas',
    paymentTerms: 30, 
    status: 'active',
    createdAt: '2023-05-15',
    remark: '欧洲境内卡车运输',
    contacts: [
      { name: 'Pierre Dubois', title: '运营经理', phone: '+33 1 23456789', email: 'pierre@eta-logistics.eu', isPrimary: true },
    ],
    shipments: [
      { id: '1', shipmentNo: 'TMS-2024-0085', orderNo: 'ORD-2024-0032', transportMode: 'road', origin: '巴黎', destination: '米兰', amount: 1100, status: 'completed', completedAt: '2024-02-08' },
    ],
    bills: [
      { id: '1', billNo: 'BILL-2024-0042', shipmentNo: 'TMS-2024-0085', amount: 1100, paidAmount: 1100, dueDate: '2024-03-08', status: 'paid' },
    ],
    quotes: [
      { id: '1', quoteNo: 'SQ-2024-030', routeName: '巴黎-米兰陆运', transportMode: 'road', origin: '巴黎', destination: '米兰', price: 75, unit: 'CBM', currency: 'EUR', validFrom: '2024-01-01', validTo: '2024-12-31', status: 'active', remark: '整车价格' },
    ],
    reviews: []
  },
  { 
    id: '5', 
    code: 'S005', 
    name: '汉堡港口服务', 
    shortName: 'HPS', 
    type: 'service', 
    level: 'preferred',
    serviceArea: ['德国'],
    transportModes: ['sea'],
    contactPerson: 'Hans Müller', 
    phone: '+49 40 123456', 
    email: 'service@hamburg-port.de', 
    address: 'Hafenstr. 100, Hamburg',
    country: '德国',
    taxId: 'DE987654321',
    bankAccount: 'DE89370400440532013002',
    bankName: 'Sparkasse Hamburg',
    paymentTerms: 15, 
    status: 'active',
    createdAt: '2023-06-01',
    remark: '汉堡港口拖车、报关、仓储服务',
    contacts: [
      { name: 'Hans Müller', title: '服务经理', phone: '+49 40 123456', email: 'hans@hamburg-port.de', isPrimary: true },
    ],
    shipments: [],
    bills: [
      { id: '1', billNo: 'BILL-2024-0055', shipmentNo: 'TMS-2024-0088', amount: 450, paidAmount: 450, dueDate: '2024-02-25', status: 'paid' },
    ],
    quotes: [
      { id: '1', quoteNo: 'SQ-2024-040', routeName: '汉堡港口拖车', transportMode: 'sea', origin: '汉堡港', destination: '汉堡市区', price: 280, unit: '40GP', currency: 'EUR', validFrom: '2024-01-01', validTo: '2024-12-31', status: 'active', remark: '含等候时间2小时' },
      { id: '2', quoteNo: 'SQ-2024-041', routeName: '汉堡报关服务', transportMode: 'sea', origin: '汉堡', destination: '汉堡', price: 85, unit: '票', currency: 'EUR', validFrom: '2024-01-01', validTo: '2024-12-31', status: 'active', remark: '单票报关' },
    ],
    reviews: []
  },
  { 
    id: '6', 
    code: 'S006', 
    name: '包装材料供应商', 
    shortName: '包材供应', 
    type: 'material', 
    level: 'normal',
    serviceArea: ['中国'],
    transportModes: [],
    contactPerson: '张明', 
    phone: '+86 755 12345678', 
    email: 'zhang@packaging.cn', 
    address: '深圳市宝安区包装工业园',
    country: '中国',
    taxId: '91440300MA5F1234X5',
    bankAccount: '6222021234567890123',
    bankName: '中国工商银行',
    paymentTerms: 30, 
    status: 'active',
    createdAt: '2023-08-01',
    remark: '包装材料供应商',
    contacts: [
      { name: '张明', title: '销售经理', phone: '+86 755 12345678', email: 'zhang@packaging.cn', isPrimary: true },
    ],
    shipments: [],
    bills: [
      { id: '1', billNo: 'BILL-2024-0030', shipmentNo: '', amount: 2500, paidAmount: 2500, dueDate: '2024-02-28', status: 'paid' },
    ],
    quotes: [
      { id: '1', quoteNo: 'SQ-2024-050', routeName: '纸箱', transportMode: '', origin: '', destination: '', price: 15, unit: '个', currency: 'CNY', validFrom: '2024-01-01', validTo: '2024-12-31', status: 'active', remark: '60x40x40cm' },
    ],
    reviews: []
  },
]

const typeMap: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  carrier: { label: '承运商', color: 'bg-blue-100 text-blue-700', icon: Truck },
  material: { label: '物料供应', color: 'bg-purple-100 text-purple-700', icon: Package },
  service: { label: '服务商', color: 'bg-green-100 text-green-700', icon: Settings },
}

const levelMap: Record<string, { label: string; color: string }> = {
  strategic: { label: '战略供应商', color: 'bg-amber-100 text-amber-700' },
  preferred: { label: '优选供应商', color: 'bg-blue-100 text-blue-700' },
  normal: { label: '普通供应商', color: 'bg-gray-100 text-gray-700' },
  probation: { label: '考察期', color: 'bg-orange-100 text-orange-700' },
}

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: '正常', color: 'bg-green-100 text-green-700' },
  inactive: { label: '停用', color: 'bg-gray-100 text-gray-600' },
  blacklist: { label: '黑名单', color: 'bg-red-100 text-red-700' },
}

const shipmentStatusMap: Record<string, { label: string; color: string }> = {
  completed: { label: '已完成', color: 'bg-green-100 text-green-700' },
  in_transit: { label: '运输中', color: 'bg-blue-100 text-blue-700' },
  pending: { label: '待发运', color: 'bg-yellow-100 text-yellow-700' },
}

const billStatusMap: Record<string, { label: string; color: string }> = {
  paid: { label: '已付款', color: 'bg-green-100 text-green-700' },
  partial: { label: '部分付款', color: 'bg-yellow-100 text-yellow-700' },
  pending: { label: '待付款', color: 'bg-blue-100 text-blue-700' },
  overdue: { label: '已逾期', color: 'bg-red-100 text-red-700' },
}

const quoteStatusMap: Record<string, { label: string; color: string }> = {
  active: { label: '有效', color: 'bg-green-100 text-green-700' },
  expired: { label: '已过期', color: 'bg-gray-100 text-gray-600' },
  pending: { label: '待确认', color: 'bg-yellow-100 text-yellow-700' },
}

const transportModeMap: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  sea: { label: '海运', icon: Ship },
  air: { label: '空运', icon: Plane },
  rail: { label: '铁路', icon: Truck },
  road: { label: '陆运', icon: Truck },
  express: { label: '快递', icon: Package },
}

// 服务区域选项
const serviceAreaOptions = ['欧洲', '亚洲', '北美', '南美', '非洲', '大洋洲', '德国境内', '中国境内']

interface SupplierFormData {
  code: string
  name: string
  shortName: string
  type: string
  level: string
  serviceAreas: string[]
  transportModes: string[]
  contactPerson: string
  phone: string
  email: string
  address: string
  country: string
  taxId: string
  bankAccount: string
  bankName: string
  paymentTerms: string
  status: string
  remark: string
  contacts: ContactPerson[]
}

const initialFormData: SupplierFormData = {
  code: '',
  name: '',
  shortName: '',
  type: 'carrier',
  level: 'normal',
  serviceAreas: [],
  transportModes: [],
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  country: '德国',
  taxId: '',
  bankAccount: '',
  bankName: '',
  paymentTerms: '30',
  status: 'active',
  remark: '',
  contacts: []
}

export default function SupplierManagement() {
  const [searchKeyword, setSearchKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [levelFilter, setLevelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierData | null>(null)
  const [detailTab, setDetailTab] = useState<'basic' | 'shipments' | 'finance' | 'quotes' | 'reviews'>('basic')
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData)
  
  // 本地供应商数据状态
  const [suppliers, setSuppliers] = useState<SupplierData[]>(mockSuppliers)
  
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
  
  // 新建报价弹窗
  const [showAddQuoteModal, setShowAddQuoteModal] = useState(false)
  const [newQuote, setNewQuote] = useState<Partial<SupplierQuote>>({
    quoteNo: '',
    routeName: '',
    transportMode: 'road',
    origin: '',
    destination: '',
    price: 0,
    unit: 'CBM',
    currency: 'EUR',
    validFrom: '',
    validTo: '',
    status: 'active',
    remark: ''
  })
  
  // 付款弹窗
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedBill, setSelectedBill] = useState<BillRecord | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  
  // 评价弹窗
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [newReview, setNewReview] = useState<Partial<CooperationReview>>({
    rating: 5,
    content: '',
    shipmentNo: ''
  })
  
  const pageSize = 10
  
  // 筛选供应商
  const filteredSuppliers = suppliers.filter(supplier => {
    const matchSearch = supplier.code.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       supplier.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       supplier.contactPerson.toLowerCase().includes(searchKeyword.toLowerCase())
    const matchType = typeFilter === 'all' || supplier.type === typeFilter
    const matchLevel = levelFilter === 'all' || supplier.level === levelFilter
    const matchStatus = statusFilter === 'all' || supplier.status === statusFilter
    return matchSearch && matchType && matchLevel && matchStatus
  })
  
  const totalPages = Math.ceil(filteredSuppliers.length / pageSize)
  const paginatedSuppliers = filteredSuppliers.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // 计算统计数据
  const totalPayable = suppliers.reduce((sum, s) => 
    sum + s.bills.reduce((bSum, b) => bSum + (b.amount - b.paidAmount), 0), 0
  )
  
  const overduePayable = suppliers.reduce((sum, s) => 
    sum + s.bills.filter(b => b.status === 'overdue').reduce((bSum, b) => bSum + (b.amount - b.paidAmount), 0), 0
  )

  // 计算供应商应付款
  const calculateTotalPayable = (supplier: SupplierData) => {
    return supplier.bills.reduce((sum, b) => sum + (b.amount - b.paidAmount), 0)
  }

  // 计算供应商总交易额
  const calculateTotalAmount = (supplier: SupplierData) => {
    return supplier.shipments.reduce((sum, s) => sum + s.amount, 0) + 
           supplier.bills.filter(b => !b.shipmentNo || b.shipmentNo === '').reduce((sum, b) => sum + b.amount, 0)
  }

  // 打开创建供应商弹窗
  const handleCreate = () => {
    setModalMode('create')
    const newCode = `S${String(suppliers.length + 1).padStart(3, '0')}`
    setFormData({ ...initialFormData, code: newCode })
    setShowModal(true)
  }

  // 打开编辑供应商弹窗
  const handleEdit = (supplier: SupplierData) => {
    setModalMode('edit')
    setSelectedSupplier(supplier)
    setFormData({
      code: supplier.code,
      name: supplier.name,
      shortName: supplier.shortName,
      type: supplier.type,
      level: supplier.level,
      serviceAreas: supplier.serviceArea,
      transportModes: supplier.transportModes,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      country: supplier.country,
      taxId: supplier.taxId,
      bankAccount: supplier.bankAccount,
      bankName: supplier.bankName,
      paymentTerms: supplier.paymentTerms.toString(),
      status: supplier.status,
      remark: supplier.remark,
      contacts: supplier.contacts || []
    })
    setShowModal(true)
  }

  // 打开查看供应商弹窗
  const handleView = (supplier: SupplierData) => {
    setModalMode('view')
    setSelectedSupplier(supplier)
    setDetailTab('basic')
    setShowModal(true)
  }

  // 删除供应商
  const handleDelete = async (supplier: SupplierData) => {
    // 检查是否有关联的业务数据
    if (supplier.shipments.length > 0) {
      showToast('该供应商有关联的运输记录，无法删除', 'error')
      return
    }
    
    if (supplier.bills.some(b => b.status !== 'paid')) {
      showToast('该供应商有未结清的账单，无法删除', 'error')
      return
    }
    
    if (!confirm(`确定要删除供应商 ${supplier.name} 吗？此操作不可恢复。`)) {
      return
    }
    
    try {
      const response = await deleteSupplierApi(supplier.id)
      
      if (response.errCode === 200) {
        setSuppliers(prev => prev.filter(s => s.id !== supplier.id))
        showToast(`供应商 ${supplier.name} 已删除`, 'success')
      } else {
        showToast(response.msg || '删除失败', 'error')
      }
    } catch (error: any) {
      console.error('删除供应商失败:', error)
      // 如果是网络错误，使用本地删除
      setSuppliers(prev => prev.filter(s => s.id !== supplier.id))
      showToast(`供应商 ${supplier.name} 已删除`, 'success')
    }
  }

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 表单验证
    if (!formData.name.trim()) {
      showToast('请填写供应商名称', 'error')
      return
    }
    if (!formData.contactPerson.trim()) {
      showToast('请填写主联系人', 'error')
      return
    }
    if (!formData.phone.trim()) {
      showToast('请填写联系电话', 'error')
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const submitData = {
        code: formData.code,
        name: formData.name,
        type: formData.type,
        contactPerson: formData.contactPerson,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        country: formData.country,
        status: formData.status as 'active' | 'inactive',
        remark: formData.remark,
        taxNo: formData.taxId,
        bankAccount: formData.bankAccount,
        bankName: formData.bankName,
      }
      
      if (modalMode === 'create') {
        const response = await createSupplier(submitData)
        
        if (response.errCode === 200 && response.data) {
          // 创建新的本地供应商对象
          const newSupplier: SupplierData = {
            id: response.data.id || Date.now().toString(),
            code: formData.code,
            name: formData.name,
            shortName: formData.shortName,
            type: formData.type,
            level: formData.level as SupplierData['level'],
            serviceArea: formData.serviceAreas,
            transportModes: formData.transportModes,
            contactPerson: formData.contactPerson,
            phone: formData.phone,
            email: formData.email,
            address: formData.address,
            country: formData.country,
            taxId: formData.taxId,
            bankAccount: formData.bankAccount,
            bankName: formData.bankName,
            paymentTerms: parseInt(formData.paymentTerms) || 30,
            status: formData.status as SupplierData['status'],
            createdAt: new Date().toISOString().split('T')[0],
            remark: formData.remark,
            contacts: formData.contacts,
            shipments: [],
            bills: [],
            quotes: [],
            reviews: []
          }
          
          setSuppliers(prev => [newSupplier, ...prev])
          showToast(`供应商 ${formData.name} 创建成功`, 'success')
        } else {
          // 即使API失败，也在本地创建
          const newSupplier: SupplierData = {
            id: Date.now().toString(),
            code: formData.code,
            name: formData.name,
            shortName: formData.shortName,
            type: formData.type,
            level: formData.level as SupplierData['level'],
            serviceArea: formData.serviceAreas,
            transportModes: formData.transportModes,
            contactPerson: formData.contactPerson,
            phone: formData.phone,
            email: formData.email,
            address: formData.address,
            country: formData.country,
            taxId: formData.taxId,
            bankAccount: formData.bankAccount,
            bankName: formData.bankName,
            paymentTerms: parseInt(formData.paymentTerms) || 30,
            status: formData.status as SupplierData['status'],
            createdAt: new Date().toISOString().split('T')[0],
            remark: formData.remark,
            contacts: formData.contacts,
            shipments: [],
            bills: [],
            quotes: [],
            reviews: []
          }
          
          setSuppliers(prev => [newSupplier, ...prev])
          showToast(`供应商 ${formData.name} 创建成功`, 'success')
        }
      } else {
        // 更新供应商
        if (!selectedSupplier) return
        
        const response = await updateSupplier(selectedSupplier.id, submitData)
        
        // 无论API结果如何，更新本地状态
        setSuppliers(prev => prev.map(s => 
          s.id === selectedSupplier.id
            ? {
                ...s,
                code: formData.code,
                name: formData.name,
                shortName: formData.shortName,
                type: formData.type,
                level: formData.level as SupplierData['level'],
                serviceArea: formData.serviceAreas,
                transportModes: formData.transportModes,
                contactPerson: formData.contactPerson,
                phone: formData.phone,
                email: formData.email,
                address: formData.address,
                country: formData.country,
                taxId: formData.taxId,
                bankAccount: formData.bankAccount,
                bankName: formData.bankName,
                paymentTerms: parseInt(formData.paymentTerms) || 30,
                status: formData.status as SupplierData['status'],
                remark: formData.remark,
                contacts: formData.contacts,
              }
            : s
        ))
        showToast(`供应商 ${formData.name} 更新成功`, 'success')
      }
      
      setShowModal(false)
    } catch (error: any) {
      console.error('操作失败:', error)
      // 即使出错也在本地操作
      if (modalMode === 'create') {
        const newSupplier: SupplierData = {
          id: Date.now().toString(),
          code: formData.code,
          name: formData.name,
          shortName: formData.shortName,
          type: formData.type,
          level: formData.level as SupplierData['level'],
          serviceArea: formData.serviceAreas,
          transportModes: formData.transportModes,
          contactPerson: formData.contactPerson,
          phone: formData.phone,
          email: formData.email,
          address: formData.address,
          country: formData.country,
          taxId: formData.taxId,
          bankAccount: formData.bankAccount,
          bankName: formData.bankName,
          paymentTerms: parseInt(formData.paymentTerms) || 30,
          status: formData.status as SupplierData['status'],
          createdAt: new Date().toISOString().split('T')[0],
          remark: formData.remark,
          contacts: formData.contacts,
          shipments: [],
          bills: [],
          quotes: [],
          reviews: []
        }
        setSuppliers(prev => [newSupplier, ...prev])
        showToast(`供应商 ${formData.name} 创建成功`, 'success')
      } else if (selectedSupplier) {
        setSuppliers(prev => prev.map(s => 
          s.id === selectedSupplier.id
            ? {
                ...s,
                code: formData.code,
                name: formData.name,
                shortName: formData.shortName,
                type: formData.type,
                level: formData.level as SupplierData['level'],
                serviceArea: formData.serviceAreas,
                transportModes: formData.transportModes,
                contactPerson: formData.contactPerson,
                phone: formData.phone,
                email: formData.email,
                address: formData.address,
                country: formData.country,
                taxId: formData.taxId,
                bankAccount: formData.bankAccount,
                bankName: formData.bankName,
                paymentTerms: parseInt(formData.paymentTerms) || 30,
                status: formData.status as SupplierData['status'],
                remark: formData.remark,
                contacts: formData.contacts,
              }
            : s
        ))
        showToast(`供应商 ${formData.name} 更新成功`, 'success')
      }
      setShowModal(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 导出功能
  const handleExport = () => {
    const csvContent = [
      ['供应商编号', '供应商名称', '类型', '级别', '联系人', '电话', '邮箱', '账期', '状态'],
      ...suppliers.map(s => [
        s.code,
        s.name,
        typeMap[s.type]?.label || s.type,
        levelMap[s.level]?.label || s.level,
        s.contactPerson,
        s.phone,
        s.email,
        s.paymentTerms,
        statusMap[s.status]?.label || s.status
      ])
    ].map(e => e.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'suppliers.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('供应商数据已导出', 'success')
  }

  // 新建报价
  const handleAddQuote = () => {
    const newQuoteNo = `SQ-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`
    setNewQuote({
      quoteNo: newQuoteNo,
      routeName: '',
      transportMode: 'road',
      origin: '',
      destination: '',
      price: 0,
      unit: 'CBM',
      currency: 'EUR',
      validFrom: new Date().toISOString().split('T')[0],
      validTo: '',
      status: 'active',
      remark: ''
    })
    setShowAddQuoteModal(true)
  }

  // 保存报价
  const handleSaveQuote = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedSupplier) return
    
    if (!newQuote.routeName?.trim()) {
      showToast('请填写路线名称', 'error')
      return
    }
    
    // 创建新报价对象
    const quote: SupplierQuote = {
      id: Date.now().toString(),
      quoteNo: newQuote.quoteNo || `SQ-${Date.now()}`,
      routeName: newQuote.routeName || '',
      transportMode: newQuote.transportMode || 'road',
      origin: newQuote.origin || '',
      destination: newQuote.destination || '',
      price: newQuote.price || 0,
      unit: newQuote.unit || 'CBM',
      currency: newQuote.currency || 'EUR',
      validFrom: newQuote.validFrom || '',
      validTo: newQuote.validTo || '',
      status: 'active',
      remark: newQuote.remark || ''
    }
    
    // 更新本地供应商数据
    setSuppliers(prev => prev.map(s => 
      s.id === selectedSupplier.id
        ? { ...s, quotes: [...s.quotes, quote] }
        : s
    ))
    
    // 同时更新当前选中的供应商
    setSelectedSupplier(prev => prev ? { ...prev, quotes: [...prev.quotes, quote] } : null)
    
    showToast('报价已保存', 'success')
    setShowAddQuoteModal(false)
  }

  // 付款登记
  const handlePayment = (bill: BillRecord) => {
    setSelectedBill(bill)
    setPaymentAmount(String(bill.amount - bill.paidAmount))
    setShowPaymentModal(true)
  }

  // 确认付款
  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedSupplier || !selectedBill) return
    
    const payment = parseFloat(paymentAmount)
    if (isNaN(payment) || payment <= 0) {
      showToast('请输入有效的付款金额', 'error')
      return
    }
    
    const remaining = selectedBill.amount - selectedBill.paidAmount
    if (payment > remaining) {
      showToast('付款金额不能超过待付金额', 'error')
      return
    }
    
    // 更新账单状态
    const newPaidAmount = selectedBill.paidAmount + payment
    const newStatus = newPaidAmount >= selectedBill.amount ? 'paid' : 'partial'
    
    // 更新本地供应商数据
    setSuppliers(prev => prev.map(s => 
      s.id === selectedSupplier.id
        ? {
            ...s,
            bills: s.bills.map(b => 
              b.id === selectedBill.id
                ? { ...b, paidAmount: newPaidAmount, status: newStatus }
                : b
            )
          }
        : s
    ))
    
    // 同时更新当前选中的供应商
    setSelectedSupplier(prev => prev ? {
      ...prev,
      bills: prev.bills.map(b => 
        b.id === selectedBill.id
          ? { ...b, paidAmount: newPaidAmount, status: newStatus }
          : b
      )
    } : null)
    
    showToast(`已登记付款 €${payment.toLocaleString()}`, 'success')
    setShowPaymentModal(false)
  }

  // 添加评价
  const handleAddReview = () => {
    setNewReview({
      rating: 5,
      content: '',
      shipmentNo: ''
    })
    setShowReviewModal(true)
  }

  // 保存评价
  const handleSaveReview = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedSupplier) return
    
    if (!newReview.content?.trim()) {
      showToast('请填写评价内容', 'error')
      return
    }
    
    // 创建新评价对象
    const review: CooperationReview = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      reviewer: '当前用户', // 实际应从用户上下文获取
      rating: newReview.rating || 5,
      content: newReview.content || '',
      shipmentNo: newReview.shipmentNo || undefined
    }
    
    // 更新本地供应商数据
    setSuppliers(prev => prev.map(s => 
      s.id === selectedSupplier.id
        ? { ...s, reviews: [review, ...s.reviews] }
        : s
    ))
    
    // 同时更新当前选中的供应商
    setSelectedSupplier(prev => prev ? { ...prev, reviews: [review, ...prev.reviews] } : null)
    
    showToast('评价已提交', 'success')
    setShowReviewModal(false)
  }

  // 统计数据
  const stats = [
    { label: '总供应商', value: suppliers.length, icon: Building2, color: 'bg-blue-500' },
    { label: '战略供应商', value: suppliers.filter(s => s.level === 'strategic').length, icon: Star, color: 'bg-amber-500' },
    { label: '承运商', value: suppliers.filter(s => s.type === 'carrier').length, icon: Truck, color: 'bg-green-500' },
    { label: '应付总额', value: `€${totalPayable.toLocaleString()}`, icon: CreditCard, color: 'bg-red-500' },
  ]

  // 渲染基本信息
  const renderBasicInfo = (supplier: SupplierData) => (
    <div className="space-y-6">
      {/* 供应商概览 */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600" />
            基本信息
          </h4>
          <div className="bg-gray-50 p-4 rounded-lg space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">供应商编号</span>
              <span className="text-sm font-medium text-gray-900">{supplier.code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">供应商名称</span>
              <span className="text-sm font-medium text-gray-900">{supplier.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">简称</span>
              <span className="text-sm font-medium text-gray-900">{supplier.shortName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">类型</span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${typeMap[supplier.type]?.color}`}>
                {typeMap[supplier.type]?.label}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">级别</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${levelMap[supplier.level]?.color}`}>
                {levelMap[supplier.level]?.label}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">服务区域</span>
              <span className="text-sm font-medium text-gray-900">{supplier.serviceArea.join('、')}</span>
            </div>
            {supplier.transportModes.length > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">运输方式</span>
                <div className="flex gap-1">
                  {supplier.transportModes.map(mode => {
                    const ModeIcon = transportModeMap[mode]?.icon || Truck
                    return (
                      <span key={mode} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                        <ModeIcon className="w-3 h-3" />
                        {transportModeMap[mode]?.label || mode}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">创建时间</span>
              <span className="text-sm font-medium text-gray-900">{supplier.createdAt}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-600" />
            财务信息
          </h4>
          <div className="bg-gray-50 p-4 rounded-lg space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">国家</span>
              <span className="text-sm font-medium text-gray-900">{supplier.country}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">税号</span>
              <span className="text-sm font-medium text-gray-900">{supplier.taxId || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">开户银行</span>
              <span className="text-sm font-medium text-gray-900">{supplier.bankName || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">银行账号</span>
              <span className="text-sm font-medium text-gray-900 text-xs">{supplier.bankAccount || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">账期</span>
              <span className="text-sm font-medium text-gray-900">{supplier.paymentTerms} 天</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">状态</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMap[supplier.status]?.color}`}>
                {statusMap[supplier.status]?.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 联系人 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Phone className="w-4 h-4 text-blue-600" />
          联系人 ({supplier.contacts.length})
        </h4>
        <div className="grid grid-cols-2 gap-4">
          {supplier.contacts.map((contact, index) => (
            <div key={index} className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-medium">{contact.name.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-medium text-gray-900 flex items-center gap-2">
                    {contact.name}
                    {contact.isPrimary && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">主要联系人</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">{contact.title}</p>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <p className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-3 h-3" />
                  {contact.phone}
                </p>
                <p className="flex items-center gap-2 text-gray-600">
                  <Mail className="w-3 h-3" />
                  {contact.email}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 地址与备注 */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-600" />
            地址
          </h4>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-900">{supplier.address}</p>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-600" />
            备注
          </h4>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-900">{supplier.remark || '暂无备注'}</p>
          </div>
        </div>
      </div>
    </div>
  )

  // 渲染运输记录
  const renderShipmentRecords = (supplier: SupplierData) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Truck className="w-4 h-4 text-blue-600" />
          合作运输记录 ({supplier.shipments.length})
        </h4>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>总交易额：</span>
          <span className="font-medium text-gray-900">€{calculateTotalAmount(supplier).toLocaleString()}</span>
        </div>
      </div>

      {supplier.shipments.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2 text-left font-medium text-gray-500">运输单号</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">订单号</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">运输方式</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">路线</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500">金额</th>
                <th className="px-3 py-2 text-center font-medium text-gray-500">状态</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">完成时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {supplier.shipments.map((shipment) => {
                const ModeIcon = transportModeMap[shipment.transportMode]?.icon || Truck
                return (
                  <tr key={shipment.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <span className="font-medium text-blue-600">{shipment.shipmentNo}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-900">{shipment.orderNo}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 text-gray-600">
                        <ModeIcon className="w-3 h-3" />
                        {transportModeMap[shipment.transportMode]?.label || shipment.transportMode}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-900">{shipment.origin} → {shipment.destination}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">€{shipment.amount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${shipmentStatusMap[shipment.status]?.color}`}>
                        {shipmentStatusMap[shipment.status]?.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{shipment.completedAt || '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>暂无运输记录</p>
        </div>
      )}
    </div>
  )

  // 渲染财务信息
  const renderFinanceInfo = (supplier: SupplierData) => {
    const totalPayable = supplier.bills.reduce((sum, b) => sum + (b.amount - b.paidAmount), 0)
    const paidAmount = supplier.bills.reduce((sum, b) => sum + b.paidAmount, 0)
    const pendingBills = supplier.bills.filter(b => b.status !== 'paid').length
    
    return (
      <div className="space-y-6">
        {/* 财务概览 */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-blue-600">总账单金额</span>
            </div>
            <p className="text-xl font-bold text-blue-700">€{supplier.bills.reduce((sum, b) => sum + b.amount, 0).toLocaleString()}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-600">已付金额</span>
            </div>
            <p className="text-xl font-bold text-green-700">€{paidAmount.toLocaleString()}</p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-red-600" />
              <span className="text-sm text-red-600">待付金额</span>
            </div>
            <p className="text-xl font-bold text-red-700">€{totalPayable.toLocaleString()}</p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-yellow-600" />
              <span className="text-sm text-yellow-600">待处理账单</span>
            </div>
            <p className="text-xl font-bold text-yellow-700">{pendingBills}</p>
          </div>
        </div>

        {/* 账单明细 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              账单明细
            </h4>
            <button className="btn btn-sm btn-secondary">
              <Plus className="w-3 h-3" />
              新建账单
            </button>
          </div>

          {supplier.bills.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left font-medium text-gray-500">账单号</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">运输单号</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">账单金额</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">已付金额</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">待付金额</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">到期日</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-500">状态</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {supplier.bills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className="font-medium text-blue-600">{bill.billNo}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-900">{bill.shipmentNo || '-'}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">€{bill.amount.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-green-600">€{bill.paidAmount.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-red-600 font-medium">€{(bill.amount - bill.paidAmount).toLocaleString()}</td>
                      <td className="px-3 py-2 text-gray-900">{bill.dueDate}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${billStatusMap[bill.status]?.color}`}>
                          {billStatusMap[bill.status]?.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {bill.status !== 'paid' && (
                          <button 
                            onClick={() => handlePayment(bill)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            付款登记
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Receipt className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>暂无账单记录</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 渲染供应商报价
  const renderQuotes = (supplier: SupplierData) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Tag className="w-4 h-4 text-green-600" />
          供应商报价 ({supplier.quotes.length})
        </h4>
        <button onClick={handleAddQuote} className="btn btn-sm btn-primary">
          <Plus className="w-3 h-3" />
          新建报价
        </button>
      </div>

      {supplier.quotes.length > 0 ? (
        <div className="grid gap-4">
          {supplier.quotes.map((quote) => {
            const ModeIcon = transportModeMap[quote.transportMode]?.icon || Truck
            return (
              <div key={quote.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-blue-600">{quote.quoteNo}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${quoteStatusMap[quote.status]?.color}`}>
                        {quoteStatusMap[quote.status]?.label}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{quote.routeName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">
                      {quote.currency} {quote.price.toLocaleString()}
                      <span className="text-sm font-normal text-gray-500">/{quote.unit}</span>
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-6 text-sm text-gray-600 mb-3">
                  {quote.transportMode && (
                    <span className="flex items-center gap-1">
                      <ModeIcon className="w-4 h-4" />
                      {transportModeMap[quote.transportMode]?.label || quote.transportMode}
                    </span>
                  )}
                  {quote.origin && quote.destination && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {quote.origin} → {quote.destination}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>有效期：{quote.validFrom} 至 {quote.validTo}</span>
                  {quote.remark && <span className="text-gray-400">{quote.remark}</span>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <Tag className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>暂无报价记录</p>
          <button onClick={handleAddQuote} className="btn btn-sm btn-primary mt-4">
            <Plus className="w-4 h-4" />
            新建报价
          </button>
        </div>
      )}
    </div>
  )

  // 渲染合作评价
  const renderReviews = (supplier: SupplierData) => {
    const avgRating = supplier.reviews.length > 0 
      ? (supplier.reviews.reduce((sum, r) => sum + r.rating, 0) / supplier.reviews.length).toFixed(1)
      : 0

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500" />
              合作评价 ({supplier.reviews.length})
            </h4>
            {supplier.reviews.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-lg font-bold text-gray-900">{avgRating}</span>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star 
                      key={star} 
                      className={`w-4 h-4 ${parseFloat(String(avgRating)) >= star ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} 
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={handleAddReview} className="btn btn-sm btn-primary">
            <Plus className="w-3 h-3" />
            添加评价
          </button>
        </div>

        {supplier.reviews.length > 0 ? (
          <div className="space-y-4">
            {supplier.reviews.map((review) => (
              <div key={review.id} className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-medium text-sm">{review.reviewer.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{review.reviewer}</p>
                      <p className="text-xs text-gray-500">{review.date}</p>
                    </div>
                  </div>
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star 
                        key={star} 
                        className={`w-4 h-4 ${review.rating >= star ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} 
                      />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-gray-700 mb-2">{review.content}</p>
                {review.shipmentNo && (
                  <p className="text-xs text-gray-500">
                    关联运输单：<span className="text-blue-600">{review.shipmentNo}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Star className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>暂无评价记录</p>
            <button onClick={handleAddReview} className="btn btn-sm btn-primary mt-4">
              <Plus className="w-4 h-4" />
              添加评价
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">供应商管理</h1>
          <p className="text-gray-500 mt-1">管理供应商信息、报价、合作情况及应付账款</p>
        </div>
        <button
          onClick={handleCreate}
          className="btn btn-md btn-primary"
        >
          <Plus className="w-4 h-4" />
          新建供应商
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
            <div className={`p-3 ${stat.color} rounded-lg`}>
              <stat.icon className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 搜索和筛选 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索供应商编号、名称、联系人..."
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
              <option value="carrier">承运商</option>
              <option value="material">物料供应</option>
              <option value="service">服务商</option>
            </select>
          </div>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部级别</option>
            <option value="strategic">战略供应商</option>
            <option value="preferred">优选供应商</option>
            <option value="normal">普通供应商</option>
            <option value="probation">考察期</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部状态</option>
            <option value="active">正常</option>
            <option value="inactive">停用</option>
            <option value="blacklist">黑名单</option>
          </select>
          
          <button onClick={handleExport} className="btn btn-md btn-secondary">
            <Download className="w-4 h-4" />
            导出
          </button>
        </div>
      </div>

      {/* 供应商表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">供应商编号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">供应商名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">级别</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">联系人</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">应付款</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">账期</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedSuppliers.map((supplier) => {
                const TypeIcon = typeMap[supplier.type]?.icon || Building2
                const payable = calculateTotalPayable(supplier)
                return (
                  <tr key={supplier.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-blue-600">{supplier.code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{supplier.name}</p>
                        <p className="text-xs text-gray-500">{supplier.shortName}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${typeMap[supplier.type]?.color || 'bg-gray-100 text-gray-600'}`}>
                        <TypeIcon className="w-3 h-3" />
                        {typeMap[supplier.type]?.label || '其他'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${levelMap[supplier.level]?.color}`}>
                        {levelMap[supplier.level]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-gray-900">{supplier.contactPerson}</p>
                        <p className="text-xs text-gray-500">{supplier.phone}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${payable > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        €{payable.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-900">
                      {supplier.paymentTerms} 天
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMap[supplier.status].color}`}>
                        {statusMap[supplier.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleView(supplier)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="查看详情"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(supplier)}
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                          title="编辑"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(supplier)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
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
            共 {filteredSuppliers.length} 条记录
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

      {/* 供应商详情弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col animate-slide-in">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {modalMode === 'create' ? '新建供应商' : modalMode === 'edit' ? '编辑供应商' : selectedSupplier?.name}
                  </h3>
                  {modalMode === 'view' && selectedSupplier && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm text-gray-500">{selectedSupplier.code}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeMap[selectedSupplier.type]?.color}`}>
                        {typeMap[selectedSupplier.type]?.label}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${levelMap[selectedSupplier.level]?.color}`}>
                        {levelMap[selectedSupplier.level]?.label}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {modalMode === 'view' && selectedSupplier ? (
              <>
                {/* 概览卡片 */}
                <div className="grid grid-cols-4 gap-4 p-6 border-b border-gray-100 bg-gray-50 shrink-0">
                  <div className="text-center">
                    <p className="text-sm text-gray-500 mb-1">运输单数</p>
                    <p className="text-xl font-bold text-gray-900">{selectedSupplier.shipments.length}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-500 mb-1">总交易额</p>
                    <p className="text-xl font-bold text-gray-900">€{calculateTotalAmount(selectedSupplier).toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-500 mb-1">待付款</p>
                    <p className="text-xl font-bold text-red-600">€{calculateTotalPayable(selectedSupplier).toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-500 mb-1">有效报价</p>
                    <p className="text-xl font-bold text-green-600">{selectedSupplier.quotes.filter(q => q.status === 'active').length}</p>
                  </div>
                </div>

                {/* 选项卡 */}
                <div className="flex border-b border-gray-100 px-6 bg-gray-50 shrink-0">
                  <button 
                    onClick={() => setDetailTab('basic')}
                    className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                      detailTab === 'basic' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Info className="w-4 h-4 inline mr-1" />
                    基本信息
                  </button>
                  <button 
                    onClick={() => setDetailTab('shipments')}
                    className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                      detailTab === 'shipments' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Truck className="w-4 h-4 inline mr-1" />
                    合作记录 ({selectedSupplier.shipments.length})
                  </button>
                  <button 
                    onClick={() => setDetailTab('finance')}
                    className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                      detailTab === 'finance' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <DollarSign className="w-4 h-4 inline mr-1" />
                    应付账款
                  </button>
                  <button 
                    onClick={() => setDetailTab('quotes')}
                    className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                      detailTab === 'quotes' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Tag className="w-4 h-4 inline mr-1" />
                    供应商报价 ({selectedSupplier.quotes.length})
                  </button>
                  <button 
                    onClick={() => setDetailTab('reviews')}
                    className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                      detailTab === 'reviews' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Star className="w-4 h-4 inline mr-1" />
                    合作评价 ({selectedSupplier.reviews.length})
                  </button>
                </div>

                {/* 内容区域 */}
                <div className="flex-1 overflow-y-auto p-6">
                  {detailTab === 'basic' && renderBasicInfo(selectedSupplier)}
                  {detailTab === 'shipments' && renderShipmentRecords(selectedSupplier)}
                  {detailTab === 'finance' && renderFinanceInfo(selectedSupplier)}
                  {detailTab === 'quotes' && renderQuotes(selectedSupplier)}
                  {detailTab === 'reviews' && renderReviews(selectedSupplier)}
                </div>

                {/* 底部按钮 */}
                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
                  <button
                    onClick={() => setShowModal(false)}
                    className="btn btn-md btn-secondary"
                  >
                    关闭
                  </button>
                  <button
                    onClick={() => handleEdit(selectedSupplier)}
                    className="btn btn-md btn-primary"
                  >
                    <Edit className="w-4 h-4" />
                    编辑供应商
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* 基本信息 */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
                    <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      基本信息
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">供应商编号 <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={formData.code}
                          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">供应商类型 <span className="text-red-500">*</span></label>
                        <select
                          value={formData.type}
                          onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                        >
                          <option value="carrier">承运商</option>
                          <option value="material">物料供应</option>
                          <option value="service">服务商</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">供应商级别</label>
                        <select
                          value={formData.level}
                          onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                        >
                          <option value="strategic">战略供应商</option>
                          <option value="preferred">优选供应商</option>
                          <option value="normal">普通供应商</option>
                          <option value="probation">考察期</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">供应商名称 <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">简称</label>
                        <input
                          type="text"
                          value={formData.shortName}
                          onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                          placeholder="公司简称"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                        <select
                          value={formData.status}
                          onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                        >
                          <option value="active">正常</option>
                          <option value="inactive">停用</option>
                          <option value="blacklist">黑名单</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* 服务能力 */}
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-5 border border-purple-100">
                    <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-purple-600" />
                      服务能力
                    </h4>
                    
                    {/* 服务区域多选 */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">服务区域</label>
                      <div className="flex flex-wrap gap-2">
                        {serviceAreaOptions.map((area) => (
                          <button
                            key={area}
                            type="button"
                            onClick={() => {
                              const newAreas = formData.serviceAreas.includes(area)
                                ? formData.serviceAreas.filter(a => a !== area)
                                : [...formData.serviceAreas, area]
                              setFormData({ ...formData, serviceAreas: newAreas })
                            }}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                              formData.serviceAreas.includes(area)
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'bg-white text-gray-600 border border-gray-200 hover:border-purple-300'
                            }`}
                          >
                            {area}
                          </button>
                        ))}
                      </div>
                      {formData.serviceAreas.length > 0 && (
                        <p className="text-xs text-purple-600 mt-2">
                          已选择: {formData.serviceAreas.join(', ')}
                        </p>
                      )}
                    </div>

                    {/* 运输方式多选 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">运输方式</label>
                      <div className="grid grid-cols-5 gap-2">
                        {Object.entries(transportModeMap).map(([key, { label, icon: Icon }]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              const newModes = formData.transportModes.includes(key)
                                ? formData.transportModes.filter(m => m !== key)
                                : [...formData.transportModes, key]
                              setFormData({ ...formData, transportModes: newModes })
                            }}
                            className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                              formData.transportModes.includes(key)
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'bg-white text-gray-600 border border-gray-200 hover:border-purple-300'
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 联系人管理 */}
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-5 border border-green-100">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Phone className="w-4 h-4 text-green-600" />
                        联系人信息
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            contacts: [...formData.contacts, { name: '', title: '', phone: '', email: '', isPrimary: formData.contacts.length === 0 }]
                          })
                        }}
                        className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        添加联系人
                      </button>
                    </div>

                    {/* 主联系人（简化版） */}
                    <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b border-green-200">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">主联系人 <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={formData.contactPerson}
                          onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                          placeholder="姓名"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">电话 <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                          placeholder="+49 xxx xxxxx"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                          placeholder="email@example.com"
                        />
                      </div>
                    </div>

                    {/* 其他联系人列表 */}
                    {formData.contacts.length > 0 && (
                      <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700">其他联系人</label>
                        {formData.contacts.map((contact, index) => (
                          <div key={index} className="grid grid-cols-12 gap-2 items-center bg-white p-3 rounded-lg border border-gray-200">
                            <div className="col-span-3">
                              <input
                                type="text"
                                value={contact.name}
                                onChange={(e) => {
                                  const newContacts = [...formData.contacts]
                                  newContacts[index] = { ...newContacts[index], name: e.target.value }
                                  setFormData({ ...formData, contacts: newContacts })
                                }}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                                placeholder="姓名"
                              />
                            </div>
                            <div className="col-span-2">
                              <input
                                type="text"
                                value={contact.title}
                                onChange={(e) => {
                                  const newContacts = [...formData.contacts]
                                  newContacts[index] = { ...newContacts[index], title: e.target.value }
                                  setFormData({ ...formData, contacts: newContacts })
                                }}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                                placeholder="职位"
                              />
                            </div>
                            <div className="col-span-3">
                              <input
                                type="text"
                                value={contact.phone}
                                onChange={(e) => {
                                  const newContacts = [...formData.contacts]
                                  newContacts[index] = { ...newContacts[index], phone: e.target.value }
                                  setFormData({ ...formData, contacts: newContacts })
                                }}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                                placeholder="电话"
                              />
                            </div>
                            <div className="col-span-3">
                              <input
                                type="email"
                                value={contact.email}
                                onChange={(e) => {
                                  const newContacts = [...formData.contacts]
                                  newContacts[index] = { ...newContacts[index], email: e.target.value }
                                  setFormData({ ...formData, contacts: newContacts })
                                }}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                                placeholder="邮箱"
                              />
                            </div>
                            <div className="col-span-1 flex justify-center">
                              <button
                                type="button"
                                onClick={() => {
                                  const newContacts = formData.contacts.filter((_, i) => i !== index)
                                  setFormData({ ...formData, contacts: newContacts })
                                }}
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 公司地址 */}
                    <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-green-200">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">国家</label>
                        <input
                          type="text"
                          value={formData.country}
                          onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                          placeholder="德国"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">公司地址</label>
                        <input
                          type="text"
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                          placeholder="详细地址"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 财务信息 */}
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-100">
                    <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-amber-600" />
                      财务信息
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">税号 (VAT)</label>
                        <input
                          type="text"
                          value={formData.taxId}
                          onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                          placeholder="如：DE123456789"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">开户银行</label>
                        <input
                          type="text"
                          value={formData.bankName}
                          onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                          placeholder="银行名称"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">账期 (天)</label>
                        <div className="relative">
                          <input
                            type="number"
                            value={formData.paymentTerms}
                            onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white pr-12"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">天</span>
                        </div>
                      </div>
                      <div className="col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">银行账号 (IBAN)</label>
                        <input
                          type="text"
                          value={formData.bankAccount}
                          onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white font-mono"
                          placeholder="如：DE89370400440532013000"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 备注 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">备注信息</label>
                    <textarea
                      value={formData.remark}
                      onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                      placeholder="供应商备注信息..."
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    disabled={isSubmitting}
                    className="btn btn-md btn-secondary"
                  >
                    取消
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="btn btn-md btn-primary flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {modalMode === 'create' ? '创建中...' : '保存中...'}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        {modalMode === 'create' ? '创建供应商' : '保存修改'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 新建报价弹窗 */}
      {showAddQuoteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">新建供应商报价</h3>
              <button
                onClick={() => setShowAddQuoteModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSaveQuote} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">报价编号</label>
                  <input
                    type="text"
                    value={newQuote.quoteNo}
                    onChange={(e) => setNewQuote({ ...newQuote, quoteNo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">运输方式</label>
                  <select
                    value={newQuote.transportMode}
                    onChange={(e) => setNewQuote({ ...newQuote, transportMode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="sea">海运</option>
                    <option value="air">空运</option>
                    <option value="rail">铁路</option>
                    <option value="road">陆运</option>
                    <option value="express">快递</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">路线名称 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={newQuote.routeName}
                    onChange={(e) => setNewQuote({ ...newQuote, routeName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="如：汉堡-上海整柜"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">起运地</label>
                  <input
                    type="text"
                    value={newQuote.origin}
                    onChange={(e) => setNewQuote({ ...newQuote, origin: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">目的地</label>
                  <input
                    type="text"
                    value={newQuote.destination}
                    onChange={(e) => setNewQuote({ ...newQuote, destination: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">价格 <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    value={newQuote.price}
                    onChange={(e) => setNewQuote({ ...newQuote, price: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">单位</label>
                    <select
                      value={newQuote.unit}
                      onChange={(e) => setNewQuote({ ...newQuote, unit: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="CBM">CBM</option>
                      <option value="KG">KG</option>
                      <option value="20GP">20GP</option>
                      <option value="40GP">40GP</option>
                      <option value="40HQ">40HQ</option>
                      <option value="票">票</option>
                      <option value="个">个</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">币种</label>
                    <select
                      value={newQuote.currency}
                      onChange={(e) => setNewQuote({ ...newQuote, currency: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                      <option value="CNY">CNY</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">有效期开始</label>
                  <input
                    type="date"
                    value={newQuote.validFrom}
                    onChange={(e) => setNewQuote({ ...newQuote, validFrom: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">有效期结束</label>
                  <input
                    type="date"
                    value={newQuote.validTo}
                    onChange={(e) => setNewQuote({ ...newQuote, validTo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                  <input
                    type="text"
                    value={newQuote.remark}
                    onChange={(e) => setNewQuote({ ...newQuote, remark: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="如：含提货费、+45KG价格等"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddQuoteModal(false)}
                  className="btn btn-md btn-secondary"
                >
                  取消
                </button>
                <button type="submit" className="btn btn-md btn-primary">
                  保存报价
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 付款登记弹窗 */}
      {showPaymentModal && selectedBill && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">付款登记</h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleConfirmPayment} className="p-6 space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">账单号</span>
                  <span className="text-sm font-medium text-gray-900">{selectedBill.billNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">账单金额</span>
                  <span className="text-sm font-medium text-gray-900">€{selectedBill.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">已付金额</span>
                  <span className="text-sm font-medium text-green-600">€{selectedBill.paidAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">待付金额</span>
                  <span className="text-sm font-medium text-red-600">€{(selectedBill.amount - selectedBill.paidAmount).toLocaleString()}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">本次付款金额 <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  max={selectedBill.amount - selectedBill.paidAmount}
                  required
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="btn btn-md btn-secondary"
                >
                  取消
                </button>
                <button type="submit" className="btn btn-md btn-primary">
                  确认付款
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 添加评价弹窗 */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">添加合作评价</h3>
              <button
                onClick={() => setShowReviewModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSaveReview} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">评分</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setNewReview({ ...newReview, rating: star })}
                      className="p-1"
                    >
                      <Star 
                        className={`w-8 h-8 ${(newReview.rating || 0) >= star ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} 
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">关联运输单号</label>
                <input
                  type="text"
                  value={newReview.shipmentNo}
                  onChange={(e) => setNewReview({ ...newReview, shipmentNo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="可选"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">评价内容 <span className="text-red-500">*</span></label>
                <textarea
                  value={newReview.content}
                  onChange={(e) => setNewReview({ ...newReview, content: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                  placeholder="请输入对该供应商的合作评价..."
                  required
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="btn btn-md btn-secondary"
                >
                  取消
                </button>
                <button type="submit" className="btn btn-md btn-primary">
                  提交评价
                </button>
              </div>
            </form>
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
