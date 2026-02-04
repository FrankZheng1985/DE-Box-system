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
  Users,
  Mail,
  Phone,
  MapPin,
  Star,
  Building,
  Package,
  DollarSign,
  FileText,
  MessageSquare,
  Clock,
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  Target,
  Briefcase,
  Send,
  UserPlus,
  Receipt,
  CreditCard,
  BarChart3,
  Globe,
  Ship,
  Truck,
  Plane,
  History,
  ArrowRight,
  Check,
  AlertTriangle,
  CircleDot,
  PhoneCall,
  Video,
  Coffee,
  Handshake,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Percent,
  Tag,
  Copy,
  ExternalLink
} from 'lucide-react'

// ==================== 数据类型定义 ====================

interface OrderData {
  id: string
  orderNo: string
  transportMode: string
  origin: string
  destination: string
  createTime: string
  status: string
  amount: number
  currency: string
}

interface FinancialRecord {
  id: string
  type: 'receivable' | 'payable'
  invoiceNo: string
  orderNo: string
  amount: number
  currency: string
  dueDate: string
  status: 'pending' | 'partial' | 'paid' | 'overdue'
  paidAmount: number
  createTime: string
}

interface QuoteItem {
  id: string
  quoteNo: string
  transportMode: string
  origin: string
  destination: string
  validFrom: string
  validTo: string
  status: 'active' | 'expired' | 'pending'
  items: {
    name: string
    price: number
    unit: string
    currency: string
  }[]
  createTime: string
  remark?: string
}

interface FollowUpRecord {
  id: string
  type: 'phone' | 'email' | 'meeting' | 'visit' | 'other'
  subject: string
  content: string
  contactPerson: string
  operator: string
  createTime: string
  nextFollowUp?: string
  result?: string
}

interface CustomerDocument {
  id: string
  name: string
  type: string
  size: string
  uploadTime: string
  uploader: string
}

interface CustomerData {
  id: string
  code: string
  name: string
  shortName: string
  level: string
  stage: 'lead' | 'prospect' | 'customer' | 'vip'
  industry: string
  source: string
  contactPerson: string
  phone: string
  email: string
  address: string
  country: string
  taxNo?: string
  creditLimit: number
  usedCredit: number
  paymentTerms: number
  salesName: string
  salesId: string
  status: 'active' | 'inactive'
  createTime: string
  lastOrderTime?: string
  totalOrders: number
  totalAmount: number
  totalReceivable: number
  totalPaid: number
  orders: OrderData[]
  financials: FinancialRecord[]
  quotes: QuoteItem[]
  followUps: FollowUpRecord[]
  documents: CustomerDocument[]
  contacts: {
    id: string
    name: string
    position: string
    phone: string
    email: string
    isPrimary: boolean
  }[]
  remark?: string
}

// ==================== 模拟数据 ====================

const mockCustomers: CustomerData[] = [
  { 
    id: '1', 
    code: 'C001', 
    name: '德国物流有限公司', 
    shortName: '德国物流', 
    level: 'vip', 
    stage: 'vip',
    industry: '物流运输',
    source: '展会',
    contactPerson: 'Hans Schmidt', 
    phone: '+49 30 1234567', 
    email: 'hans@deutsche-logistik.de', 
    address: 'Berliner Str. 123, Berlin',
    country: '德国',
    taxNo: 'DE123456789',
    creditLimit: 50000, 
    usedCredit: 32000,
    paymentTerms: 30, 
    salesName: '张三',
    salesId: 'S001',
    status: 'active',
    createTime: '2024-01-15',
    lastOrderTime: '2024-01-20',
    totalOrders: 45,
    totalAmount: 185000,
    totalReceivable: 28500,
    totalPaid: 156500,
    orders: [
      { id: 'ORD-2024-0045', orderNo: 'ORD-2024-0045', transportMode: 'sea', origin: '上海', destination: '汉堡', createTime: '2024-01-20', status: 'delivered', amount: 4500, currency: 'EUR' },
      { id: 'ORD-2024-0038', orderNo: 'ORD-2024-0038', transportMode: 'sea', origin: '宁波', destination: '汉堡', createTime: '2024-01-15', status: 'in_transit', amount: 5200, currency: 'EUR' },
      { id: 'ORD-2024-0025', orderNo: 'ORD-2024-0025', transportMode: 'air', origin: '深圳', destination: '法兰克福', createTime: '2024-01-08', status: 'delivered', amount: 8800, currency: 'EUR' },
    ],
    financials: [
      { id: 'INV-001', type: 'receivable', invoiceNo: 'INV-2024-0089', orderNo: 'ORD-2024-0045', amount: 4500, currency: 'EUR', dueDate: '2024-02-20', status: 'pending', paidAmount: 0, createTime: '2024-01-20' },
      { id: 'INV-002', type: 'receivable', invoiceNo: 'INV-2024-0078', orderNo: 'ORD-2024-0038', amount: 5200, currency: 'EUR', dueDate: '2024-02-15', status: 'partial', paidAmount: 3000, createTime: '2024-01-15' },
      { id: 'INV-003', type: 'receivable', invoiceNo: 'INV-2024-0065', orderNo: 'ORD-2024-0025', amount: 8800, currency: 'EUR', dueDate: '2024-02-08', status: 'paid', paidAmount: 8800, createTime: '2024-01-08' },
    ],
    quotes: [
      { 
        id: 'Q001', 
        quoteNo: 'QT-2024-0015', 
        transportMode: 'sea', 
        origin: '中国主要港口', 
        destination: '汉堡/不来梅', 
        validFrom: '2024-01-01', 
        validTo: '2024-03-31', 
        status: 'active',
        items: [
          { name: '20GP 海运费', price: 1200, unit: '柜', currency: 'EUR' },
          { name: '40GP 海运费', price: 2200, unit: '柜', currency: 'EUR' },
          { name: '40HQ 海运费', price: 2350, unit: '柜', currency: 'EUR' },
          { name: '码头操作费', price: 150, unit: '柜', currency: 'EUR' },
          { name: '文件费', price: 50, unit: '票', currency: 'EUR' },
        ],
        createTime: '2024-01-01',
        remark: 'VIP客户专属价格'
      }
    ],
    followUps: [
      { id: 'FU001', type: 'phone', subject: '确认新订单需求', content: '客户表示下周有一批货物需要从上海发往汉堡，预计2个40GP集装箱。', contactPerson: 'Hans Schmidt', operator: '张三', createTime: '2024-01-22 10:30', nextFollowUp: '2024-01-25', result: '已确认需求，准备报价' },
      { id: 'FU002', type: 'meeting', subject: '年度合作洽谈', content: '与客户进行年度合作总结和2024年合作计划讨论。', contactPerson: 'Hans Schmidt', operator: '张三', createTime: '2024-01-10 14:00', result: '签订年度合作框架协议' },
      { id: 'FU003', type: 'email', subject: '发送报价单', content: '发送最新海运报价单给客户确认。', contactPerson: 'Hans Schmidt', operator: '张三', createTime: '2024-01-05 09:15', result: '客户已确认接受' },
    ],
    documents: [
      { id: 'DOC001', name: '营业执照.pdf', type: 'license', size: '2.3 MB', uploadTime: '2024-01-15', uploader: '张三' },
      { id: 'DOC002', name: '合作协议.pdf', type: 'contract', size: '1.5 MB', uploadTime: '2024-01-10', uploader: '张三' },
    ],
    contacts: [
      { id: 'CT001', name: 'Hans Schmidt', position: '采购总监', phone: '+49 30 1234567', email: 'hans@deutsche-logistik.de', isPrimary: true },
      { id: 'CT002', name: 'Eva Müller', position: '财务主管', phone: '+49 30 1234568', email: 'eva@deutsche-logistik.de', isPrimary: false },
    ],
    remark: '长期战略合作客户，注意维护关系'
  },
  { 
    id: '2', 
    code: 'C002', 
    name: '欧洲快递服务公司', 
    shortName: '欧快', 
    level: 'normal', 
    stage: 'customer',
    industry: '电商',
    source: '网络推广',
    contactPerson: 'Maria Weber', 
    phone: '+49 89 9876543', 
    email: 'maria@euro-express.de', 
    address: 'Münchner Str. 456, Munich',
    country: '德国',
    creditLimit: 30000, 
    usedCredit: 15000,
    paymentTerms: 45, 
    salesName: '李四',
    salesId: 'S002',
    status: 'active',
    createTime: '2024-02-20',
    lastOrderTime: '2024-01-18',
    totalOrders: 12,
    totalAmount: 45000,
    totalReceivable: 8500,
    totalPaid: 36500,
    orders: [
      { id: 'ORD-2024-0042', orderNo: 'ORD-2024-0042', transportMode: 'air', origin: '深圳', destination: '慕尼黑', createTime: '2024-01-18', status: 'in_transit', amount: 3200, currency: 'EUR' },
    ],
    financials: [
      { id: 'INV-004', type: 'receivable', invoiceNo: 'INV-2024-0085', orderNo: 'ORD-2024-0042', amount: 3200, currency: 'EUR', dueDate: '2024-03-03', status: 'pending', paidAmount: 0, createTime: '2024-01-18' },
    ],
    quotes: [],
    followUps: [
      { id: 'FU004', type: 'phone', subject: '询问合作意向', content: '客户对空运服务有持续需求，每月预计5-8票。', contactPerson: 'Maria Weber', operator: '李四', createTime: '2024-01-18 11:00', result: '有合作意向' },
    ],
    documents: [],
    contacts: [
      { id: 'CT003', name: 'Maria Weber', position: '物流经理', phone: '+49 89 9876543', email: 'maria@euro-express.de', isPrimary: true },
    ]
  },
  { 
    id: '3', 
    code: 'C003', 
    name: '柏林贸易公司', 
    shortName: '柏林贸易', 
    level: 'vip', 
    stage: 'vip',
    industry: '进出口贸易',
    source: '客户推荐',
    contactPerson: 'Thomas Müller', 
    phone: '+49 30 5555666', 
    email: 'thomas@berlin-trade.de', 
    address: 'Kurfürstendamm 789, Berlin',
    country: '德国',
    taxNo: 'DE987654321',
    creditLimit: 80000, 
    usedCredit: 45000,
    paymentTerms: 30, 
    salesName: '张三',
    salesId: 'S001',
    status: 'active',
    createTime: '2023-06-10',
    lastOrderTime: '2024-01-19',
    totalOrders: 78,
    totalAmount: 320000,
    totalReceivable: 45000,
    totalPaid: 275000,
    orders: [
      { id: 'ORD-2024-0043', orderNo: 'ORD-2024-0043', transportMode: 'sea', origin: '青岛', destination: '汉堡', createTime: '2024-01-19', status: 'processing', amount: 6800, currency: 'EUR' },
      { id: 'ORD-2024-0035', orderNo: 'ORD-2024-0035', transportMode: 'rail', origin: '成都', destination: '杜伊斯堡', createTime: '2024-01-12', status: 'in_transit', amount: 12500, currency: 'EUR' },
    ],
    financials: [
      { id: 'INV-005', type: 'receivable', invoiceNo: 'INV-2024-0086', orderNo: 'ORD-2024-0043', amount: 6800, currency: 'EUR', dueDate: '2024-02-19', status: 'pending', paidAmount: 0, createTime: '2024-01-19' },
      { id: 'INV-006', type: 'receivable', invoiceNo: 'INV-2024-0072', orderNo: 'ORD-2024-0035', amount: 12500, currency: 'EUR', dueDate: '2024-02-12', status: 'overdue', paidAmount: 0, createTime: '2024-01-12' },
    ],
    quotes: [
      { 
        id: 'Q002', 
        quoteNo: 'QT-2024-0018', 
        transportMode: 'rail', 
        origin: '中国内陆城市', 
        destination: '德国/欧洲', 
        validFrom: '2024-01-01', 
        validTo: '2024-06-30', 
        status: 'active',
        items: [
          { name: '40GP 中欧班列', price: 4500, unit: '柜', currency: 'EUR' },
          { name: '40HQ 中欧班列', price: 4800, unit: '柜', currency: 'EUR' },
          { name: '目的港操作费', price: 200, unit: '柜', currency: 'EUR' },
        ],
        createTime: '2024-01-01'
      }
    ],
    followUps: [],
    documents: [],
    contacts: [
      { id: 'CT004', name: 'Thomas Müller', position: '总经理', phone: '+49 30 5555666', email: 'thomas@berlin-trade.de', isPrimary: true },
    ]
  },
  { 
    id: '4', 
    code: 'C004', 
    name: '慕尼黑电子商务', 
    shortName: '慕尼黑电商', 
    level: 'normal', 
    stage: 'prospect',
    industry: '电子商务',
    source: '网络推广',
    contactPerson: 'Anna Fischer', 
    phone: '+49 89 1112233', 
    email: 'anna@munich-ecom.de', 
    address: 'Maximilianstr. 321, Munich',
    country: '德国',
    creditLimit: 20000, 
    usedCredit: 0,
    paymentTerms: 30, 
    salesName: '王五',
    salesId: 'S003',
    status: 'active',
    createTime: '2024-01-10',
    totalOrders: 0,
    totalAmount: 0,
    totalReceivable: 0,
    totalPaid: 0,
    orders: [],
    financials: [],
    quotes: [
      { 
        id: 'Q003', 
        quoteNo: 'QT-2024-0022', 
        transportMode: 'air', 
        origin: '中国', 
        destination: '慕尼黑', 
        validFrom: '2024-01-15', 
        validTo: '2024-02-15', 
        status: 'pending',
        items: [
          { name: '空运费', price: 8.5, unit: 'kg', currency: 'EUR' },
          { name: '提货费', price: 0.5, unit: 'kg', currency: 'EUR' },
          { name: '清关费', price: 80, unit: '票', currency: 'EUR' },
        ],
        createTime: '2024-01-15',
        remark: '待客户确认'
      }
    ],
    followUps: [
      { id: 'FU005', type: 'email', subject: '发送报价', content: '根据客户需求发送空运报价方案。', contactPerson: 'Anna Fischer', operator: '王五', createTime: '2024-01-15 16:00', nextFollowUp: '2024-01-20' },
      { id: 'FU006', type: 'phone', subject: '初次联系', content: '客户通过网站咨询，主要做跨境电商，需要空运和海运服务。', contactPerson: 'Anna Fischer', operator: '王五', createTime: '2024-01-10 10:00', result: '有明确需求，安排报价' },
    ],
    documents: [],
    contacts: [
      { id: 'CT005', name: 'Anna Fischer', position: '运营总监', phone: '+49 89 1112233', email: 'anna@munich-ecom.de', isPrimary: true },
    ]
  },
  { 
    id: '5', 
    code: 'C005', 
    name: '法兰克福进出口', 
    shortName: '法兰克福', 
    level: 'important', 
    stage: 'customer',
    industry: '进出口贸易',
    source: '展会',
    contactPerson: 'Peter Wagner', 
    phone: '+49 69 4445566', 
    email: 'peter@frankfurt-import.de', 
    address: 'Mainzer Landstr. 654, Frankfurt',
    country: '德国',
    taxNo: 'DE456789123',
    creditLimit: 100000, 
    usedCredit: 78000,
    paymentTerms: 60, 
    salesName: '李四',
    salesId: 'S002',
    status: 'active',
    createTime: '2023-03-20',
    lastOrderTime: '2024-01-22',
    totalOrders: 120,
    totalAmount: 580000,
    totalReceivable: 78000,
    totalPaid: 502000,
    orders: [
      { id: 'ORD-2024-0048', orderNo: 'ORD-2024-0048', transportMode: 'sea', origin: '上海', destination: '汉堡', createTime: '2024-01-22', status: 'processing', amount: 15800, currency: 'EUR' },
    ],
    financials: [
      { id: 'INV-007', type: 'receivable', invoiceNo: 'INV-2024-0092', orderNo: 'ORD-2024-0048', amount: 15800, currency: 'EUR', dueDate: '2024-03-22', status: 'pending', paidAmount: 0, createTime: '2024-01-22' },
    ],
    quotes: [],
    followUps: [],
    documents: [],
    contacts: [
      { id: 'CT006', name: 'Peter Wagner', position: '采购经理', phone: '+49 69 4445566', email: 'peter@frankfurt-import.de', isPrimary: true },
    ]
  },
  { 
    id: '6', 
    code: 'C006', 
    name: '汉堡国际物流', 
    shortName: '汉堡国际', 
    level: 'normal', 
    stage: 'lead',
    industry: '物流运输',
    source: '网络推广',
    contactPerson: 'Klaus Becker', 
    phone: '+49 40 7778899', 
    email: 'klaus@hamburg-intl.de', 
    address: 'Hafenstr. 987, Hamburg',
    country: '德国',
    creditLimit: 25000, 
    usedCredit: 0,
    paymentTerms: 30, 
    salesName: '张三',
    salesId: 'S001',
    status: 'inactive',
    createTime: '2024-01-05',
    totalOrders: 0,
    totalAmount: 0,
    totalReceivable: 0,
    totalPaid: 0,
    orders: [],
    financials: [],
    quotes: [],
    followUps: [
      { id: 'FU007', type: 'phone', subject: '潜在客户开发', content: '初次电话沟通，客户目前与其他物流公司合作，但对我们的服务有兴趣。', contactPerson: 'Klaus Becker', operator: '张三', createTime: '2024-01-05 15:30', nextFollowUp: '2024-02-01', result: '待跟进' },
    ],
    documents: [],
    contacts: [
      { id: 'CT007', name: 'Klaus Becker', position: '运营经理', phone: '+49 40 7778899', email: 'klaus@hamburg-intl.de', isPrimary: true },
    ]
  },
]

// ==================== 常量映射 ====================

const levelMap: Record<string, { label: string; color: string }> = {
  vip: { label: 'VIP客户', color: 'bg-yellow-100 text-yellow-700' },
  important: { label: '重要客户', color: 'bg-purple-100 text-purple-700' },
  normal: { label: '普通客户', color: 'bg-gray-100 text-gray-600' },
}

const stageMap: Record<string, { label: string; color: string; icon: typeof Users }> = {
  lead: { label: '潜在客户', color: 'bg-blue-100 text-blue-700', icon: Target },
  prospect: { label: '意向客户', color: 'bg-orange-100 text-orange-700', icon: UserPlus },
  customer: { label: '正式客户', color: 'bg-green-100 text-green-700', icon: Briefcase },
  vip: { label: 'VIP客户', color: 'bg-yellow-100 text-yellow-700', icon: Star },
}

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: '正常', color: 'bg-green-100 text-green-700' },
  inactive: { label: '停用', color: 'bg-red-100 text-red-700' },
}

const orderStatusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'bg-gray-100 text-gray-600' },
  processing: { label: '处理中', color: 'bg-blue-100 text-blue-700' },
  in_transit: { label: '运输中', color: 'bg-purple-100 text-purple-700' },
  delivered: { label: '已送达', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '已取消', color: 'bg-red-100 text-red-700' },
}

const invoiceStatusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待收款', color: 'bg-gray-100 text-gray-600' },
  partial: { label: '部分收款', color: 'bg-yellow-100 text-yellow-700' },
  paid: { label: '已收款', color: 'bg-green-100 text-green-700' },
  overdue: { label: '已逾期', color: 'bg-red-100 text-red-700' },
}

const quoteStatusMap: Record<string, { label: string; color: string }> = {
  active: { label: '生效中', color: 'bg-green-100 text-green-700' },
  expired: { label: '已过期', color: 'bg-gray-100 text-gray-600' },
  pending: { label: '待确认', color: 'bg-yellow-100 text-yellow-700' },
}

const followUpTypeMap: Record<string, { label: string; icon: typeof Phone; color: string }> = {
  phone: { label: '电话', icon: PhoneCall, color: 'bg-blue-100 text-blue-600' },
  email: { label: '邮件', icon: Mail, color: 'bg-green-100 text-green-600' },
  meeting: { label: '会议', icon: Video, color: 'bg-purple-100 text-purple-600' },
  visit: { label: '拜访', icon: Coffee, color: 'bg-orange-100 text-orange-600' },
  other: { label: '其他', icon: MessageSquare, color: 'bg-gray-100 text-gray-600' },
}

const transportModeMap: Record<string, { label: string; icon: typeof Ship }> = {
  sea: { label: '海运', icon: Ship },
  air: { label: '空运', icon: Plane },
  road: { label: '陆运', icon: Truck },
  rail: { label: '铁路', icon: Truck },
}

// ==================== 表单数据类型 ====================

// 行业选项
const industryOptions = ['物流运输', '电商', '贸易', '制造业', '零售业', '汽车行业', '电子产品', '食品饮料', '医药', '化工', '其他']

// 客户来源选项
const sourceOptions = ['展会', '网络推广', '客户推荐', '电话开发', '行业协会', '社交媒体', '代理商', '其他']

interface ContactItem {
  name: string
  position: string
  phone: string
  email: string
  isPrimary: boolean
}

interface CustomerFormData {
  code: string
  name: string
  shortName: string
  level: string
  stage: string
  industry: string
  source: string
  contactPerson: string
  phone: string
  email: string
  address: string
  country: string
  taxNo: string
  creditLimit: string
  paymentTerms: string
  salesName: string
  status: string
  remark: string
  contacts: ContactItem[]
}

interface FollowUpFormData {
  type: string
  subject: string
  content: string
  contactPerson: string
  nextFollowUp: string
  result: string
}

interface QuoteFormData {
  transportMode: string
  origin: string
  destination: string
  validFrom: string
  validTo: string
  items: { name: string; price: string; unit: string; currency: string }[]
  remark: string
}

// ==================== 主组件 ====================

export default function CustomerList() {
  // 列表状态
  const [customers, setCustomers] = useState(mockCustomers)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  
  // 弹窗状态
  const [showModal, setShowModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(null)
  const [detailTab, setDetailTab] = useState<'info' | 'orders' | 'finance' | 'quotes' | 'followups' | 'documents'>('info')
  
  // 提示消息
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  
  // 表单数据
  const [formData, setFormData] = useState<CustomerFormData>({
    code: '',
    name: '',
    shortName: '',
    level: 'normal',
    stage: 'lead',
    industry: '',
    source: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    country: '德国',
    taxNo: '',
    creditLimit: '',
    paymentTerms: '30',
    salesName: '',
    status: 'active',
    remark: '',
    contacts: []
  })
  
  const [followUpFormData, setFollowUpFormData] = useState<FollowUpFormData>({
    type: 'phone',
    subject: '',
    content: '',
    contactPerson: '',
    nextFollowUp: '',
    result: ''
  })
  
  const [quoteFormData, setQuoteFormData] = useState<QuoteFormData>({
    transportMode: 'sea',
    origin: '',
    destination: '',
    validFrom: '',
    validTo: '',
    items: [{ name: '', price: '', unit: '', currency: 'EUR' }],
    remark: ''
  })
  
  const pageSize = 10
  
  // ==================== 筛选逻辑 ====================
  
  const filteredCustomers = customers.filter(customer => {
    const matchSearch = customer.code.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       customer.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       customer.contactPerson.toLowerCase().includes(searchKeyword.toLowerCase())
    const matchLevel = levelFilter === 'all' || customer.level === levelFilter
    const matchStage = stageFilter === 'all' || customer.stage === stageFilter
    const matchStatus = statusFilter === 'all' || customer.status === statusFilter
    return matchSearch && matchLevel && matchStage && matchStatus
  })
  
  const totalPages = Math.ceil(filteredCustomers.length / pageSize)
  const paginatedCustomers = filteredCustomers.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // ==================== 统计数据 ====================
  
  const stats = [
    { label: '总客户数', value: customers.length, icon: Users, color: 'bg-blue-500' },
    { label: 'VIP客户', value: customers.filter(c => c.level === 'vip').length, icon: Star, color: 'bg-yellow-500' },
    { label: '重要客户', value: customers.filter(c => c.level === 'important').length, icon: Building, color: 'bg-purple-500' },
    { label: '潜在客户', value: customers.filter(c => c.stage === 'lead' || c.stage === 'prospect').length, icon: Target, color: 'bg-orange-500' },
    { label: '应收总额', value: `€${customers.reduce((sum, c) => sum + c.totalReceivable, 0).toLocaleString('de-DE')}`, icon: DollarSign, color: 'bg-green-500', isAmount: true },
  ]

  // ==================== 工具函数 ====================
  
  const showToastMessage = (message: string) => {
    setToastMessage(message)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }
  
  const handleExport = () => {
    const csvContent = [
      ['客户编号', '客户名称', '简称', '等级', '阶段', '联系人', '电话', '邮箱', '信用额度', '已用额度', '订单数', '总金额', '应收款', '状态'].join(','),
      ...filteredCustomers.map(c => [
        c.code, c.name, c.shortName, levelMap[c.level]?.label || c.level, stageMap[c.stage]?.label || c.stage,
        c.contactPerson, c.phone, c.email, c.creditLimit, c.usedCredit, c.totalOrders, c.totalAmount, c.totalReceivable,
        statusMap[c.status]?.label || c.status
      ].join(','))
    ].join('\n')
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `客户列表_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToastMessage('导出成功！')
  }

  // ==================== 操作处理函数 ====================

  const handleCreate = () => {
    setModalMode('create')
    setFormData({
      code: `C${String(customers.length + 1).padStart(3, '0')}`,
      name: '',
      shortName: '',
      level: 'normal',
      stage: 'lead',
      industry: '',
      source: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      country: '德国',
      taxNo: '',
      creditLimit: '',
      paymentTerms: '30',
      salesName: '',
      status: 'active',
      remark: '',
      contacts: []
    })
    setShowModal(true)
  }

  const handleEdit = (customer: CustomerData) => {
    setModalMode('edit')
    setSelectedCustomer(customer)
    setFormData({
      code: customer.code,
      name: customer.name,
      shortName: customer.shortName,
      level: customer.level,
      stage: customer.stage,
      industry: customer.industry,
      source: customer.source,
      contactPerson: customer.contactPerson,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      country: customer.country,
      taxNo: customer.taxNo || '',
      creditLimit: customer.creditLimit.toString(),
      paymentTerms: customer.paymentTerms.toString(),
      salesName: customer.salesName,
      status: customer.status,
      remark: customer.remark || '',
      contacts: customer.contacts?.map(c => ({
        name: c.name,
        position: c.position,
        phone: c.phone,
        email: c.email,
        isPrimary: c.isPrimary
      })) || []
    })
    setShowModal(true)
  }

  const handleViewDetail = (customer: CustomerData) => {
    setSelectedCustomer(customer)
    setDetailTab('info')
    setShowDetailModal(true)
  }

  const handleDelete = (customer: CustomerData) => {
    // 检查是否有关联的业务数据
    const hasOrders = customer.totalOrders > 0 || customer.orders.length > 0
    const hasReceivable = customer.totalReceivable > 0
    const hasFinancials = customer.financials.length > 0
    const hasQuotes = customer.quotes.length > 0
    
    if (hasOrders || hasReceivable || hasFinancials) {
      // 有业务数据，提示并提供停用选项
      const reasons = []
      if (hasOrders) reasons.push(`${customer.totalOrders} 个订单`)
      if (hasReceivable) reasons.push(`€${customer.totalReceivable.toLocaleString('de-DE')} 应收款`)
      if (hasFinancials) reasons.push(`${customer.financials.length} 条财务记录`)
      
      const shouldDeactivate = confirm(
        `⚠️ 客户 "${customer.name}" 存在以下业务数据，无法直接删除：\n\n` +
        `• ${reasons.join('\n• ')}\n\n` +
        `是否将该客户设为"停用"状态？\n` +
        `（停用后客户将不再显示在正常列表中，但历史数据保留）`
      )
      
      if (shouldDeactivate) {
        // 将客户状态设为停用
        setCustomers(prev => prev.map(c => 
          c.id === customer.id ? { ...c, status: 'inactive' as const } : c
        ))
        showToastMessage(`客户 ${customer.name} 已停用`)
      }
      return
    }
    
    if (hasQuotes) {
      // 只有报价单，给予警告但允许删除
      if (!confirm(`客户 "${customer.name}" 存在 ${customer.quotes.length} 个报价记录。\n\n确定要删除吗？删除后报价记录也将丢失！`)) {
        return
      }
    } else {
      // 无任何业务数据，正常确认删除
      if (!confirm(`确定要删除客户 "${customer.name}" 吗？此操作不可恢复！`)) {
        return
      }
    }
    
    // 执行删除
    setCustomers(prev => prev.filter(c => c.id !== customer.id))
    showToastMessage(`客户 ${customer.name} 已删除`)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (modalMode === 'create') {
      // 创建新客户
      const newCustomer: CustomerData = {
        id: `customer_${Date.now()}`,
        code: formData.code,
        name: formData.name,
        shortName: formData.shortName || formData.name.substring(0, 4),
        level: formData.level,
        stage: formData.stage as CustomerData['stage'],
        industry: formData.industry,
        source: formData.source,
        contactPerson: formData.contactPerson,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        country: formData.country,
        taxNo: formData.taxNo,
        creditLimit: parseFloat(formData.creditLimit) || 0,
        usedCredit: 0,
        paymentTerms: parseInt(formData.paymentTerms) || 30,
        salesName: formData.salesName || 'admin',
        salesId: 'S001',
        status: formData.status as CustomerData['status'],
        createTime: new Date().toISOString().split('T')[0],
        totalOrders: 0,
        totalAmount: 0,
        totalReceivable: 0,
        totalPaid: 0,
        orders: [],
        financials: [],
        quotes: [],
        followUps: [],
        documents: [],
        contacts: formData.contacts.map((c, idx) => ({
          id: `contact_${Date.now()}_${idx}`,
          name: c.name,
          position: c.position,
          phone: c.phone,
          email: c.email,
          isPrimary: c.isPrimary
        })),
        remark: formData.remark
      }
      
      // 添加到列表头部
      setCustomers(prev => [newCustomer, ...prev])
      showToastMessage('客户创建成功！')
    } else {
      // 编辑现有客户
      if (selectedCustomer) {
        setCustomers(prev => prev.map(c => {
          if (c.id === selectedCustomer.id) {
            return {
              ...c,
              code: formData.code,
              name: formData.name,
              shortName: formData.shortName || formData.name.substring(0, 4),
              level: formData.level,
              stage: formData.stage as CustomerData['stage'],
              industry: formData.industry,
              source: formData.source,
              contactPerson: formData.contactPerson,
              phone: formData.phone,
              email: formData.email,
              address: formData.address,
              country: formData.country,
              taxNo: formData.taxNo,
              creditLimit: parseFloat(formData.creditLimit) || c.creditLimit,
              paymentTerms: parseInt(formData.paymentTerms) || c.paymentTerms,
              salesName: formData.salesName || c.salesName,
              status: formData.status as CustomerData['status'],
              contacts: formData.contacts.map((contact, idx) => ({
                id: `contact_${Date.now()}_${idx}`,
                name: contact.name,
                position: contact.position,
                phone: contact.phone,
                email: contact.email,
                isPrimary: contact.isPrimary
              })),
              remark: formData.remark
            }
          }
          return c
        }))
        showToastMessage('客户信息已更新！')
      }
    }
    setShowModal(false)
  }
  
  const handleAddFollowUp = () => {
    if (selectedCustomer) {
      setFollowUpFormData({
        type: 'phone',
        subject: '',
        content: '',
        contactPerson: selectedCustomer.contactPerson,
        nextFollowUp: '',
        result: ''
      })
      setShowFollowUpModal(true)
    }
  }
  
  const handleSubmitFollowUp = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (selectedCustomer) {
      const newFollowUp: FollowUpRecord = {
        id: `followup_${Date.now()}`,
        type: followUpFormData.type as FollowUpRecord['type'],
        subject: followUpFormData.subject,
        content: followUpFormData.content,
        contactPerson: followUpFormData.contactPerson,
        operator: 'admin',
        createTime: new Date().toISOString().split('T')[0] + ' ' + new Date().toTimeString().substring(0, 5),
        nextFollowUp: followUpFormData.nextFollowUp || undefined,
        result: followUpFormData.result || undefined
      }
      
      // 更新客户的跟进记录
      setCustomers(prev => prev.map(c => {
        if (c.id === selectedCustomer.id) {
          return {
            ...c,
            followUps: [newFollowUp, ...c.followUps]
          }
        }
        return c
      }))
      
      // 同步更新 selectedCustomer 以便详情页能立即看到新记录
      setSelectedCustomer(prev => {
        if (prev) {
          return {
            ...prev,
            followUps: [newFollowUp, ...prev.followUps]
          }
        }
        return prev
      })
      
      showToastMessage('跟进记录已添加！')
    }
    setShowFollowUpModal(false)
  }
  
  const handleAddQuote = () => {
    setQuoteFormData({
      transportMode: 'sea',
      origin: '',
      destination: '',
      validFrom: new Date().toISOString().split('T')[0],
      validTo: '',
      items: [{ name: '', price: '', unit: '', currency: 'EUR' }],
      remark: ''
    })
    setShowQuoteModal(true)
  }
  
  const handleSubmitQuote = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (selectedCustomer) {
      const newQuote: QuoteItem = {
        id: `quote_${Date.now()}`,
        quoteNo: `QT${new Date().getFullYear()}${String(Date.now()).slice(-6)}`,
        transportMode: quoteFormData.transportMode,
        origin: quoteFormData.origin,
        destination: quoteFormData.destination,
        validFrom: quoteFormData.validFrom,
        validTo: quoteFormData.validTo,
        status: 'active',
        items: quoteFormData.items.map(item => ({
          name: item.name,
          price: parseFloat(item.price) || 0,
          unit: item.unit,
          currency: item.currency
        })),
        createTime: new Date().toISOString().split('T')[0],
        remark: quoteFormData.remark || undefined
      }
      
      // 更新客户的报价记录
      setCustomers(prev => prev.map(c => {
        if (c.id === selectedCustomer.id) {
          return {
            ...c,
            quotes: [newQuote, ...c.quotes]
          }
        }
        return c
      }))
      
      // 同步更新 selectedCustomer
      setSelectedCustomer(prev => {
        if (prev) {
          return {
            ...prev,
            quotes: [newQuote, ...prev.quotes]
          }
        }
        return prev
      })
      
      showToastMessage('报价已创建！')
    }
    setShowQuoteModal(false)
  }
  
  const addQuoteItem = () => {
    setQuoteFormData(prev => ({
      ...prev,
      items: [...prev.items, { name: '', price: '', unit: '', currency: 'EUR' }]
    }))
  }
  
  const removeQuoteItem = (index: number) => {
    setQuoteFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }))
  }
  
  const updateQuoteItem = (index: number, field: string, value: string) => {
    setQuoteFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item)
    }))
  }

  // ==================== 渲染详情选项卡内容 ====================
  
  const renderDetailContent = () => {
    if (!selectedCustomer) return null
    
    switch (detailTab) {
      case 'info':
        return (
          <div className="space-y-6">
            {/* 客户概览 */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500">总订单</p>
                <p className="text-2xl font-bold text-blue-600">{selectedCustomer.totalOrders}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500">总金额</p>
                <p className="text-2xl font-bold text-green-600">€{selectedCustomer.totalAmount.toLocaleString('de-DE')}</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500">应收款</p>
                <p className="text-2xl font-bold text-yellow-600">€{selectedCustomer.totalReceivable.toLocaleString('de-DE')}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500">信用使用</p>
                <p className="text-2xl font-bold text-purple-600">
                  {Math.round((selectedCustomer.usedCredit / selectedCustomer.creditLimit) * 100)}%
                </p>
              </div>
            </div>
            
            {/* 基本信息 */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Building className="w-4 h-4" />
                基本信息
              </h4>
              <div className="grid grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
                <div>
                  <label className="text-sm text-gray-500">客户编号</label>
                  <p className="font-medium text-blue-600">{selectedCustomer.code}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">客户阶段</label>
                  <p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stageMap[selectedCustomer.stage]?.color}`}>
                      {stageMap[selectedCustomer.stage]?.label}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">客户等级</label>
                  <p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${levelMap[selectedCustomer.level]?.color}`}>
                      {levelMap[selectedCustomer.level]?.label}
                    </span>
                  </p>
                </div>
                <div className="col-span-2">
                  <label className="text-sm text-gray-500">客户名称</label>
                  <p className="font-medium text-gray-900">{selectedCustomer.name} ({selectedCustomer.shortName})</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">行业</label>
                  <p className="font-medium text-gray-900">{selectedCustomer.industry}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">客户来源</label>
                  <p className="font-medium text-gray-900">{selectedCustomer.source}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">销售负责人</label>
                  <p className="font-medium text-gray-900">{selectedCustomer.salesName}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">创建时间</label>
                  <p className="font-medium text-gray-900">{selectedCustomer.createTime}</p>
                </div>
              </div>
            </div>

            {/* 联系人信息 */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                联系人 ({selectedCustomer.contacts.length})
              </h4>
              <div className="space-y-2">
                {selectedCustomer.contacts.map(contact => (
                  <div key={contact.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{contact.name}</span>
                          {contact.isPrimary && (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">主要联系人</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{contact.position}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {contact.phone}
                      </div>
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {contact.email}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 财务信息 */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                财务信息
              </h4>
              <div className="grid grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
                <div>
                  <label className="text-sm text-gray-500">信用额度</label>
                  <p className="font-medium text-gray-900">€{selectedCustomer.creditLimit.toLocaleString('de-DE')}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">已用额度</label>
                  <p className="font-medium text-gray-900">€{selectedCustomer.usedCredit.toLocaleString('de-DE')}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">可用额度</label>
                  <p className="font-medium text-green-600">€{(selectedCustomer.creditLimit - selectedCustomer.usedCredit).toLocaleString('de-DE')}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">账期</label>
                  <p className="font-medium text-gray-900">{selectedCustomer.paymentTerms} 天</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">税号</label>
                  <p className="font-medium text-gray-900">{selectedCustomer.taxNo || '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">地址</label>
                  <p className="font-medium text-gray-900 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-gray-400" />
                    {selectedCustomer.address}
                  </p>
                </div>
              </div>
            </div>
            
            {/* 备注 */}
            {selectedCustomer.remark && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">备注</h4>
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                  <p className="text-sm text-gray-700">{selectedCustomer.remark}</p>
                </div>
              </div>
            )}
          </div>
        )
        
      case 'orders':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">订单记录 ({selectedCustomer.orders.length})</h4>
              <button 
                onClick={() => showToastMessage('跳转到订单管理创建新订单')}
                className="btn btn-sm btn-primary"
              >
                <Plus className="w-4 h-4" />
                创建订单
              </button>
            </div>
            
            {selectedCustomer.orders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">订单号</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">运输方式</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">路线</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">创建时间</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">状态</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">金额</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedCustomer.orders.map(order => {
                      const ModeIcon = transportModeMap[order.transportMode]?.icon || Package
                      return (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <span className="font-medium text-blue-600">{order.orderNo}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <ModeIcon className="w-4 h-4 text-gray-400" />
                              <span>{transportModeMap[order.transportMode]?.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {order.origin} → {order.destination}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{order.createTime}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${orderStatusMap[order.status]?.color}`}>
                              {orderStatusMap[order.status]?.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            €{order.amount.toLocaleString('de-DE')}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button 
                              onClick={() => showToastMessage('跳转到订单详情')}
                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p>暂无订单记录</p>
              </div>
            )}
          </div>
        )
        
      case 'finance':
        return (
          <div className="space-y-6">
            {/* 财务概览 */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-500">累计收款</span>
                </div>
                <p className="text-2xl font-bold text-green-600">€{selectedCustomer.totalPaid.toLocaleString('de-DE')}</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-yellow-600" />
                  <span className="text-sm text-gray-500">应收款</span>
                </div>
                <p className="text-2xl font-bold text-yellow-600">€{selectedCustomer.totalReceivable.toLocaleString('de-DE')}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span className="text-sm text-gray-500">逾期款</span>
                </div>
                <p className="text-2xl font-bold text-red-600">
                  €{selectedCustomer.financials.filter(f => f.status === 'overdue').reduce((sum, f) => sum + f.amount - f.paidAmount, 0).toLocaleString('de-DE')}
                </p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-500">信用使用率</span>
                </div>
                <p className="text-2xl font-bold text-blue-600">
                  {Math.round((selectedCustomer.usedCredit / selectedCustomer.creditLimit) * 100)}%
                </p>
              </div>
            </div>
            
            {/* 账单列表 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-900">账单明细</h4>
                <button 
                  onClick={() => showToastMessage('跳转到财务管理')}
                  className="btn btn-sm btn-secondary"
                >
                  <FileText className="w-4 h-4" />
                  查看全部
                </button>
              </div>
              
              {selectedCustomer.financials.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">账单号</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">关联订单</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">金额</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">已付</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">到期日</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">状态</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedCustomer.financials.map(record => (
                        <tr key={record.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <span className="font-medium text-blue-600">{record.invoiceNo}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{record.orderNo}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            €{record.amount.toLocaleString('de-DE')}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600">
                            €{record.paidAmount.toLocaleString('de-DE')}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{record.dueDate}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${invoiceStatusMap[record.status]?.color}`}>
                              {invoiceStatusMap[record.status]?.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button 
                              onClick={() => showToastMessage('收款登记功能')}
                              className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                              title="收款登记"
                            >
                              <Receipt className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <DollarSign className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p>暂无财务记录</p>
                </div>
              )}
            </div>
            
            {/* 信用额度进度条 */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">信用额度使用情况</span>
                <span className="text-sm text-gray-500">
                  €{selectedCustomer.usedCredit.toLocaleString('de-DE')} / €{selectedCustomer.creditLimit.toLocaleString('de-DE')}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full ${
                    selectedCustomer.usedCredit / selectedCustomer.creditLimit > 0.9 ? 'bg-red-500' :
                    selectedCustomer.usedCredit / selectedCustomer.creditLimit > 0.7 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min((selectedCustomer.usedCredit / selectedCustomer.creditLimit) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                可用额度: €{(selectedCustomer.creditLimit - selectedCustomer.usedCredit).toLocaleString('de-DE')}
              </p>
            </div>
          </div>
        )
        
      case 'quotes':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">客户报价 ({selectedCustomer.quotes.length})</h4>
              <button onClick={handleAddQuote} className="btn btn-sm btn-primary">
                <Plus className="w-4 h-4" />
                新建报价
              </button>
            </div>
            
            {selectedCustomer.quotes.length > 0 ? (
              <div className="space-y-4">
                {selectedCustomer.quotes.map(quote => {
                  const ModeIcon = transportModeMap[quote.transportMode]?.icon || Package
                  return (
                    <div key={quote.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <ModeIcon className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{quote.quoteNo}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${quoteStatusMap[quote.status]?.color}`}>
                                {quoteStatusMap[quote.status]?.label}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500">
                              {quote.origin} → {quote.destination}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">有效期</p>
                          <p className="text-sm font-medium">{quote.validFrom} ~ {quote.validTo}</p>
                        </div>
                      </div>
                      
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left pb-2">费用项</th>
                            <th className="text-right pb-2">单价</th>
                            <th className="text-right pb-2">单位</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {quote.items.map((item, index) => (
                            <tr key={index}>
                              <td className="py-2">{item.name}</td>
                              <td className="py-2 text-right font-medium">€{item.price}</td>
                              <td className="py-2 text-right text-gray-500">/{item.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      
                      {quote.remark && (
                        <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
                          备注: {quote.remark}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
                        <button 
                          onClick={() => showToastMessage('复制报价')}
                          className="btn btn-sm btn-secondary"
                        >
                          <Copy className="w-3 h-3" />
                          复制
                        </button>
                        <button 
                          onClick={() => showToastMessage('编辑报价')}
                          className="btn btn-sm btn-secondary"
                        >
                          <Edit className="w-3 h-3" />
                          编辑
                        </button>
                        <button 
                          onClick={() => showToastMessage('发送报价给客户')}
                          className="btn btn-sm btn-primary"
                        >
                          <Send className="w-3 h-3" />
                          发送
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Tag className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p>暂无报价记录</p>
                <button onClick={handleAddQuote} className="btn btn-sm btn-primary mt-4">
                  <Plus className="w-4 h-4" />
                  创建首个报价
                </button>
              </div>
            )}
          </div>
        )
        
      case 'followups':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">跟进记录 ({selectedCustomer.followUps.length})</h4>
              <button onClick={handleAddFollowUp} className="btn btn-sm btn-primary">
                <Plus className="w-4 h-4" />
                添加跟进
              </button>
            </div>
            
            {selectedCustomer.followUps.length > 0 ? (
              <div className="space-y-4">
                {selectedCustomer.followUps.map((record, index) => {
                  const TypeIcon = followUpTypeMap[record.type]?.icon || MessageSquare
                  return (
                    <div key={record.id} className="relative pl-8">
                      {/* 时间线 */}
                      {index < selectedCustomer.followUps.length - 1 && (
                        <div className="absolute left-3 top-10 bottom-0 w-0.5 bg-gray-200" />
                      )}
                      
                      {/* 图标 */}
                      <div className={`absolute left-0 top-0 w-6 h-6 rounded-full flex items-center justify-center ${followUpTypeMap[record.type]?.color}`}>
                        <TypeIcon className="w-3 h-3" />
                      </div>
                      
                      {/* 内容 */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="font-medium text-gray-900">{record.subject}</span>
                            <span className={`ml-2 px-2 py-0.5 rounded text-xs ${followUpTypeMap[record.type]?.color}`}>
                              {followUpTypeMap[record.type]?.label}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">{record.createTime}</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{record.content}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>联系人: {record.contactPerson}</span>
                          <span>操作人: {record.operator}</span>
                        </div>
                        {record.result && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <span className="text-xs text-green-600 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              结果: {record.result}
                            </span>
                          </div>
                        )}
                        {record.nextFollowUp && (
                          <div className="mt-1">
                            <span className="text-xs text-blue-600 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              下次跟进: {record.nextFollowUp}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <MessageSquare className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p>暂无跟进记录</p>
                <button onClick={handleAddFollowUp} className="btn btn-sm btn-primary mt-4">
                  <Plus className="w-4 h-4" />
                  添加首条跟进
                </button>
              </div>
            )}
          </div>
        )
        
      case 'documents':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">文档附件 ({selectedCustomer.documents.length})</h4>
              <button 
                onClick={() => showToastMessage('上传文档功能开发中...')}
                className="btn btn-sm btn-primary"
              >
                <Plus className="w-4 h-4" />
                上传文档
              </button>
            </div>
            
            {selectedCustomer.documents.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {selectedCustomer.documents.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{doc.name}</p>
                        <p className="text-xs text-gray-500">{doc.size} · {doc.uploadTime} · {doc.uploader}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => showToastMessage('下载文档')}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p>暂无文档附件</p>
              </div>
            )}
          </div>
        )
        
      default:
        return null
    }
  }

  // ==================== 主渲染 ====================

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">客户管理</h1>
          <p className="text-gray-500 mt-1">全面管理客户信息、订单、财务与沟通记录</p>
        </div>
        <button onClick={handleCreate} className="btn btn-md btn-primary">
          <Plus className="w-4 h-4" />
          新建客户
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
            <div className={`p-3 ${stat.color} rounded-lg`}>
              <stat.icon className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
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
              placeholder="搜索客户编号、名称、联系人..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部阶段</option>
              <option value="lead">潜在客户</option>
              <option value="prospect">意向客户</option>
              <option value="customer">正式客户</option>
              <option value="vip">VIP客户</option>
            </select>
          </div>
          
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部等级</option>
            <option value="vip">VIP客户</option>
            <option value="important">重要客户</option>
            <option value="normal">普通客户</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部状态</option>
            <option value="active">正常</option>
            <option value="inactive">停用</option>
          </select>
          
          <button onClick={handleExport} className="btn btn-md btn-secondary">
            <Download className="w-4 h-4" />
            导出
          </button>
        </div>
      </div>

      {/* 客户表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">客户编号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">客户名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">等级</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">联系人</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">联系方式</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">信用额度</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-blue-600">{customer.code}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{customer.name}</p>
                      <p className="text-xs text-gray-500">{customer.shortName}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${levelMap[customer.level]?.color}`}>
                      {levelMap[customer.level]?.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900">{customer.contactPerson}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Phone className="w-3 h-3" />
                        {customer.phone}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Mail className="w-3 h-3" />
                        {customer.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    €{customer.creditLimit.toLocaleString('de-DE')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMap[customer.status]?.color}`}>
                      {statusMap[customer.status]?.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleViewDetail(customer)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="查看详情"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(customer)}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                        title="编辑"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(customer)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* 分页 */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            共 {filteredCustomers.length} 条记录
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

      {/* 客户详情弹窗 */}
      {showDetailModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col animate-slide-in">
            {/* 头部 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <Building className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900">{selectedCustomer.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageMap[selectedCustomer.stage]?.color}`}>
                      {stageMap[selectedCustomer.stage]?.label}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${levelMap[selectedCustomer.level]?.color}`}>
                      {levelMap[selectedCustomer.level]?.label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{selectedCustomer.code} · {selectedCustomer.industry}</p>
                </div>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {/* 选项卡导航 */}
            <div className="flex border-b border-gray-100 px-6 bg-gray-50 shrink-0">
              {[
                { key: 'info', label: '基本信息', icon: Building },
                { key: 'orders', label: '订单记录', icon: Package },
                { key: 'finance', label: '财务信息', icon: DollarSign },
                { key: 'quotes', label: '客户报价', icon: Tag },
                { key: 'followups', label: '跟进记录', icon: MessageSquare },
                { key: 'documents', label: '文档附件', icon: FileText },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setDetailTab(tab.key as typeof detailTab)}
                  className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 -mb-px ${
                    detailTab === tab.key 
                      ? 'border-blue-600 text-blue-600' 
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
            
            {/* 内容区域 */}
            <div className="flex-1 overflow-y-auto p-6">
              {renderDetailContent()}
            </div>
            
            {/* 底部按钮 */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-between shrink-0">
              <button
                onClick={handleAddFollowUp}
                className="btn btn-md btn-secondary"
              >
                <MessageSquare className="w-4 h-4" />
                添加跟进
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="btn btn-md btn-secondary"
                >
                  关闭
                </button>
                <button
                  onClick={() => {
                    setShowDetailModal(false)
                    handleEdit(selectedCustomer)
                  }}
                  className="btn btn-md btn-primary"
                >
                  <Edit className="w-4 h-4" />
                  编辑客户
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 创建/编辑客户弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto animate-slide-in">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-gray-100 z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {modalMode === 'create' ? '新建客户' : '编辑客户'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex flex-col max-h-[80vh]">
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* 基本信息 */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Building className="w-4 h-4 text-blue-600" />
                    基本信息
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">客户编号 <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">客户阶段 <span className="text-red-500">*</span></label>
                      <select
                        value={formData.stage}
                        onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                      >
                        <option value="lead">潜在客户</option>
                        <option value="prospect">意向客户</option>
                        <option value="customer">正式客户</option>
                        <option value="vip">VIP客户</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">客户等级</label>
                      <select
                        value={formData.level}
                        onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                      >
                        <option value="normal">普通客户</option>
                        <option value="important">重要客户</option>
                        <option value="vip">VIP客户</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">客户名称 <span className="text-red-500">*</span></label>
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
                      </select>
                    </div>
                  </div>
                </div>

                {/* 业务信息 */}
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-5 border border-purple-100">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-purple-600" />
                    业务信息
                  </h4>
                  
                  {/* 行业选择 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">所属行业</label>
                    <div className="flex flex-wrap gap-2">
                      {industryOptions.map((industry) => (
                        <button
                          key={industry}
                          type="button"
                          onClick={() => setFormData({ ...formData, industry })}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                            formData.industry === industry
                              ? 'bg-purple-600 text-white shadow-sm'
                              : 'bg-white text-gray-600 border border-gray-200 hover:border-purple-300'
                          }`}
                        >
                          {industry}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 客户来源选择 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">客户来源</label>
                    <div className="flex flex-wrap gap-2">
                      {sourceOptions.map((source) => (
                        <button
                          key={source}
                          type="button"
                          onClick={() => setFormData({ ...formData, source })}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                            formData.source === source
                              ? 'bg-purple-600 text-white shadow-sm'
                              : 'bg-white text-gray-600 border border-gray-200 hover:border-purple-300'
                          }`}
                        >
                          {source}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">销售负责人</label>
                    <input
                      type="text"
                      value={formData.salesName}
                      onChange={(e) => setFormData({ ...formData, salesName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                      placeholder="负责该客户的销售人员"
                    />
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
                          contacts: [...formData.contacts, { name: '', position: '', phone: '', email: '', isPrimary: formData.contacts.length === 0 }]
                        })
                      }}
                      className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      添加联系人
                    </button>
                  </div>

                  {/* 主联系人 */}
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
                              value={contact.position}
                              onChange={(e) => {
                                const newContacts = [...formData.contacts]
                                newContacts[index] = { ...newContacts[index], position: e.target.value }
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
                    <CreditCard className="w-4 h-4 text-amber-600" />
                    财务信息
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">税号 (VAT)</label>
                      <input
                        type="text"
                        value={formData.taxNo}
                        onChange={(e) => setFormData({ ...formData, taxNo: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                        placeholder="如：DE123456789"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">信用额度 (EUR)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                        <input
                          type="number"
                          value={formData.creditLimit}
                          onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                          className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">账期 (天)</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={formData.paymentTerms}
                          onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white pr-10"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">天</span>
                      </div>
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
                    placeholder="客户备注信息..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-md btn-secondary"
                >
                  取消
                </button>
                <button type="submit" className="btn btn-md btn-primary">
                  <CheckCircle className="w-4 h-4" />
                  {modalMode === 'create' ? '创建客户' : '保存修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 添加跟进记录弹窗 */}
      {showFollowUpModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">添加跟进记录</h3>
              </div>
              <button
                onClick={() => setShowFollowUpModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <form onSubmit={handleSubmitFollowUp} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">跟进方式</label>
                  <select
                    value={followUpFormData.type}
                    onChange={(e) => setFollowUpFormData({ ...followUpFormData, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="phone">电话</option>
                    <option value="email">邮件</option>
                    <option value="meeting">会议</option>
                    <option value="visit">拜访</option>
                    <option value="other">其他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">联系人</label>
                  <input
                    type="text"
                    value={followUpFormData.contactPerson}
                    onChange={(e) => setFollowUpFormData({ ...followUpFormData, contactPerson: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">主题 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={followUpFormData.subject}
                  onChange={(e) => setFollowUpFormData({ ...followUpFormData, subject: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">内容 <span className="text-red-500">*</span></label>
                <textarea
                  value={followUpFormData.content}
                  onChange={(e) => setFollowUpFormData({ ...followUpFormData, content: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">结果</label>
                  <input
                    type="text"
                    value={followUpFormData.result}
                    onChange={(e) => setFollowUpFormData({ ...followUpFormData, result: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="如：已达成合作意向"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">下次跟进日期</label>
                  <input
                    type="date"
                    value={followUpFormData.nextFollowUp}
                    onChange={(e) => setFollowUpFormData({ ...followUpFormData, nextFollowUp: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowFollowUpModal(false)}
                  className="btn btn-md btn-secondary"
                >
                  取消
                </button>
                <button type="submit" className="btn btn-md btn-primary">
                  保存记录
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 创建报价弹窗 */}
      {showQuoteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto animate-slide-in">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-gray-100 z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Tag className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">新建客户报价</h3>
              </div>
              <button
                onClick={() => setShowQuoteModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <form onSubmit={handleSubmitQuote} className="p-6 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">运输方式</label>
                  <select
                    value={quoteFormData.transportMode}
                    onChange={(e) => setQuoteFormData({ ...quoteFormData, transportMode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="sea">海运</option>
                    <option value="air">空运</option>
                    <option value="road">陆运</option>
                    <option value="rail">铁路</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">起始地</label>
                  <input
                    type="text"
                    value={quoteFormData.origin}
                    onChange={(e) => setQuoteFormData({ ...quoteFormData, origin: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="如：中国主要港口"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">目的地</label>
                  <input
                    type="text"
                    value={quoteFormData.destination}
                    onChange={(e) => setQuoteFormData({ ...quoteFormData, destination: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="如：汉堡/不来梅"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">有效期开始</label>
                  <input
                    type="date"
                    value={quoteFormData.validFrom}
                    onChange={(e) => setQuoteFormData({ ...quoteFormData, validFrom: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">有效期结束</label>
                  <input
                    type="date"
                    value={quoteFormData.validTo}
                    onChange={(e) => setQuoteFormData({ ...quoteFormData, validTo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              
              {/* 报价项目 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">报价项目</label>
                  <button
                    type="button"
                    onClick={addQuoteItem}
                    className="btn btn-sm btn-secondary"
                  >
                    <Plus className="w-3 h-3" />
                    添加项目
                  </button>
                </div>
                <div className="space-y-2">
                  {quoteFormData.items.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateQuoteItem(index, 'name', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        placeholder="费用名称"
                      />
                      <input
                        type="number"
                        value={item.price}
                        onChange={(e) => updateQuoteItem(index, 'price', e.target.value)}
                        className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        placeholder="单价"
                      />
                      <select
                        value={item.currency}
                        onChange={(e) => updateQuoteItem(index, 'currency', e.target.value)}
                        className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-sm"
                      >
                        <option value="EUR">EUR</option>
                        <option value="USD">USD</option>
                        <option value="CNY">CNY</option>
                      </select>
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => updateQuoteItem(index, 'unit', e.target.value)}
                        className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        placeholder="单位"
                      />
                      <button
                        type="button"
                        onClick={() => removeQuoteItem(index)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        disabled={quoteFormData.items.length <= 1}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  value={quoteFormData.remark}
                  onChange={(e) => setQuoteFormData({ ...quoteFormData, remark: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                  placeholder="报价说明或特殊条款"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowQuoteModal(false)}
                  className="btn btn-md btn-secondary"
                >
                  取消
                </button>
                <button type="submit" className="btn btn-md btn-primary">
                  创建报价
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast 提示 */}
      {showToast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg animate-slide-in flex items-center gap-2 z-50">
          <CheckCircle className="w-5 h-5 text-green-400" />
          {toastMessage}
        </div>
      )}
    </div>
  )
}
