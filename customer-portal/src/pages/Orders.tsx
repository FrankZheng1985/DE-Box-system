import { Package, Search, Filter, Plus, X, Truck, FileCheck, Check, Calendar, ChevronDown, AlertTriangle, Thermometer, CheckCircle, Clock, MapPin, ArrowUpDown } from 'lucide-react'
import { useState } from 'react'

// 业务类型
type ServiceType = 'release' | 'transport' | 'both'
// 放单类型
type ReleaseType = 'not_required' | 'original' | 'telex' | 'seaway'
// 货物类型
type CargoType = 'general' | 'dangerous' | 'temperature_controlled'
// 船司放单状态
type CarrierReleaseStatus = 'not_required' | 'pending_mail' | 'mailed' | 'pending_release' | 'released'
// 清关状态
type CustomsClearanceStatus = 'pending' | 'cleared'
// 派送状态
type DeliveryStatus = 'waiting' | 'fleet_confirmed' | 'in_transit' | 'completed' | 'abnormal' | 'cmr_received'

interface OrderFormData {
  // 业务类型
  serviceType: ServiceType
  // 放单类型
  releaseType: ReleaseType
  // 货物类型
  cargoType: CargoType
  
  // 货物信息
  goodsDescription: string
  packages: string
  grossWeight: string
  volume: string
  
  // 提单信息（放单业务需要）
  blNumber: string
  shippingLine: string
  
  // 运输信息（运输业务需要）
  pickupAddress: string
  warehouseAddress: string  // 送仓地址
  
  // 其他
  remarks: string
}

const initialFormData: OrderFormData = {
  serviceType: 'both',
  releaseType: 'telex',
  cargoType: 'general',
  goodsDescription: '',
  packages: '',
  grossWeight: '',
  volume: '',
  blNumber: '',
  shippingLine: '',
  pickupAddress: '',
  warehouseAddress: '',
  remarks: ''
}

// 船公司列表
const shippingLines = [
  { code: 'MSC', name: 'MSC 地中海航运' },
  { code: 'MAERSK', name: 'Maersk 马士基' },
  { code: 'CMACGM', name: 'CMA CGM 达飞' },
  { code: 'COSCO', name: 'COSCO 中远海运' },
  { code: 'HAPAG', name: 'Hapag-Lloyd 赫伯罗特' },
  { code: 'ONE', name: 'ONE 海洋网联' },
  { code: 'EVERGREEN', name: 'Evergreen 长荣海运' },
  { code: 'YANGMING', name: 'Yang Ming 阳明海运' },
  { code: 'HMM', name: 'HMM 现代商船' },
  { code: 'ZIM', name: 'ZIM 以星航运' },
]

// 模拟订单数据
const mockOrders = [
  {
    id: '1',
    orderNo: 'ORD-2024-0001',
    serviceType: 'both' as ServiceType,
    status: 'pending',
    goodsDescription: '电子产品配件',
    createTime: '2024-01-15 10:30',
    blNumber: 'COSU6285471520',
    shippingLine: 'COSCO',
    cargoType: 'general' as CargoType,
    warehouseAddress: 'Hamburg, Hafenstraße 123',
    carrierReleaseStatus: 'pending_release' as CarrierReleaseStatus,
    customsClearanceStatus: 'pending' as CustomsClearanceStatus,
    deliveryStatus: 'waiting' as DeliveryStatus,
  },
  {
    id: '2',
    orderNo: 'ORD-2024-0002',
    serviceType: 'release' as ServiceType,
    status: 'processing',
    goodsDescription: '服装面料',
    createTime: '2024-01-14 14:20',
    blNumber: 'MAEU1234567890',
    shippingLine: 'MAERSK',
    cargoType: 'general' as CargoType,
    warehouseAddress: 'Berlin, Industriestr. 45',
    carrierReleaseStatus: 'mailed' as CarrierReleaseStatus,
    customsClearanceStatus: 'cleared' as CustomsClearanceStatus,
    deliveryStatus: 'fleet_confirmed' as DeliveryStatus,
  },
  {
    id: '3',
    orderNo: 'ORD-2024-0003',
    serviceType: 'transport' as ServiceType,
    status: 'completed',
    goodsDescription: '化工原料',
    createTime: '2024-01-13 09:15',
    blNumber: '',
    shippingLine: '',
    cargoType: 'dangerous' as CargoType,
    warehouseAddress: 'Frankfurt, Logistikpark 88',
    carrierReleaseStatus: 'not_required' as CarrierReleaseStatus,
    customsClearanceStatus: 'cleared' as CustomsClearanceStatus,
    deliveryStatus: 'completed' as DeliveryStatus,
  },
  {
    id: '4',
    orderNo: 'ORD-2024-0004',
    serviceType: 'both' as ServiceType,
    status: 'processing',
    goodsDescription: '冷冻海鲜',
    createTime: '2024-01-12 16:45',
    blNumber: 'HLCU8574321',
    shippingLine: 'HAPAG',
    cargoType: 'temperature_controlled' as CargoType,
    warehouseAddress: 'Munich, Kühlhaus 12',
    carrierReleaseStatus: 'released' as CarrierReleaseStatus,
    customsClearanceStatus: 'cleared' as CustomsClearanceStatus,
    deliveryStatus: 'in_transit' as DeliveryStatus,
  },
]

const serviceTypeLabels: Record<ServiceType, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  release: { label: '放单服务', color: 'bg-blue-100 text-blue-700', icon: FileCheck },
  transport: { label: '运输服务', color: 'bg-green-100 text-green-700', icon: Truck },
  both: { label: '放单+运输', color: 'bg-purple-100 text-purple-700', icon: Package }
}

const releaseTypeLabels: Record<ReleaseType, string> = {
  not_required: '无需放单',
  original: '正本 Original B/L',
  telex: '电放 Telex Release',
  seaway: 'Seaway Bill'
}

const cargoTypeLabels: Record<CargoType, { label: string; color: string; icon: React.ComponentType<{ className?: string }> | null }> = {
  general: { label: '普货', color: 'text-gray-600', icon: null },
  dangerous: { label: '危险品', color: 'text-red-600', icon: AlertTriangle },
  temperature_controlled: { label: '温控', color: 'text-blue-600', icon: Thermometer }
}

const carrierReleaseStatusLabels: Record<CarrierReleaseStatus, { label: string; color: string }> = {
  not_required: { label: '否', color: 'bg-gray-100 text-gray-500' },
  pending_mail: { label: '正本待邮寄', color: 'bg-orange-100 text-orange-700' },
  mailed: { label: '正本已邮寄', color: 'bg-blue-100 text-blue-700' },
  pending_release: { label: '待放行', color: 'bg-yellow-100 text-yellow-700' },
  released: { label: '船司放行', color: 'bg-green-100 text-green-700' }
}

const customsClearanceStatusLabels: Record<CustomsClearanceStatus, { label: string; color: string }> = {
  pending: { label: '待清关', color: 'bg-yellow-100 text-yellow-700' },
  cleared: { label: '已放行', color: 'bg-green-100 text-green-700' }
}

const deliveryStatusLabels: Record<DeliveryStatus, { label: string; color: string }> = {
  waiting: { label: '等待安排', color: 'bg-gray-100 text-gray-600' },
  fleet_confirmed: { label: '车队已确认', color: 'bg-blue-100 text-blue-700' },
  in_transit: { label: '运输中', color: 'bg-blue-100 text-blue-700' },
  completed: { label: '完成', color: 'bg-green-100 text-green-700' },
  abnormal: { label: '状态异常', color: 'bg-red-100 text-red-700' },
  cmr_received: { label: 'CMR已回传', color: 'bg-green-100 text-green-700' }
}

export default function Orders() {
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [formData, setFormData] = useState<OrderFormData>(initialFormData)
  const [orders, setOrders] = useState(mockOrders)
  
  // 筛选条件
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterDeliveryStatus, setFilterDeliveryStatus] = useState<string>('')
  const [filterCarrierReleaseStatus, setFilterCarrierReleaseStatus] = useState<string>('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  
  // 排序
  const [sortBy, setSortBy] = useState<'createTime' | 'orderNo'>('createTime')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // 打开创建订单弹窗
  const handleOpenCreate = () => {
    setFormData(initialFormData)
    setShowCreateModal(true)
  }

  // 关闭弹窗
  const handleCloseModal = () => {
    setShowCreateModal(false)
    setFormData(initialFormData)
  }

  // 提交订单
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // 验证必填字段
    if (!formData.goodsDescription) {
      alert('请填写货物描述')
      return
    }
    
    if ((formData.serviceType === 'release' || formData.serviceType === 'both') && !formData.blNumber) {
      alert('放单服务需要填写提单号')
      return
    }
    
    if ((formData.serviceType === 'transport' || formData.serviceType === 'both') && !formData.warehouseAddress) {
      alert('运输服务需要填写送仓地址')
      return
    }
    
    // 确定船司放单初始状态
    let carrierReleaseStatus: CarrierReleaseStatus = 'not_required'
    if (formData.serviceType !== 'transport' && formData.releaseType !== 'not_required') {
      if (formData.releaseType === 'original') {
        carrierReleaseStatus = 'pending_mail'
      } else {
        carrierReleaseStatus = 'pending_release'
      }
    }

    // 创建新订单
    const newOrder = {
      id: String(orders.length + 1),
      orderNo: `ORD-2024-${String(orders.length + 1).padStart(4, '0')}`,
      serviceType: formData.serviceType,
      status: 'pending',
      goodsDescription: formData.goodsDescription,
      createTime: new Date().toLocaleString('zh-CN'),
      blNumber: formData.blNumber,
      shippingLine: formData.shippingLine,
      cargoType: formData.cargoType,
      warehouseAddress: formData.warehouseAddress,
      carrierReleaseStatus,
      customsClearanceStatus: 'pending' as CustomsClearanceStatus,
      deliveryStatus: 'waiting' as DeliveryStatus,
    }

    setOrders([newOrder, ...orders])
    handleCloseModal()
    alert('订单创建成功！')
  }
  
  // 确认清关完成
  const handleConfirmCustomsClearance = (orderId: string) => {
    if (confirm('确认清关已完成？')) {
      setOrders(orders.map(order => 
        order.id === orderId 
          ? { ...order, customsClearanceStatus: 'cleared' as CustomsClearanceStatus }
          : order
      ))
      alert('清关状态已更新')
    }
  }
  
  // 确认派送完成
  const handleConfirmDeliveryComplete = (orderId: string) => {
    if (confirm('确认派送已完成？')) {
      setOrders(orders.map(order => 
        order.id === orderId 
          ? { ...order, deliveryStatus: 'completed' as DeliveryStatus }
          : order
      ))
      alert('派送状态已更新')
    }
  }

  // 筛选和排序订单
  const filteredOrders = orders
    .filter(order => {
      // 搜索筛选
      const matchSearch = searchQuery === '' ||
        order.orderNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.goodsDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.blNumber.toLowerCase().includes(searchQuery.toLowerCase())
      
      // 状态筛选
      const matchStatus = filterStatus === '' || order.status === filterStatus
      
      // 派送状态筛选
      const matchDeliveryStatus = filterDeliveryStatus === '' || order.deliveryStatus === filterDeliveryStatus
      
      // 船司放单状态筛选
      const matchCarrierReleaseStatus = filterCarrierReleaseStatus === '' || order.carrierReleaseStatus === filterCarrierReleaseStatus
      
      // 时间范围筛选
      const orderDate = new Date(order.createTime.replace(' ', 'T'))
      const matchStartDate = filterStartDate === '' || orderDate >= new Date(filterStartDate)
      const matchEndDate = filterEndDate === '' || orderDate <= new Date(filterEndDate + 'T23:59:59')
      
      return matchSearch && matchStatus && matchDeliveryStatus && matchCarrierReleaseStatus && matchStartDate && matchEndDate
    })
    .sort((a, b) => {
      let comparison = 0
      if (sortBy === 'createTime') {
        comparison = new Date(a.createTime).getTime() - new Date(b.createTime).getTime()
      } else if (sortBy === 'orderNo') {
        comparison = a.orderNo.localeCompare(b.orderNo)
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
  
  // 切换排序
  const toggleSort = (field: 'createTime' | 'orderNo') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }
  
  // 清除筛选
  const clearFilters = () => {
    setFilterStatus('')
    setFilterDeliveryStatus('')
    setFilterCarrierReleaseStatus('')
    setFilterStartDate('')
    setFilterEndDate('')
    setSearchQuery('')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">我的订单</h1>
          <p className="text-gray-500 mt-1">查看和管理您的所有订单</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          新建订单
        </button>
      </div>

      {/* Search & Filter */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索订单号、货物描述、提单号..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <button 
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`flex items-center justify-center px-4 py-2.5 border rounded-lg transition-colors ${
              showFilterPanel ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-300 hover:bg-gray-50 text-gray-700'
            }`}
          >
            <Filter className="w-5 h-5 mr-2" />
            筛选
            <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${showFilterPanel ? 'rotate-180' : ''}`} />
          </button>
          <button 
            onClick={() => toggleSort('createTime')}
            className="flex items-center justify-center px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
          >
            <ArrowUpDown className="w-5 h-5 mr-2" />
            {sortBy === 'createTime' ? '按时间' : '按订单号'}
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
        
        {/* Filter Panel */}
        {showFilterPanel && (
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 时间范围 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  开始日期
                </label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  结束日期
                </label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              
              {/* 船司放单状态 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">船司放单</label>
                <select
                  value={filterCarrierReleaseStatus}
                  onChange={(e) => setFilterCarrierReleaseStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">全部</option>
                  {Object.entries(carrierReleaseStatusLabels).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              
              {/* 派送状态 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">派送状态</label>
                <select
                  value={filterDeliveryStatus}
                  onChange={(e) => setFilterDeliveryStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">全部</option>
                  {Object.entries(deliveryStatusLabels).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 订单状态 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">订单状态</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">全部</option>
                  <option value="pending">待处理</option>
                  <option value="processing">处理中</option>
                  <option value="completed">已完成</option>
                  <option value="cancelled">已取消</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end">
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                清除筛选
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-lg font-medium text-gray-600">暂无订单</p>
            <p className="text-sm mt-1">点击"新建订单"创建您的第一个订单</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">订单信息</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">船公司/提单号</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">船司放单</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">清关放行</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">货物类型</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">送仓地址</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">派送状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOrders.map((order) => {
                  const serviceInfo = serviceTypeLabels[order.serviceType]
                  const cargoInfo = cargoTypeLabels[order.cargoType]
                  const carrierReleaseInfo = carrierReleaseStatusLabels[order.carrierReleaseStatus]
                  const customsClearanceInfo = customsClearanceStatusLabels[order.customsClearanceStatus]
                  const deliveryInfo = deliveryStatusLabels[order.deliveryStatus]
                  const CargoIcon = cargoInfo.icon
                  
                  return (
                    <tr key={order.id} className="hover:bg-gray-50">
                      {/* 订单信息 */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${serviceInfo.color}`}>
                            <serviceInfo.icon className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{order.orderNo}</p>
                            <p className="text-xs text-gray-500">{order.goodsDescription}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{order.createTime}</p>
                          </div>
                        </div>
                      </td>
                      
                      {/* 船公司/提单号 */}
                      <td className="px-4 py-4">
                        {order.blNumber ? (
                          <div>
                            <p className="text-sm font-medium text-gray-900">{order.shippingLine || '-'}</p>
                            <p className="text-xs text-gray-500">{order.blNumber}</p>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </td>
                      
                      {/* 船司放单 */}
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${carrierReleaseInfo.color}`}>
                          {carrierReleaseInfo.label}
                        </span>
                      </td>
                      
                      {/* 清关放行 */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${customsClearanceInfo.color}`}>
                            {customsClearanceInfo.label}
                          </span>
                          {order.customsClearanceStatus === 'pending' && (
                            <button
                              onClick={() => handleConfirmCustomsClearance(order.id)}
                              className="text-xs text-primary-600 hover:text-primary-700 hover:underline"
                            >
                              确认完成
                            </button>
                          )}
                        </div>
                      </td>
                      
                      {/* 货物类型 */}
                      <td className="px-4 py-4">
                        <div className={`flex items-center gap-1 ${cargoInfo.color}`}>
                          {CargoIcon && <CargoIcon className="w-4 h-4" />}
                          <span className="text-sm">{cargoInfo.label}</span>
                        </div>
                      </td>
                      
                      {/* 送仓地址 */}
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-1 max-w-[150px]">
                          <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-600 truncate" title={order.warehouseAddress}>
                            {order.warehouseAddress || '-'}
                          </span>
                        </div>
                      </td>
                      
                      {/* 派送状态 */}
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${deliveryInfo.color}`}>
                          {deliveryInfo.label}
                        </span>
                      </td>
                      
                      {/* 操作 */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          {order.deliveryStatus === 'in_transit' && (
                            <button
                              onClick={() => handleConfirmDeliveryComplete(order.id)}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100"
                            >
                              <CheckCircle className="w-3 h-3" />
                              确认完成
                            </button>
                          )}
                          <button className="text-primary-600 hover:text-primary-700 text-sm">
                            详情
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 创建订单弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">新建订单</h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* 表单内容 */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* 业务类型选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  选择业务类型 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {/* 放单服务 */}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, serviceType: 'release', releaseType: 'telex' })}
                    className={`relative p-4 rounded-lg border-2 transition-all ${
                      formData.serviceType === 'release'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {formData.serviceType === 'release' && (
                      <div className="absolute top-2 right-2">
                        <Check className="w-4 h-4 text-blue-500" />
                      </div>
                    )}
                    <FileCheck className={`w-8 h-8 mx-auto mb-2 ${
                      formData.serviceType === 'release' ? 'text-blue-500' : 'text-gray-400'
                    }`} />
                    <p className={`text-sm font-medium ${
                      formData.serviceType === 'release' ? 'text-blue-700' : 'text-gray-700'
                    }`}>放单服务</p>
                    <p className="text-xs text-gray-500 mt-1">提单放货服务</p>
                  </button>

                  {/* 运输服务 */}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, serviceType: 'transport', releaseType: 'not_required' })}
                    className={`relative p-4 rounded-lg border-2 transition-all ${
                      formData.serviceType === 'transport'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {formData.serviceType === 'transport' && (
                      <div className="absolute top-2 right-2">
                        <Check className="w-4 h-4 text-green-500" />
                      </div>
                    )}
                    <Truck className={`w-8 h-8 mx-auto mb-2 ${
                      formData.serviceType === 'transport' ? 'text-green-500' : 'text-gray-400'
                    }`} />
                    <p className={`text-sm font-medium ${
                      formData.serviceType === 'transport' ? 'text-green-700' : 'text-gray-700'
                    }`}>运输服务</p>
                    <p className="text-xs text-gray-500 mt-1">货物配送运输</p>
                  </button>

                  {/* 放单+运输 */}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, serviceType: 'both', releaseType: 'telex' })}
                    className={`relative p-4 rounded-lg border-2 transition-all ${
                      formData.serviceType === 'both'
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {formData.serviceType === 'both' && (
                      <div className="absolute top-2 right-2">
                        <Check className="w-4 h-4 text-purple-500" />
                      </div>
                    )}
                    <Package className={`w-8 h-8 mx-auto mb-2 ${
                      formData.serviceType === 'both' ? 'text-purple-500' : 'text-gray-400'
                    }`} />
                    <p className={`text-sm font-medium ${
                      formData.serviceType === 'both' ? 'text-purple-700' : 'text-gray-700'
                    }`}>放单+运输</p>
                    <p className="text-xs text-gray-500 mt-1">全程物流服务</p>
                  </button>
                </div>
              </div>

              {/* 放单信息 - 仅当选择放单或全程服务时显示 */}
              {(formData.serviceType === 'release' || formData.serviceType === 'both') && (
                <div className="p-4 bg-blue-50 rounded-lg space-y-4">
                  <h3 className="font-medium text-blue-800 flex items-center gap-2">
                    <FileCheck className="w-4 h-4" />
                    放单信息
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        提单号 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.blNumber}
                        onChange={(e) => setFormData({ ...formData, blNumber: e.target.value })}
                        placeholder="例如：COSU6285471520"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        船公司
                      </label>
                      <select
                        value={formData.shippingLine}
                        onChange={(e) => setFormData({ ...formData, shippingLine: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">选择船公司</option>
                        {shippingLines.map((line) => (
                          <option key={line.code} value={line.code}>{line.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  {/* 放单类型选择 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      放单类型 <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['original', 'telex', 'seaway'] as ReleaseType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFormData({ ...formData, releaseType: type })}
                          className={`px-3 py-2 text-sm rounded-lg border-2 transition-all ${
                            formData.releaseType === type
                              ? 'border-blue-500 bg-blue-100 text-blue-700'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {releaseTypeLabels[type]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 运输信息 - 仅当选择运输或全程服务时显示 */}
              {(formData.serviceType === 'transport' || formData.serviceType === 'both') && (
                <div className="p-4 bg-green-50 rounded-lg space-y-4">
                  <h3 className="font-medium text-green-800 flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    运输信息
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        提货地址
                      </label>
                      <input
                        type="text"
                        value={formData.pickupAddress}
                        onChange={(e) => setFormData({ ...formData, pickupAddress: e.target.value })}
                        placeholder="港口/仓库地址"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        送仓地址 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.warehouseAddress}
                        onChange={(e) => setFormData({ ...formData, warehouseAddress: e.target.value })}
                        placeholder="最终送货仓库地址"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 货物信息 */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-800">货物信息</h3>
                
                {/* 货物类型选择 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    货物类型 <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, cargoType: 'general' })}
                      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                        formData.cargoType === 'general'
                          ? 'border-gray-500 bg-gray-100'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Package className="w-4 h-4 text-gray-500" />
                      <span className="text-sm">普货</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, cargoType: 'dangerous' })}
                      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                        formData.cargoType === 'dangerous'
                          ? 'border-red-500 bg-red-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <span className="text-sm text-red-600">危险品</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, cargoType: 'temperature_controlled' })}
                      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                        formData.cargoType === 'temperature_controlled'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Thermometer className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-blue-600">温控</span>
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    货物描述 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.goodsDescription}
                    onChange={(e) => setFormData({ ...formData, goodsDescription: e.target.value })}
                    placeholder="请描述货物内容"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">件数</label>
                    <input
                      type="number"
                      value={formData.packages}
                      onChange={(e) => setFormData({ ...formData, packages: e.target.value })}
                      placeholder="件"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">毛重</label>
                    <input
                      type="number"
                      value={formData.grossWeight}
                      onChange={(e) => setFormData({ ...formData, grossWeight: e.target.value })}
                      placeholder="KG"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">体积</label>
                    <input
                      type="number"
                      value={formData.volume}
                      onChange={(e) => setFormData({ ...formData, volume: e.target.value })}
                      placeholder="CBM"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>
              </div>

              {/* 备注 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  placeholder="其他需要说明的信息..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              {/* 提交按钮 */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  提交订单
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
