import { useState, useEffect } from 'react'
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
  Package,
  MapPin,
  Truck,
  Box,
  FileText,
  DollarSign,
  AlertTriangle,
  Thermometer,
  Shield,
  Plane,
  Ship,
  Train,
  Building2,
  User,
  Phone,
  Mail,
  Calendar,
  Globe,
  Copy,
  CheckCircle,
  ArrowRight,
  Clock,
  MoreHorizontal,
  FileCheck,
  Anchor,
  Navigation,
  Loader2,
  Ban
} from 'lucide-react'
import { deleteOrder, voidOrder, createOrder, updateOrder } from '../utils/api'

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
  { code: 'PIL', name: 'PIL 太平船务' },
  { code: 'WANHAI', name: 'Wan Hai 万海航运' },
]

// 集装箱类型
const containerTypes = [
  { code: '20GP', name: "20' 普通箱", teu: 1 },
  { code: '40GP', name: "40' 普通箱", teu: 2 },
  { code: '40HC', name: "40' 高柜", teu: 2 },
  { code: '45HC', name: "45' 高柜", teu: 2.25 },
  { code: '20RF', name: "20' 冷藏箱", teu: 1 },
  { code: '40RF', name: "40' 冷藏箱", teu: 2 },
  { code: '20OT', name: "20' 开顶箱", teu: 1 },
  { code: '40OT', name: "40' 开顶箱", teu: 2 },
  { code: '20FR', name: "20' 框架箱", teu: 1 },
  { code: '40FR', name: "40' 框架箱", teu: 2 },
  { code: '20TK', name: "20' 罐箱", teu: 1 },
]

// 业务类型配置
type BusinessType = 'release' | 'transport' | 'both'
type ReleaseStatus = 'pending' | 'released' | 'not_required'
// 船司放单状态
type CarrierReleaseStatus = 'not_required' | 'pending_mail' | 'mailed' | 'pending_release' | 'released'
// 清关状态
type CustomsClearanceStatus = 'pending' | 'cleared'
// 派送状态
type DeliveryStatus = 'waiting' | 'fleet_confirmed' | 'in_transit' | 'completed' | 'abnormal' | 'cmr_received'
// 货物类型
type CargoType = 'general' | 'dangerous' | 'temperature_controlled'

const businessTypeMap: Record<BusinessType, { label: string; color: string }> = {
  release: { label: '放单服务', color: 'bg-blue-100 text-blue-700' },
  transport: { label: '运输服务', color: 'bg-green-100 text-green-700' },
  both: { label: '放单+运输', color: 'bg-purple-100 text-purple-700' }
}

const releaseStatusMap: Record<ReleaseStatus, { label: string; color: string }> = {
  pending: { label: '待放单', color: 'bg-orange-100 text-orange-700' },
  released: { label: '已放单', color: 'bg-green-100 text-green-700' },
  not_required: { label: '-', color: 'bg-gray-100 text-gray-500' }
}

// 船司放单状态标签
const carrierReleaseStatusMap: Record<CarrierReleaseStatus, { label: string; color: string }> = {
  not_required: { label: '否', color: 'bg-gray-100 text-gray-500' },
  pending_mail: { label: '正本待邮寄', color: 'bg-orange-100 text-orange-700' },
  mailed: { label: '正本已邮寄', color: 'bg-blue-100 text-blue-700' },
  pending_release: { label: '待放行', color: 'bg-yellow-100 text-yellow-700' },
  released: { label: '船司放行', color: 'bg-green-100 text-green-700' }
}

// 清关状态标签
const customsClearanceStatusMap: Record<CustomsClearanceStatus, { label: string; color: string }> = {
  pending: { label: '待清关', color: 'bg-yellow-100 text-yellow-700' },
  cleared: { label: '已放行', color: 'bg-green-100 text-green-700' }
}

// 派送状态标签
const deliveryStatusMap: Record<DeliveryStatus, { label: string; color: string }> = {
  waiting: { label: '等待安排', color: 'bg-gray-100 text-gray-600' },
  fleet_confirmed: { label: '车队已确认', color: 'bg-blue-100 text-blue-700' },
  in_transit: { label: '运输中', color: 'bg-blue-100 text-blue-700' },
  completed: { label: '完成', color: 'bg-green-100 text-green-700' },
  abnormal: { label: '状态异常', color: 'bg-red-100 text-red-700' },
  cmr_received: { label: 'CMR已回传', color: 'bg-green-100 text-green-700' }
}

// 货物类型标签
const cargoTypeMap: Record<CargoType, { label: string; color: string }> = {
  general: { label: '普货', color: 'text-gray-600' },
  dangerous: { label: '危险品', color: 'text-red-600' },
  temperature_controlled: { label: '温控', color: 'text-blue-600' }
}

// 扩展的模拟订单数据 - 符合欧洲运输标准
const mockOrders = [
  { 
    id: '1', 
    orderNo: 'ORD-2024-0001', 
    customerName: '德国物流有限公司',
    customerRef: 'PO-DE-2024-001',
    status: 'completed', 
    totalAmount: 1250.00, 
    currency: 'EUR', 
    createTime: '2024-01-15 10:30', 
    operator: '张三',
    orderType: 'import',
    transportMode: 'sea',
    incoterms: 'DDP',
    origin: { port: '上海', country: 'CN' },
    destination: { port: 'Hamburg', country: 'DE' },
    etd: '2024-01-20',
    eta: '2024-02-15',
    packages: 25,
    grossWeight: 1250,
    volume: 8.5,
    isDangerous: false,
    requiresTemperatureControl: false,
    customsClearance: 'destination',
    shipperCompany: '上海国际贸易有限公司',
    consigneeCompany: '德国物流有限公司',
    // 船公司信息
    shippingLine: 'COSCO',
    vesselName: 'COSCO SHIPPING ARIES',
    voyageNo: '025E',
    blNumber: 'COSU6285471520',
    bookingNo: 'BK2024011500123',
    // 集装箱信息
    containers: [
      { containerNo: 'CSLU2185476', type: '40HC', sealNo: 'CN2024001', vgm: 28500 }
    ],
    // 业务类型
    businessType: 'both' as BusinessType,
    releaseStatus: 'released' as ReleaseStatus,
    // 新增状态字段
    carrierReleaseStatus: 'released' as CarrierReleaseStatus,
    customsClearanceStatus: 'cleared' as CustomsClearanceStatus,
    deliveryStatus: 'completed' as DeliveryStatus,
    warehouseAddress: 'Hamburg, Hafenstraße 123'
  },
  { 
    id: '2', 
    orderNo: 'ORD-2024-0002', 
    customerName: '欧洲快递服务',
    customerRef: 'REF-EU-8876',
    status: 'shipping', 
    totalAmount: 890.50, 
    currency: 'EUR', 
    createTime: '2024-01-15 11:45', 
    operator: '李四',
    orderType: 'import',
    transportMode: 'air',
    incoterms: 'DAP',
    origin: { port: '深圳', country: 'CN' },
    destination: { port: 'Frankfurt', country: 'DE' },
    etd: '2024-01-16',
    eta: '2024-01-18',
    packages: 5,
    grossWeight: 120,
    volume: 0.8,
    isDangerous: false,
    requiresTemperatureControl: true,
    customsClearance: 'both',
    shipperCompany: '深圳电子科技公司',
    consigneeCompany: '欧洲快递服务',
    shippingLine: '',
    vesselName: '',
    voyageNo: '',
    blNumber: '',
    bookingNo: '',
    containers: [],
    // 业务类型
    businessType: 'transport' as BusinessType,
    releaseStatus: 'not_required' as ReleaseStatus,
    // 新增状态字段
    carrierReleaseStatus: 'not_required' as CarrierReleaseStatus,
    customsClearanceStatus: 'cleared' as CustomsClearanceStatus,
    deliveryStatus: 'in_transit' as DeliveryStatus,
    warehouseAddress: 'Frankfurt, Logistikpark 88'
  },
  { 
    id: '3', 
    orderNo: 'ORD-2024-0003', 
    customerName: '柏林贸易公司',
    customerRef: 'BTC-2024-0156',
    status: 'pending', 
    totalAmount: 2100.00, 
    currency: 'EUR', 
    createTime: '2024-01-15 14:20', 
    operator: '张三',
    orderType: 'import',
    transportMode: 'rail',
    incoterms: 'CIF',
    origin: { port: '义乌', country: 'CN' },
    destination: { port: 'Berlin', country: 'DE' },
    etd: '2024-01-25',
    eta: '2024-02-22',
    packages: 50,
    grossWeight: 3500,
    volume: 25,
    isDangerous: true,
    requiresTemperatureControl: false,
    customsClearance: 'destination',
    shipperCompany: '义乌小商品批发',
    consigneeCompany: '柏林贸易公司',
    shippingLine: '',
    vesselName: '',
    voyageNo: '',
    blNumber: 'RAIL2024001BL',
    bookingNo: '',
    containers: [
      { containerNo: 'TEMU8876543', type: '40HC', sealNo: 'RAIL2024001', vgm: 26800 }
    ],
    // 业务类型 - 近期到港 + 需放单
    businessType: 'both' as BusinessType,
    releaseStatus: 'pending' as ReleaseStatus,
    carrierReleaseStatus: 'pending_release' as CarrierReleaseStatus,
    customsClearanceStatus: 'pending' as CustomsClearanceStatus,
    deliveryStatus: 'waiting' as DeliveryStatus,
    warehouseAddress: 'Berlin, Industriestr. 200'
  },
  { 
    id: '4', 
    orderNo: 'ORD-2024-0004', 
    customerName: '慕尼黑电子商务',
    customerRef: '',
    status: 'draft', 
    totalAmount: 560.75, 
    currency: 'EUR', 
    createTime: '2024-01-15 15:00', 
    operator: '王五',
    orderType: 'import',
    transportMode: 'air',
    incoterms: 'EXW',
    origin: { port: '广州', country: 'CN' },
    destination: { port: 'Munich', country: 'DE' },
    etd: '',
    eta: '',
    packages: 10,
    grossWeight: 85,
    volume: 0.5,
    isDangerous: false,
    requiresTemperatureControl: false,
    customsClearance: 'none',
    shipperCompany: '广州电子配件厂',
    consigneeCompany: '慕尼黑电子商务',
    shippingLine: '',
    vesselName: '',
    voyageNo: '',
    blNumber: '',
    bookingNo: '',
    containers: [],
    // 业务类型
    businessType: 'release' as BusinessType,
    releaseStatus: 'pending' as ReleaseStatus,
    carrierReleaseStatus: 'pending_mail' as CarrierReleaseStatus,
    customsClearanceStatus: 'pending' as CustomsClearanceStatus,
    deliveryStatus: 'waiting' as DeliveryStatus,
    warehouseAddress: 'Munich, Frachtweg 45'
  },
  { 
    id: '5', 
    orderNo: 'ORD-2024-0005', 
    customerName: '法兰克福进出口',
    customerRef: 'FFM-IMP-2024-088',
    status: 'completed', 
    totalAmount: 3200.00, 
    currency: 'EUR', 
    createTime: '2024-01-14 09:15', 
    operator: '李四',
    orderType: 'import',
    transportMode: 'sea',
    incoterms: 'FOB',
    origin: { port: '宁波', country: 'CN' },
    destination: { port: 'Rotterdam', country: 'NL' },
    etd: '2024-01-05',
    eta: '2024-02-01',
    packages: 120,
    grossWeight: 8500,
    volume: 45,
    isDangerous: false,
    requiresTemperatureControl: false,
    customsClearance: 'both',
    shipperCompany: '宁波外贸集团',
    consigneeCompany: '法兰克福进出口',
    shippingLine: 'MAERSK',
    vesselName: 'MAERSK SELETAR',
    voyageNo: '401W',
    blNumber: 'MAEU285743210',
    bookingNo: 'BK2024010500456',
    containers: [
      { containerNo: 'MSKU9876543', type: '40HC', sealNo: 'NB2024005A', vgm: 27200 },
      { containerNo: 'MSKU9876544', type: '40HC', sealNo: 'NB2024005B', vgm: 28100 }
    ],
    // 业务类型
    businessType: 'both' as BusinessType,
    releaseStatus: 'released' as ReleaseStatus,
    carrierReleaseStatus: 'released' as CarrierReleaseStatus,
    customsClearanceStatus: 'cleared' as CustomsClearanceStatus,
    deliveryStatus: 'cmr_received' as DeliveryStatus,
    warehouseAddress: 'Rotterdam, Port Terminal 8'
  },
  { 
    id: '6', 
    orderNo: 'ORD-2024-0006', 
    customerName: '汉堡国际物流',
    customerRef: 'HH-LOG-0099',
    status: 'shipping', 
    totalAmount: 1800.25, 
    currency: 'EUR', 
    createTime: '2024-01-14 16:30', 
    operator: '张三',
    orderType: 'import',
    transportMode: 'sea',
    incoterms: 'CIF',
    origin: { port: '青岛', country: 'CN' },
    destination: { port: 'Hamburg', country: 'DE' },
    etd: '2024-01-10',
    eta: '2024-02-20',
    packages: 35,
    grossWeight: 2800,
    volume: 18,
    isDangerous: true,
    requiresTemperatureControl: false,
    customsClearance: 'destination',
    shipperCompany: '青岛化工有限公司',
    consigneeCompany: '汉堡国际物流',
    shippingLine: 'HAPAG',
    vesselName: 'HAMBURG EXPRESS',
    voyageNo: '118E',
    blNumber: 'HLCU8574329100',
    bookingNo: 'BK2024011000789',
    containers: [
      { containerNo: 'HLXU7654321', type: '20GP', sealNo: 'QD2024006', vgm: 18500 }
    ],
    // 业务类型 - 近期到港 + 需放单
    businessType: 'release' as BusinessType,
    releaseStatus: 'pending' as ReleaseStatus,
    carrierReleaseStatus: 'mailed' as CarrierReleaseStatus,
    customsClearanceStatus: 'pending' as CustomsClearanceStatus,
    deliveryStatus: 'fleet_confirmed' as DeliveryStatus,
    warehouseAddress: 'Hamburg, Logistikzentrum 5'
  },
  { 
    id: '7', 
    orderNo: 'ORD-2024-0007', 
    customerName: '科隆仓储配送',
    customerRef: 'KOL-WH-2024',
    status: 'cancelled', 
    totalAmount: 450.00, 
    currency: 'EUR', 
    createTime: '2024-01-13 11:00', 
    operator: '王五',
    orderType: 'domestic',
    transportMode: 'road',
    incoterms: 'DDP',
    origin: { port: 'Hamburg', country: 'DE' },
    destination: { port: 'Cologne', country: 'DE' },
    etd: '2024-01-15',
    eta: '2024-01-16',
    packages: 15,
    grossWeight: 450,
    volume: 3.2,
    isDangerous: false,
    requiresTemperatureControl: true,
    customsClearance: 'none',
    shipperCompany: '汉堡仓库',
    consigneeCompany: '科隆仓储配送',
    shippingLine: '',
    vesselName: '',
    voyageNo: '',
    blNumber: '',
    bookingNo: '',
    containers: [
      { containerNo: 'HLXU7654321', type: '40RF', sealNo: 'HH2024007', vgm: 15200 }
    ],
    // 业务类型 - 仅运输
    businessType: 'transport' as BusinessType,
    releaseStatus: 'not_required' as ReleaseStatus,
    carrierReleaseStatus: 'not_required' as CarrierReleaseStatus,
    customsClearanceStatus: 'cleared' as CustomsClearanceStatus,
    deliveryStatus: 'abnormal' as DeliveryStatus,
    warehouseAddress: 'Cologne, Lagerhaus 22'
  },
  { 
    id: '8', 
    orderNo: 'ORD-2024-0008', 
    customerName: '杜塞尔多夫贸易',
    customerRef: 'DUS-TR-2024-012',
    status: 'pending', 
    totalAmount: 1650.50, 
    currency: 'EUR', 
    createTime: '2024-01-13 14:45', 
    operator: '李四',
    orderType: 'import',
    transportMode: 'multimodal',
    incoterms: 'DAP',
    origin: { port: '天津', country: 'CN' },
    destination: { port: 'Düsseldorf', country: 'DE' },
    etd: '2024-01-20',
    eta: '2024-02-21',
    packages: 40,
    grossWeight: 2200,
    volume: 15,
    isDangerous: false,
    requiresTemperatureControl: false,
    customsClearance: 'destination',
    shipperCompany: '天津进出口贸易公司',
    consigneeCompany: '杜塞尔多夫贸易',
    shippingLine: 'CMACGM',
    vesselName: 'CMA CGM MARCO POLO',
    voyageNo: '0FL78W1MA',
    blNumber: 'CMAU2857431000',
    bookingNo: 'BK2024012000321',
    containers: [
      { containerNo: 'CMAU5432167', type: '40HC', sealNo: 'TJ2024008', vgm: 25600 }
    ],
    // 业务类型 - 近期到港 + 需放单
    businessType: 'both' as BusinessType,
    releaseStatus: 'pending' as ReleaseStatus,
    carrierReleaseStatus: 'pending_release' as CarrierReleaseStatus,
    customsClearanceStatus: 'pending' as CustomsClearanceStatus,
    deliveryStatus: 'waiting' as DeliveryStatus,
    warehouseAddress: 'Düsseldorf, Logistikpark 15'
  },
]

const statusMap: Record<string, { label: string; color: string; bgColor: string }> = {
  draft: { label: '草稿', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  pending: { label: '待处理', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  confirmed: { label: '已确认', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  shipping: { label: '运输中', color: 'text-indigo-700', bgColor: 'bg-indigo-50' },
  customs: { label: '清关中', color: 'text-purple-700', bgColor: 'bg-purple-50' },
  completed: { label: '已完成', color: 'text-green-700', bgColor: 'bg-green-50' },
  cancelled: { label: '已取消', color: 'text-red-700', bgColor: 'bg-red-50' },
}

const transportModeMap: Record<string, { label: string; icon: typeof Plane; color: string }> = {
  air: { label: '空运', icon: Plane, color: 'text-sky-600' },
  sea: { label: '海运', icon: Ship, color: 'text-blue-600' },
  road: { label: '陆运', icon: Truck, color: 'text-orange-600' },
  rail: { label: '铁路', icon: Train, color: 'text-emerald-600' },
  multimodal: { label: '多式联运', icon: Box, color: 'text-purple-600' },
}

const orderTypeMap: Record<string, { label: string; color: string }> = {
  import: { label: '进口', color: 'text-blue-600 bg-blue-50' },
  export: { label: '出口', color: 'text-green-600 bg-green-50' },
  domestic: { label: '国内', color: 'text-gray-600 bg-gray-100' },
}

// Incoterms 2020 贸易术语
const incotermsOptions = [
  { value: 'EXW', label: 'EXW - 工厂交货', group: '任何运输方式' },
  { value: 'FCA', label: 'FCA - 货交承运人', group: '任何运输方式' },
  { value: 'CPT', label: 'CPT - 运费付至', group: '任何运输方式' },
  { value: 'CIP', label: 'CIP - 运费保险费付至', group: '任何运输方式' },
  { value: 'DAP', label: 'DAP - 目的地交货', group: '任何运输方式' },
  { value: 'DPU', label: 'DPU - 卸货地交货', group: '任何运输方式' },
  { value: 'DDP', label: 'DDP - 完税后交货', group: '任何运输方式' },
  { value: 'FAS', label: 'FAS - 船边交货', group: '海运/内河' },
  { value: 'FOB', label: 'FOB - 船上交货', group: '海运/内河' },
  { value: 'CFR', label: 'CFR - 成本加运费', group: '海运/内河' },
  { value: 'CIF', label: 'CIF - 成本保险费加运费', group: '海运/内河' },
]

// 服务类型
const serviceTypes = [
  { value: 'door_to_door', label: '门到门 (Door to Door)' },
  { value: 'door_to_port', label: '门到港 (Door to Port)' },
  { value: 'port_to_door', label: '港到门 (Port to Door)' },
  { value: 'port_to_port', label: '港到港 (Port to Port)' },
]

// 包装类型
const packageTypes = [
  { value: 'carton', label: '纸箱 (Carton)' },
  { value: 'pallet', label: '托盘 (Pallet)' },
  { value: 'wooden_case', label: '木箱 (Wooden Case)' },
  { value: 'bag', label: '袋装 (Bag)' },
  { value: 'drum', label: '桶装 (Drum)' },
  { value: 'container_20', label: "20'集装箱 (20' Container)" },
  { value: 'container_40', label: "40'集装箱 (40' Container)" },
  { value: 'container_40hc', label: "40'高柜 (40' HC)" },
  { value: 'bulk', label: '散装 (Bulk)' },
  { value: 'other', label: '其他 (Other)' },
]

// 欧洲国家列表
const europeanCountries = [
  { code: 'DE', name: '德国', nameEn: 'Germany' },
  { code: 'FR', name: '法国', nameEn: 'France' },
  { code: 'NL', name: '荷兰', nameEn: 'Netherlands' },
  { code: 'BE', name: '比利时', nameEn: 'Belgium' },
  { code: 'AT', name: '奥地利', nameEn: 'Austria' },
  { code: 'PL', name: '波兰', nameEn: 'Poland' },
  { code: 'CZ', name: '捷克', nameEn: 'Czech Republic' },
  { code: 'IT', name: '意大利', nameEn: 'Italy' },
  { code: 'ES', name: '西班牙', nameEn: 'Spain' },
  { code: 'PT', name: '葡萄牙', nameEn: 'Portugal' },
  { code: 'GB', name: '英国', nameEn: 'United Kingdom' },
  { code: 'CH', name: '瑞士', nameEn: 'Switzerland' },
  { code: 'DK', name: '丹麦', nameEn: 'Denmark' },
  { code: 'SE', name: '瑞典', nameEn: 'Sweden' },
  { code: 'NO', name: '挪威', nameEn: 'Norway' },
  { code: 'FI', name: '芬兰', nameEn: 'Finland' },
  { code: 'CN', name: '中国', nameEn: 'China' },
  { code: 'HK', name: '香港', nameEn: 'Hong Kong' },
  { code: 'US', name: '美国', nameEn: 'United States' },
]

// 国家代码映射
const countryNames: Record<string, string> = {
  DE: '德国', FR: '法国', NL: '荷兰', BE: '比利时', AT: '奥地利',
  PL: '波兰', CZ: '捷克', IT: '意大利', ES: '西班牙', PT: '葡萄牙',
  GB: '英国', CH: '瑞士', DK: '丹麦', SE: '瑞典', NO: '挪威',
  FI: '芬兰', CN: '中国', HK: '香港', US: '美国'
}

// 集装箱数据接口
interface ContainerData {
  containerNo: string
  type: string
  sealNo: string
  vgm: number | string
}

// 航空公司列表
const airlines = [
  { code: 'LH', name: 'Lufthansa 汉莎航空' },
  { code: 'CA', name: 'Air China 中国国航' },
  { code: 'CZ', name: 'China Southern 南方航空' },
  { code: 'MU', name: 'China Eastern 东方航空' },
  { code: 'AF', name: 'Air France 法国航空' },
  { code: 'KL', name: 'KLM 荷兰皇家航空' },
  { code: 'EK', name: 'Emirates 阿联酋航空' },
  { code: 'TK', name: 'Turkish Airlines 土耳其航空' },
  { code: 'QR', name: 'Qatar Airways 卡塔尔航空' },
  { code: 'SQ', name: 'Singapore Airlines 新加坡航空' },
]

// 铁路运营商
const railOperators = [
  { code: 'CRCT', name: '中欧班列 China Railway' },
  { code: 'DB', name: 'DB Cargo 德铁货运' },
  { code: 'UTLC', name: 'UTLC 统一运输物流公司' },
  { code: 'RZD', name: 'RZD 俄罗斯铁路' },
]

// 简化的订单表单数据接口
interface OrderFormData {
  // 基本信息
  orderType: 'import' | 'export' | 'domestic'
  customerId: string
  customerName: string
  customerRef: string
  
  // 业务类型
  businessType: BusinessType
  releaseStatus: ReleaseStatus
  
  // 运输方式 & 路线
  transportMode: 'air' | 'sea' | 'road' | 'rail' | 'multimodal'
  incoterms: string
  originPort: string
  originCountry: string
  destinationPort: string
  destinationCountry: string
  etd: string
  eta: string
  
  // 海运信息
  shippingLine: string
  vesselName: string
  voyageNo: string
  blNumber: string
  bookingNo: string
  containers: ContainerData[]
  
  // 空运信息
  airline: string
  flightNo: string
  mawbNo: string
  hawbNo: string
  
  // 陆运信息
  truckPlate: string
  trailerPlate: string
  driverName: string
  driverPhone: string
  
  // 铁路信息
  railOperator: string
  trainNo: string
  wagonNo: string
  railContainers: ContainerData[]
  
  // 货物信息 (简化)
  goodsDescription: string
  packages: string
  grossWeight: string
  volume: string
  
  // 特殊标记
  isDangerous: boolean
  requiresTemperatureControl: boolean
  
  // 备注
  remarks: string
  
  // 其他
  status: string
  currency: string
  totalAmount: string
}

const initialFormData: OrderFormData = {
  // 基本信息
  orderType: 'import',
  customerId: '',
  customerName: '',
  customerRef: '',
  
  // 业务类型
  businessType: 'both',
  releaseStatus: 'pending',
  
  // 运输方式 & 路线
  transportMode: 'sea',
  incoterms: 'DDP',
  originPort: '',
  originCountry: 'CN',
  destinationPort: '',
  destinationCountry: 'DE',
  etd: '',
  eta: '',
  
  // 海运信息
  shippingLine: '',
  vesselName: '',
  voyageNo: '',
  blNumber: '',
  bookingNo: '',
  containers: [{ containerNo: '', type: '40HC', sealNo: '', vgm: '' }],
  
  // 空运信息
  airline: '',
  flightNo: '',
  mawbNo: '',
  hawbNo: '',
  
  // 陆运信息
  truckPlate: '',
  trailerPlate: '',
  driverName: '',
  driverPhone: '',
  
  // 铁路信息
  railOperator: '',
  trainNo: '',
  wagonNo: '',
  railContainers: [{ containerNo: '', type: '40HC', sealNo: '', vgm: '' }],
  
  // 货物信息
  goodsDescription: '',
  packages: '',
  grossWeight: '',
  volume: '',
  
  // 特殊标记
  isDangerous: false,
  requiresTemperatureControl: false,
  
  // 备注
  remarks: '',
  
  // 其他
  status: 'draft',
  currency: 'EUR',
  totalAmount: ''
}

// 简化的表单 - 不需要多个标签页

export default function OrderManagement() {
  const [searchKeyword, setSearchKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [transportFilter, setTransportFilter] = useState('all')
  const [businessTypeFilter, setBusinessTypeFilter] = useState('all')
  const [releaseStatusFilter, setReleaseStatusFilter] = useState('all')
  const [carrierReleaseStatusFilter, setCarrierReleaseStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [selectedOrder, setSelectedOrder] = useState<typeof mockOrders[0] | null>(null)
  const [formData, setFormData] = useState<OrderFormData>(initialFormData)
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  
  // 订单列表状态（使用本地状态管理，后续可接入API）
  const [orders, setOrders] = useState(mockOrders)
  
  // 删除相关状态
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showVoidModal, setShowVoidModal] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<typeof mockOrders[0] | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  
  // 船司放单操作弹窗状态
  const [showCarrierReleaseModal, setShowCarrierReleaseModal] = useState(false)
  const [carrierReleaseOrder, setCarrierReleaseOrder] = useState<typeof mockOrders[0] | null>(null)
  const [carrierReleaseForm, setCarrierReleaseForm] = useState({
    status: '' as CarrierReleaseStatus | '',
    mailAddress: '',
    releaseValidUntil: '',
    serviceCompanyId: ''
  })
  
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
  
  // 筛选订单
  const filteredOrders = orders.filter(order => {
    const matchSearch = order.orderNo.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       order.customerName.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       (order.customerRef || '').toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       order.origin.port.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       order.destination.port.toLowerCase().includes(searchKeyword.toLowerCase())
    const matchStatus = statusFilter === 'all' || order.status === statusFilter
    const matchTransport = transportFilter === 'all' || order.transportMode === transportFilter
    const matchBusinessType = businessTypeFilter === 'all' || order.businessType === businessTypeFilter
    const matchReleaseStatus = releaseStatusFilter === 'all' || order.releaseStatus === releaseStatusFilter
    const matchCarrierReleaseStatus = carrierReleaseStatusFilter === 'all' || order.carrierReleaseStatus === carrierReleaseStatusFilter
    return matchSearch && matchStatus && matchTransport && matchBusinessType && matchReleaseStatus && matchCarrierReleaseStatus
  })
  
  const totalPages = Math.ceil(filteredOrders.length / pageSize)
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // 计算总金额
  const calculateTotal = () => {
    const freight = parseFloat(formData.freightCharge) || 0
    const customs = parseFloat(formData.customsFee) || 0
    const insurance = parseFloat(formData.insuranceFee) || 0
    const handling = parseFloat(formData.handlingFee) || 0
    const other = parseFloat(formData.otherFee) || 0
    return (freight + customs + insurance + handling + other).toFixed(2)
  }

  // 打开创建订单弹窗
  const handleCreate = () => {
    setModalMode('create')
    setFormData(initialFormData)
    setShowModal(true)
  }

  // 打开编辑订单弹窗
  const handleEdit = (order: typeof mockOrders[0]) => {
    setModalMode('edit')
    setSelectedOrder(order)
    setFormData({
      ...initialFormData,
      customerName: order.customerName,
      customerRef: order.customerRef,
      status: order.status,
      totalAmount: order.totalAmount.toString(),
      currency: order.currency,
      transportMode: order.transportMode as OrderFormData['transportMode'],
      incoterms: order.incoterms,
      orderType: order.orderType as OrderFormData['orderType'],
      originPort: order.origin.port,
      originCountry: order.origin.country,
      destinationPort: order.destination.port,
      destinationCountry: order.destination.country,
      etd: order.etd,
      eta: order.eta,
      packages: order.packages.toString(),
      grossWeight: order.grossWeight.toString(),
      volume: order.volume.toString(),
      isDangerous: order.isDangerous,
      requiresTemperatureControl: order.requiresTemperatureControl,
      shipperCompany: order.shipperCompany,
      consigneeCompany: order.consigneeCompany,
      // 船公司信息
      shippingLine: order.shippingLine || '',
      vesselName: order.vesselName || '',
      voyageNo: order.voyageNo || '',
      blNumber: order.blNumber || '',
      bookingNo: order.bookingNo || '',
      // 集装箱信息
      containers: order.containers && order.containers.length > 0 
        ? order.containers.map(c => ({ ...c, vgm: c.vgm.toString() }))
        : [{ containerNo: '', type: '40HC', sealNo: '', vgm: '' }],
    })
    setShowModal(true)
  }

  // 打开查看订单弹窗
  const handleView = (order: typeof mockOrders[0]) => {
    setModalMode('view')
    setSelectedOrder(order)
    setShowModal(true)
  }

  // 打开删除确认弹窗
  const handleDelete = (order: typeof mockOrders[0]) => {
    setOrderToDelete(order)
    setDeleteError('')
    
    // 根据订单状态决定是删除还是作废
    if (order.status === 'draft') {
      setShowDeleteModal(true)
    } else {
      setVoidReason('')
      setShowVoidModal(true)
    }
  }
  
  // 确认删除订单（仅草稿状态）
  const confirmDelete = async () => {
    if (!orderToDelete) return
    
    setIsDeleting(true)
    setDeleteError('')
    
    try {
      const response = await deleteOrder(orderToDelete.id)
      
      if (response.errCode === 200) {
        // 从本地状态中移除订单
        setOrders(prev => prev.filter(o => o.id !== orderToDelete.id))
        setShowDeleteModal(false)
        setOrderToDelete(null)
        showToast(`订单 ${orderToDelete.orderNo} 已删除`, 'success')
      } else {
        setDeleteError(response.msg || '删除失败')
      }
    } catch (error: any) {
      console.error('删除订单失败:', error)
      setDeleteError(error.message || '删除订单失败，请重试')
    } finally {
      setIsDeleting(false)
    }
  }
  
  // 确认作废订单（非草稿状态）
  const confirmVoid = async () => {
    if (!orderToDelete) return
    
    if (!voidReason.trim() || voidReason.trim().length < 2) {
      setDeleteError('请填写作废原因（至少2个字符）')
      return
    }
    
    setIsDeleting(true)
    setDeleteError('')
    
    try {
      const response = await voidOrder(orderToDelete.id, voidReason.trim())
      
      if (response.errCode === 200) {
        // 更新本地状态中的订单状态为已作废
        setOrders(prev => prev.map(o => 
          o.id === orderToDelete.id 
            ? { ...o, status: 'cancelled' }  // 使用 cancelled 表示已作废
            : o
        ))
        setShowVoidModal(false)
        setOrderToDelete(null)
        setVoidReason('')
        showToast(`订单 ${orderToDelete.orderNo} 已作废`, 'success')
      } else {
        setDeleteError(response.msg || '作废失败')
      }
    } catch (error: any) {
      console.error('作废订单失败:', error)
      setDeleteError(error.message || '作废订单失败，请重试')
    } finally {
      setIsDeleting(false)
    }
  }

  // 复制发货人信息到收货人
  const copyShipperToConsignee = () => {
    setFormData({
      ...formData,
      consigneeCompany: formData.shipperCompany,
      consigneeContact: formData.shipperContact,
      consigneeAddress: formData.shipperAddress,
      consigneeCity: formData.shipperCity,
      consigneePostcode: formData.shipperPostcode,
      consigneeCountry: formData.shipperCountry,
      consigneePhone: formData.shipperPhone,
      consigneeEmail: formData.shipperEmail,
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 表单提交中状态
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 表单验证
    if (!formData.customerName.trim()) {
      showToast('请填写客户名称', 'error')
      return
    }
    
    setIsSubmitting(true)
    
    try {
      // 构建提交数据
      const submitData = {
        orderType: formData.orderType,
        customerId: formData.customerId || undefined,
        customerName: formData.customerName,
        customerRef: formData.customerRef || undefined,
        transportMode: formData.transportMode,
        incoterms: formData.incoterms,
        origin: {
          port: formData.originPort,
          country: formData.originCountry
        },
        destination: {
          port: formData.destinationPort,
          country: formData.destinationCountry
        },
        etd: formData.etd || undefined,
        eta: formData.eta || undefined,
        packages: parseInt(formData.packages) || 0,
        grossWeight: parseFloat(formData.grossWeight) || 0,
        volume: parseFloat(formData.volume) || 0,
        isDangerous: formData.isDangerous,
        requiresTemperatureControl: formData.requiresTemperatureControl,
        currency: formData.currency,
        totalAmount: parseFloat(formData.totalAmount) || 0,
        remark: formData.remarks || undefined,
        // 业务类型
        businessType: formData.businessType,
        releaseStatus: formData.releaseStatus,
        // 根据运输方式添加特定信息
        ...(formData.transportMode === 'sea' || formData.transportMode === 'multimodal' ? {
          shippingLine: formData.shippingLine || undefined,
          vesselName: formData.vesselName || undefined,
          voyageNo: formData.voyageNo || undefined,
          blNumber: formData.blNumber || undefined,
          bookingNo: formData.bookingNo || undefined,
          containers: formData.containers.filter(c => c.containerNo).map(c => ({
            containerNo: c.containerNo,
            type: c.type,
            sealNo: c.sealNo,
            vgm: parseFloat(c.vgm as string) || 0
          }))
        } : {}),
        ...(formData.transportMode === 'air' ? {
          airline: formData.airline || undefined,
          flightNo: formData.flightNo || undefined,
          mawbNo: formData.mawbNo || undefined,
          hawbNo: formData.hawbNo || undefined
        } : {}),
        ...(formData.transportMode === 'road' || formData.transportMode === 'multimodal' ? {
          truckPlate: formData.truckPlate || undefined,
          trailerPlate: formData.trailerPlate || undefined,
          driverName: formData.driverName || undefined,
          driverPhone: formData.driverPhone || undefined
        } : {}),
        ...(formData.transportMode === 'rail' ? {
          railOperator: formData.railOperator || undefined,
          trainNo: formData.trainNo || undefined,
          wagonNo: formData.wagonNo || undefined,
          containers: formData.railContainers.filter(c => c.containerNo).map(c => ({
            containerNo: c.containerNo,
            type: c.type,
            sealNo: c.sealNo,
            vgm: parseFloat(c.vgm as string) || 0
          }))
        } : {})
      }
      
      if (modalMode === 'create') {
        // 创建订单
        const response = await createOrder(submitData)
        
        if (response.errCode === 200 && response.data) {
          // 添加新订单到本地列表
          const newOrder = {
            id: response.data.id,
            orderNo: response.data.orderNo,
            customerName: formData.customerName,
            customerRef: formData.customerRef,
            status: 'draft',
            totalAmount: response.data.totalAmount || parseFloat(formData.totalAmount) || 0,
            currency: formData.currency,
            createTime: new Date().toLocaleString('zh-CN'),
            operator: '当前用户',
            orderType: formData.orderType,
            transportMode: formData.transportMode,
            incoterms: formData.incoterms,
            origin: { port: formData.originPort, country: formData.originCountry },
            destination: { port: formData.destinationPort, country: formData.destinationCountry },
            etd: formData.etd,
            eta: formData.eta,
            packages: parseInt(formData.packages) || 0,
            grossWeight: parseFloat(formData.grossWeight) || 0,
            volume: parseFloat(formData.volume) || 0,
            isDangerous: formData.isDangerous,
            requiresTemperatureControl: formData.requiresTemperatureControl,
            businessType: formData.businessType,
            releaseStatus: formData.releaseStatus,
            customsClearance: 'destination',
            shipperCompany: '',
            consigneeCompany: formData.customerName,
            shippingLine: formData.shippingLine,
            vesselName: formData.vesselName,
            voyageNo: formData.voyageNo,
            blNumber: formData.blNumber,
            bookingNo: formData.bookingNo,
            containers: formData.transportMode === 'rail' 
              ? formData.railContainers.filter(c => c.containerNo).map(c => ({
                  containerNo: c.containerNo,
                  type: c.type,
                  sealNo: c.sealNo,
                  vgm: parseFloat(c.vgm as string) || 0
                }))
              : formData.containers.filter(c => c.containerNo).map(c => ({
                  containerNo: c.containerNo,
                  type: c.type,
                  sealNo: c.sealNo,
                  vgm: parseFloat(c.vgm as string) || 0
                }))
          }
          setOrders(prev => [newOrder, ...prev])
          showToast(`订单 ${response.data.orderNo} 创建成功`, 'success')
        } else {
          showToast(response.msg || '创建订单失败', 'error')
          return
        }
      } else {
        // 更新订单
        if (!selectedOrder) return
        
        const response = await updateOrder(selectedOrder.id, submitData)
        
        if (response.errCode === 200) {
          // 更新本地列表中的订单
          setOrders(prev => prev.map(order => 
            order.id === selectedOrder.id 
              ? {
                  ...order,
                  customerName: formData.customerName,
                  customerRef: formData.customerRef,
                  totalAmount: parseFloat(formData.totalAmount) || order.totalAmount,
                  currency: formData.currency,
                  orderType: formData.orderType,
                  transportMode: formData.transportMode,
                  incoterms: formData.incoterms,
                  origin: { port: formData.originPort, country: formData.originCountry },
                  destination: { port: formData.destinationPort, country: formData.destinationCountry },
                  etd: formData.etd,
                  eta: formData.eta,
                  packages: parseInt(formData.packages) || 0,
                  grossWeight: parseFloat(formData.grossWeight) || 0,
                  volume: parseFloat(formData.volume) || 0,
                  isDangerous: formData.isDangerous,
                  requiresTemperatureControl: formData.requiresTemperatureControl,
                  businessType: formData.businessType,
                  releaseStatus: formData.releaseStatus,
                  shippingLine: formData.shippingLine,
                  vesselName: formData.vesselName,
                  voyageNo: formData.voyageNo,
                  blNumber: formData.blNumber,
                  bookingNo: formData.bookingNo,
                  containers: formData.transportMode === 'rail' 
                    ? formData.railContainers.filter(c => c.containerNo).map(c => ({
                        containerNo: c.containerNo,
                        type: c.type,
                        sealNo: c.sealNo,
                        vgm: parseFloat(c.vgm as string) || 0
                      }))
                    : formData.containers.filter(c => c.containerNo).map(c => ({
                        containerNo: c.containerNo,
                        type: c.type,
                        sealNo: c.sealNo,
                        vgm: parseFloat(c.vgm as string) || 0
                      }))
                }
              : order
          ))
          showToast(`订单 ${selectedOrder.orderNo} 更新成功`, 'success')
        } else {
          showToast(response.msg || '更新订单失败', 'error')
          return
        }
      }
      
      setShowModal(false)
    } catch (error: any) {
      console.error('操作失败:', error)
      showToast(error.message || '操作失败，请重试', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 渲染运输方式图标
  const renderTransportIcon = (mode: string) => {
    const config = transportModeMap[mode]
    if (!config) return null
    const Icon = config.icon
    return <Icon className={`w-4 h-4 ${config.color}`} />
  }
  
  // 添加集装箱（海运/铁路共用）
  const addContainer = (isRail: boolean = false) => {
    const newContainer = { containerNo: '', type: '40HC', sealNo: '', vgm: '' }
    if (isRail) {
      setFormData({ ...formData, railContainers: [...formData.railContainers, newContainer] })
    } else {
      setFormData({ ...formData, containers: [...formData.containers, newContainer] })
    }
  }
  
  // 删除集装箱
  const removeContainer = (index: number, isRail: boolean = false) => {
    if (isRail) {
      setFormData({ ...formData, railContainers: formData.railContainers.filter((_, i) => i !== index) })
    } else {
      setFormData({ ...formData, containers: formData.containers.filter((_, i) => i !== index) })
    }
  }
  
  // 更新集装箱
  const updateContainer = (index: number, field: keyof ContainerData, value: string, isRail: boolean = false) => {
    if (isRail) {
      const newContainers = [...formData.railContainers]
      newContainers[index] = { ...newContainers[index], [field]: value }
      setFormData({ ...formData, railContainers: newContainers })
    } else {
      const newContainers = [...formData.containers]
      newContainers[index] = { ...newContainers[index], [field]: value }
      setFormData({ ...formData, containers: newContainers })
    }
  }
  
  // 打开船司放单操作弹窗
  const openCarrierReleaseModal = (order: typeof mockOrders[0]) => {
    setCarrierReleaseOrder(order)
    setCarrierReleaseForm({
      status: order.carrierReleaseStatus as CarrierReleaseStatus,
      mailAddress: '',
      releaseValidUntil: '',
      serviceCompanyId: ''
    })
    setShowCarrierReleaseModal(true)
  }
  
  // 更新船司放单状态
  const handleUpdateCarrierReleaseStatus = () => {
    if (!carrierReleaseOrder || !carrierReleaseForm.status) return
    
    // 验证状态流转
    const currentStatus = carrierReleaseOrder.carrierReleaseStatus
    const newStatus = carrierReleaseForm.status
    
    // 正本邮寄需要填写地址
    if (newStatus === 'mailed' && !carrierReleaseForm.mailAddress) {
      showToast('请填写邮寄地址', 'error')
      return
    }
    
    // 放行需要填写有效期
    if (newStatus === 'released' && !carrierReleaseForm.releaseValidUntil) {
      showToast('请填写放行有效期', 'error')
      return
    }
    
    // 更新订单
    setOrders(prev => prev.map(o => 
      o.id === carrierReleaseOrder.id 
        ? { 
            ...o, 
            carrierReleaseStatus: newStatus,
            // 可以添加更多字段如 mailAddress, releaseValidUntil 等
          } 
        : o
    ))
    
    showToast(`船司放单状态已更新为：${carrierReleaseStatusMap[newStatus].label}`, 'success')
    setShowCarrierReleaseModal(false)
    setCarrierReleaseOrder(null)
  }
  
  // 获取可选的下一个状态
  const getNextCarrierReleaseStatuses = (currentStatus: CarrierReleaseStatus): CarrierReleaseStatus[] => {
    switch (currentStatus) {
      case 'pending_mail':
        return ['mailed']
      case 'mailed':
        return ['pending_release']
      case 'pending_release':
        return ['released']
      case 'released':
        return [] // 终态
      case 'not_required':
        return [] // 不需要放单
      default:
        return []
    }
  }

  // 渲染简化的表单内容 - 根据运输方式动态显示
  const renderSimplifiedForm = () => {
    return (
      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
        {/* 第一部分：基本信息 & 运输方式选择 */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-500" />
            基本信息
          </h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">订单类型</label>
              <select
                value={formData.orderType}
                onChange={(e) => setFormData({ ...formData, orderType: e.target.value as OrderFormData['orderType'] })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="import">进口</option>
                <option value="export">出口</option>
                <option value="domestic">国内</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">客户名称 *</label>
              <input
                type="text"
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                placeholder="请输入客户名称"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">客户参考号</label>
              <input
                type="text"
                value={formData.customerRef}
                onChange={(e) => setFormData({ ...formData, customerRef: e.target.value })}
                placeholder="PO号/参考号"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>
          
          {/* 业务类型选择 */}
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-600 mb-2">业务类型 *</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(businessTypeMap).map(([key, value]) => {
                const isSelected = formData.businessType === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFormData({ 
                      ...formData, 
                      businessType: key as BusinessType,
                      releaseStatus: key === 'transport' ? 'not_required' : 'pending'
                    })}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                      isSelected 
                        ? `border-2 ${value.color}` 
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    {key === 'release' && <FileCheck className={`w-5 h-5 ${isSelected ? 'text-blue-600' : ''}`} />}
                    {key === 'transport' && <Truck className={`w-5 h-5 ${isSelected ? 'text-green-600' : ''}`} />}
                    {key === 'both' && <Package className={`w-5 h-5 ${isSelected ? 'text-purple-600' : ''}`} />}
                    <span className="text-xs font-medium">{value.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 运输方式选择 - 使用大按钮 */}
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-600 mb-2">运输方式 *</label>
            <div className="grid grid-cols-5 gap-2">
              {Object.entries(transportModeMap).map(([key, value]) => {
                const Icon = value.icon
                const isSelected = formData.transportMode === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFormData({ ...formData, transportMode: key as OrderFormData['transportMode'] })}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-50 text-blue-700' 
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isSelected ? value.color : ''}`} />
                    <span className="text-xs font-medium">{value.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 第二部分：路线信息 */}
        <div className="p-4 bg-blue-50 rounded-lg">
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Navigation className="w-4 h-4 text-blue-500" />
            路线 & 时间
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs font-medium text-gray-600">起运地</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={formData.originPort}
                  onChange={(e) => setFormData({ ...formData, originPort: e.target.value })}
                  placeholder="城市/港口"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <select
                  value={formData.originCountry}
                  onChange={(e) => setFormData({ ...formData, originCountry: e.target.value })}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  {europeanCountries.map(c => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">ETD 预计发货</label>
                <input
                  type="date"
                  value={formData.etd}
                  onChange={(e) => setFormData({ ...formData, etd: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-xs font-medium text-gray-600">目的地</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={formData.destinationPort}
                  onChange={(e) => setFormData({ ...formData, destinationPort: e.target.value })}
                  placeholder="城市/港口"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <select
                  value={formData.destinationCountry}
                  onChange={(e) => setFormData({ ...formData, destinationCountry: e.target.value })}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  {europeanCountries.map(c => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">ETA 预计到达</label>
                <input
                  type="date"
                  value={formData.eta}
                  onChange={(e) => setFormData({ ...formData, eta: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs font-medium text-gray-600">贸易条款 (Incoterms)</label>
            <select
              value={formData.incoterms}
              onChange={(e) => setFormData({ ...formData, incoterms: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              {incotermsOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 第三部分：根据运输方式显示不同的详情 */}
        {formData.transportMode === 'sea' && (
          <div className="p-4 bg-indigo-50 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Ship className="w-4 h-4 text-indigo-500" />
              海运信息
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">船公司</label>
                <select
                  value={formData.shippingLine}
                  onChange={(e) => setFormData({ ...formData, shippingLine: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">请选择船公司</option>
                  {shippingLines.map(line => (
                    <option key={line.code} value={line.code}>{line.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">订舱号</label>
                <input
                  type="text"
                  value={formData.bookingNo}
                  onChange={(e) => setFormData({ ...formData, bookingNo: e.target.value })}
                  placeholder="Booking Number"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">船名</label>
                <input
                  type="text"
                  value={formData.vesselName}
                  onChange={(e) => setFormData({ ...formData, vesselName: e.target.value })}
                  placeholder="Vessel Name"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">航次</label>
                <input
                  type="text"
                  value={formData.voyageNo}
                  onChange={(e) => setFormData({ ...formData, voyageNo: e.target.value })}
                  placeholder="Voyage No."
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600">提单号 (B/L)</label>
                <input
                  type="text"
                  value={formData.blNumber}
                  onChange={(e) => setFormData({ ...formData, blNumber: e.target.value })}
                  placeholder="Bill of Lading Number"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                />
              </div>
            </div>
            
            {/* 集装箱信息 */}
            <div className="mt-4 pt-4 border-t border-indigo-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">集装箱</span>
                <button
                  type="button"
                  onClick={() => addContainer(false)}
                  className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> 添加
                </button>
              </div>
              <div className="space-y-2">
                {formData.containers.map((container, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded border border-indigo-100">
                    <input
                      type="text"
                      value={container.containerNo}
                      onChange={(e) => updateContainer(idx, 'containerNo', e.target.value.toUpperCase(), false)}
                      placeholder="箱号"
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono uppercase"
                    />
                    <select
                      value={container.type}
                      onChange={(e) => updateContainer(idx, 'type', e.target.value, false)}
                      className="w-28 px-2 py-1.5 border border-gray-200 rounded text-xs"
                    >
                      {containerTypes.map(t => (
                        <option key={t.code} value={t.code}>{t.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={container.sealNo}
                      onChange={(e) => updateContainer(idx, 'sealNo', e.target.value, false)}
                      placeholder="封条号"
                      className="w-24 px-2 py-1.5 border border-gray-200 rounded text-xs"
                    />
                    <input
                      type="number"
                      value={container.vgm}
                      onChange={(e) => updateContainer(idx, 'vgm', e.target.value, false)}
                      placeholder="VGM(kg)"
                      className="w-20 px-2 py-1.5 border border-gray-200 rounded text-xs"
                    />
                    {formData.containers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContainer(idx, false)}
                        className="p-1 text-red-500 hover:text-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {formData.transportMode === 'air' && (
          <div className="p-4 bg-sky-50 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Plane className="w-4 h-4 text-sky-500" />
              空运信息
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">航空公司</label>
                <select
                  value={formData.airline}
                  onChange={(e) => setFormData({ ...formData, airline: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">请选择航空公司</option>
                  {airlines.map(a => (
                    <option key={a.code} value={a.code}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">航班号</label>
                <input
                  type="text"
                  value={formData.flightNo}
                  onChange={(e) => setFormData({ ...formData, flightNo: e.target.value.toUpperCase() })}
                  placeholder="如: LH778"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">主运单号 (MAWB)</label>
                <input
                  type="text"
                  value={formData.mawbNo}
                  onChange={(e) => setFormData({ ...formData, mawbNo: e.target.value })}
                  placeholder="Master Airway Bill"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">分运单号 (HAWB)</label>
                <input
                  type="text"
                  value={formData.hawbNo}
                  onChange={(e) => setFormData({ ...formData, hawbNo: e.target.value })}
                  placeholder="House Airway Bill"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {formData.transportMode === 'road' && (
          <div className="p-4 bg-orange-50 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4 text-orange-500" />
              陆运信息
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">车牌号</label>
                <input
                  type="text"
                  value={formData.truckPlate}
                  onChange={(e) => setFormData({ ...formData, truckPlate: e.target.value.toUpperCase() })}
                  placeholder="如: B-AB1234"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">挂车号</label>
                <input
                  type="text"
                  value={formData.trailerPlate}
                  onChange={(e) => setFormData({ ...formData, trailerPlate: e.target.value.toUpperCase() })}
                  placeholder="如: B-CD5678"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">司机姓名</label>
                <input
                  type="text"
                  value={formData.driverName}
                  onChange={(e) => setFormData({ ...formData, driverName: e.target.value })}
                  placeholder="Driver Name"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">司机电话</label>
                <input
                  type="text"
                  value={formData.driverPhone}
                  onChange={(e) => setFormData({ ...formData, driverPhone: e.target.value })}
                  placeholder="+49 xxx xxx xxxx"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {formData.transportMode === 'rail' && (
          <div className="p-4 bg-emerald-50 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Train className="w-4 h-4 text-emerald-500" />
              铁路信息
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">铁路运营商</label>
                <select
                  value={formData.railOperator}
                  onChange={(e) => setFormData({ ...formData, railOperator: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">请选择运营商</option>
                  {railOperators.map(r => (
                    <option key={r.code} value={r.code}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">班列号</label>
                <input
                  type="text"
                  value={formData.trainNo}
                  onChange={(e) => setFormData({ ...formData, trainNo: e.target.value })}
                  placeholder="如: X8001"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600">车厢号</label>
                <input
                  type="text"
                  value={formData.wagonNo}
                  onChange={(e) => setFormData({ ...formData, wagonNo: e.target.value })}
                  placeholder="Wagon Number"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                />
              </div>
            </div>
            
            {/* 铁路集装箱信息 */}
            <div className="mt-4 pt-4 border-t border-emerald-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">集装箱</span>
                <button
                  type="button"
                  onClick={() => addContainer(true)}
                  className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> 添加
                </button>
              </div>
              <div className="space-y-2">
                {formData.railContainers.map((container, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded border border-emerald-100">
                    <input
                      type="text"
                      value={container.containerNo}
                      onChange={(e) => updateContainer(idx, 'containerNo', e.target.value.toUpperCase(), true)}
                      placeholder="箱号"
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono uppercase"
                    />
                    <select
                      value={container.type}
                      onChange={(e) => updateContainer(idx, 'type', e.target.value, true)}
                      className="w-28 px-2 py-1.5 border border-gray-200 rounded text-xs"
                    >
                      {containerTypes.map(t => (
                        <option key={t.code} value={t.code}>{t.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={container.sealNo}
                      onChange={(e) => updateContainer(idx, 'sealNo', e.target.value, true)}
                      placeholder="封条号"
                      className="w-24 px-2 py-1.5 border border-gray-200 rounded text-xs"
                    />
                    {formData.railContainers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContainer(idx, true)}
                        className="p-1 text-red-500 hover:text-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {formData.transportMode === 'multimodal' && (
          <div className="p-4 bg-purple-50 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Box className="w-4 h-4 text-purple-500" />
              多式联运信息
            </h4>
            <p className="text-xs text-gray-500 mb-3">多式联运可能涉及海运+陆运的组合，请填写主要运输段信息</p>
            
            {/* 海运段 */}
            <div className="mb-4 p-3 bg-white rounded-lg border border-purple-100">
              <span className="text-xs font-medium text-indigo-600 mb-2 block">🚢 海运段</span>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500">船公司</label>
                  <select
                    value={formData.shippingLine}
                    onChange={(e) => setFormData({ ...formData, shippingLine: e.target.value })}
                    className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-xs"
                  >
                    <option value="">选择船公司</option>
                    {shippingLines.map(line => (
                      <option key={line.code} value={line.code}>{line.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">船名/航次</label>
                  <input
                    type="text"
                    value={formData.vesselName}
                    onChange={(e) => setFormData({ ...formData, vesselName: e.target.value })}
                    placeholder="船名 / 航次"
                    className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">提单号</label>
                  <input
                    type="text"
                    value={formData.blNumber}
                    onChange={(e) => setFormData({ ...formData, blNumber: e.target.value })}
                    placeholder="B/L Number"
                    className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono"
                  />
                </div>
              </div>
            </div>
            
            {/* 陆运段 */}
            <div className="p-3 bg-white rounded-lg border border-purple-100">
              <span className="text-xs font-medium text-orange-600 mb-2 block">🚛 陆运段</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">车牌号</label>
                  <input
                    type="text"
                    value={formData.truckPlate}
                    onChange={(e) => setFormData({ ...formData, truckPlate: e.target.value.toUpperCase() })}
                    placeholder="车牌号"
                    className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">司机/电话</label>
                  <input
                    type="text"
                    value={formData.driverName}
                    onChange={(e) => setFormData({ ...formData, driverName: e.target.value })}
                    placeholder="司机姓名 / 电话"
                    className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-xs"
                  />
                </div>
              </div>
            </div>
            
            {/* 集装箱 */}
            <div className="mt-3 pt-3 border-t border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">集装箱</span>
                <button
                  type="button"
                  onClick={() => addContainer(false)}
                  className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> 添加
                </button>
              </div>
              <div className="space-y-2">
                {formData.containers.map((container, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded border border-purple-100">
                    <input
                      type="text"
                      value={container.containerNo}
                      onChange={(e) => updateContainer(idx, 'containerNo', e.target.value.toUpperCase(), false)}
                      placeholder="箱号"
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono uppercase"
                    />
                    <select
                      value={container.type}
                      onChange={(e) => updateContainer(idx, 'type', e.target.value, false)}
                      className="w-24 px-2 py-1.5 border border-gray-200 rounded text-xs"
                    >
                      {containerTypes.map(t => (
                        <option key={t.code} value={t.code}>{t.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={container.sealNo}
                      onChange={(e) => updateContainer(idx, 'sealNo', e.target.value, false)}
                      placeholder="封条号"
                      className="w-20 px-2 py-1.5 border border-gray-200 rounded text-xs"
                    />
                    {formData.containers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContainer(idx, false)}
                        className="p-1 text-red-500 hover:text-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 第四部分：货物信息（简化版） */}
        <div className="p-4 bg-amber-50 rounded-lg">
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-500" />
            货物信息
          </h4>
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600">货物描述</label>
              <input
                type="text"
                value={formData.goodsDescription}
                onChange={(e) => setFormData({ ...formData, goodsDescription: e.target.value })}
                placeholder="货物名称/品名"
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">件数</label>
              <input
                type="number"
                value={formData.packages}
                onChange={(e) => setFormData({ ...formData, packages: e.target.value })}
                placeholder="0"
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">毛重 (KG)</label>
              <input
                type="number"
                value={formData.grossWeight}
                onChange={(e) => setFormData({ ...formData, grossWeight: e.target.value })}
                placeholder="0"
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">体积 (CBM)</label>
              <input
                type="number"
                step="0.01"
                value={formData.volume}
                onChange={(e) => setFormData({ ...formData, volume: e.target.value })}
                placeholder="0.00"
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div className="col-span-3 flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isDangerous}
                  onChange={(e) => setFormData({ ...formData, isDangerous: e.target.checked })}
                  className="w-4 h-4 text-red-500 rounded"
                />
                <span className="text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  危险品
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.requiresTemperatureControl}
                  onChange={(e) => setFormData({ ...formData, requiresTemperatureControl: e.target.checked })}
                  className="w-4 h-4 text-blue-500 rounded"
                />
                <span className="text-blue-600 flex items-center gap-1">
                  <Thermometer className="w-3.5 h-3.5" />
                  温控
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* 第五部分：备注 */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <label className="text-xs font-medium text-gray-600">备注</label>
          <textarea
            value={formData.remarks}
            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
            placeholder="特殊说明、注意事项等..."
            rows={2}
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
          />
        </div>
      </div>
    )
  }

  // 统计数据
  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    shipping: orders.filter(o => o.status === 'shipping').length,
    completed: orders.filter(o => o.status === 'completed').length,
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">订单管理</h1>
          <p className="text-gray-500 mt-1">管理所有客户运输订单</p>
        </div>
        <button
          onClick={handleCreate}
          className="btn btn-md btn-primary"
        >
          <Plus className="w-4 h-4" />
          新建订单
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">总订单</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">待处理</p>
              <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Truck className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">运输中</p>
              <p className="text-2xl font-bold text-indigo-600">{stats.shipping}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">已完成</p>
              <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* 搜索框 */}
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索订单号、客户名称、参考号、起运地、目的地..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          {/* 状态筛选 */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部状态</option>
              <option value="draft">草稿</option>
              <option value="pending">待处理</option>
              <option value="shipping">运输中</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>

          {/* 运输方式筛选 */}
          <select
            value={transportFilter}
            onChange={(e) => setTransportFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部运输方式</option>
            <option value="air">✈️ 空运</option>
            <option value="sea">🚢 海运</option>
            <option value="road">🚚 陆运</option>
            <option value="rail">🚂 铁路</option>
            <option value="multimodal">📦 多式联运</option>
          </select>

          {/* 业务类型筛选 */}
          <select
            value={businessTypeFilter}
            onChange={(e) => setBusinessTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部业务类型</option>
            <option value="release">放单服务</option>
            <option value="transport">运输服务</option>
            <option value="both">放单+运输</option>
          </select>

          {/* 放单状态筛选 */}
          <select
            value={releaseStatusFilter}
            onChange={(e) => setReleaseStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部放单状态</option>
            <option value="pending">待放单</option>
            <option value="released">已放单</option>
          </select>
          
          {/* 船司放单状态筛选 */}
          <select
            value={carrierReleaseStatusFilter}
            onChange={(e) => setCarrierReleaseStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部船司放单</option>
            {Object.entries(carrierReleaseStatusMap).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          
          {/* 导出按钮 */}
          <button className="btn btn-md btn-secondary">
            <Download className="w-4 h-4" />
            导出
          </button>
        </div>
      </div>

      {/* 订单表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">订单信息</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">船公司/集装箱</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">船司放单</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">清关放行</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">货物类型</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">送仓地址</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">派送状态</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  {/* 订单信息 */}
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-blue-600 cursor-pointer hover:underline" onClick={() => handleView(order)}>
                          {order.orderNo}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${orderTypeMap[order.orderType].color}`}>
                          {orderTypeMap[order.orderType].label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-900">{order.customerName}</p>
                      {order.customerRef && (
                        <p className="text-xs text-gray-500">Ref: {order.customerRef}</p>
                      )}
                    </div>
                  </td>

                  {/* 船公司/集装箱 */}
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      {order.shippingLine ? (
                        <>
                          <div className="flex items-center gap-1">
                            <Anchor className="w-3 h-3 text-blue-500" />
                            <span className="text-sm font-medium text-gray-900">
                              {shippingLines.find(l => l.code === order.shippingLine)?.name.split(' ')[0] || order.shippingLine}
                            </span>
                          </div>
                          {order.vesselName && (
                            <p className="text-xs text-gray-500">{order.vesselName} / {order.voyageNo}</p>
                          )}
                          {order.blNumber && (
                            <p className="text-xs text-blue-600 font-mono">B/L: {order.blNumber}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                      {order.containers && order.containers.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {order.containers.slice(0, 2).map((c, idx) => (
                            <span key={idx} className="inline-flex items-center gap-0.5 text-xs bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded font-mono">
                              <Box className="w-2.5 h-2.5" />
                              {c.type}
                            </span>
                          ))}
                          {order.containers.length > 2 && (
                            <span className="text-xs text-gray-500">+{order.containers.length - 2}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  
                  {/* 船司放单 */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        carrierReleaseStatusMap[order.carrierReleaseStatus as CarrierReleaseStatus]?.color || 'bg-gray-100 text-gray-500'
                      }`}>
                        {carrierReleaseStatusMap[order.carrierReleaseStatus as CarrierReleaseStatus]?.label || '否'}
                      </span>
                      {order.carrierReleaseStatus !== 'not_required' && order.carrierReleaseStatus !== 'released' && (
                        <button
                          onClick={() => openCarrierReleaseModal(order)}
                          className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          更新
                        </button>
                      )}
                    </div>
                  </td>
                  
                  {/* 清关放行 */}
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      customsClearanceStatusMap[order.customsClearanceStatus as CustomsClearanceStatus]?.color || 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {customsClearanceStatusMap[order.customsClearanceStatus as CustomsClearanceStatus]?.label || '待清关'}
                    </span>
                  </td>
                  
                  {/* 货物类型 */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1">
                      {order.isDangerous ? (
                        <span className="inline-flex items-center gap-0.5 text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                          <AlertTriangle className="w-3 h-3" />
                          危险品
                        </span>
                      ) : order.requiresTemperatureControl ? (
                        <span className="inline-flex items-center gap-0.5 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          <Thermometer className="w-3 h-3" />
                          温控
                        </span>
                      ) : (
                        <span className="text-sm text-gray-600">普货</span>
                      )}
                    </div>
                  </td>
                  
                  {/* 送仓地址 */}
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-1 max-w-[150px]">
                      <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600 truncate" title={order.warehouseAddress || order.destination?.port || '-'}>
                        {order.warehouseAddress || order.destination?.port || '-'}
                      </span>
                    </div>
                  </td>
                  
                  {/* 时间 */}
                  <td className="px-4 py-4">
                    <div className="space-y-1 text-sm">
                      {order.etd ? (
                        <>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500 w-8">ETD</span>
                            <span className="text-gray-900">{order.etd}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500 w-8">ETA</span>
                            <span className="text-gray-900">{order.eta}</span>
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-400 text-xs">待定</span>
                      )}
                    </div>
                  </td>
                  
                  {/* 派送状态 */}
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      deliveryStatusMap[order.deliveryStatus as DeliveryStatus]?.color || 'bg-gray-100 text-gray-600'
                    }`}>
                      {deliveryStatusMap[order.deliveryStatus as DeliveryStatus]?.label || '等待安排'}
                    </span>
                  </td>
                  
                  {/* 操作 */}
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleView(order)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="查看详情"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(order)}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                        title="编辑"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(order)}
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
            共 {filteredOrders.length} 条记录，当前第 {currentPage} / {totalPages || 1} 页
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages || 1 }, (_, i) => i + 1).map(page => (
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
              onClick={() => setCurrentPage(p => Math.min(totalPages || 1, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 订单弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-slide-in">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Package className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {modalMode === 'create' ? '新建订单' : modalMode === 'edit' ? '编辑订单' : '订单详情'}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {modalMode === 'create' ? '按欧洲运输标准填写订单信息' : selectedOrder?.orderNo}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {modalMode === 'view' && selectedOrder ? (
              /* 查看模式 - 详细信息展示 */
              <div className="p-6 space-y-6 overflow-y-auto">
                {/* 基本信息 */}
                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 uppercase">订单号</label>
                    <p className="font-semibold text-blue-600">{selectedOrder.orderNo}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 uppercase">订单类型</label>
                    <p className={`inline-flex px-2 py-0.5 rounded text-sm ${orderTypeMap[selectedOrder.orderType].color}`}>
                      {orderTypeMap[selectedOrder.orderType].label}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 uppercase">状态</label>
                    <p>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusMap[selectedOrder.status].bgColor} ${statusMap[selectedOrder.status].color}`}>
                        {statusMap[selectedOrder.status].label}
                      </span>
                    </p>
                  </div>
                </div>

                {/* 客户信息 */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">客户信息</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500">客户名称</label>
                      <p className="font-medium">{selectedOrder.customerName}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">客户参考号</label>
                      <p className="font-medium">{selectedOrder.customerRef || '-'}</p>
                    </div>
                  </div>
                </div>

                {/* 运输信息 */}
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    运输信息
                  </h4>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <label className="text-xs text-gray-500">运输方式</label>
                      <p className="font-medium flex items-center gap-1">
                        {renderTransportIcon(selectedOrder.transportMode)}
                        {transportModeMap[selectedOrder.transportMode].label}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">贸易条款</label>
                      <p className="font-medium">{selectedOrder.incoterms}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">起运地</label>
                      <p className="font-medium">{selectedOrder.origin.port}, {countryNames[selectedOrder.origin.country]}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">目的地</label>
                      <p className="font-medium">{selectedOrder.destination.port}, {countryNames[selectedOrder.destination.country]}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="text-xs text-gray-500">ETD 预计发货</label>
                      <p className="font-medium">{selectedOrder.etd || '-'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">ETA 预计到达</label>
                      <p className="font-medium">{selectedOrder.eta || '-'}</p>
                    </div>
                  </div>
                </div>

                {/* 船务信息 */}
                {selectedOrder.shippingLine && (
                  <div className="p-4 bg-indigo-50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <Anchor className="w-4 h-4" />
                      船务信息
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs text-gray-500">船公司</label>
                        <p className="font-medium">{shippingLines.find(l => l.code === selectedOrder.shippingLine)?.name || selectedOrder.shippingLine}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">船名 / 航次</label>
                        <p className="font-medium">{selectedOrder.vesselName} / {selectedOrder.voyageNo}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">订舱号</label>
                        <p className="font-medium font-mono">{selectedOrder.bookingNo || '-'}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="text-xs text-gray-500">提单号 (B/L)</label>
                      <p className="font-medium font-mono text-blue-700">{selectedOrder.blNumber}</p>
                    </div>
                  </div>
                )}

                {/* 集装箱信息 */}
                {selectedOrder.containers && selectedOrder.containers.length > 0 && (
                  <div className="p-4 bg-orange-50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <Box className="w-4 h-4" />
                      集装箱信息 ({selectedOrder.containers.length} 个)
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b border-orange-200">
                            <th className="text-left py-2 font-medium">箱号</th>
                            <th className="text-left py-2 font-medium">箱型</th>
                            <th className="text-left py-2 font-medium">封条号</th>
                            <th className="text-right py-2 font-medium">VGM (KG)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedOrder.containers.map((container, idx) => (
                            <tr key={idx} className="border-b border-orange-100 last:border-0">
                              <td className="py-2 font-mono font-medium">{container.containerNo}</td>
                              <td className="py-2">
                                <span className="inline-flex px-2 py-0.5 bg-orange-100 text-orange-800 rounded text-xs">
                                  {containerTypes.find(t => t.code === container.type)?.name || container.type}
                                </span>
                              </td>
                              <td className="py-2 font-mono">{container.sealNo}</td>
                              <td className="py-2 text-right font-medium">{container.vgm?.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 货物信息 */}
                <div className="p-4 bg-orange-50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Box className="w-4 h-4" />
                    货物信息
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-gray-500">件数</label>
                      <p className="font-medium">{selectedOrder.packages} 件</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">毛重</label>
                      <p className="font-medium">{selectedOrder.grossWeight.toLocaleString()} KG</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">体积</label>
                      <p className="font-medium">{selectedOrder.volume} CBM</p>
                    </div>
                  </div>
                  {(selectedOrder.isDangerous || selectedOrder.requiresTemperatureControl) && (
                    <div className="flex gap-2 mt-3">
                      {selectedOrder.isDangerous && (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 px-2 py-1 rounded">
                          <AlertTriangle className="w-3 h-3" />
                          危险品
                        </span>
                      )}
                      {selectedOrder.requiresTemperatureControl && (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded">
                          <Thermometer className="w-3 h-3" />
                          温控货物
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 费用信息 */}
                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    费用信息
                  </h4>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">订单总额</span>
                    <span className="text-2xl font-bold text-green-700">
                      {selectedOrder.currency} {selectedOrder.totalAmount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* 其他信息 */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="text-xs text-gray-500">创建时间</label>
                    <p className="font-medium">{selectedOrder.createTime}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">操作员</label>
                    <p className="font-medium">{selectedOrder.operator}</p>
                  </div>
                </div>
              </div>
            ) : (
              /* 创建/编辑模式 - 简化表单 */
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                {/* 表单内容 */}
                <div className="flex-1 overflow-y-auto p-6">
                  {renderSimplifiedForm()}
                </div>
                
                {/* 底部按钮 */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
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
                      modalMode === 'create' ? '创建订单' : '保存更改'
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 删除确认弹窗（草稿状态） */}
      {showDeleteModal && orderToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-slide-in">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">确认删除订单</h3>
                  <p className="text-sm text-gray-500">此操作不可恢复</p>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">订单号</span>
                    <span className="text-sm font-semibold text-blue-600">{orderToDelete.orderNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">客户</span>
                    <span className="text-sm font-medium">{orderToDelete.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">状态</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusMap[orderToDelete.status].bgColor} ${statusMap[orderToDelete.status].color}`}>
                      {statusMap[orderToDelete.status].label}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">金额</span>
                    <span className="text-sm font-medium">{orderToDelete.currency} {orderToDelete.totalAmount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
              
              {deleteError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {deleteError}
                </div>
              )}
              
              <p className="text-sm text-gray-600 mb-6">
                确定要删除订单 <span className="font-semibold">{orderToDelete.orderNo}</span> 吗？删除后将无法恢复。
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false)
                    setOrderToDelete(null)
                    setDeleteError('')
                  }}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      删除中...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      确认删除
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 作废确认弹窗（非草稿状态） */}
      {showVoidModal && orderToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-slide-in">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-amber-100 rounded-full">
                  <Ban className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">作废订单</h3>
                  <p className="text-sm text-gray-500">非草稿状态的订单只能作废，不能删除</p>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">订单号</span>
                    <span className="text-sm font-semibold text-blue-600">{orderToDelete.orderNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">客户</span>
                    <span className="text-sm font-medium">{orderToDelete.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">当前状态</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusMap[orderToDelete.status].bgColor} ${statusMap[orderToDelete.status].color}`}>
                      {statusMap[orderToDelete.status].label}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">金额</span>
                    <span className="text-sm font-medium">{orderToDelete.currency} {orderToDelete.totalAmount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  作废原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="请填写作废原因（至少2个字符）..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              
              {deleteError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {deleteError}
                </div>
              )}
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
                <p className="text-xs text-amber-800">
                  <strong>提示：</strong>作废后订单状态将变为"已取消"，订单数据仍会保留用于历史查询和审计。
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowVoidModal(false)
                    setOrderToDelete(null)
                    setVoidReason('')
                    setDeleteError('')
                  }}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmVoid}
                  disabled={isDeleting || !voidReason.trim()}
                  className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      处理中...
                    </>
                  ) : (
                    <>
                      <Ban className="w-4 h-4" />
                      确认作废
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 船司放单操作弹窗 */}
      {showCarrierReleaseModal && carrierReleaseOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md m-4 shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Anchor className="w-5 h-5 text-blue-600" />
                更新船司放单状态
              </h3>
              <button
                onClick={() => {
                  setShowCarrierReleaseModal(false)
                  setCarrierReleaseOrder(null)
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4">
              {/* 订单信息 */}
              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-500">订单号</span>
                  <span className="text-sm font-medium text-blue-600">{carrierReleaseOrder.orderNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">当前状态</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    carrierReleaseStatusMap[carrierReleaseOrder.carrierReleaseStatus as CarrierReleaseStatus]?.color || 'bg-gray-100 text-gray-500'
                  }`}>
                    {carrierReleaseStatusMap[carrierReleaseOrder.carrierReleaseStatus as CarrierReleaseStatus]?.label || '否'}
                  </span>
                </div>
              </div>
              
              {/* 状态选择 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  更新为
                </label>
                <div className="space-y-2">
                  {getNextCarrierReleaseStatuses(carrierReleaseOrder.carrierReleaseStatus as CarrierReleaseStatus).map((status) => (
                    <label key={status} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="carrierReleaseStatus"
                        value={status}
                        checked={carrierReleaseForm.status === status}
                        onChange={(e) => setCarrierReleaseForm({ ...carrierReleaseForm, status: e.target.value as CarrierReleaseStatus })}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className={`text-sm px-2 py-0.5 rounded-full ${carrierReleaseStatusMap[status].color}`}>
                        {carrierReleaseStatusMap[status].label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              
              {/* 根据状态显示额外字段 */}
              {carrierReleaseForm.status === 'mailed' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    邮寄地址 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={carrierReleaseForm.mailAddress}
                    onChange={(e) => setCarrierReleaseForm({ ...carrierReleaseForm, mailAddress: e.target.value })}
                    placeholder="请填写正本邮寄地址..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              )}
              
              {carrierReleaseForm.status === 'released' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    放行有效期 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={carrierReleaseForm.releaseValidUntil}
                    onChange={(e) => setCarrierReleaseForm({ ...carrierReleaseForm, releaseValidUntil: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              )}
              
              {getNextCarrierReleaseStatuses(carrierReleaseOrder.carrierReleaseStatus as CarrierReleaseStatus).length === 0 && (
                <div className="text-center py-4 text-gray-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  <p>当前状态为终态，无需更新</p>
                </div>
              )}
            </div>
            
            <div className="flex gap-3 p-4 border-t border-gray-100">
              <button
                onClick={() => {
                  setShowCarrierReleaseModal(false)
                  setCarrierReleaseOrder(null)
                }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              {getNextCarrierReleaseStatuses(carrierReleaseOrder.carrierReleaseStatus as CarrierReleaseStatus).length > 0 && (
                <button
                  onClick={handleUpdateCarrierReleaseStatus}
                  disabled={!carrierReleaseForm.status}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  确认更新
                </button>
              )}
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
