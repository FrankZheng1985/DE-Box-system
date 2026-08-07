/**
 * 派单页面
 * 为订单分配承运商，包含承运商报价对比面板和推荐承运商卡片
 */

import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Truck,
  Star,
  MapPin,
  Package,
  Scale,
  AlertCircle,
  CheckCircle,
  Loader2,
  Globe,
  Clock,
  BarChart3,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import { formatMoney, formatNumber } from '../utils/format'
import { useMasterDataOptions } from '../hooks/useMasterDataOptions'

// ==================== 类型定义 ====================

interface Address {
  country: string
  city: string
  zipCode: string
  address: string
  contact: string
  phone: string
}

interface Order {
  id: string
  order_number: string
  business_type: string
  transport_type: string
  cargo_weight_kg: number
  cargo_volume_m3: number
  pickup_address: Address | string
  delivery_address: Address | string
  client_name: string
  status: string
}

interface MatchedCarrier {
  id: string
  carrier_code: string
  company_name: string
  country: string
  performance_score: number
  vehicle_types: string[]
  available_vehicles: number | string
  /** 准时率（百分比）。样本为 0 时后端给 null，界面显示 "-" */
  on_time_rate?: number | string | null
  /** 准时率是基于几单算的，用来提示样本量，别让 1 单的 100% 显得很权威 */
  on_time_sample?: number
  /** 跑过的真实线路（装货城市 → 卸货城市），按次数取前 5 条 */
  covered_routes?: string[] | null
  /**
   * 是否跑过本单这条线（装货城市 → 卸货城市）。
   * 只用于排序和界面标记，**不代表没跑过就不能派** —— 后端不会因此排除任何人。
   */
  route_matched?: boolean
}

// ==================== 工具函数 ====================

// 解析地址（兼容 JSON 字符串和对象）
function parseAddress(addr: Address | string | null): Address {
  const empty: Address = { country: '', city: '', zipCode: '', address: '', contact: '', phone: '' }
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

// 运输类型标签的语言包 key（值可能是大写也可能是小写，统一大写后再查）
function transportLabelKey(type: string): string {
  return `transportType.${(type || '').toUpperCase()}`
}

// ==================== 骨架屏组件 ====================

function AssignSkeleton() {
  return (
    <div className="p-4 lg:p-6 animate-pulse">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-10 h-10 bg-slate-200 rounded-xl" />
        <div className="h-7 w-40 bg-slate-200 rounded-lg" />
        <div className="h-5 w-32 bg-slate-200 rounded-lg" />
      </div>
      <div className="bg-white/80 rounded-2xl p-6 h-24 mb-6" />
      <div className="bg-white/80 rounded-2xl p-6 h-48 mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white/80 rounded-2xl p-6 h-64" />
        ))}
      </div>
    </div>
  )
}

// ==================== 评分星标组件 ====================

function ScoreStars({ score }: { score: number }) {
  const maxScore = 5
  const normalizedScore = Math.min(score, maxScore)
  const fullStars = Math.floor(normalizedScore)
  const hasHalf = normalizedScore - fullStars >= 0.5

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: fullStars }).map((_, i) => (
        <Star key={`f-${i}`} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
      ))}
      {hasHalf && (
        <div className="relative">
          <Star className="w-3.5 h-3.5 text-slate-200 fill-slate-200" />
          <div className="absolute inset-0 overflow-hidden w-1/2">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          </div>
        </div>
      )}
      {Array.from({ length: maxScore - fullStars - (hasHalf ? 1 : 0) }).map((_, i) => (
        <Star key={`e-${i}`} className="w-3.5 h-3.5 text-slate-200 fill-slate-200" />
      ))}
      <span className="ml-1 text-xs text-slate-500">{Number(score).toFixed(1)}</span>
    </div>
  )
}

// ==================== 确认弹窗组件 ====================

interface ConfirmDialogProps {
  visible: boolean
  carrierName: string
  price: number
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}

function ConfirmDialog({ visible, carrierName, price, onConfirm, onCancel, loading }: ConfirmDialogProps) {
  const { t } = useTranslation()
  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-6 w-full max-w-md mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Truck className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">{t('orderAssign.confirmTitle')}</h3>
        </div>

        <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{t('common.carrier')}</span>
            <span className="text-sm font-medium text-slate-900">{carrierName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{t('orderAssign.carrierCost')}</span>
            <span className="text-sm font-semibold text-blue-600">{formatMoney(price)}</span>
          </div>
        </div>

        <p className="text-sm text-slate-500 mb-6">
          {t('orderAssign.confirmHint')}
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-all duration-200 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('orderAssign.assigning')}
              </>
            ) : (
              t('orderAssign.confirmAssign')
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

export default function OrderAssign() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()

  // 状态
  const [order, setOrder] = useState<Order | null>(null)
  const [carriers, setCarriers] = useState<MatchedCarrier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 每个承运商的报价输入
  const [carrierPrices, setCarrierPrices] = useState<Record<string, number>>({})

  // 确认弹窗
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [selectedCarrier, setSelectedCarrier] = useState<MatchedCarrier | null>(null)
  const [assigning, setAssigning] = useState(false)

  // 成功提示
  const [successMsg, setSuccessMsg] = useState('')

  // 车型筛选：订单表里没有「本单需要什么车型」字段，无从自动推导，
  // 所以做成运营手动选。空 = 不筛（默认，行为与以前一致）
  const [vehicleFilter, setVehicleFilter] = useState('')
  // 换筛选只重拉承运商，用独立的 loading，别让整页骨架屏闪一下
  const [loadingCarriers, setLoadingCarriers] = useState(false)
  const { options: vehicleTypeOptions } = useMasterDataOptions('vehicle-types')

  // 第一步：拉订单。匹配承运商要带本单的装卸货城市，所以必须先拿到它
  // （原来两个请求是 Promise.all 并行的，拿不到城市，筛选参数一直没法传）
  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function fetchOrder() {
      setLoading(true)
      setError(null)
      try {
        const res = await api.get<ApiResponse<{ order: Order }>>(`/orders/${id}`)
        if (cancelled) return
        if (res.code === 200 && res.data) {
          setOrder(res.data.order || (res.data as unknown as Order))
        } else {
          setError(res.message || t('orderAssign.loadOrderFailed'))
          setLoading(false)
        }
      } catch (err: any) {
        if (cancelled) return
        console.error('[OrderAssign] 获取订单失败:', err)
        setError(err.message || t('apiError.networkFailed'))
        setLoading(false)
      }
    }

    fetchOrder()
    return () => { cancelled = true }
  }, [id])

  // 第二步：按本单路线 + 运营选的车型匹配承运商。
  // 单独一个 effect，这样换车型筛选时只重拉承运商，不用重拉订单。
  useEffect(() => {
    if (!order) return
    let cancelled = false

    async function fetchCarriers() {
      setLoadingCarriers(true)
      try {
        // 路线：跑过这条线的排前面并带 route_matched 标记，**不排除任何人**
        // 车型：**会排除**没有该车型的承运商（但没维护过车型的照常显示，未知≠做不了）
        const from = parseAddress(order!.pickup_address).city?.trim()
        const to = parseAddress(order!.delivery_address).city?.trim()
        const qs = new URLSearchParams()
        if (from) qs.set('routeFrom', from)
        if (to) qs.set('routeTo', to)
        if (vehicleFilter) qs.set('vehicleType', vehicleFilter)
        const matchUrl = qs.toString() ? `/carriers/match?${qs}` : '/carriers/match'

        const res = await api.get<ApiResponse<MatchedCarrier[]>>(matchUrl)
        if (cancelled) return

        if (res.code === 200 && res.data) {
          const list = Array.isArray(res.data) ? res.data : []
          setCarriers(list)
          // 换筛选条件后**保留运营已经填过的报价**，只给新出现的承运商补 0，
          // 否则改一下车型就把输入清空了
          setCarrierPrices((prev) => {
            const next: Record<string, number> = {}
            list.forEach((c) => { next[c.id] = prev[c.id] ?? 0 })
            return next
          })
        }
      } catch (err: any) {
        if (cancelled) return
        console.error('[OrderAssign] 匹配承运商失败:', err)
        setError(err.message || t('apiError.networkFailed'))
      } finally {
        if (!cancelled) {
          setLoadingCarriers(false)
          setLoading(false)
        }
      }
    }

    fetchCarriers()
    return () => { cancelled = true }
  }, [order, vehicleFilter])

  // 更新报价金额
  function handlePriceChange(carrierId: string, value: string) {
    const num = parseFloat(value) || 0
    setCarrierPrices((prev) => ({ ...prev, [carrierId]: num }))
  }

  // 打开确认弹窗
  function handleAssignClick(carrier: MatchedCarrier) {
    const price = carrierPrices[carrier.id] || 0
    if (price <= 0) {
      setError(t('orderAssign.priceRequired'))
      setTimeout(() => setError(null), 3000)
      return
    }
    setSelectedCarrier(carrier)
    setConfirmVisible(true)
  }

  // 执行指派
  async function handleConfirmAssign() {
    if (!selectedCarrier || !id) return
    const price = carrierPrices[selectedCarrier.id] || 0

    setAssigning(true)
    try {
      const res = await api.post<ApiResponse<any>>(`/orders/${id}/assign`, {
        carrierId: selectedCarrier.id,
        carrierCost: price,
      })

      if (res.code === 200) {
        setConfirmVisible(false)
        setSuccessMsg(t('orderAssign.assignSuccess', { carrier: selectedCarrier.company_name }))
        // 2 秒后跳转回订单详情
        setTimeout(() => {
          navigate(`/orders/${id}`)
        }, 2000)
      } else {
        setError(res.message || t('orderAssign.assignFailed'))
        setConfirmVisible(false)
      }
    } catch (err: any) {
      console.error('[OrderAssign] 指派失败:', err)
      setError(err.message || t('orderAssign.assignFailedRetry'))
      setConfirmVisible(false)
    } finally {
      setAssigning(false)
    }
  }

  // 加载中
  if (loading) return <AssignSkeleton />

  // 错误
  if (error && !order) {
    return (
      <div className="p-4 lg:p-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-slate-100 transition-all duration-200"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-xl font-semibold text-slate-900">{t('orderAssign.pageTitle')}</h1>
        </div>
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-12 text-center">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 text-sm mb-4">{error}</p>
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

  if (!order) return null

  // 解析地址
  const pickupAddr = parseAddress(order.pickup_address)
  const deliveryAddr = parseAddress(order.delivery_address)

  // 对比表格数据（取前 5 个承运商展示）
  const compareCarriers = carriers.slice(0, 5)

  return (
    <div className="p-4 lg:p-6">
      {/* ==================== 成功提示 ==================== */}
      {successMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-green-50 border border-green-200 text-green-700 px-5 py-3 rounded-xl shadow-lg animate-in">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-sm font-medium">{successMsg}</span>
        </div>
      )}

      {/* ==================== 错误提示 ==================== */}
      {error && order && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-5 py-3 rounded-xl shadow-lg">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* ==================== 头部 ==================== */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-slate-100 transition-all duration-200"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t('orderAssign.pageTitle')}</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {t('common.orderNo')}: {order.order_number || order.id}
          </p>
        </div>
      </div>

      {/* ==================== 订单摘要条 ==================== */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4 mb-6">
        <div className="flex flex-wrap items-center gap-6">
          {/* 路线 */}
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-green-600" />
            <span className="text-sm text-slate-700 font-medium">
              {pickupAddr.city || pickupAddr.country || t('orderAssign.origin')}
            </span>
            <span className="text-slate-300 mx-1">&rarr;</span>
            <MapPin className="w-4 h-4 text-red-500" />
            <span className="text-sm text-slate-700 font-medium">
              {deliveryAddr.city || deliveryAddr.country || t('orderAssign.destination')}
            </span>
          </div>

          <div className="w-px h-6 bg-slate-200" />

          {/* 类型 */}
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-slate-600">
              {t(transportLabelKey(order.transport_type), { defaultValue: order.transport_type || '-' })}
            </span>
          </div>

          <div className="w-px h-6 bg-slate-200" />

          {/* 重量 */}
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-600">
              {order.cargo_weight_kg ? `${formatNumber(order.cargo_weight_kg)} kg` : '-'}
            </span>
          </div>
        </div>
      </div>

      {/* ==================== 承运商报价对比表 ==================== */}
      {compareCarriers.length > 0 && (
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            {t('orderAssign.compareTitle')}
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full table-fixed min-w-[600px]">
              <colgroup>
                <col className="w-[18%]" />
                {compareCarriers.map((c) => (
                  <col key={c.id} style={{ width: `${82 / compareCarriers.length}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 px-3 text-xs font-medium text-slate-500">{t('orderAssign.compareItem')}</th>
                  {compareCarriers.map((c) => (
                    <th key={c.id} className="text-center py-3 px-3 text-xs font-medium text-slate-700">
                      {c.company_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* 报价金额 */}
                <tr className="border-b border-slate-50">
                  <td className="py-3 px-3 text-xs text-slate-500">{t('orderAssign.quoteAmountEur')}</td>
                  {compareCarriers.map((c) => (
                    <td key={c.id} className="py-3 px-3 text-center">
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={carrierPrices[c.id] || ''}
                        onChange={(e) => handlePriceChange(c.id, e.target.value)}
                        placeholder={t('orderAssign.enterQuote')}
                        className="w-full max-w-[120px] mx-auto px-3 py-1.5 text-sm text-center border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      />
                    </td>
                  ))}
                </tr>
                {/* 综合评分 */}
                <tr className="border-b border-slate-50">
                  <td className="py-3 px-3 text-xs text-slate-500">{t('orderAssign.overallScore')}</td>
                  {compareCarriers.map((c) => (
                    <td key={c.id} className="py-3 px-3 text-center">
                      <span className="text-sm font-medium text-slate-700">
                        {c.performance_score ? Number(c.performance_score).toFixed(1) : '-'} / 10
                      </span>
                    </td>
                  ))}
                </tr>
                {/* 历史准时率 */}
                <tr className="border-b border-slate-50">
                  <td className="py-3 px-3 text-xs text-slate-500">{t('orderAssign.onTimeRate')}</td>
                  {compareCarriers.map((c) => (
                    <td key={c.id} className="py-3 px-3 text-center">
                      <span
                        className={`text-sm font-medium ${
                          (Number(c.on_time_rate) || 0) >= 90
                            ? 'text-green-600'
                            : (Number(c.on_time_rate) || 0) >= 70
                            ? 'text-amber-600'
                            : 'text-red-500'
                        }`}
                      >
                        {c.on_time_rate != null
                          ? t('orderAssign.onTimeWithSample', {
                              rate: c.on_time_rate,
                              count: c.on_time_sample ?? 0,
                            })
                          : '-'}
                      </span>
                    </td>
                  ))}
                </tr>
                {/* 可用车辆 */}
                <tr>
                  <td className="py-3 px-3 text-xs text-slate-500">{t('orderAssign.availableVehicles')}</td>
                  {compareCarriers.map((c) => (
                    <td key={c.id} className="py-3 px-3 text-center">
                      <span className="text-sm font-medium text-slate-700">
                        {t('orderAssign.vehicleCount', { count: Number(c.available_vehicles) || 0 })}
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== 推荐承运商卡片 ==================== */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-600" />
          {t('orderAssign.recommendedTitle')}
          <span className="text-sm font-normal text-slate-400 ml-1">
            {t('orderAssign.availableCarrierCount', { count: carriers.length })}
          </span>
          {loadingCarriers && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
        </h2>

        {/* 车型筛选（手动选）：订单里没有「本单需要什么车型」字段，无从自动推导 */}
        <div className="flex items-center gap-2">
          <label htmlFor="vehicleFilter" className="text-xs text-slate-500 whitespace-nowrap">
            {t('orderAssign.filterByVehicle')}
          </label>
          <select
            id="vehicleFilter"
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className="min-w-[10rem] h-9 px-3 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
          >
            <option value="">{t('orderAssign.vehicleAny')}</option>
            {vehicleTypeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 筛了车型却一家都没剩时，把原因说清楚——别让人以为系统坏了 */}
      {vehicleFilter && carriers.length === 0 && (
        <div className="mb-4 text-sm px-4 py-3 rounded-xl bg-amber-50 text-amber-700">
          {t('orderAssign.noCarrierForVehicle')}
        </div>
      )}

      {carriers.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-12 text-center">
          <Truck className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 text-sm">{t('orderAssign.noCarriers')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {carriers.map((carrier) => (
            <div
              key={carrier.id}
              className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 flex flex-col transition-all duration-200 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
            >
              {/* 承运商名称和国家 */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{carrier.company_name}</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">{carrier.country || '-'}</span>
                  </div>
                </div>
                <span className="text-xs text-slate-400 font-mono">{carrier.carrier_code}</span>
              </div>

              {/* 数据指标 */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {/* 可用车辆 */}
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Truck className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">{t('orderAssign.availableVehicles')}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {t('orderAssign.vehicleCount', { count: Number(carrier.available_vehicles) || 0 })}
                  </p>
                </div>

                {/* 准时率 */}
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">{t('orderAssign.onTimeRateShort')}</span>
                  </div>
                  <p
                    className={`text-sm font-semibold ${
                      (Number(carrier.on_time_rate) || 0) >= 90
                        ? 'text-green-600'
                        : (Number(carrier.on_time_rate) || 0) >= 70
                        ? 'text-amber-600'
                        : 'text-red-500'
                    }`}
                  >
                    {carrier.on_time_rate != null
                      ? t('orderAssign.onTimeWithSample', {
                          rate: carrier.on_time_rate,
                          count: carrier.on_time_sample ?? 0,
                        })
                      : '-'}
                  </p>
                </div>
              </div>

              {/* 评分 */}
              <div className="mb-3">
                <span className="text-xs text-slate-500 block mb-1">{t('orderAssign.performanceScore')}</span>
                <ScoreStars score={carrier.performance_score || 0} />
              </div>

              {/* 跑过本单这条线的标记（只是提示，没有这个标记也照样能派） */}
              {carrier.route_matched && (
                <div className="mb-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-lg">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {t('orderAssign.routeMatched')}
                  </span>
                </div>
              )}

              {/* 覆盖路线 */}
              {carrier.covered_routes && carrier.covered_routes.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs text-slate-500 block mb-1.5">{t('orderAssign.coveredRoutes')}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {carrier.covered_routes.slice(0, 4).map((route, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-lg"
                      >
                        {route}
                      </span>
                    ))}
                    {carrier.covered_routes.length > 4 && (
                      <span className="text-xs text-slate-400">
                        +{carrier.covered_routes.length - 4}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 报价输入 + 指派按钮 */}
              <div className="mt-auto pt-4 border-t border-slate-100">
                <div className="mb-3">
                  <label className="text-xs text-slate-500 block mb-1">{t('orderAssign.carrierCostEur')}</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={carrierPrices[carrier.id] || ''}
                    onChange={(e) => handlePriceChange(carrier.id, e.target.value)}
                    placeholder={t('orderAssign.enterQuoteAmount')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                </div>
                <button
                  onClick={() => handleAssignClick(carrier)}
                  className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Truck className="w-4 h-4" />
                  {t('orderAssign.assign')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ==================== 确认弹窗 ==================== */}
      <ConfirmDialog
        visible={confirmVisible}
        carrierName={selectedCarrier?.company_name || ''}
        price={selectedCarrier ? carrierPrices[selectedCarrier.id] || 0 : 0}
        onConfirm={handleConfirmAssign}
        onCancel={() => setConfirmVisible(false)}
        loading={assigning}
      />
    </div>
  )
}
