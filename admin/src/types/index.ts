/**
 * EU-TMS 欧洲运输管理系统 - 全局类型定义
 */

// ==================== 通用类型 ====================

/** 通用分页参数 */
export interface PaginationParams {
  page?: number
  pageSize?: number
}

/** 通用搜索参数 */
export interface SearchParams extends PaginationParams {
  search?: string
  startDate?: string
  endDate?: string
}

// ==================== 用户与认证 ====================

/** 用户类型 */
export type UserType = 'OPERATOR' | 'CLIENT' | 'CARRIER'

/** 用户信息 */
export interface User {
  id: string
  username: string
  displayName: string
  email: string
  userType: UserType
  roleCode: string
  roleName: string
  phone?: string
  avatar?: string
  status?: 'active' | 'inactive'
  lastLoginTime?: string
  createdAt?: string
  updatedAt?: string
}

/** 组织信息 */
export interface Organization {
  id: string
  name: string
  code: string
  type: string
}

/** 权限对象 */
export interface AuthObject {
  code: string
  name: string
  type: string
}

/** 登录响应 */
export interface LoginResponseData {
  token: string
  user: User
  organization: Organization
  authObjects: AuthObject[]
}

// ==================== 状态枚举 ====================

/** 订单状态 */
export enum OrderStatus {
  DRAFT = 'DRAFT',                   // 草稿
  PENDING = 'PENDING',               // 待处理
  CONFIRMED = 'CONFIRMED',           // 已确认
  IN_TRANSIT = 'IN_TRANSIT',         // 运输中
  DELIVERED = 'DELIVERED',           // 已送达
  COMPLETED = 'COMPLETED',           // 已完成
  CANCELLED = 'CANCELLED',           // 已取消
}

/** 运输/配送状态 */
export enum DeliveryStatus {
  PENDING = 'PENDING',               // 待配送
  PICKED_UP = 'PICKED_UP',           // 已提货
  IN_TRANSIT = 'IN_TRANSIT',         // 运输中
  AT_CUSTOMS = 'AT_CUSTOMS',         // 海关清关中
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY', // 派送中
  DELIVERED = 'DELIVERED',           // 已签收
  FAILED = 'FAILED',                 // 配送失败
}

/** 放单状态 */
export enum ReleaseStatus {
  PENDING = 'PENDING',               // 待放单
  REQUESTED = 'REQUESTED',           // 已申请
  APPROVED = 'APPROVED',             // 已批准
  RELEASED = 'RELEASED',             // 已放单
  REJECTED = 'REJECTED',             // 已拒绝
}

/** 付款状态 */
export enum PaymentStatus {
  UNPAID = 'UNPAID',                 // 未付款
  PARTIAL = 'PARTIAL',               // 部分付款
  PAID = 'PAID',                     // 已付款
  OVERDUE = 'OVERDUE',               // 已逾期
}

/** 清关状态 */
export enum CustomsStatus {
  PENDING = 'PENDING',               // 待清关
  SUBMITTED = 'SUBMITTED',           // 已提交
  IN_REVIEW = 'IN_REVIEW',           // 审核中
  CLEARED = 'CLEARED',               // 已放行
  HELD = 'HELD',                     // 被扣留
  REJECTED = 'REJECTED',             // 被拒绝
}

/** 报价状态 */
export enum QuotationStatus {
  DRAFT = 'DRAFT',                   // 草稿
  SENT = 'SENT',                     // 已发送
  ACCEPTED = 'ACCEPTED',             // 已接受
  REJECTED = 'REJECTED',             // 已拒绝
  EXPIRED = 'EXPIRED',               // 已过期
}

/** CMR 状态 */
export enum CMRStatus {
  DRAFT = 'DRAFT',                   // 草稿
  ISSUED = 'ISSUED',                 // 已签发
  IN_TRANSIT = 'IN_TRANSIT',         // 运输中
  DELIVERED = 'DELIVERED',           // 已签收
  COMPLETED = 'COMPLETED',           // 已完成
}

/** 运输方式 */
export enum TransportMode {
  TILT = 'TILT',                     // 篷布车
  CONTAINER = 'CONTAINER',           // 集装箱
}

// ==================== 业务实体 ====================

/** 客户 */
export interface Client {
  id: string
  name: string
  code?: string
  companyName?: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  country?: string
  taxNumber?: string
  paymentTerms?: string
  creditLimit?: number
  currency?: string
  status: 'active' | 'inactive'
  remark?: string
  createdAt?: string
  updatedAt?: string
}

/** 承运商 */
export interface Carrier {
  id: string
  name: string
  code?: string
  companyName?: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  country?: string
  taxNumber?: string
  // 车辆与服务信息
  vehicleTypes?: string[]
  serviceRegions?: string[]
  licenseNumber?: string
  insuranceInfo?: string
  rating?: number
  status: 'active' | 'inactive'
  remark?: string
  createdAt?: string
  updatedAt?: string
}

/** 订单 */
export interface Order {
  id: string
  orderNo: string
  transportMode: TransportMode
  status: OrderStatus
  // 客户信息
  clientId?: string
  clientName?: string
  clientRef?: string
  // 承运商信息
  carrierId?: string
  carrierName?: string
  // 路线信息
  origin: string
  destination: string
  loadingDate?: string
  deliveryDate?: string
  // 货物信息
  goodsDescription?: string
  weight?: number
  volume?: number
  packages?: number
  pallets?: number
  // 集装箱信息（集装箱模式）
  containerType?: string
  containerNo?: string
  sealNo?: string
  // 篷布车信息（篷布车模式）
  vehicleType?: string
  vehiclePlate?: string
  trailerPlate?: string
  // 价格信息
  price?: number
  currency?: string
  costPrice?: number
  // 其他
  remark?: string
  operatorId?: string
  operatorName?: string
  createdAt?: string
  updatedAt?: string
}

/** 询价 */
export interface Inquiry {
  id: string
  inquiryNo: string
  clientId?: string
  clientName?: string
  transportMode: TransportMode
  origin: string
  destination: string
  goodsDescription?: string
  weight?: number
  volume?: number
  loadingDate?: string
  status: 'pending' | 'quoted' | 'closed'
  remark?: string
  createdAt?: string
  updatedAt?: string
}

/** 报价 */
export interface Quotation {
  id: string
  quotationNo: string
  inquiryId?: string
  clientId?: string
  clientName?: string
  transportMode: TransportMode
  origin: string
  destination: string
  // 价格明细
  price: number
  currency: string
  validFrom?: string
  validTo?: string
  // 详细条款
  transitTime?: string
  paymentTerms?: string
  conditions?: string
  status: QuotationStatus
  remark?: string
  createdAt?: string
  updatedAt?: string
}

/** CMR 运单 */
export interface CMR {
  id: string
  cmrNo: string
  orderId?: string
  orderNo?: string
  // 发货人
  senderName?: string
  senderAddress?: string
  senderCountry?: string
  // 收货人
  receiverName?: string
  receiverAddress?: string
  receiverCountry?: string
  // 承运商
  carrierName?: string
  carrierAddress?: string
  // 货物信息
  goodsDescription?: string
  weight?: number
  packages?: number
  // 运输信息
  loadingPlace?: string
  loadingDate?: string
  deliveryPlace?: string
  deliveryDate?: string
  // 车辆信息
  vehiclePlate?: string
  trailerPlate?: string
  driverName?: string
  // 状态
  status: CMRStatus
  issuedDate?: string
  signedDate?: string
  remark?: string
  createdAt?: string
  updatedAt?: string
}

/** GPS 跟踪记录 */
export interface GPSRecord {
  id: string
  orderId?: string
  orderNo?: string
  carrierId?: string
  carrierName?: string
  vehiclePlate?: string
  // 位置信息
  latitude: number
  longitude: number
  address?: string
  // 状态
  speed?: number
  heading?: number
  status?: string
  timestamp: string
  createdAt?: string
}

/** GPS 跟踪（订单维度） */
export interface GPSTracking {
  id: string
  orderId: string
  orderNo: string
  clientName?: string
  carrierName?: string
  vehiclePlate?: string
  origin: string
  destination: string
  currentLocation?: string
  currentStatus: DeliveryStatus
  lastUpdate?: string
  eta?: string
  progress?: number
  records?: GPSRecord[]
}

/** 船司放单 */
export interface ShippingRelease {
  id: string
  releaseNo: string
  orderId?: string
  orderNo?: string
  clientName?: string
  // 船运信息
  shippingLine?: string
  vesselName?: string
  voyageNo?: string
  blNumber?: string
  containerNo?: string
  // 放单信息
  status: ReleaseStatus
  requestDate?: string
  approvalDate?: string
  releaseDate?: string
  releasedBy?: string
  // 费用信息
  releaseCharges?: number
  currency?: string
  paymentStatus?: PaymentStatus
  remark?: string
  createdAt?: string
  updatedAt?: string
}

/** 清关记录 */
export interface CustomsClearance {
  id: string
  clearanceNo: string
  orderId?: string
  orderNo?: string
  clientName?: string
  // 清关信息
  customsOffice?: string
  declarationType?: string
  declarationNo?: string
  hsCode?: string
  goodsDescription?: string
  goodsValue?: number
  currency?: string
  // 文件
  documents?: CustomsDocument[]
  // 状态
  status: CustomsStatus
  submittedDate?: string
  clearedDate?: string
  remark?: string
  createdAt?: string
  updatedAt?: string
}

/** 清关文件 */
export interface CustomsDocument {
  id: string
  name: string
  type: string
  url?: string
  uploadedAt?: string
}

/** 财务记录 */
export interface FinancialRecord {
  id: string
  recordNo: string
  type: 'receivable' | 'payable' | 'invoice' | 'payment' | 'credit_note'
  orderId?: string
  orderNo?: string
  // 关联方
  counterpartyId?: string
  counterpartyName?: string
  counterpartyType?: 'client' | 'carrier' | 'agent'
  // 金额
  amount: number
  currency: string
  taxAmount?: number
  totalAmount?: number
  paidAmount?: number
  // 状态
  status: PaymentStatus
  dueDate?: string
  paidDate?: string
  paymentMethod?: string
  // 发票信息
  invoiceNo?: string
  invoiceDate?: string
  // 其他
  description?: string
  remark?: string
  createdAt?: string
  updatedAt?: string
}

/** 通知 */
export interface Notification {
  id: string
  type: 'info' | 'warning' | 'error' | 'success'
  title: string
  content: string
  isRead: boolean
  link?: string
  createdAt: string
}

// ==================== 仪表盘统计 ====================

/** 仪表盘统计数据 */
export interface DashboardStats {
  // 订单统计
  totalOrders: number
  pendingOrders: number
  inTransitOrders: number
  completedOrders: number
  // 运输统计
  activeShipments: number
  delayedShipments: number
  // 财务统计
  totalRevenue: number
  totalCost: number
  outstandingReceivables: number
  outstandingPayables: number
  // 客户统计
  totalClients: number
  activeClients: number
  // 承运商统计
  totalCarriers: number
  activeCarriers: number
}

/** 订单趋势数据 */
export interface OrderTrendItem {
  date: string
  count: number
  revenue?: number
}

/** 运输方式分布 */
export interface TransportModeDistribution {
  mode: TransportMode
  label: string
  count: number
  percentage: number
}

// ==================== 查询参数类型 ====================

/** 订单查询参数 */
export interface OrderQueryParams extends SearchParams {
  status?: OrderStatus
  transportMode?: TransportMode
  clientId?: string
  carrierId?: string
}

/** 报价查询参数 */
export interface QuotationQueryParams extends SearchParams {
  status?: QuotationStatus
  clientId?: string
}

/** 财务查询参数 */
export interface FinanceQueryParams extends SearchParams {
  type?: string
  status?: PaymentStatus
  counterpartyId?: string
}
