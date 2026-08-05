/**
 * 订单管理页面
 * 三个业务类型标签：卡车派送 LTL / 卡车运输 FTL / 本地派送
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package,
  Search,
  Filter,
  Plus,
  Eye,
  Edit,
  Download,
  ChevronLeft,
  ChevronRight,
  Truck,
  Container,
  MapPin,
  X,
  Calendar,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import { formatDate, formatMoney, formatNumber } from '../utils/format'
import {
  BUSINESS_TYPES,
  type BusinessType,
  TRUCK_STATUS_TABS,
  LOCAL_DELIVERY_STATUS_TABS,
  CONTAINER_DELIVERY_STATUS_TABS,
  businessTypeLabelKey,
  getStatusLabel,
} from '../constants/businessTypes'

// ==================== 类型定义 ====================

// 订单行（字段名与后端 list API 一致，snake_case，三种业务类型共用一个查询）
interface OrderRow {
  id: string
  order_number: string
  business_type: string
  client_name: string
  pickup_city: string | null
  delivery_city: string | null
  status: string
  delivery_status: string | null
  release_status: string | null
  transport_type: string | null
  cargo_weight_kg: string | number | null
  carrier_name: string | null
  client_price: string | number | null
  currency: string
  shipping_line: string | null
  container_no: string | null
  bl_number: string | null
  eta: string | null
  tracking_number: string | null
  created_at: string
}

// API 返回的分页信息
interface Pagination {
  total: number
  page: number
  pageSize: number
}

// ==================== 常量配置 ====================

// 业务类型 Tab（枚举值来自共享常量，页面只负责配图标）
const BUSINESS_TABS = [
  { key: BUSINESS_TYPES.TRUCK_LTL, icon: Truck },
  { key: BUSINESS_TYPES.TRUCK_FTL, icon: Container },
  { key: BUSINESS_TYPES.LOCAL_DELIVERY, icon: MapPin },
] as const

const PAGE_SIZE = 15

// ==================== 组件 ====================

export default function OrderManagement() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // ---------- 状态 ----------
  // 业务类型 Tab
  const [businessType, setBusinessType] = useState<BusinessType>(BUSINESS_TYPES.TRUCK_LTL)
  // 状态筛选（FTL 筛的是派送子状态 delivery_status，其余筛主状态 status）
  const [statusFilter, setStatusFilter] = useState('')
  // 搜索关键词
  const [searchKeyword, setSearchKeyword] = useState('')
  // 提交到 API 的搜索词（防抖后）
  const [searchQuery, setSearchQuery] = useState('')
  // 日期范围
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // 筛选面板
  const [showFilter, setShowFilter] = useState(false)
  // 分页
  const [currentPage, setCurrentPage] = useState(1)
  // 加载状态
  const [loading, setLoading] = useState(false)

  // 订单数据（三种业务类型共用，切 Tab 时重新拉取）
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    total: 0, page: 1, pageSize: PAGE_SIZE,
  })

  // 跟踪号编辑弹窗（仅本地派送）
  const [trackingOrder, setTrackingOrder] = useState<OrderRow | null>(null)
  const [trackingInput, setTrackingInput] = useState('')
  const [trackingSaving, setTrackingSaving] = useState(false)

  // 轻提示
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // ---------- 搜索防抖 ----------
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchKeyword)
      setCurrentPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchKeyword])

  // ---------- 切换业务类型时重置 ----------
  const handleBusinessTypeChange = (type: BusinessType) => {
    setBusinessType(type)
    setStatusFilter('')
    setSearchKeyword('')
    setSearchQuery('')
    setDateFrom('')
    setDateTo('')
    setCurrentPage(1)
    setShowFilter(false)
  }

  // ---------- 拉取订单数据 ----------
  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('businessType', businessType)
      params.append('page', String(currentPage))
      params.append('pageSize', String(PAGE_SIZE))
      if (statusFilter) {
        // FTL Tab 的子标签是集装箱派送子状态，走 deliveryStatus 参数；
        // 传给 status 会去匹配主状态，永远查不到（旧版就是这么坏的）
        if (businessType === BUSINESS_TYPES.TRUCK_FTL) {
          params.append('deliveryStatus', statusFilter)
        } else {
          params.append('status', statusFilter)
        }
      }
      if (searchQuery) params.append('search', searchQuery)
      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo) params.append('dateTo', dateTo)

      const response = await api.get<ApiResponse<OrderRow[]>>(
        `/orders?${params.toString()}`
      )

      setOrders(response.data || [])
      setPagination(
        response.pagination || { total: 0, page: currentPage, pageSize: PAGE_SIZE }
      )
    } catch (error) {
      console.error('[OrderManagement] 获取订单列表失败:', error)
      // 请求失败时清空数据，避免残留旧数据
      setOrders([])
      setPagination({ total: 0, page: 1, pageSize: PAGE_SIZE })
    } finally {
      setLoading(false)
    }
  }, [businessType, statusFilter, searchQuery, dateFrom, dateTo, currentPage])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // ---------- 导出 ----------
  const handleExport = () => {
    const params = new URLSearchParams()
    params.append('businessType', businessType)
    if (statusFilter && businessType !== BUSINESS_TYPES.TRUCK_FTL) {
      params.append('status', statusFilter)
    }
    if (searchQuery) params.append('search', searchQuery)
    if (dateFrom) params.append('dateFrom', dateFrom)
    if (dateTo) params.append('dateTo', dateTo)
    // 通过打开新窗口触发下载
    window.open(`/api/v1/orders/export?${params.toString()}`, '_blank')
  }

  // ---------- 保存跟踪号 ----------
  const openTrackingModal = (order: OrderRow) => {
    setTrackingOrder(order)
    setTrackingInput(order.tracking_number || '')
  }

  const handleSaveTracking = async () => {
    if (!trackingOrder) return
    setTrackingSaving(true)
    try {
      await api.put<ApiResponse<null>>(
        `/orders/${trackingOrder.id}/tracking-number`,
        { trackingNumber: trackingInput.trim() }
      )
      setTrackingOrder(null)
      showToast(t('order.trackingSaved'))
      fetchOrders()
    } catch (error) {
      console.error('[OrderManagement] 保存跟踪号失败:', error)
      showToast(error instanceof Error ? error.message : t('order.trackingSaveFailed'))
    } finally {
      setTrackingSaving(false)
    }
  }

  // ---------- 当前使用的配置 ----------
  const totalPages = Math.max(1, Math.ceil(pagination.total / PAGE_SIZE))
  const statusTabs =
    businessType === BUSINESS_TYPES.TRUCK_FTL
      ? CONTAINER_DELIVERY_STATUS_TABS
      : businessType === BUSINESS_TYPES.LOCAL_DELIVERY
        ? LOCAL_DELIVERY_STATUS_TABS
        : TRUCK_STATUS_TABS
  const searchPlaceholder =
    businessType === BUSINESS_TYPES.TRUCK_FTL
      ? t('order.searchPlaceholderFtl')
      : businessType === BUSINESS_TYPES.LOCAL_DELIVERY
        ? t('order.searchPlaceholderLocal')
        : t('order.searchPlaceholderLtl')

  // ==================== 渲染 ====================

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* ===== 页面标题区域 ===== */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Package className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t('order.pageTitle')}</h1>
            <p className="text-xs text-slate-500">{t('order.pageSubtitle')}</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/orders/create')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('order.create')}
        </button>
      </div>

      {/* ===== 业务类型 Tab ===== */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="border-b border-gray-100">
          <div className="flex overflow-x-auto">
            {BUSINESS_TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = businessType === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => handleBusinessTypeChange(tab.key)}
                  className={`
                    shrink-0 flex items-center gap-2 px-6 py-3.5 text-sm font-medium border-b-2 transition-all duration-200
                    ${isActive
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-gray-200'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {t(businessTypeLabelKey(tab.key))}
                </button>
              )
            })}
          </div>
        </div>

        {/* ===== 搜索 & 操作栏 ===== */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3 flex-wrap">
            {/* 搜索框 */}
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
              />
              {searchKeyword && (
                <button
                  onClick={() => setSearchKeyword('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 筛选按钮 */}
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-all duration-200 ${
                showFilter
                  ? 'border-blue-300 bg-blue-50 text-blue-600'
                  : 'border-gray-200 text-slate-600 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              {t('order.filter')}
            </button>

            {/* 导出按钮 */}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg text-slate-600 hover:bg-gray-50 transition-all duration-200"
            >
              <Download className="w-4 h-4" />
              {t('common.export')}
            </button>
          </div>

          {/* 日期范围筛选（展开时显示） */}
          {showFilter && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Calendar className="w-4 h-4" />
                {t('order.createdDateRange')}
              </div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1) }}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
              <span className="text-slate-400 text-sm">{t('order.dateRangeTo')}</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1) }}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); setCurrentPage(1) }}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  {t('order.clearDate')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ===== 状态子标签 ===== */}
        <div className="px-4 pt-2 pb-0 flex gap-1 overflow-x-auto">
          {statusTabs.map((tab) => {
            const isActive = statusFilter === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => { setStatusFilter(tab.key); setCurrentPage(1) }}
                className={`
                  shrink-0 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-all duration-200
                  ${isActive
                    ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-gray-50'
                  }
                `}
              >
                {t(tab.labelKey)}
              </button>
            )
          })}
        </div>

        {/* ===== 表格 ===== */}
        <div className="overflow-x-auto">
          {businessType === BUSINESS_TYPES.TRUCK_FTL
            ? renderFtlTable()
            : businessType === BUSINESS_TYPES.LOCAL_DELIVERY
              ? renderLocalDeliveryTable()
              : renderLtlTable()
          }
        </div>

        {/* ===== 分页 ===== */}
        {pagination.total > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {t('common.totalCount', { count: pagination.total })}
              <span className="mx-1">·</span>
              {t('common.page', { page: currentPage, total: totalPages })}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-lg border border-gray-200 text-slate-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {renderPageNumbers()}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg border border-gray-200 text-slate-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* 空状态 */}
        {!loading && orders.length === 0 && (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <Package className="w-12 h-12 mb-3 text-slate-300" />
            <p className="text-sm">{t('order.emptyTitle')}</p>
            <p className="text-xs mt-1">
              {searchQuery || statusFilter ? t('order.emptyFiltered') : t('order.emptyHint')}
            </p>
          </div>
        )}
      </div>

      {/* ===== 跟踪号编辑弹窗（本地派送） ===== */}
      <Modal
        isOpen={trackingOrder !== null}
        onClose={() => setTrackingOrder(null)}
        title={`${t('order.trackingModalTitle')} - ${trackingOrder?.order_number || ''}`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setTrackingOrder(null)}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-slate-600 hover:bg-gray-50 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSaveTracking}
              disabled={trackingSaving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {trackingSaving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        }
      >
        <div className="space-y-2">
          <label className="block text-sm text-slate-600">{t('order.trackingNumber')}</label>
          <input
            type="text"
            value={trackingInput}
            onChange={(e) => setTrackingInput(e.target.value)}
            maxLength={100}
            placeholder={t('order.trackingPlaceholder')}
            className="w-full min-w-[320px] px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            autoFocus
          />
          <p className="text-xs text-slate-400">{t('order.trackingClearHint')}</p>
        </div>
      </Modal>

      {/* ===== 轻提示 ===== */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 bg-slate-900 text-white text-sm rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )

  // ==================== 卡车派送 LTL 表格 ====================
  function renderLtlTable() {
    if (loading) return renderSkeletonRows(9)
    if (orders.length === 0) return null

    return (
      <table className="w-full table-fixed">
        <colgroup>
          {/* 订单号 */}
          <col className="w-[12%]" />
          {/* 客户 */}
          <col className="w-[12%]" />
          {/* 路线 */}
          <col className="w-[16%]" />
          {/* 状态 */}
          <col className="w-[10%]" />
          {/* 类型 */}
          <col className="w-[8%]" />
          {/* 重量 */}
          <col className="w-[10%]" />
          {/* 承运商 */}
          <col className="w-[12%]" />
          {/* 报价 */}
          <col className="w-[10%]" />
          {/* 操作 */}
          <col className="w-[10%]" />
        </colgroup>
        <thead>
          <tr className="bg-gray-50/80">
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.orderNo')}
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.client')}
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.route')}
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.status')}
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.type')}
            </th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('order.colWeightKg')}
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.carrier')}
            </th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('order.colPriceEur')}
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.actions')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {orders.map((order) => (
            <tr
              key={order.id}
              className="hover:bg-blue-50/30 transition-colors duration-150"
            >
              {/* 订单号 - 可点击 */}
              <td className="px-4 py-3">
                <button
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline truncate block max-w-full text-left"
                  title={order.order_number}
                >
                  {order.order_number}
                </button>
              </td>
              {/* 客户 */}
              <td className="px-4 py-3 text-xs text-slate-700 truncate" title={order.client_name}>
                {order.client_name}
              </td>
              {/* 路线 */}
              <td className="px-4 py-3 text-xs text-slate-600">
                <span className="truncate block" title={`${order.pickup_city} → ${order.delivery_city}`}>
                  {order.pickup_city}
                  <span className="text-slate-400 mx-1">→</span>
                  {order.delivery_city}
                </span>
              </td>
              {/* 状态 */}
              <td className="px-4 py-3 text-center">
                <StatusBadge status={order.status} />
              </td>
              {/* 类型 FTL/LTL */}
              <td className="px-4 py-3 text-center">
                {order.transport_type ? (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    order.transport_type === 'FTL'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-teal-100 text-teal-700'
                  }`}>
                    {order.transport_type}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">-</span>
                )}
              </td>
              {/* 重量 */}
              <td className="px-4 py-3 text-xs text-slate-700 text-right tabular-nums">
                {formatNumber(order.cargo_weight_kg)}
              </td>
              {/* 承运商 */}
              <td className="px-4 py-3 text-xs text-slate-600 truncate" title={order.carrier_name || undefined}>
                {order.carrier_name || '-'}
              </td>
              {/* 报价 */}
              <td className="px-4 py-3 text-xs text-slate-700 text-right tabular-nums font-medium">
                {formatMoney(order.client_price, order.currency)}
              </td>
              {/* 操作 */}
              <td className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all duration-200"
                    title={t('common.view')}
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate(`/orders/${order.id}/edit`)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-all duration-200"
                    title={t('common.edit')}
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // ==================== 卡车运输 FTL（原集装箱物流）表格 ====================
  function renderFtlTable() {
    if (loading) return renderSkeletonRows(10)
    if (orders.length === 0) return null

    return (
      <table className="w-full table-fixed">
        <colgroup>
          {/* 订单号 */}
          <col className="w-[10%]" />
          {/* 客户 */}
          <col className="w-[10%]" />
          {/* 船司 */}
          <col className="w-[10%]" />
          {/* 柜号 */}
          <col className="w-[11%]" />
          {/* 提单号 */}
          <col className="w-[12%]" />
          {/* 目的地 */}
          <col className="w-[10%]" />
          {/* 派送状态 */}
          <col className="w-[10%]" />
          {/* 放单状态 */}
          <col className="w-[10%]" />
          {/* ETA */}
          <col className="w-[9%]" />
          {/* 操作 */}
          <col className="w-[8%]" />
        </colgroup>
        <thead>
          <tr className="bg-gray-50/80">
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.orderNo')}
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.client')}
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('order.colShippingLine')}
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('order.colContainerNo')}
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('order.colBlNumber')}
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('order.colDestination')}
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('order.colDeliveryStatus')}
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('order.colReleaseStatus')}
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              ETA
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.actions')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {orders.map((order) => (
            <tr
              key={order.id}
              className="hover:bg-blue-50/30 transition-colors duration-150"
            >
              {/* 订单号 */}
              <td className="px-4 py-3">
                <button
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline truncate block max-w-full text-left"
                  title={order.order_number}
                >
                  {order.order_number}
                </button>
              </td>
              {/* 客户 */}
              <td className="px-4 py-3 text-xs text-slate-700 truncate" title={order.client_name}>
                {order.client_name}
              </td>
              {/* 船司 */}
              <td className="px-4 py-3 text-xs text-slate-600 truncate" title={order.shipping_line || undefined}>
                {order.shipping_line || '-'}
              </td>
              {/* 柜号 */}
              <td className="px-4 py-3 text-xs text-slate-700 font-mono truncate" title={order.container_no || undefined}>
                {order.container_no || '-'}
              </td>
              {/* 提单号 */}
              <td className="px-4 py-3 text-xs text-slate-700 font-mono truncate" title={order.bl_number || undefined}>
                {order.bl_number || '-'}
              </td>
              {/* 目的地 */}
              <td className="px-4 py-3 text-xs text-slate-600 truncate" title={order.delivery_city || undefined}>
                {order.delivery_city || '-'}
              </td>
              {/* 派送状态 */}
              <td className="px-4 py-3 text-center">
                <StatusBadge status={order.delivery_status || ''} />
              </td>
              {/* 放单状态 */}
              <td className="px-4 py-3 text-center">
                <StatusBadge status={order.release_status || ''} />
              </td>
              {/* ETA */}
              <td className="px-4 py-3 text-xs text-slate-600 text-center">
                {order.eta ? formatDate(order.eta) : '-'}
              </td>
              {/* 操作 */}
              <td className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all duration-200"
                    title={t('common.view')}
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate(`/orders/${order.id}/edit`)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-all duration-200"
                    title={t('common.edit')}
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // ==================== 本地派送表格 ====================
  function renderLocalDeliveryTable() {
    if (loading) return renderSkeletonRows(8)
    if (orders.length === 0) return null

    return (
      <table className="w-full table-fixed">
        <colgroup>
          {/* 订单号 */}
          <col className="w-[13%]" />
          {/* 客户 */}
          <col className="w-[13%]" />
          {/* 路线 */}
          <col className="w-[17%]" />
          {/* 状态 */}
          <col className="w-[10%]" />
          {/* 跟踪号 */}
          <col className="w-[16%]" />
          {/* 报价 */}
          <col className="w-[10%]" />
          {/* 创建日期 */}
          <col className="w-[11%]" />
          {/* 操作 */}
          <col className="w-[10%]" />
        </colgroup>
        <thead>
          <tr className="bg-gray-50/80">
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.orderNo')}
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.client')}
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.route')}
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.status')}
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('order.trackingNumber')}
            </th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('order.colPriceEur')}
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('order.colCreatedDate')}
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.actions')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {orders.map((order) => (
            <tr
              key={order.id}
              className="hover:bg-blue-50/30 transition-colors duration-150"
            >
              {/* 订单号 - 可点击 */}
              <td className="px-4 py-3">
                <button
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline truncate block max-w-full text-left"
                  title={order.order_number}
                >
                  {order.order_number}
                </button>
              </td>
              {/* 客户 */}
              <td className="px-4 py-3 text-xs text-slate-700 truncate" title={order.client_name}>
                {order.client_name}
              </td>
              {/* 路线 */}
              <td className="px-4 py-3 text-xs text-slate-600">
                <span className="truncate block" title={`${order.pickup_city} → ${order.delivery_city}`}>
                  {order.pickup_city}
                  <span className="text-slate-400 mx-1">→</span>
                  {order.delivery_city}
                </span>
              </td>
              {/* 状态（本地派送文案：IN_TRANSIT→派送中，COMPLETED→已签收） */}
              <td className="px-4 py-3 text-center">
                <StatusBadge
                  status={order.status}
                  label={getStatusLabel(t, order.business_type, order.status)}
                />
              </td>
              {/* 跟踪号（点击填写/修改） */}
              <td className="px-4 py-3">
                {order.tracking_number ? (
                  <button
                    onClick={() => openTrackingModal(order)}
                    className="text-xs font-mono text-slate-700 hover:text-blue-600 hover:underline truncate block max-w-full text-left"
                    title={t('order.trackingEditHint', { value: order.tracking_number })}
                  >
                    {order.tracking_number}
                  </button>
                ) : (
                  <button
                    onClick={() => openTrackingModal(order)}
                    className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    {t('order.trackingFill')}
                  </button>
                )}
              </td>
              {/* 报价 */}
              <td className="px-4 py-3 text-xs text-slate-700 text-right tabular-nums font-medium">
                {formatMoney(order.client_price, order.currency)}
              </td>
              {/* 创建日期 */}
              <td className="px-4 py-3 text-xs text-slate-600 text-center">
                {formatDate(order.created_at)}
              </td>
              {/* 操作 */}
              <td className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all duration-200"
                    title={t('common.view')}
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate(`/orders/${order.id}/edit`)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-all duration-200"
                    title={t('common.edit')}
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // ==================== 骨架屏加载 ====================
  function renderSkeletonRows(colCount: number) {
    return (
      <table className="w-full">
        <tbody>
          {Array.from({ length: 6 }).map((_, rowIdx) => (
            <tr key={rowIdx} className="border-b border-gray-50">
              {Array.from({ length: colCount }).map((_, colIdx) => (
                <td key={colIdx} className="px-4 py-3.5">
                  <div className="h-4 bg-gray-100 rounded animate-pulse" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // ==================== 页码按钮 ====================
  function renderPageNumbers() {
    const pages: (number | string)[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible + 2) {
      // 总页数不多，全部显示
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      // 始终显示第1页
      pages.push(1)

      let start = Math.max(2, currentPage - 1)
      let end = Math.min(totalPages - 1, currentPage + 1)

      // 保证中间至少显示 3 个页码
      if (start <= 2) {
        end = Math.min(totalPages - 1, start + 2)
      }
      if (end >= totalPages - 1) {
        start = Math.max(2, end - 2)
      }

      if (start > 2) pages.push('...')
      for (let i = start; i <= end; i++) pages.push(i)
      if (end < totalPages - 1) pages.push('...')

      // 始终显示最后一页
      pages.push(totalPages)
    }

    return pages.map((page, idx) => {
      if (page === '...') {
        return (
          <span key={`ellipsis-${idx}`} className="px-2 py-1 text-xs text-slate-400">
            ...
          </span>
        )
      }

      const pageNum = page as number
      const isActive = currentPage === pageNum
      return (
        <button
          key={pageNum}
          onClick={() => setCurrentPage(pageNum)}
          className={`min-w-[32px] h-8 px-2 text-xs rounded-lg border transition-all duration-200 ${
            isActive
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          {pageNum}
        </button>
      )
    })
  }
}
