import { useState } from 'react'
import { 
  Search, 
  Plus, 
  Download, 
  Filter, 
  Eye, 
  Edit, 
  MapPin,
  ChevronLeft,
  ChevronRight,
  X,
  Truck,
  Package,
  Clock,
  CheckCircle,
  AlertCircle,
  Ship,
  Plane,
  Train,
  DollarSign,
  FileText,
  Calendar,
  User,
  Phone,
  Building2,
  ArrowRight,
  RefreshCw,
  Anchor,
  Box,
  Receipt,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  CheckSquare,
  FileCheck,
  Send,
  MoreVertical,
  Link as LinkIcon
} from 'lucide-react'

// 运输方式图标映射
const transportModeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  sea: Ship,
  air: Plane,
  road: Truck,
  rail: Train,
  multimodal: Package
}

// 运输单状态
const shipmentStatusMap: Record<string, { label: string; color: string; bgColor: string }> = {
  draft: { label: '草稿', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  booked: { label: '已订舱', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  pickup_pending: { label: '待提货', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  picked_up: { label: '已提货', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  in_transit: { label: '运输中', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  customs_clearance: { label: '清关中', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  arrived: { label: '已到达', color: 'text-teal-600', bgColor: 'bg-teal-100' },
  delivering: { label: '派送中', color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
  delivered: { label: '已交付', color: 'text-green-600', bgColor: 'bg-green-100' },
  exception: { label: '异常', color: 'text-red-600', bgColor: 'bg-red-100' },
  cancelled: { label: '已取消', color: 'text-gray-500', bgColor: 'bg-gray-200' }
}

// 费用状态
const costStatusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待确认', color: 'text-yellow-600 bg-yellow-100' },
  confirmed: { label: '已确认', color: 'text-blue-600 bg-blue-100' },
  invoiced: { label: '已开票', color: 'text-purple-600 bg-purple-100' },
  paid: { label: '已结算', color: 'text-green-600 bg-green-100' }
}

// 承运商/船公司数据
const carriers = [
  { code: 'COSCO', name: '中远海运 COSCO', type: 'sea' },
  { code: 'MSC', name: '地中海航运 MSC', type: 'sea' },
  { code: 'MAERSK', name: '马士基 Maersk', type: 'sea' },
  { code: 'EVERGREEN', name: '长荣海运 Evergreen', type: 'sea' },
  { code: 'DHL', name: 'DHL Express', type: 'air' },
  { code: 'UPS', name: 'UPS', type: 'air' },
  { code: 'FEDEX', name: 'FedEx', type: 'air' },
  { code: 'DPD', name: 'DPD', type: 'road' },
  { code: 'DBTSCHENKER', name: 'DB Schenker', type: 'rail' },
  { code: 'CRCT', name: '中铁集装箱 CRCT', type: 'rail' }
]

// 费用类型
const costTypes = [
  { code: 'FREIGHT', name: '海运费/空运费', category: 'receivable' },
  { code: 'THC', name: '码头操作费 (THC)', category: 'receivable' },
  { code: 'DOC', name: '文件费 (DOC)', category: 'receivable' },
  { code: 'CUSTOMS', name: '清关费', category: 'receivable' },
  { code: 'DELIVERY', name: '派送费', category: 'receivable' },
  { code: 'INSURANCE', name: '保险费', category: 'receivable' },
  { code: 'STORAGE', name: '仓储费', category: 'receivable' },
  { code: 'VGM', name: 'VGM费用', category: 'receivable' },
  { code: 'HANDLING', name: '操作费', category: 'receivable' },
  { code: 'OTHER', name: '其他费用', category: 'receivable' }
]

// 供应商列表（从供应商管理模块同步）
const supplierList = [
  { id: 'S001', name: 'DHL物流服务', type: ['road', 'air'], taxId: 'DE119246592' },
  { id: 'S002', name: 'UPS快递服务', type: ['road', 'air'], taxId: 'DE812581628' },
  { id: 'S003', name: 'FedEx国际快递', type: ['air'], taxId: 'DE113850988' },
  { id: 'S004', name: '德铁物流', type: ['rail'], taxId: 'DE811569869' },
  { id: 'S005', name: '马士基航运', type: ['sea'], taxId: 'DK17320744' },
  { id: 'S006', name: '中远海运 COSCO', type: ['sea'], taxId: 'CN91310000' },
  { id: 'S007', name: '地中海航运 MSC', type: ['sea'], taxId: 'CH12345678' },
  { id: 'S008', name: '长荣海运', type: ['sea'], taxId: 'TW98765432' },
  { id: 'S009', name: 'DPD快递', type: ['road'], taxId: 'DE123456789' },
  { id: 'S010', name: 'DB Schenker', type: ['rail', 'road'], taxId: 'DE987654321' },
  { id: 'S011', name: '欧洲仓储服务', type: ['storage'], taxId: 'DE256789123' },
  { id: 'S012', name: '汉堡港务局', type: ['port'], taxId: 'DE333444555' },
  { id: 'S013', name: '法兰克福机场货运', type: ['airport'], taxId: 'DE666777888' },
  { id: 'S014', name: '鹿特丹港务', type: ['port'], taxId: 'NL111222333' },
  { id: 'S015', name: '清关代理服务', type: ['customs'], taxId: 'DE444555666' }
]

// 模拟关联订单数据
const mockOrders = [
  { id: 'ORD-2024-0001', customerName: '汉堡科技有限公司', transportMode: 'sea', origin: 'Shanghai', destination: 'Hamburg', packages: 120, grossWeight: 2500, volume: 15.5 },
  { id: 'ORD-2024-0002', customerName: '慕尼黑汽车零部件', transportMode: 'air', origin: 'Shenzhen', destination: 'Munich', packages: 50, grossWeight: 800, volume: 4.2 },
  { id: 'ORD-2024-0003', customerName: '柏林电子贸易', transportMode: 'rail', origin: 'Chengdu', destination: 'Berlin', packages: 200, grossWeight: 5000, volume: 28 },
  { id: 'ORD-2024-0004', customerName: '法兰克福机械公司', transportMode: 'road', origin: 'Rotterdam', destination: 'Frankfurt', packages: 30, grossWeight: 1200, volume: 8.5 },
  { id: 'ORD-2024-0005', customerName: '杜塞尔多夫贸易', transportMode: 'sea', origin: 'Ningbo', destination: 'Duisburg', packages: 80, grossWeight: 1800, volume: 12 }
]

// 模拟运输单数据
const mockShipments = [
  { 
    id: 'TMS-2024-0001', 
    orderNo: 'ORD-2024-0001',
    customerName: '汉堡科技有限公司',
    transportMode: 'sea',
    carrier: 'COSCO',
    vesselName: 'COSCO SHIPPING ARIES',
    voyageNo: '025E',
    blNumber: 'COSU6285471520',
    bookingNo: 'BK2024001520',
    containers: [
      { containerNo: 'CSLU2185476', type: '40HC', sealNo: 'CN2024001' },
      { containerNo: 'CSLU2185477', type: '40HC', sealNo: 'CN2024002' }
    ],
    origin: { port: 'Shanghai', country: 'CN' },
    destination: { port: 'Hamburg', country: 'DE' },
    etd: '2024-01-15',
    eta: '2024-02-15',
    atd: '2024-01-15',
    ata: null,
    status: 'in_transit',
    packages: 120,
    grossWeight: 2500,
    volume: 15.5,
    costs: {
      receivable: [
        { type: 'FREIGHT', amount: 3500, currency: 'EUR', status: 'confirmed' },
        { type: 'THC', amount: 280, currency: 'EUR', status: 'confirmed' },
        { type: 'DOC', amount: 50, currency: 'EUR', status: 'confirmed' }
      ],
      payable: [
        { type: 'FREIGHT', amount: 2800, currency: 'EUR', status: 'confirmed', vendor: 'COSCO', supplierId: 'S006', supplierName: '中远海运 COSCO' },
        { type: 'THC', amount: 220, currency: 'EUR', status: 'confirmed', vendor: 'SIPG', supplierId: 'S012', supplierName: '汉堡港务局' }
      ]
    },
    milestones: [
      { code: 'BOOKED', label: '已订舱', time: '2024-01-10 10:30', completed: true },
      { code: 'LOADED', label: '已装船', time: '2024-01-15 08:00', completed: true },
      { code: 'DEPARTED', label: '已离港', time: '2024-01-15 14:00', completed: true },
      { code: 'ARRIVED', label: '到达目的港', time: null, completed: false },
      { code: 'DELIVERED', label: '已交付', time: null, completed: false }
    ],
    createdAt: '2024-01-08',
    operatorName: '张三'
  },
  { 
    id: 'TMS-2024-0002', 
    orderNo: 'ORD-2024-0002',
    customerName: '慕尼黑汽车零部件',
    transportMode: 'air',
    carrier: 'DHL',
    flightNo: 'LH780',
    mawbNo: '020-12345678',
    hawbNo: 'HAWB-2024-0002',
    origin: { port: 'Shenzhen', country: 'CN' },
    destination: { port: 'Munich', country: 'DE' },
    etd: '2024-01-18',
    eta: '2024-01-20',
    atd: '2024-01-18',
    ata: '2024-01-20',
    status: 'delivered',
    packages: 50,
    grossWeight: 800,
    volume: 4.2,
    costs: {
      receivable: [
        { type: 'FREIGHT', amount: 4200, currency: 'EUR', status: 'paid' },
        { type: 'CUSTOMS', amount: 150, currency: 'EUR', status: 'paid' }
      ],
      payable: [
        { type: 'FREIGHT', amount: 3500, currency: 'EUR', status: 'paid', vendor: 'DHL', supplierId: 'S001', supplierName: 'DHL物流服务' }
      ]
    },
    milestones: [
      { code: 'BOOKED', label: '已订舱', time: '2024-01-16 09:00', completed: true },
      { code: 'PICKED_UP', label: '已提货', time: '2024-01-17 14:00', completed: true },
      { code: 'DEPARTED', label: '已起飞', time: '2024-01-18 22:30', completed: true },
      { code: 'ARRIVED', label: '已到达', time: '2024-01-20 06:00', completed: true },
      { code: 'DELIVERED', label: '已交付', time: '2024-01-20 16:00', completed: true }
    ],
    createdAt: '2024-01-15',
    operatorName: '李四'
  },
  { 
    id: 'TMS-2024-0003', 
    orderNo: 'ORD-2024-0003',
    customerName: '柏林电子贸易',
    transportMode: 'rail',
    carrier: 'CRCT',
    trainNo: 'X8001',
    containers: [
      { containerNo: 'CRXU1234567', type: '40HC', sealNo: 'CR2024001' }
    ],
    origin: { port: 'Chengdu', country: 'CN' },
    destination: { port: 'Berlin', country: 'DE' },
    etd: '2024-01-20',
    eta: '2024-02-08',
    atd: null,
    ata: null,
    status: 'booked',
    packages: 200,
    grossWeight: 5000,
    volume: 28,
    costs: {
      receivable: [
        { type: 'FREIGHT', amount: 6500, currency: 'EUR', status: 'pending' }
      ],
      payable: [
        { type: 'FREIGHT', amount: 5200, currency: 'EUR', status: 'pending', vendor: 'CRCT', supplierId: 'S004', supplierName: '德铁物流' }
      ]
    },
    milestones: [
      { code: 'BOOKED', label: '已订舱', time: '2024-01-18 11:00', completed: true },
      { code: 'LOADED', label: '已装车', time: null, completed: false },
      { code: 'DEPARTED', label: '已发车', time: null, completed: false },
      { code: 'ARRIVED', label: '到达目的站', time: null, completed: false },
      { code: 'DELIVERED', label: '已交付', time: null, completed: false }
    ],
    createdAt: '2024-01-17',
    operatorName: '王五'
  },
  { 
    id: 'TMS-2024-0004', 
    orderNo: 'ORD-2024-0004',
    customerName: '法兰克福机械公司',
    transportMode: 'road',
    carrier: 'DPD',
    truckNo: 'DE-AB1234',
    trailerNo: 'DE-CD5678',
    driverName: 'Hans Mueller',
    driverPhone: '+49 171 1234567',
    origin: { port: 'Rotterdam', country: 'NL' },
    destination: { port: 'Frankfurt', country: 'DE' },
    etd: '2024-01-22',
    eta: '2024-01-23',
    atd: '2024-01-22',
    ata: null,
    status: 'delivering',
    packages: 30,
    grossWeight: 1200,
    volume: 8.5,
    costs: {
      receivable: [
        { type: 'FREIGHT', amount: 850, currency: 'EUR', status: 'confirmed' },
        { type: 'DELIVERY', amount: 120, currency: 'EUR', status: 'confirmed' }
      ],
      payable: [
        { type: 'FREIGHT', amount: 680, currency: 'EUR', status: 'confirmed', vendor: 'DPD', supplierId: 'S009', supplierName: 'DPD快递' }
      ]
    },
    milestones: [
      { code: 'BOOKED', label: '已安排', time: '2024-01-21 16:00', completed: true },
      { code: 'PICKED_UP', label: '已提货', time: '2024-01-22 08:00', completed: true },
      { code: 'IN_TRANSIT', label: '运输中', time: '2024-01-22 09:00', completed: true },
      { code: 'DELIVERING', label: '派送中', time: '2024-01-23 07:00', completed: true },
      { code: 'DELIVERED', label: '已交付', time: null, completed: false }
    ],
    createdAt: '2024-01-20',
    operatorName: '张三'
  },
  { 
    id: 'TMS-2024-0005', 
    orderNo: 'ORD-2024-0005',
    customerName: '杜塞尔多夫贸易',
    transportMode: 'sea',
    carrier: 'MSC',
    vesselName: 'MSC OSCAR',
    voyageNo: '112W',
    blNumber: 'MEDU1234567',
    bookingNo: 'BK2024005678',
    containers: [
      { containerNo: 'MSCU1234567', type: '20GP', sealNo: 'MSC2024001' }
    ],
    origin: { port: 'Ningbo', country: 'CN' },
    destination: { port: 'Duisburg', country: 'DE' },
    etd: '2024-01-25',
    eta: '2024-02-28',
    atd: null,
    ata: null,
    status: 'pickup_pending',
    packages: 80,
    grossWeight: 1800,
    volume: 12,
    costs: {
      receivable: [
        { type: 'FREIGHT', amount: 2800, currency: 'EUR', status: 'pending' },
        { type: 'THC', amount: 200, currency: 'EUR', status: 'pending' }
      ],
      payable: [
        { type: 'FREIGHT', amount: 2200, currency: 'EUR', status: 'pending', vendor: 'MSC', supplierId: 'S007', supplierName: '地中海航运 MSC' }
      ]
    },
    milestones: [
      { code: 'BOOKED', label: '已订舱', time: '2024-01-22 14:00', completed: true },
      { code: 'PICKUP', label: '待提货', time: null, completed: false },
      { code: 'LOADED', label: '已装船', time: null, completed: false },
      { code: 'DEPARTED', label: '已离港', time: null, completed: false },
      { code: 'ARRIVED', label: '到达目的港', time: null, completed: false },
      { code: 'DELIVERED', label: '已交付', time: null, completed: false }
    ],
    createdAt: '2024-01-21',
    operatorName: '李四'
  }
]

// 类型定义
interface ContainerData {
  containerNo: string
  type: string
  sealNo: string
}

interface CostItem {
  type: string
  amount: number
  currency: string
  status: string
  vendor?: string
  supplierId?: string
  supplierName?: string
}

interface Milestone {
  code: string
  label: string
  time: string | null
  completed: boolean
}

interface ShipmentData {
  id: string
  orderNo: string
  customerName: string
  transportMode: string
  carrier: string
  vesselName?: string
  voyageNo?: string
  blNumber?: string
  bookingNo?: string
  flightNo?: string
  mawbNo?: string
  hawbNo?: string
  trainNo?: string
  truckNo?: string
  trailerNo?: string
  driverName?: string
  driverPhone?: string
  containers?: ContainerData[]
  origin: { port: string; country: string }
  destination: { port: string; country: string }
  etd: string
  eta: string
  atd: string | null
  ata: string | null
  status: string
  packages: number
  grossWeight: number
  volume: number
  costs: {
    receivable: CostItem[]
    payable: CostItem[]
  }
  milestones: Milestone[]
  createdAt: string
  operatorName: string
}

export default function TMSManagement() {
  const [searchKeyword, setSearchKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modeFilter, setModeFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  
  // 弹窗状态
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showCostModal, setShowCostModal] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showAddCostModal, setShowAddCostModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedShipment, setSelectedShipment] = useState<ShipmentData | null>(null)
  const [detailTab, setDetailTab] = useState<'info' | 'milestones' | 'costs' | 'documents'>('info')
  const [costType, setCostType] = useState<'receivable' | 'payable'>('receivable')
  
  // 新增费用表单
  const [newCostData, setNewCostData] = useState({
    type: '',
    amount: '',
    currency: 'EUR',
    vendor: '',
    supplierId: '',
    status: 'pending'
  })
  
  // 编辑费用状态
  const [showEditCostModal, setShowEditCostModal] = useState(false)
  const [editingCostIndex, setEditingCostIndex] = useState<number | null>(null)
  const [editCostType, setEditCostType] = useState<'receivable' | 'payable'>('receivable')
  const [editCostData, setEditCostData] = useState({
    type: '',
    amount: '',
    currency: 'EUR',
    vendor: '',
    supplierId: '',
    status: 'pending'
  })
  
  // 状态更新
  const [newStatus, setNewStatus] = useState('')
  const [statusRemark, setStatusRemark] = useState('')
  
  // 操作提示
  const [toastMessage, setToastMessage] = useState('')
  const [showToast, setShowToast] = useState(false)
  
  // 创建表单状态
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [createFormData, setCreateFormData] = useState({
    transportMode: 'sea',
    carrier: '',
    // 海运
    vesselName: '',
    voyageNo: '',
    blNumber: '',
    bookingNo: '',
    // 空运
    flightNo: '',
    mawbNo: '',
    hawbNo: '',
    // 铁路
    trainNo: '',
    // 陆运
    truckNo: '',
    trailerNo: '',
    driverName: '',
    driverPhone: '',
    // 通用
    etd: '',
    eta: '',
    remarks: ''
  })

  const pageSize = 10
  
  // 筛选运输单
  const filteredShipments = mockShipments.filter(shipment => {
    const matchSearch = shipment.id.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       shipment.orderNo.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       shipment.customerName.toLowerCase().includes(searchKeyword.toLowerCase())
    const matchStatus = statusFilter === 'all' || shipment.status === statusFilter
    const matchMode = modeFilter === 'all' || shipment.transportMode === modeFilter
    return matchSearch && matchStatus && matchMode
  })
  
  const totalPages = Math.ceil(filteredShipments.length / pageSize)
  const paginatedShipments = filteredShipments.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // 统计数据
  const stats = {
    total: mockShipments.length,
    inTransit: mockShipments.filter(s => ['in_transit', 'delivering'].includes(s.status)).length,
    pending: mockShipments.filter(s => ['draft', 'booked', 'pickup_pending'].includes(s.status)).length,
    exception: mockShipments.filter(s => s.status === 'exception').length,
    totalReceivable: mockShipments.reduce((sum, s) => sum + s.costs.receivable.reduce((a, c) => a + c.amount, 0), 0),
    totalPayable: mockShipments.reduce((sum, s) => sum + s.costs.payable.reduce((a, c) => a + c.amount, 0), 0)
  }

  // 计算利润
  const calculateProfit = (shipment: ShipmentData) => {
    const receivable = shipment.costs.receivable.reduce((sum, c) => sum + c.amount, 0)
    const payable = shipment.costs.payable.reduce((sum, c) => sum + c.amount, 0)
    return receivable - payable
  }

  // 获取运输方式图标
  const getTransportIcon = (mode: string) => {
    const Icon = transportModeIcons[mode] || Package
    return Icon
  }

  // 查看详情
  const handleViewDetail = (shipment: ShipmentData) => {
    setSelectedShipment(shipment)
    setDetailTab('info')
    setShowDetailModal(true)
  }

  // 打开费用管理
  const handleOpenCosts = (shipment: ShipmentData) => {
    setSelectedShipment(shipment)
    setShowCostModal(true)
  }

  // 选择订单时自动填充信息
  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId)
    const order = mockOrders.find(o => o.id === orderId)
    if (order) {
      setCreateFormData(prev => ({
        ...prev,
        transportMode: order.transportMode
      }))
    }
  }

  // 显示提示消息
  const showToastMessage = (message: string) => {
    setToastMessage(message)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  // 导出功能
  const handleExport = () => {
    const csvContent = [
      ['运输单号', '订单号', '客户', '运输方式', '起运地', '目的地', 'ETD', 'ETA', '状态', '利润'].join(','),
      ...filteredShipments.map(s => [
        s.id,
        s.orderNo,
        s.customerName,
        s.transportMode,
        s.origin.port,
        s.destination.port,
        s.etd,
        s.eta,
        shipmentStatusMap[s.status].label,
        calculateProfit(s).toFixed(2)
      ].join(','))
    ].join('\n')
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `运输单导出_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    showToastMessage('导出成功！')
  }

  // 更新状态
  const handleUpdateStatus = (shipment: ShipmentData) => {
    setSelectedShipment(shipment)
    setNewStatus(shipment.status)
    setStatusRemark('')
    setShowStatusModal(true)
  }

  // 确认更新状态
  const confirmUpdateStatus = () => {
    if (!selectedShipment || !newStatus) return
    // 模拟更新
    const shipmentIndex = mockShipments.findIndex(s => s.id === selectedShipment.id)
    if (shipmentIndex !== -1) {
      mockShipments[shipmentIndex].status = newStatus
      // 添加里程碑
      mockShipments[shipmentIndex].milestones.push({
        code: newStatus.toUpperCase(),
        label: shipmentStatusMap[newStatus].label,
        time: new Date().toLocaleString('zh-CN'),
        completed: true
      })
    }
    setShowStatusModal(false)
    showToastMessage(`状态已更新为: ${shipmentStatusMap[newStatus].label}`)
  }

  // 添加费用
  const handleAddCost = (type: 'receivable' | 'payable') => {
    setCostType(type)
    setNewCostData({
      type: '',
      amount: '',
      currency: 'EUR',
      vendor: '',
      supplierId: '',
      status: 'pending'
    })
    setShowAddCostModal(true)
  }

  // 确认添加费用
  const confirmAddCost = () => {
    if (!selectedShipment || !newCostData.type || !newCostData.amount) return
    // 应付费用必须选择供应商
    if (costType === 'payable' && !newCostData.supplierId) {
      showToastMessage('请选择供应商！')
      return
    }
    const shipmentIndex = mockShipments.findIndex(s => s.id === selectedShipment.id)
    if (shipmentIndex !== -1) {
      const supplier = supplierList.find(s => s.id === newCostData.supplierId)
      const cost: CostItem = {
        type: newCostData.type,
        amount: parseFloat(newCostData.amount),
        currency: newCostData.currency,
        status: newCostData.status,
        vendor: costType === 'payable' ? (supplier?.name || newCostData.vendor) : undefined,
        supplierId: costType === 'payable' ? newCostData.supplierId : undefined,
        supplierName: costType === 'payable' ? supplier?.name : undefined
      }
      if (costType === 'receivable') {
        mockShipments[shipmentIndex].costs.receivable.push(cost)
      } else {
        mockShipments[shipmentIndex].costs.payable.push(cost)
      }
      // 更新选中的shipment以刷新UI
      setSelectedShipment({ ...mockShipments[shipmentIndex] })
    }
    setShowAddCostModal(false)
    showToastMessage('费用添加成功！')
  }

  // 打开编辑费用弹窗
  const handleEditCost = (type: 'receivable' | 'payable', index: number, cost: CostItem) => {
    setEditCostType(type)
    setEditingCostIndex(index)
    setEditCostData({
      type: cost.type,
      amount: cost.amount.toString(),
      currency: cost.currency,
      vendor: cost.vendor || '',
      supplierId: cost.supplierId || '',
      status: cost.status
    })
    setShowEditCostModal(true)
  }

  // 确认编辑费用
  const confirmEditCost = () => {
    if (!selectedShipment || editingCostIndex === null || !editCostData.type || !editCostData.amount) return
    // 应付费用必须选择供应商
    if (editCostType === 'payable' && !editCostData.supplierId) {
      showToastMessage('请选择供应商！')
      return
    }
    const shipmentIndex = mockShipments.findIndex(s => s.id === selectedShipment.id)
    if (shipmentIndex !== -1) {
      const supplier = supplierList.find(s => s.id === editCostData.supplierId)
      const updatedCost: CostItem = {
        type: editCostData.type,
        amount: parseFloat(editCostData.amount),
        currency: editCostData.currency,
        status: editCostData.status,
        vendor: editCostType === 'payable' ? (supplier?.name || editCostData.vendor) : undefined,
        supplierId: editCostType === 'payable' ? editCostData.supplierId : undefined,
        supplierName: editCostType === 'payable' ? supplier?.name : undefined
      }
      if (editCostType === 'receivable') {
        mockShipments[shipmentIndex].costs.receivable[editingCostIndex] = updatedCost
      } else {
        mockShipments[shipmentIndex].costs.payable[editingCostIndex] = updatedCost
      }
      // 更新选中的shipment以刷新UI
      setSelectedShipment({ ...mockShipments[shipmentIndex] })
    }
    setShowEditCostModal(false)
    setEditingCostIndex(null)
    showToastMessage('费用修改成功！')
  }

  // 删除费用
  const handleDeleteCost = (type: 'receivable' | 'payable', index: number) => {
    if (!selectedShipment) return
    if (!window.confirm('确定要删除这条费用记录吗？')) return
    const shipmentIndex = mockShipments.findIndex(s => s.id === selectedShipment.id)
    if (shipmentIndex !== -1) {
      if (type === 'receivable') {
        mockShipments[shipmentIndex].costs.receivable.splice(index, 1)
      } else {
        mockShipments[shipmentIndex].costs.payable.splice(index, 1)
      }
      setSelectedShipment({ ...mockShipments[shipmentIndex] })
      showToastMessage('费用已删除！')
    }
  }

  // 费用确认
  const handleConfirmCosts = () => {
    if (!selectedShipment) return
    const shipmentIndex = mockShipments.findIndex(s => s.id === selectedShipment.id)
    if (shipmentIndex !== -1) {
      mockShipments[shipmentIndex].costs.receivable.forEach(c => c.status = 'confirmed')
      mockShipments[shipmentIndex].costs.payable.forEach(c => c.status = 'confirmed')
      setSelectedShipment({ ...mockShipments[shipmentIndex] })
    }
    showToastMessage('所有费用已确认！')
  }

  // 生成对账单
  const handleGenerateStatement = () => {
    if (!selectedShipment) return
    showToastMessage(`运输单 ${selectedShipment.id} 对账单已生成！`)
  }

  // 发送给财务
  const handleSendToFinance = () => {
    if (!selectedShipment) return
    showToastMessage(`运输单 ${selectedShipment.id} 已发送给财务部门！`)
  }

  // 创建运输单
  const handleCreateShipment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrderId) {
      showToastMessage('请选择关联订单！')
      return
    }
    if (!createFormData.carrier) {
      showToastMessage('请选择承运商！')
      return
    }
    
    const order = mockOrders.find(o => o.id === selectedOrderId)
    if (!order) return
    
    const newShipment: ShipmentData = {
      id: `TMS-${new Date().getFullYear()}-${String(mockShipments.length + 1).padStart(4, '0')}`,
      orderNo: selectedOrderId,
      customerName: order.customerName,
      transportMode: createFormData.transportMode,
      carrier: createFormData.carrier,
      vesselName: createFormData.vesselName,
      voyageNo: createFormData.voyageNo,
      blNumber: createFormData.blNumber,
      bookingNo: createFormData.bookingNo,
      flightNo: createFormData.flightNo,
      mawbNo: createFormData.mawbNo,
      hawbNo: createFormData.hawbNo,
      trainNo: createFormData.trainNo,
      truckNo: createFormData.truckNo,
      trailerNo: createFormData.trailerNo,
      driverName: createFormData.driverName,
      driverPhone: createFormData.driverPhone,
      containers: [],
      origin: { port: order.origin, country: 'CN' },
      destination: { port: order.destination, country: 'DE' },
      etd: createFormData.etd,
      eta: createFormData.eta,
      atd: null,
      ata: null,
      status: 'draft',
      packages: order.packages,
      grossWeight: order.grossWeight,
      volume: order.volume,
      costs: { receivable: [], payable: [] },
      milestones: [
        { code: 'CREATED', label: '已创建', time: new Date().toLocaleString('zh-CN'), completed: true }
      ],
      createdAt: new Date().toISOString().slice(0, 10),
      operatorName: '当前用户'
    }
    
    mockShipments.unshift(newShipment)
    setShowCreateModal(false)
    // 重置表单
    setSelectedOrderId('')
    setCreateFormData({
      transportMode: 'sea',
      carrier: '',
      vesselName: '',
      voyageNo: '',
      blNumber: '',
      bookingNo: '',
      flightNo: '',
      mawbNo: '',
      hawbNo: '',
      trainNo: '',
      truckNo: '',
      trailerNo: '',
      driverName: '',
      driverPhone: '',
      etd: '',
      eta: '',
      remarks: ''
    })
    showToastMessage(`运输单 ${newShipment.id} 创建成功！`)
  }

  // 编辑运输单
  const handleEditShipment = (shipment: ShipmentData) => {
    setSelectedShipment(shipment)
    setSelectedOrderId(shipment.orderNo)
    setCreateFormData({
      transportMode: shipment.transportMode,
      carrier: shipment.carrier,
      vesselName: shipment.vesselName || '',
      voyageNo: shipment.voyageNo || '',
      blNumber: shipment.blNumber || '',
      bookingNo: shipment.bookingNo || '',
      flightNo: shipment.flightNo || '',
      mawbNo: shipment.mawbNo || '',
      hawbNo: shipment.hawbNo || '',
      trainNo: shipment.trainNo || '',
      truckNo: shipment.truckNo || '',
      trailerNo: shipment.trailerNo || '',
      driverName: shipment.driverName || '',
      driverPhone: shipment.driverPhone || '',
      etd: shipment.etd,
      eta: shipment.eta,
      remarks: ''
    })
    setShowEditModal(true)
  }

  // 保存编辑
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedShipment) return
    
    const shipmentIndex = mockShipments.findIndex(s => s.id === selectedShipment.id)
    if (shipmentIndex !== -1) {
      mockShipments[shipmentIndex] = {
        ...mockShipments[shipmentIndex],
        transportMode: createFormData.transportMode,
        carrier: createFormData.carrier,
        vesselName: createFormData.vesselName,
        voyageNo: createFormData.voyageNo,
        blNumber: createFormData.blNumber,
        bookingNo: createFormData.bookingNo,
        flightNo: createFormData.flightNo,
        mawbNo: createFormData.mawbNo,
        hawbNo: createFormData.hawbNo,
        trainNo: createFormData.trainNo,
        truckNo: createFormData.truckNo,
        trailerNo: createFormData.trailerNo,
        driverName: createFormData.driverName,
        driverPhone: createFormData.driverPhone,
        etd: createFormData.etd,
        eta: createFormData.eta
      }
    }
    setShowEditModal(false)
    setShowDetailModal(false)
    showToastMessage(`运输单 ${selectedShipment.id} 已更新！`)
  }

  // 渲染运输详情
  const renderShipmentInfo = (shipment: ShipmentData) => {
    const TransportIcon = getTransportIcon(shipment.transportMode)
    
    return (
      <div className="space-y-6">
        {/* 基本信息 */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <TransportIcon className="w-5 h-5 text-blue-600" />
              运输信息
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">运输单号</span>
                <span className="font-medium text-blue-600">{shipment.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">关联订单</span>
                <span className="font-medium text-gray-900">{shipment.orderNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">客户名称</span>
                <span className="font-medium text-gray-900">{shipment.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">承运商</span>
                <span className="font-medium text-gray-900">{carriers.find(c => c.code === shipment.carrier)?.name || shipment.carrier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">操作员</span>
                <span className="font-medium text-gray-900">{shipment.operatorName}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <MapPin className="w-5 h-5 text-green-600" />
              路线信息
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">起运地</span>
                <span className="font-medium text-gray-900">{shipment.origin.port}, {shipment.origin.country}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">目的地</span>
                <span className="font-medium text-gray-900">{shipment.destination.port}, {shipment.destination.country}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">ETD</span>
                <span className="font-medium text-gray-900">{shipment.etd}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">ETA</span>
                <span className="font-medium text-gray-900">{shipment.eta}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">ATD</span>
                <span className="font-medium text-gray-900">{shipment.atd || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">ATA</span>
                <span className="font-medium text-gray-900">{shipment.ata || '-'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 运输方式特定信息 */}
        {shipment.transportMode === 'sea' && (
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-800 mb-3">
              <Anchor className="w-4 h-4" />
              海运信息
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">船名:</span> <span className="font-medium">{shipment.vesselName}</span></div>
              <div><span className="text-gray-500">航次:</span> <span className="font-medium">{shipment.voyageNo}</span></div>
              <div><span className="text-gray-500">提单号:</span> <span className="font-medium">{shipment.blNumber}</span></div>
              <div><span className="text-gray-500">订舱号:</span> <span className="font-medium">{shipment.bookingNo}</span></div>
            </div>
            {shipment.containers && shipment.containers.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-medium text-gray-700 mb-2">集装箱信息:</div>
                <div className="space-y-2">
                  {shipment.containers.map((container, idx) => (
                    <div key={idx} className="flex items-center gap-4 text-sm bg-white p-2 rounded">
                      <span className="font-mono font-medium">{container.containerNo}</span>
                      <span className="text-gray-500">{container.type}</span>
                      <span className="text-gray-500">封号: {container.sealNo}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {shipment.transportMode === 'air' && (
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="flex items-center gap-2 text-sm font-semibold text-purple-800 mb-3">
              <Plane className="w-4 h-4" />
              空运信息
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">航班号:</span> <span className="font-medium">{shipment.flightNo}</span></div>
              <div><span className="text-gray-500">主运单号:</span> <span className="font-medium">{shipment.mawbNo}</span></div>
              <div><span className="text-gray-500">分运单号:</span> <span className="font-medium">{shipment.hawbNo}</span></div>
            </div>
          </div>
        )}

        {shipment.transportMode === 'rail' && (
          <div className="p-4 bg-orange-50 rounded-lg">
            <div className="flex items-center gap-2 text-sm font-semibold text-orange-800 mb-3">
              <Train className="w-4 h-4" />
              铁路信息
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">班列号:</span> <span className="font-medium">{shipment.trainNo}</span></div>
            </div>
            {shipment.containers && shipment.containers.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-medium text-gray-700 mb-2">集装箱信息:</div>
                <div className="space-y-2">
                  {shipment.containers.map((container, idx) => (
                    <div key={idx} className="flex items-center gap-4 text-sm bg-white p-2 rounded">
                      <span className="font-mono font-medium">{container.containerNo}</span>
                      <span className="text-gray-500">{container.type}</span>
                      <span className="text-gray-500">封号: {container.sealNo}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {shipment.transportMode === 'road' && (
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 text-sm font-semibold text-green-800 mb-3">
              <Truck className="w-4 h-4" />
              陆运信息
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">车牌号:</span> <span className="font-medium">{shipment.truckNo}</span></div>
              <div><span className="text-gray-500">挂车号:</span> <span className="font-medium">{shipment.trailerNo}</span></div>
              <div><span className="text-gray-500">司机姓名:</span> <span className="font-medium">{shipment.driverName}</span></div>
              <div><span className="text-gray-500">司机电话:</span> <span className="font-medium">{shipment.driverPhone}</span></div>
            </div>
          </div>
        )}

        {/* 货物信息 */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
            <Box className="w-4 h-4" />
            货物信息
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><span className="text-gray-500">件数:</span> <span className="font-medium">{shipment.packages} 件</span></div>
            <div><span className="text-gray-500">毛重:</span> <span className="font-medium">{shipment.grossWeight} KG</span></div>
            <div><span className="text-gray-500">体积:</span> <span className="font-medium">{shipment.volume} CBM</span></div>
          </div>
        </div>
      </div>
    )
  }

  // 渲染里程碑
  const renderMilestones = (shipment: ShipmentData) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold text-gray-900">运输里程碑</h4>
        <button 
          onClick={() => handleUpdateStatus(shipment)}
          className="btn btn-sm btn-primary"
        >
          <Plus className="w-4 h-4" />
          更新状态
        </button>
      </div>
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
        <div className="space-y-6">
          {shipment.milestones.map((milestone, index) => (
            <div key={index} className="relative flex items-start gap-4 pl-10">
              <div className={`absolute left-2.5 w-4 h-4 rounded-full border-2 ${
                milestone.completed 
                  ? 'bg-green-500 border-green-500' 
                  : 'bg-white border-gray-300'
              }`}>
                {milestone.completed && <CheckCircle className="w-3 h-3 text-white absolute -left-[1px] -top-[1px]" />}
              </div>
              <div className="flex-1 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${milestone.completed ? 'text-green-700' : 'text-gray-500'}`}>
                    {milestone.label}
                  </span>
                  {milestone.time ? (
                    <span className="text-sm text-gray-500">{milestone.time}</span>
                  ) : (
                    <span className="text-sm text-gray-400">待完成</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // 渲染费用明细
  const renderCosts = (shipment: ShipmentData) => {
    const totalReceivable = shipment.costs.receivable.reduce((sum, c) => sum + c.amount, 0)
    const totalPayable = shipment.costs.payable.reduce((sum, c) => sum + c.amount, 0)
    const profit = totalReceivable - totalPayable
    const profitRate = totalReceivable > 0 ? ((profit / totalReceivable) * 100).toFixed(1) : '0'

    return (
      <div className="space-y-6">
        {/* 利润概览 */}
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-sm text-green-600">应收合计</div>
            <div className="text-xl font-bold text-green-700">€{totalReceivable.toFixed(2)}</div>
          </div>
          <div className="p-4 bg-red-50 rounded-lg">
            <div className="text-sm text-red-600">应付合计</div>
            <div className="text-xl font-bold text-red-700">€{totalPayable.toFixed(2)}</div>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-sm text-blue-600">毛利润</div>
            <div className={`text-xl font-bold ${profit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
              €{profit.toFixed(2)}
            </div>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-sm text-purple-600">利润率</div>
            <div className="text-xl font-bold text-purple-700">{profitRate}%</div>
          </div>
        </div>

        {/* 应收费用 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              应收费用 (向客户收取)
            </h4>
            <button onClick={() => handleAddCost('receivable')} className="btn btn-sm btn-secondary">
              <Plus className="w-3 h-3" />
              添加
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-gray-500 font-medium">费用类型</th>
                <th className="text-right py-2 text-gray-500 font-medium">金额</th>
                <th className="text-center py-2 text-gray-500 font-medium">状态</th>
                <th className="text-center py-2 text-gray-500 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {shipment.costs.receivable.map((cost, idx) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="py-2">{costTypes.find(t => t.code === cost.type)?.name || cost.type}</td>
                  <td className="py-2 text-right font-medium">{cost.currency} {cost.amount.toFixed(2)}</td>
                  <td className="py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${costStatusMap[cost.status]?.color}`}>
                      {costStatusMap[cost.status]?.label}
                    </span>
                  </td>
                  <td className="py-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => handleEditCost('receivable', idx, cost)}
                        className="text-blue-600 hover:text-blue-800 text-xs"
                      >
                        编辑
                      </button>
                      <button 
                        onClick={() => handleDeleteCost('receivable', idx)}
                        className="text-red-600 hover:text-red-800 text-xs"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 应付费用 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-red-600" />
              应付费用 (支付给供应商)
            </h4>
            <button onClick={() => handleAddCost('payable')} className="btn btn-sm btn-secondary">
              <Plus className="w-3 h-3" />
              添加
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-gray-500 font-medium">费用类型</th>
                <th className="text-left py-2 text-gray-500 font-medium">供应商</th>
                <th className="text-right py-2 text-gray-500 font-medium">金额</th>
                <th className="text-center py-2 text-gray-500 font-medium">状态</th>
                <th className="text-center py-2 text-gray-500 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {shipment.costs.payable.map((cost, idx) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="py-2">{costTypes.find(t => t.code === cost.type)?.name || cost.type}</td>
                  <td className="py-2">
                    <div className="flex flex-col">
                      <span className="text-gray-900 font-medium">{cost.supplierName || cost.vendor}</span>
                      {cost.supplierId && (
                        <span className="text-xs text-gray-400">{cost.supplierId}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 text-right font-medium">{cost.currency} {cost.amount.toFixed(2)}</td>
                  <td className="py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${costStatusMap[cost.status]?.color}`}>
                      {costStatusMap[cost.status]?.label}
                    </span>
                  </td>
                  <td className="py-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => handleEditCost('payable', idx, cost)}
                        className="text-blue-600 hover:text-blue-800 text-xs"
                      >
                        编辑
                      </button>
                      <button 
                        onClick={() => handleDeleteCost('payable', idx)}
                        className="text-red-600 hover:text-red-800 text-xs"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 财务操作按钮 */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <button onClick={handleConfirmCosts} className="btn btn-sm btn-secondary">
            <FileCheck className="w-4 h-4" />
            费用确认
          </button>
          <button onClick={handleGenerateStatement} className="btn btn-sm btn-secondary">
            <Receipt className="w-4 h-4" />
            生成对账单
          </button>
          <button onClick={handleSendToFinance} className="btn btn-sm btn-primary">
            <Send className="w-4 h-4" />
            发送给财务
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">TMS运输管理</h1>
          <p className="text-gray-500 mt-1">运输全流程管理、费用维护、里程碑跟踪</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-md btn-primary"
        >
          <Plus className="w-4 h-4" />
          创建运输单
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 bg-blue-500 rounded-lg">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">总运输单</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 bg-yellow-500 rounded-lg">
            <Clock className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">待处理</p>
            <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 bg-green-500 rounded-lg">
            <Truck className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">运输中</p>
            <p className="text-2xl font-bold text-gray-900">{stats.inTransit}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 bg-red-500 rounded-lg">
            <AlertCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">异常</p>
            <p className="text-2xl font-bold text-gray-900">{stats.exception}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 bg-emerald-500 rounded-lg">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">应收总额</p>
            <p className="text-xl font-bold text-emerald-600">€{stats.totalReceivable.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <div className="p-3 bg-orange-500 rounded-lg">
            <CreditCard className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">应付总额</p>
            <p className="text-xl font-bold text-orange-600">€{stats.totalPayable.toLocaleString()}</p>
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
              placeholder="搜索运输单号、订单号、客户名称..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部状态</option>
              {Object.entries(shipmentStatusMap).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
          </div>

          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部运输方式</option>
            <option value="sea">🚢 海运</option>
            <option value="air">✈️ 空运</option>
            <option value="road">🚚 陆运</option>
            <option value="rail">🚂 铁路</option>
          </select>
          
          <button onClick={handleExport} className="btn btn-md btn-secondary">
            <Download className="w-4 h-4" />
            导出
          </button>
        </div>
      </div>

      {/* 运输单表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">运输单</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">客户/订单</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">运输方式</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">路线</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">利润</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedShipments.map((shipment) => {
                const TransportIcon = getTransportIcon(shipment.transportMode)
                const profit = calculateProfit(shipment)
                
                return (
                  <tr key={shipment.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-medium text-blue-600">{shipment.id}</span>
                        <div className="text-xs text-gray-500 mt-0.5">{shipment.createdAt}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{shipment.customerName}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <LinkIcon className="w-3 h-3" />
                          {shipment.orderNo}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-100 rounded">
                          <TransportIcon className="w-4 h-4 text-gray-600" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {carriers.find(c => c.code === shipment.carrier)?.name?.split(' ')[0] || shipment.carrier}
                          </div>
                          <div className="text-xs text-gray-500">
                            {shipment.transportMode === 'sea' && shipment.vesselName}
                            {shipment.transportMode === 'air' && shipment.flightNo}
                            {shipment.transportMode === 'rail' && shipment.trainNo}
                            {shipment.transportMode === 'road' && shipment.truckNo}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm">
                        <span className="text-gray-900">{shipment.origin.port}</span>
                        <ArrowRight className="w-3 h-3 text-gray-400" />
                        <span className="text-gray-900">{shipment.destination.port}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs">
                        <div className="text-gray-500">ETD: <span className="text-gray-900">{shipment.etd}</span></div>
                        <div className="text-gray-500">ETA: <span className="text-gray-900">{shipment.eta}</span></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${shipmentStatusMap[shipment.status].bgColor} ${shipmentStatusMap[shipment.status].color}`}>
                        {shipmentStatusMap[shipment.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        €{profit.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleViewDetail(shipment)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="查看详情"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenCosts(shipment)}
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                          title="费用管理"
                        >
                          <DollarSign className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(shipment)}
                          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                          title="更新状态"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEditShipment(shipment)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          title="编辑"
                        >
                          <Edit className="w-4 h-4" />
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
            共 {filteredShipments.length} 条记录
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

      {/* 详情弹窗 */}
      {showDetailModal && selectedShipment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Truck className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">运输单详情</h3>
                  <p className="text-sm text-gray-500">{selectedShipment.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${shipmentStatusMap[selectedShipment.status].bgColor} ${shipmentStatusMap[selectedShipment.status].color}`}>
                  {shipmentStatusMap[selectedShipment.status].label}
                </span>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>
            
            {/* 标签导航 */}
            <div className="px-6 border-b border-gray-100 shrink-0">
              <div className="flex gap-6">
                {[
                  { key: 'info', label: '基本信息', icon: FileText },
                  { key: 'milestones', label: '里程碑', icon: Clock },
                  { key: 'costs', label: '费用明细', icon: DollarSign },
                  { key: 'documents', label: '文档', icon: FileCheck }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setDetailTab(tab.key as typeof detailTab)}
                    className={`flex items-center gap-2 py-3 px-1 border-b-2 transition-colors ${
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
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {detailTab === 'info' && renderShipmentInfo(selectedShipment)}
              {detailTab === 'milestones' && renderMilestones(selectedShipment)}
              {detailTab === 'costs' && renderCosts(selectedShipment)}
              {detailTab === 'documents' && (
                <div className="text-center text-gray-500 py-12">
                  <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p>暂无文档</p>
                  <button 
                    onClick={() => showToastMessage('文档上传功能开发中...')}
                    className="btn btn-sm btn-primary mt-4"
                  >
                    <Plus className="w-4 h-4" />
                    上传文档
                  </button>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowDetailModal(false)}
                className="btn btn-md btn-secondary"
              >
                关闭
              </button>
              <button 
                onClick={() => handleEditShipment(selectedShipment)}
                className="btn btn-md btn-primary"
              >
                <Edit className="w-4 h-4" />
                编辑运输单
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 创建运输单弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Plus className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">创建运输单</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <form onSubmit={handleCreateShipment} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* 关联订单 */}
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                <label className="block text-sm font-medium text-blue-800 mb-2">
                  <LinkIcon className="w-4 h-4 inline mr-1" />
                  关联订单 <span className="text-red-500">*</span>
                </label>
                <select 
                  value={selectedOrderId}
                  onChange={(e) => handleSelectOrder(e.target.value)}
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white"
                >
                  <option value="">选择要关联的订单</option>
                  {mockOrders.map(order => (
                    <option key={order.id} value={order.id}>
                      {order.id} - {order.customerName} ({order.origin} → {order.destination})
                    </option>
                  ))}
                </select>
                {selectedOrderId && (
                  <div className="mt-3 p-3 bg-white rounded-lg text-sm">
                    {(() => {
                      const order = mockOrders.find(o => o.id === selectedOrderId)
                      if (!order) return null
                      return (
                        <div className="grid grid-cols-3 gap-4">
                          <div><span className="text-gray-500">客户:</span> {order.customerName}</div>
                          <div><span className="text-gray-500">件数:</span> {order.packages}</div>
                          <div><span className="text-gray-500">重量:</span> {order.grossWeight} KG</div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>

              {/* 运输方式选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">运输方式 <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { value: 'sea', label: '海运', icon: Ship },
                    { value: 'air', label: '空运', icon: Plane },
                    { value: 'road', label: '陆运', icon: Truck },
                    { value: 'rail', label: '铁路', icon: Train },
                    { value: 'multimodal', label: '多式联运', icon: Package }
                  ].map(mode => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setCreateFormData(prev => ({ ...prev, transportMode: mode.value }))}
                      className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                        createFormData.transportMode === mode.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <mode.icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{mode.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 承运商 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">承运商 <span className="text-red-500">*</span></label>
                <select 
                  value={createFormData.carrier}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, carrier: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">选择承运商</option>
                  {carriers.filter(c => c.type === createFormData.transportMode || createFormData.transportMode === 'multimodal').map(carrier => (
                    <option key={carrier.code} value={carrier.code}>{carrier.name}</option>
                  ))}
                </select>
              </div>

              {/* 海运特定字段 */}
              {createFormData.transportMode === 'sea' && (
                <div className="p-4 bg-blue-50 rounded-lg space-y-4">
                  <h4 className="text-sm font-medium text-blue-800 flex items-center gap-2">
                    <Anchor className="w-4 h-4" />
                    海运信息
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">船名</label>
                      <input
                        type="text"
                        value={createFormData.vesselName}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, vesselName: e.target.value }))}
                        placeholder="如: COSCO SHIPPING ARIES"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">航次</label>
                      <input
                        type="text"
                        value={createFormData.voyageNo}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, voyageNo: e.target.value }))}
                        placeholder="如: 025E"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">订舱号</label>
                      <input
                        type="text"
                        value={createFormData.bookingNo}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, bookingNo: e.target.value }))}
                        placeholder="BK2024XXXXXX"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">提单号</label>
                      <input
                        type="text"
                        value={createFormData.blNumber}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, blNumber: e.target.value }))}
                        placeholder="如: COSU6285471520"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 空运特定字段 */}
              {createFormData.transportMode === 'air' && (
                <div className="p-4 bg-purple-50 rounded-lg space-y-4">
                  <h4 className="text-sm font-medium text-purple-800 flex items-center gap-2">
                    <Plane className="w-4 h-4" />
                    空运信息
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">航班号</label>
                      <input
                        type="text"
                        value={createFormData.flightNo}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, flightNo: e.target.value }))}
                        placeholder="如: LH780"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">主运单号 (MAWB)</label>
                      <input
                        type="text"
                        value={createFormData.mawbNo}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, mawbNo: e.target.value }))}
                        placeholder="020-12345678"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">分运单号 (HAWB)</label>
                      <input
                        type="text"
                        value={createFormData.hawbNo}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, hawbNo: e.target.value }))}
                        placeholder="HAWB-2024-0001"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 铁路特定字段 */}
              {createFormData.transportMode === 'rail' && (
                <div className="p-4 bg-orange-50 rounded-lg space-y-4">
                  <h4 className="text-sm font-medium text-orange-800 flex items-center gap-2">
                    <Train className="w-4 h-4" />
                    铁路信息
                  </h4>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">班列号</label>
                    <input
                      type="text"
                      value={createFormData.trainNo}
                      onChange={(e) => setCreateFormData(prev => ({ ...prev, trainNo: e.target.value }))}
                      placeholder="如: X8001"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                </div>
              )}

              {/* 陆运特定字段 */}
              {createFormData.transportMode === 'road' && (
                <div className="p-4 bg-green-50 rounded-lg space-y-4">
                  <h4 className="text-sm font-medium text-green-800 flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    陆运信息
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">车牌号</label>
                      <input
                        type="text"
                        value={createFormData.truckNo}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, truckNo: e.target.value }))}
                        placeholder="如: DE-AB1234"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">挂车号</label>
                      <input
                        type="text"
                        value={createFormData.trailerNo}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, trailerNo: e.target.value }))}
                        placeholder="如: DE-CD5678"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">司机姓名</label>
                      <input
                        type="text"
                        value={createFormData.driverName}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, driverName: e.target.value }))}
                        placeholder="司机姓名"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">司机电话</label>
                      <input
                        type="tel"
                        value={createFormData.driverPhone}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, driverPhone: e.target.value }))}
                        placeholder="+49 xxx xxxx xxxx"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 时间 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    预计发货日期 (ETD)
                  </label>
                  <input
                    type="date"
                    value={createFormData.etd}
                    onChange={(e) => setCreateFormData(prev => ({ ...prev, etd: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    预计到达日期 (ETA)
                  </label>
                  <input
                    type="date"
                    value={createFormData.eta}
                    onChange={(e) => setCreateFormData(prev => ({ ...prev, eta: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              {/* 备注 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea 
                  rows={3} 
                  value={createFormData.remarks}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, remarks: e.target.value }))}
                  placeholder="运输相关备注..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" 
                />
              </div>
            </form>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="btn btn-md btn-secondary"
              >
                取消
              </button>
              <button type="submit" className="btn btn-md btn-primary">
                创建运输单
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 费用管理弹窗 */}
      {showCostModal && selectedShipment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">费用管理</h3>
                  <p className="text-sm text-gray-500">{selectedShipment.id} - {selectedShipment.customerName}</p>
                </div>
              </div>
              <button
                onClick={() => setShowCostModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {renderCosts(selectedShipment)}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowCostModal(false)}
                className="btn btn-md btn-secondary"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 更新状态弹窗 */}
      {showStatusModal && selectedShipment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <RefreshCw className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">更新运输状态</h3>
              </div>
              <button
                onClick={() => setShowStatusModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">运输单号</label>
                <p className="text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded-lg">{selectedShipment.id}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">当前状态</label>
                <p className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${shipmentStatusMap[selectedShipment.status].bgColor} ${shipmentStatusMap[selectedShipment.status].color}`}>
                  {shipmentStatusMap[selectedShipment.status].label}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">新状态 <span className="text-red-500">*</span></label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">选择新状态</option>
                  {Object.entries(shipmentStatusMap).map(([key, value]) => (
                    <option key={key} value={key}>{value.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  value={statusRemark}
                  onChange={(e) => setStatusRemark(e.target.value)}
                  rows={3}
                  placeholder="状态更新备注..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowStatusModal(false)}
                className="btn btn-md btn-secondary"
              >
                取消
              </button>
              <button
                onClick={confirmUpdateStatus}
                disabled={!newStatus}
                className="btn btn-md btn-primary disabled:opacity-50"
              >
                确认更新
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 添加费用弹窗 */}
      {showAddCostModal && selectedShipment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${costType === 'receivable' ? 'bg-green-100' : 'bg-red-100'}`}>
                  <DollarSign className={`w-5 h-5 ${costType === 'receivable' ? 'text-green-600' : 'text-red-600'}`} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  添加{costType === 'receivable' ? '应收' : '应付'}费用
                </h3>
              </div>
              <button
                onClick={() => setShowAddCostModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">费用类型 <span className="text-red-500">*</span></label>
                <select
                  value={newCostData.type}
                  onChange={(e) => setNewCostData(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">选择费用类型</option>
                  {costTypes.map(type => (
                    <option key={type.code} value={type.code}>{type.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">金额 <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    value={newCostData.amount}
                    onChange={(e) => setNewCostData(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">币种</label>
                  <select
                    value={newCostData.currency}
                    onChange={(e) => setNewCostData(prev => ({ ...prev, currency: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="CNY">CNY</option>
                  </select>
                </div>
              </div>
              {costType === 'payable' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    供应商 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newCostData.supplierId}
                    onChange={(e) => {
                      const supplier = supplierList.find(s => s.id === e.target.value)
                      setNewCostData(prev => ({ 
                        ...prev, 
                        supplierId: e.target.value,
                        vendor: supplier?.name || ''
                      }))
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="">选择供应商</option>
                    {supplierList.map(supplier => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    费用将关联到订单 {selectedShipment?.orderNo}，并同步到财务应付管理
                  </p>
                </div>
              )}
              {/* 状态默认为待确认 - 不需要手动选择 */}
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-blue-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  新增费用将自动设为"待确认"状态，通过"费用确认"操作后变为"已确认"
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowAddCostModal(false)}
                className="btn btn-md btn-secondary"
              >
                取消
              </button>
              <button
                onClick={confirmAddCost}
                disabled={!newCostData.type || !newCostData.amount || (costType === 'payable' && !newCostData.supplierId)}
                className="btn btn-md btn-primary disabled:opacity-50"
              >
                添加费用
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑费用弹窗 */}
      {showEditCostModal && selectedShipment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${editCostType === 'receivable' ? 'bg-green-100' : 'bg-red-100'}`}>
                  <Edit className={`w-5 h-5 ${editCostType === 'receivable' ? 'text-green-600' : 'text-red-600'}`} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  编辑{editCostType === 'receivable' ? '应收' : '应付'}费用
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowEditCostModal(false)
                  setEditingCostIndex(null)
                }}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">费用类型 <span className="text-red-500">*</span></label>
                <select
                  value={editCostData.type}
                  onChange={(e) => setEditCostData(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">选择费用类型</option>
                  {costTypes.map(type => (
                    <option key={type.code} value={type.code}>{type.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">金额 <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    value={editCostData.amount}
                    onChange={(e) => setEditCostData(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">币种</label>
                  <select
                    value={editCostData.currency}
                    onChange={(e) => setEditCostData(prev => ({ ...prev, currency: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="CNY">CNY</option>
                  </select>
                </div>
              </div>
              {editCostType === 'payable' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    供应商 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editCostData.supplierId}
                    onChange={(e) => {
                      const supplier = supplierList.find(s => s.id === e.target.value)
                      setEditCostData(prev => ({ 
                        ...prev, 
                        supplierId: e.target.value,
                        vendor: supplier?.name || ''
                      }))
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="">选择供应商</option>
                    {supplierList.map(supplier => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {/* 状态只读显示 - 状态通过业务操作自动更新 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">当前状态</label>
                <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${costStatusMap[editCostData.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                    {costStatusMap[editCostData.status]?.label || editCostData.status}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">（状态通过业务操作自动更新）</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowEditCostModal(false)
                  setEditingCostIndex(null)
                }}
                className="btn btn-md btn-secondary"
              >
                取消
              </button>
              <button
                onClick={confirmEditCost}
                disabled={!editCostData.type || !editCostData.amount}
                className="btn btn-md btn-primary disabled:opacity-50"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑运输单弹窗 */}
      {showEditModal && selectedShipment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Edit className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">编辑运输单</h3>
                  <p className="text-sm text-gray-500">{selectedShipment.id}</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <form onSubmit={handleSaveEdit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* 运输方式选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">运输方式</label>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { value: 'sea', label: '海运', icon: Ship },
                    { value: 'air', label: '空运', icon: Plane },
                    { value: 'road', label: '陆运', icon: Truck },
                    { value: 'rail', label: '铁路', icon: Train },
                    { value: 'multimodal', label: '多式联运', icon: Package }
                  ].map(mode => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setCreateFormData(prev => ({ ...prev, transportMode: mode.value }))}
                      className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                        createFormData.transportMode === mode.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <mode.icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{mode.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 承运商 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">承运商</label>
                <select 
                  value={createFormData.carrier}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, carrier: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">选择承运商</option>
                  {carriers.filter(c => c.type === createFormData.transportMode || createFormData.transportMode === 'multimodal').map(carrier => (
                    <option key={carrier.code} value={carrier.code}>{carrier.name}</option>
                  ))}
                </select>
              </div>

              {/* 海运特定字段 */}
              {createFormData.transportMode === 'sea' && (
                <div className="p-4 bg-blue-50 rounded-lg space-y-4">
                  <h4 className="text-sm font-medium text-blue-800 flex items-center gap-2">
                    <Anchor className="w-4 h-4" />
                    海运信息
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">船名</label>
                      <input
                        type="text"
                        value={createFormData.vesselName}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, vesselName: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">航次</label>
                      <input
                        type="text"
                        value={createFormData.voyageNo}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, voyageNo: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">订舱号</label>
                      <input
                        type="text"
                        value={createFormData.bookingNo}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, bookingNo: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">提单号</label>
                      <input
                        type="text"
                        value={createFormData.blNumber}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, blNumber: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 空运特定字段 */}
              {createFormData.transportMode === 'air' && (
                <div className="p-4 bg-purple-50 rounded-lg space-y-4">
                  <h4 className="text-sm font-medium text-purple-800 flex items-center gap-2">
                    <Plane className="w-4 h-4" />
                    空运信息
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">航班号</label>
                      <input
                        type="text"
                        value={createFormData.flightNo}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, flightNo: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">主运单号 (MAWB)</label>
                      <input
                        type="text"
                        value={createFormData.mawbNo}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, mawbNo: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">分运单号 (HAWB)</label>
                      <input
                        type="text"
                        value={createFormData.hawbNo}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, hawbNo: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 铁路特定字段 */}
              {createFormData.transportMode === 'rail' && (
                <div className="p-4 bg-orange-50 rounded-lg space-y-4">
                  <h4 className="text-sm font-medium text-orange-800 flex items-center gap-2">
                    <Train className="w-4 h-4" />
                    铁路信息
                  </h4>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">班列号</label>
                    <input
                      type="text"
                      value={createFormData.trainNo}
                      onChange={(e) => setCreateFormData(prev => ({ ...prev, trainNo: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                </div>
              )}

              {/* 陆运特定字段 */}
              {createFormData.transportMode === 'road' && (
                <div className="p-4 bg-green-50 rounded-lg space-y-4">
                  <h4 className="text-sm font-medium text-green-800 flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    陆运信息
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">车牌号</label>
                      <input
                        type="text"
                        value={createFormData.truckNo}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, truckNo: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">挂车号</label>
                      <input
                        type="text"
                        value={createFormData.trailerNo}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, trailerNo: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">司机姓名</label>
                      <input
                        type="text"
                        value={createFormData.driverName}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, driverName: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">司机电话</label>
                      <input
                        type="tel"
                        value={createFormData.driverPhone}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, driverPhone: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 时间 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    预计发货日期 (ETD)
                  </label>
                  <input
                    type="date"
                    value={createFormData.etd}
                    onChange={(e) => setCreateFormData(prev => ({ ...prev, etd: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    预计到达日期 (ETA)
                  </label>
                  <input
                    type="date"
                    value={createFormData.eta}
                    onChange={(e) => setCreateFormData(prev => ({ ...prev, eta: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            </form>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="btn btn-md btn-secondary"
              >
                取消
              </button>
              <button 
                onClick={handleSaveEdit}
                className="btn btn-md btn-primary"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast 提示 */}
      {showToast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-slide-in z-50">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  )
}
