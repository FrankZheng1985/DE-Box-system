/**
 * 订单详情页面
 * 展示运输订单的完整信息，包含基本信息、运输路线、时间线、承运信息、财务信息等
 * 支持状态流转操作（审核、确认、取消、异常标记等）
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Edit,
  UserPlus,
  MapPin,
  CheckCircle,
  Circle,
  Star,
  Truck,
  FileText,
  TrendingUp,
  TrendingDown,
  Ship,
  Package,
  Clock,
  User,
  Phone,
  Building2,
  ExternalLink,
  AlertCircle,
  AlertTriangle,
  Ban,
  PlayCircle,
  RotateCcw,
  ArrowRightCircle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import OrderFilesSection from '../components/OrderFilesSection'
import { formatDate, formatDateTime, formatMoney } from '../utils/format'
import { BUSINESS_TYPES, businessTypeLabelKey, getStatusLabel } from '../constants/businessTypes'

// ==================== 类型定义 ====================

/**
 * 地址 JSONB 的实际形状
 *
 * ⚠️ 键名必须和后端写入的一致：service.js 的 mergeContactIntoAddress 写的是
 *    contactName / contactPhone，之前这里写成 contact / phone，联系人存了也显示不出来。
 *    reference 只有集装箱单的提柜地点会有（提柜参考号 / 预约号）。
 */
interface Address {
  country?: string
  city?: string
  zipCode?: string
  address?: string
  contactName?: string
  contactPhone?: string
  reference?: string
}

interface StatusLog {
  from_status: string
  to_status: string
  remarks: string
  created_at: string
  changed_by_name: string
}

interface LinkedDocument {
  id: string
  type: string
  doc_number: string
}

interface DocumentFlow {
  preceding: LinkedDocument[]
  subsequent: LinkedDocument[]
}

interface Order {
  id: string
  order_number: string
  customer_ref: string | null
  business_type: string
  status: string
  delivery_status: string
  transport_type: string
  cargo_description: string
  cargo_weight_kg: number
  cargo_volume_m3: number
  cargo_quantity: number
  pickup_address: Address
  delivery_address: Address
  pickup_date: string
  delivery_date: string
  special_requirements: string
  remarks: string
  client_name: string
  client_id: string
  carrier_name: string
  carrier_id: string
  carrier_score: number
  client_price: number
  carrier_cost: number
  currency: string
  // 集装箱字段
  shipping_line: string
  container_no: string
  bl_number: string
  cnee: string
  eta: string
  pod: string
  final_destination: string
  release_status: string
  clearance_status: string
  // 本地派送字段
  tracking_number: string | null
  created_at: string
  updated_at: string
}

interface OrderDetailResponse {
  order: Order
  documentFlow: DocumentFlow
  statusLogs: StatusLog[]
}

// 状态操作按钮的定义
interface StatusAction {
  /** 语言包 key，渲染时再 t()，这样切语言按钮文案会跟着变 */
  labelKey: string
  targetStatus: string
  variant: 'primary' | 'danger' | 'navigate' | 'warning'
  // 如果是跳转操作
  navigateTo?: string
  // 是否需要必填理由
  requireReason?: boolean
  // 是 delivery_status 操作还是 order status 操作
  isDeliveryStatus?: boolean
  // 是 cancel 接口
  isCancel?: boolean
}

// ==================== 工具函数 ====================

// 格式化日期（中文格式）
// 解析地址（兼容 JSON 字符串和对象）
function parseAddress(addr: Address | string | null): Address {
  const empty: Address = { country: '', city: '', zipCode: '', address: '' }
  if (!addr) return empty
  if (typeof addr === 'string') {
    try {
      return JSON.parse(addr)
    } catch {
      return empty
    }
  }
  return addr
}

// 运输类型标签的语言包 key（后端值可能大写也可能小写，统一大写后再查）
function transportTypeLabelKey(type: string): string {
  return `transportTypeLong.${(type || '').toUpperCase()}`
}

// 单据类型标签的语言包 key（单据流里的 doc_type 是小写）
function docTypeLabelKey(type: string): string {
  return `docType.${(type || '').toLowerCase()}`
}

// 单据类型对应的颜色
function getDocTypeBadgeClass(type: string): string {
  const map: Record<string, string> = {
    quotation: 'bg-purple-100 text-purple-700',
    cmr: 'bg-blue-100 text-blue-700',
    invoice: 'bg-amber-100 text-amber-700',
    customs: 'bg-green-100 text-green-700',
    release: 'bg-orange-100 text-orange-700',
    order: 'bg-slate-100 text-slate-700',
  }
  return map[type] || 'bg-gray-100 text-gray-600'
}

// 判断状态是否允许分配承运商
function canAssign(status: string): boolean {
  const assignableStatuses = [
    'pending_assign', 'PENDING_ASSIGN',
    'pending_dispatch', 'PENDING_DISPATCH',
    'confirmed', 'CONFIRMED',
    'pending_review', 'PENDING_REVIEW',
  ]
  return assignableStatuses.includes(status)
}

// 获取卡车订单状态对应的可用操作
function getTruckStatusActions(status: string): StatusAction[] {
  const s = status?.toUpperCase()
  switch (s) {
    case 'PENDING_REVIEW':
      return [
        { labelKey: 'orderAction.approve', targetStatus: 'CONFIRMED', variant: 'primary' },
        { labelKey: 'orderAction.cancelOrder', targetStatus: 'CANCELLED', variant: 'danger', requireReason: true, isCancel: true },
      ]
    case 'CONFIRMED':
      return [
        { labelKey: 'orderAction.toPendingAssign', targetStatus: 'PENDING_ASSIGN', variant: 'primary' },
      ]
    case 'PENDING_ASSIGN':
      return [
        { labelKey: 'orderAction.goAssign', targetStatus: '', variant: 'navigate', navigateTo: 'assign' },
      ]
    case 'ASSIGNED':
      return [
        { labelKey: 'orderAction.confirmPickup', targetStatus: 'IN_TRANSIT', variant: 'primary' },
      ]
    case 'IN_TRANSIT':
      return [
        { labelKey: 'orderAction.confirmArrival', targetStatus: 'DELIVERED', variant: 'primary' },
        { labelKey: 'orderAction.markException', targetStatus: 'EXCEPTION', variant: 'danger', requireReason: true },
      ]
    case 'DELIVERED':
      return [
        { labelKey: 'orderAction.confirmComplete', targetStatus: 'COMPLETED', variant: 'primary' },
      ]
    case 'EXCEPTION':
      return [
        { labelKey: 'orderAction.resumeTransport', targetStatus: 'IN_TRANSIT', variant: 'warning' },
        { labelKey: 'orderAction.cancelOrder', targetStatus: 'CANCELLED', variant: 'danger', requireReason: true, isCancel: true },
      ]
    default:
      return []
  }
}

// 获取本地派送订单状态对应的可用操作（简化流：待报价 → 待派送 → 派送中 → 已签收）
function getLocalDeliveryStatusActions(status: string): StatusAction[] {
  const s = status?.toUpperCase()
  switch (s) {
    case 'PENDING_QUOTE':
      return [
        { labelKey: 'orderAction.finishQuote', targetStatus: 'PENDING_DISPATCH', variant: 'primary' },
        { labelKey: 'orderAction.cancelOrder', targetStatus: 'CANCELLED', variant: 'danger', requireReason: true, isCancel: true },
      ]
    case 'PENDING_DISPATCH':
      return [
        { labelKey: 'orderAction.startDelivery', targetStatus: 'IN_TRANSIT', variant: 'primary' },
        { labelKey: 'orderAction.cancelOrder', targetStatus: 'CANCELLED', variant: 'danger', requireReason: true, isCancel: true },
      ]
    case 'IN_TRANSIT':
      return [
        { labelKey: 'orderAction.confirmSigned', targetStatus: 'COMPLETED', variant: 'primary' },
        { labelKey: 'orderAction.markException', targetStatus: 'EXCEPTION', variant: 'danger', requireReason: true },
      ]
    case 'EXCEPTION':
      return [
        { labelKey: 'orderAction.resumeDelivery', targetStatus: 'IN_TRANSIT', variant: 'warning' },
        { labelKey: 'orderAction.cancelOrder', targetStatus: 'CANCELLED', variant: 'danger', requireReason: true, isCancel: true },
      ]
    default:
      return []
  }
}

// 获取集装箱订单 delivery_status 对应的可用操作
function getContainerDeliveryActions(deliveryStatus: string): StatusAction[] {
  const s = deliveryStatus?.toUpperCase()
  switch (s) {
    case 'WAITING_ARRANGE':
      return [
        { labelKey: 'orderAction.fleetConfirm', targetStatus: 'FLEET_CONFIRMED', variant: 'primary', isDeliveryStatus: true },
      ]
    case 'FLEET_CONFIRMED':
      return [
        { labelKey: 'orderAction.startTransport', targetStatus: 'IN_TRANSIT', variant: 'primary', isDeliveryStatus: true },
      ]
    case 'IN_TRANSIT':
      return [
        { labelKey: 'orderAction.transportDone', targetStatus: 'TRANSPORT_DONE', variant: 'primary', isDeliveryStatus: true },
        { labelKey: 'orderAction.markException', targetStatus: 'EXCEPTION', variant: 'danger', requireReason: true, isDeliveryStatus: true },
      ]
    default:
      return []
  }
}

// 获取操作按钮的图标
function getActionIcon(action: StatusAction) {
  if (action.isCancel) return <Ban className="w-4 h-4" />
  if (action.requireReason && !action.isCancel) return <AlertTriangle className="w-4 h-4" />
  if (action.variant === 'navigate') return <ArrowRightCircle className="w-4 h-4" />
  if (action.variant === 'warning') return <RotateCcw className="w-4 h-4" />
  return <PlayCircle className="w-4 h-4" />
}

// 获取操作按钮样式
function getActionButtonClass(variant: StatusAction['variant']): string {
  switch (variant) {
    case 'primary':
      return 'bg-blue-600 text-white hover:bg-blue-700'
    case 'danger':
      return 'border border-red-300 text-red-600 hover:bg-red-50'
    case 'navigate':
      return 'border border-purple-300 text-purple-600 hover:bg-purple-50'
    case 'warning':
      return 'border border-amber-300 text-amber-600 hover:bg-amber-50'
    default:
      return 'bg-slate-100 text-slate-600 hover:bg-slate-200'
  }
}

// ==================== 骨架屏组件 ====================

function DetailSkeleton() {
  return (
    <div className="p-4 lg:p-6 animate-pulse">
      {/* 头部骨架 */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-10 h-10 bg-slate-200 rounded-xl" />
        <div className="h-7 w-48 bg-slate-200 rounded-lg" />
        <div className="h-6 w-16 bg-slate-200 rounded-lg" />
        <div className="h-5 w-32 bg-slate-200 rounded-lg" />
      </div>
      {/* 内容骨架 */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 lg:w-[65%] space-y-6">
          <div className="bg-white/80 rounded-2xl p-6 h-64" />
          <div className="bg-white/80 rounded-2xl p-6 h-40" />
          <div className="bg-white/80 rounded-2xl p-6 h-80" />
        </div>
        <div className="lg:w-[35%] space-y-6">
          <div className="bg-white/80 rounded-2xl p-6 h-48" />
          <div className="bg-white/80 rounded-2xl p-6 h-32" />
          <div className="bg-white/80 rounded-2xl p-6 h-40" />
        </div>
      </div>
    </div>
  )
}

// ==================== 星级评分组件 ====================

function StarRating({ score }: { score: number }) {
  const fullStars = Math.floor(score)
  const hasHalf = score - fullStars >= 0.5
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0)

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: fullStars }).map((_, i) => (
        <Star key={`full-${i}`} className="w-4 h-4 text-amber-400 fill-amber-400" />
      ))}
      {hasHalf && (
        <div className="relative">
          <Star className="w-4 h-4 text-slate-200 fill-slate-200" />
          <div className="absolute inset-0 overflow-hidden w-1/2">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          </div>
        </div>
      )}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <Star key={`empty-${i}`} className="w-4 h-4 text-slate-200 fill-slate-200" />
      ))}
      <span className="text-sm text-slate-500 ml-1">{Number(score).toFixed(1)}</span>
    </div>
  )
}

// ==================== Toast 通知组件 ====================

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed top-6 right-6 z-[60] animate-[slideIn_300ms_ease-out]">
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
        type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
      }`}>
        {type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
        {message}
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

export default function OrderDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()

  // 状态
  const [order, setOrder] = useState<Order | null>(null)
  const [documentFlow, setDocumentFlow] = useState<DocumentFlow>({ preceding: [], subsequent: [] })
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 操作弹窗状态
  const [actionModal, setActionModal] = useState<{ open: boolean; action: StatusAction | null }>({
    open: false,
    action: null,
  })
  const [actionRemarks, setActionRemarks] = useState('')
  const [actionSubmitting, setActionSubmitting] = useState(false)

  // Toast 通知
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // 拉取订单详情
  const fetchOrderDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<ApiResponse<OrderDetailResponse>>(`/orders/${id}`)
      if (response.code === 200 && response.data) {
        const data = response.data
        setOrder(data.order)
        setDocumentFlow(data.documentFlow || { preceding: [], subsequent: [] })
        setStatusLogs(data.statusLogs || [])
      } else {
        setError(response.message || t('orderDetail.loadFailed'))
      }
    } catch (err: any) {
      console.error('[OrderDetail] 获取订单详情失败:', err)
      setError(err.message || t('apiError.networkFailed'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchOrderDetail()
  }, [fetchOrderDetail])

  // 打开操作确认弹窗
  function openActionModal(action: StatusAction) {
    // 如果是跳转操作，直接跳转
    if (action.variant === 'navigate' && action.navigateTo) {
      navigate(`/orders/${id}/${action.navigateTo}`)
      return
    }
    setActionRemarks('')
    setActionModal({ open: true, action })
  }

  // 关闭操作弹窗
  function closeActionModal() {
    setActionModal({ open: false, action: null })
    setActionRemarks('')
    setActionSubmitting(false)
  }

  // 执行状态变更操作
  async function handleStatusAction() {
    const action = actionModal.action
    if (!action || !id) return

    // 验证必填理由
    if (action.requireReason && !actionRemarks.trim()) {
      setToast({ message: action.isCancel ? t('orderAction.reasonCancelRequired') : t('orderAction.reasonExceptionRequired'), type: 'error' })
      return
    }

    setActionSubmitting(true)
    try {
      let response: ApiResponse<any>

      if (action.isCancel) {
        // 取消订单用专用接口
        response = await api.post<ApiResponse<any>>(`/orders/${id}/cancel`, {
          reason: actionRemarks.trim(),
        })
      } else if (action.isDeliveryStatus) {
        // 集装箱 delivery_status 变更
        response = await api.put<ApiResponse<any>>(`/orders/${id}/delivery-status`, {
          status: action.targetStatus,
          remarks: actionRemarks.trim(),
        })
      } else {
        // 卡车订单 status 变更
        response = await api.put<ApiResponse<any>>(`/orders/${id}/status`, {
          status: action.targetStatus,
          remarks: actionRemarks.trim(),
        })
      }

      if (response.code === 200) {
        setToast({ message: t('orderAction.done', { action: t(action.labelKey) }), type: 'success' })
        closeActionModal()
        // 重新拉取数据
        await fetchOrderDetail()
      } else {
        setToast({ message: response.message || t('common.operateFailed'), type: 'error' })
      }
    } catch (err: any) {
      console.error('[OrderDetail] 状态变更失败:', err)
      setToast({ message: err.message || t('orderAction.failedRetry'), type: 'error' })
    } finally {
      setActionSubmitting(false)
    }
  }

  // 加载中
  if (loading) {
    return <DetailSkeleton />
  }

  // 错误状态
  if (error || !order) {
    return (
      <div className="p-4 lg:p-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/orders')}
            className="p-2 rounded-xl hover:bg-slate-100 transition-all duration-200"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-xl font-semibold text-slate-900">{t('orderDetail.pageTitle')}</h1>
        </div>
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-12 text-center">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 text-sm mb-4">{error || t('orderDetail.notFound')}</p>
          <button
            onClick={() => navigate('/orders')}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 transition-all duration-200"
          >
            {t('orderAssign.backToList')}
          </button>
        </div>
      </div>
    )
  }

  // 解析地址
  const pickupAddr = parseAddress(order.pickup_address)
  const deliveryAddr = parseAddress(order.delivery_address)

  // 业务类型（旧版这里用小写 'container' 比对，从来匹配不上，航运信息区一直不显示）
  const isContainer = order.business_type === BUSINESS_TYPES.TRUCK_FTL
  const isLocalDelivery = order.business_type === BUSINESS_TYPES.LOCAL_DELIVERY

  // 财务数据计算
  const clientPrice = order.client_price || 0
  const carrierCost = order.carrier_cost || 0
  const grossProfit = clientPrice - carrierCost
  const grossMargin = clientPrice > 0 ? (grossProfit / clientPrice) * 100 : 0
  const isProfitable = grossProfit >= 0

  // 单据流数据
  const allDocs = [...(documentFlow.preceding || []), ...(documentFlow.subsequent || [])]
  const hasDocFlow = allDocs.length > 0

  // 计算当前可用的状态操作（本地派送走简化流）
  const truckActions = isLocalDelivery
    ? getLocalDeliveryStatusActions(order.status)
    : getTruckStatusActions(order.status)
  const containerActions = isContainer ? getContainerDeliveryActions(order.delivery_status) : []
  const isTerminalStatus = ['COMPLETED', 'CANCELLED'].includes(order.status?.toUpperCase())

  return (
    <div className="p-4 lg:p-6">
      {/* Toast 通知 */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* ==================== 头部 ==================== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/orders')}
            className="p-2 rounded-xl hover:bg-slate-100 transition-all duration-200"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-900">
                {order.order_number || t('orderDetail.fallbackOrderNo', { id: order.id })}
              </h1>
              <StatusBadge status={order.status} type="order" label={getStatusLabel(t, order.business_type, order.status)} />
            </div>
            <p className="text-sm text-slate-400 mt-1">
              {t('orderDetail.createdAt', { time: formatDateTime(order.created_at) })}
              {order.customer_ref && (
                <span className="ml-3 text-slate-500">
                  {t('field.customerRef')}: <span className="text-slate-700">{order.customer_ref}</span>
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isLocalDelivery && canAssign(order.status) && (
            <button
              onClick={() => navigate(`/orders/${id}/assign`)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition-all duration-200"
            >
              <UserPlus className="w-4 h-4" />
              {t('orderDetail.assignCarrier')}
            </button>
          )}
          <button
            onClick={() => navigate(`/orders/${id}/edit`)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200"
          >
            <Edit className="w-4 h-4" />
            {t('common.edit')}
          </button>
        </div>
      </div>

      {/* ==================== 状态操作栏 ==================== */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] px-6 py-4 mb-6">
        {isTerminalStatus ? (
          // 终态提示
          <div className="flex items-center gap-2 text-slate-400">
            {order.status?.toUpperCase() === 'COMPLETED' ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-sm font-medium text-green-600">{t('orderDetail.orderCompleted')}</span>
              </>
            ) : (
              <>
                <Ban className="w-5 h-5 text-red-400" />
                <span className="text-sm font-medium text-red-500">{t('orderDetail.orderCancelled')}</span>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* 卡车订单状态操作 */}
            {truckActions.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-slate-400 font-medium mr-1">{t('orderDetail.orderStatusActions')}</span>
                {truckActions.map((action) => (
                  <button
                    key={action.labelKey}
                    onClick={() => openActionModal(action)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${getActionButtonClass(action.variant)}`}
                  >
                    {getActionIcon(action)}
                    {t(action.labelKey)}
                  </button>
                ))}
              </div>
            )}

            {/* 集装箱运输状态操作 */}
            {containerActions.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-slate-400 font-medium mr-1">{t('orderDetail.deliveryStatusActions')}</span>
                {containerActions.map((action) => (
                  <button
                    key={action.labelKey}
                    onClick={() => openActionModal(action)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${getActionButtonClass(action.variant)}`}
                  >
                    {getActionIcon(action)}
                    {t(action.labelKey)}
                  </button>
                ))}
              </div>
            )}

            {/* 无操作时的提示 */}
            {truckActions.length === 0 && containerActions.length === 0 && (
              <div className="flex items-center gap-2 text-slate-400">
                <Clock className="w-4 h-4" />
                <span className="text-sm">{t('orderDetail.noActions')}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ==================== 主体内容 ==================== */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ========== 左列 (65%) ========== */}
        <div className="flex-1 lg:w-[65%] space-y-6">

          {/* ---------- 基本信息卡片 ---------- */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              {t('section.basicInfo')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoItem label={t('common.client')} value={order.client_name || '-'} />
              <InfoItem
                label={t('field.businessType')}
                value={t(businessTypeLabelKey(order.business_type), { defaultValue: order.business_type })}
              />
              {!isLocalDelivery && (
                <InfoItem label={t('field.transportType')} value={t(transportTypeLabelKey(order.transport_type), { defaultValue: order.transport_type || '-' })} />
              )}
              {isLocalDelivery && (
                <InfoItem label={t('order.trackingNumber')} value={order.tracking_number || t('orderDetail.trackingNotSet')} />
              )}
              <InfoItem label={t('field.cargoDescription')} value={order.cargo_description || '-'} fullWidth />
              <InfoItem
                label={t('field.weight')}
                value={order.cargo_weight_kg != null ? `${order.cargo_weight_kg} kg` : '-'}
              />
              <InfoItem
                label={t('field.volume')}
                value={order.cargo_volume_m3 != null ? `${order.cargo_volume_m3} m\u00B3` : '-'}
              />
              <InfoItem
                label={t('field.quantity')}
                value={
                  order.cargo_quantity != null
                    ? t('orderDetail.pieceCount', { count: Number(order.cargo_quantity) })
                    : '-'
                }
              />
              <InfoItem label={t('field.specialRequirements')} value={
                  order.special_requirements
                    ? t(`specialRequirement.${order.special_requirements}`, {
                        defaultValue: order.special_requirements,
                      })
                    : '-'
                }
                fullWidth
              />
              <InfoItem label={t('common.remark')} value={order.remarks || '-'} fullWidth />
            </div>
          </div>

          {/* ---------- 集装箱航运信息 ---------- */}
          {isContainer && (
            <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Ship className="w-5 h-5 text-blue-600" />
                {t('section.shippingInfo')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoItem label={t('field.shippingLine')} value={order.shipping_line || '-'} />
                <InfoItem label={t('field.containerNo')} value={order.container_no || '-'} />
                <InfoItem label={t('field.blNumber')} value={order.bl_number || '-'} />
                <InfoItem label="CNEE" value={order.cnee || '-'} />
                <InfoItem label="ETA" value={order.eta ? formatDate(order.eta) : '-'} />
                <InfoItem label={t('field.pod')} value={order.pod || '-'} />
                <InfoItem label={t('field.finalDestination')} value={order.final_destination || '-'} />
                {/* 提柜地点整组选填：没填就是按常规从卸货港提柜，这时不占位 */}
                {pickupAddr.city && (
                  <InfoItem
                    label={t('section.pickupFtl')}
                    value={[pickupAddr.city, pickupAddr.address].filter(Boolean).join(' · ')}
                  />
                )}
                {pickupAddr.reference && (
                  <InfoItem label={t('field.pickupRef')} value={pickupAddr.reference} />
                )}
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400 font-medium">{t('order.colReleaseStatus')}</span>
                  {order.release_status ? (
                    <StatusBadge status={order.release_status} type="release" />
                  ) : (
                    <span className="text-sm text-slate-600">-</span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400 font-medium">{t('orderDetail.clearanceStatus')}</span>
                  {order.clearance_status ? (
                    <StatusBadge status={order.clearance_status} type="clearance" />
                  ) : (
                    <span className="text-sm text-slate-600">-</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ---------- 订单文件（需求 3 文件中心） ---------- */}
          <OrderFilesSection
            orderId={order.id}
            businessType={order.business_type}
            status={order.status}
            deliveryStatus={order.delivery_status}
            onToast={(message, type) => setToast({ message, type })}
          />

          {/* ---------- 运输路线可视化 ---------- */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
              <Truck className="w-5 h-5 text-blue-600" />
              {t('orderDetail.route')}
            </h2>
            <div className="flex items-center justify-between gap-4">
              {/* 装货地 */}
              <div className="flex-1 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-2xl mb-3">
                  <MapPin className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  {pickupAddr.city || t('orderDetail.pickupPlace')}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {pickupAddr.country || '-'}
                </p>
                {pickupAddr.address && (
                  <p className="text-xs text-slate-400 mt-1 max-w-[180px] mx-auto truncate">
                    {pickupAddr.address}
                  </p>
                )}
                <p className="text-xs text-blue-600 font-medium mt-2">
                  {order.pickup_date ? formatDate(order.pickup_date) : t('common.tbd')}
                </p>
              </div>

              {/* 连接线 */}
              <div className="flex-1 flex flex-col items-center gap-1 px-2">
                <div className="w-full border-t-2 border-dashed border-slate-300 relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-2">
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {order.delivery_status ? (
                        <StatusBadge status={order.delivery_status} type="delivery" />
                      ) : (
                        t('truckStatus.IN_TRANSIT')
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* 卸货地 */}
              <div className="flex-1 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 rounded-2xl mb-3">
                  <MapPin className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  {deliveryAddr.city || t('orderDetail.deliveryPlace')}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {deliveryAddr.country || '-'}
                </p>
                {deliveryAddr.address && (
                  <p className="text-xs text-slate-400 mt-1 max-w-[180px] mx-auto truncate">
                    {deliveryAddr.address}
                  </p>
                )}
                <p className="text-xs text-blue-600 font-medium mt-2">
                  {order.delivery_date ? formatDate(order.delivery_date) : t('common.tbd')}
                </p>
              </div>
            </div>

            {/* 联系人信息 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-4 border-t border-slate-100">
              <div>
                <p className="text-xs text-slate-400 font-medium mb-2">{t('orderDetail.pickupContact')}</p>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>{pickupAddr.contactName || '-'}</span>
                </div>
                {pickupAddr.contactPhone && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{pickupAddr.contactPhone}</span>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium mb-2">{t('orderDetail.deliveryContact')}</p>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>{deliveryAddr.contactName || '-'}</span>
                </div>
                {deliveryAddr.contactPhone && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{deliveryAddr.contactPhone}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ---------- 订单时间线 ---------- */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              {t('orderDetail.timeline')}
            </h2>

            {statusLogs.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">{t('orderDetail.noTimeline')}</p>
            ) : (
              <div className="relative">
                {statusLogs.map((log, index) => {
                  const isLast = index === statusLogs.length - 1
                  const isFirst = index === 0

                  return (
                    <div key={index} className="flex gap-4 pb-6 last:pb-0">
                      {/* 时间线装饰 */}
                      <div className="flex flex-col items-center">
                        {isFirst ? (
                          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <Circle className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                            <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                          </div>
                        )}
                        {!isLast && (
                          <div className="w-0.5 flex-1 bg-slate-200 mt-1" />
                        )}
                      </div>

                      {/* 内容 */}
                      <div className="flex-1 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={log.from_status} type="order" />
                          <span className="text-xs text-slate-400">&rarr;</span>
                          <StatusBadge status={log.to_status} type="order" />
                        </div>
                        <p className="text-xs text-slate-400 mt-1.5">
                          {formatDateTime(log.created_at)}
                          {log.changed_by_name && (
                            <span className="ml-2 text-slate-500">
                              {t('orderDetail.operator')}: {log.changed_by_name}
                            </span>
                          )}
                        </p>
                        {log.remarks && (
                          <p className="text-xs text-slate-500 mt-1 bg-slate-50 rounded-lg px-3 py-2">
                            {log.remarks}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ========== 右列 (35%) ========== */}
        <div className="lg:w-[35%] space-y-6">

          {/* ---------- 承运信息卡片 ---------- */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              {t('orderDetail.carrierInfo')}
            </h2>

            {order.carrier_name ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-400 font-medium">{t('common.carrier')}</p>
                  <p className="text-sm font-medium text-slate-900 mt-1">{order.carrier_name}</p>
                </div>
                {order.carrier_score > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-1">{t('orderAssign.performanceScore')}</p>
                    <StarRating score={order.carrier_score} />
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-400 font-medium">{t('orderDetail.driverInfo')}</p>
                  <p className="text-sm text-slate-500 mt-1">{t('orderDetail.notAssignedYet')}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">{t('orderDetail.vehicleInfo')}</p>
                  <p className="text-sm text-slate-500 mt-1">{t('orderDetail.notAssignedYet')}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <Truck className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400">{t('orderDetail.noCarrierAssigned')}</p>
                {canAssign(order.status) && (
                  <button
                    onClick={() => navigate(`/orders/${id}/assign`)}
                    className="mt-3 px-4 py-2 bg-green-600 text-white text-xs font-medium rounded-xl hover:bg-green-700 transition-all duration-200"
                  >
                    {t('orderDetail.assignNow')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ---------- CMR 状态卡片 ---------- */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              {t('orderDetail.cmrDocument')}
            </h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">{t('orderDetail.cmrStatus')}</p>
                <div className="mt-1">
                  <StatusBadge status={order.delivery_status || 'DRAFT'} type="cmr" />
                </div>
              </div>
              <button
                onClick={() => navigate(`/cmr?orderId=${id}`)}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-all duration-200"
              >
                {t('orderDetail.viewDetail')}
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ---------- 财务信息卡片 ---------- */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              {isProfitable ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-500" />
              )}
              {t('orderDetail.financeInfo')}
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{t('field.clientPrice')}</span>
                <span className="text-sm font-medium text-slate-900">
                  {formatMoney(clientPrice, order.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{t('orderDetail.carrierCost')}</span>
                <span className="text-sm font-medium text-slate-900">
                  {formatMoney(carrierCost, order.currency)}
                </span>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{t('orderDetail.grossProfit')}</span>
                  <span className={`text-sm font-semibold ${isProfitable ? 'text-green-600' : 'text-red-500'}`}>
                    {isProfitable ? '+' : ''}{formatMoney(grossProfit, order.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm font-medium text-slate-700">{t('orderDetail.grossMargin')}</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${
                      isProfitable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {Number(grossMargin).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ---------- 单据流卡片 ---------- */}
          {hasDocFlow && (
            <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                {t('orderDetail.relatedDocs')}
              </h2>
              <div className="space-y-3">
                {/* 前置单据 */}
                {documentFlow.preceding?.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-2">{t('orderDetail.precedingDocs')}</p>
                    {documentFlow.preceding.map((doc) => (
                      <DocFlowItem key={doc.id} doc={doc} />
                    ))}
                  </div>
                )}
                {/* 后续单据 */}
                {documentFlow.subsequent?.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-2">{t('orderDetail.followingDocs')}</p>
                    {documentFlow.subsequent.map((doc) => (
                      <DocFlowItem key={doc.id} doc={doc} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================== 状态操作确认弹窗 ==================== */}
      <Modal
        isOpen={actionModal.open}
        onClose={closeActionModal}
        title={actionModal.action ? t(actionModal.action.labelKey) : t('orderAction.confirmTitle')}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={closeActionModal}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleStatusAction}
              disabled={actionSubmitting}
              className={`px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                actionModal.action?.variant === 'danger'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {actionSubmitting ? t('confirmDialog.processing') : t('common.confirm')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {actionModal.action?.isCancel
              ? t('orderAction.confirmCancel', { orderNo: order.order_number })
              : actionModal.action?.requireReason
                ? t('orderAction.confirmException')
                : t('orderAction.confirmGeneric', {
                    action: actionModal.action ? t(actionModal.action.labelKey) : '',
                  })
            }
          </p>

          {/* 备注/理由输入框 */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              {actionModal.action?.isCancel ? t('orderAction.reasonCancel') : actionModal.action?.requireReason ? t('orderAction.reasonException') : t('common.remark')}
              {actionModal.action?.requireReason && (
                <span className="text-red-500 ml-0.5">*</span>
              )}
            </label>
            <textarea
              value={actionRemarks}
              onChange={(e) => setActionRemarks(e.target.value)}
              placeholder={
                actionModal.action?.isCancel
                  ? t('orderAction.reasonCancelPlaceholder')
                  : actionModal.action?.requireReason
                    ? t('orderAction.reasonExceptionPlaceholder')
                    : t('orderAction.remarksPlaceholder')
              }
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 resize-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ==================== 信息项子组件 ====================

interface InfoItemProps {
  label: string
  value: string
  fullWidth?: boolean
}

function InfoItem({ label, value, fullWidth }: InfoItemProps) {
  return (
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p className="text-sm text-slate-900 mt-1">{value}</p>
    </div>
  )
}

// ==================== 单据流子组件 ====================

function DocFlowItem({ doc }: { doc: LinkedDocument }) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // 根据单据类型跳转到对应页面
  function handleClick() {
    const routeMap: Record<string, string> = {
      quotation: '/quotes',
      cmr: '/cmr',
      invoice: '/finance',
      customs: '/customs',
      release: '/shipping-release',
      order: `/orders/${doc.id}`,
    }
    const route = routeMap[doc.type] || '#'
    navigate(route)
  }

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl hover:bg-slate-50 transition-all duration-200 group"
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium ${getDocTypeBadgeClass(doc.type)}`}
        >
          {t(docTypeLabelKey(doc.type), { defaultValue: doc.type })}
        </span>
        <span className="text-sm text-slate-700">{doc.doc_number}</span>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 transition-all duration-200" />
    </button>
  )
}
