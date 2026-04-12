/**
 * 订单管理页面
 * 包含两个业务类型标签：篷布车运输 / 集装箱物流
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
  X,
  Calendar,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'

// ==================== 类型定义 ====================

// 篷布车运输订单（字段名与后端 API 一致，snake_case）
interface CurtainSideOrder {
  id: string
  order_number: string
  client_name: string
  pickup_city: string
  delivery_city: string
  status: string
  transport_type: string
  cargo_weight_kg: string | number | null
  carrier_name: string | null
  client_price: string | number | null
  currency: string
  created_at: string
}

// 集装箱物流订单
interface ContainerOrder {
  id: string
  order_number: string
  client_name: string
  shipping_line: string | null
  container_no: string | null
  bl_number: string | null
  delivery_city: string | null
  delivery_status: string | null
  release_status: string | null
  eta: string | null
  created_at: string
}

// API 返回的分页信息
interface Pagination {
  total: number
  page: number
  pageSize: number
}

// ==================== 常量配置 ====================

// 业务类型 Tab
const BUSINESS_TABS = [
  { key: 'CURTAIN_SIDE', label: '篷布车运输', icon: Truck },
  { key: 'CONTAINER', label: '集装箱物流', icon: Container },
] as const

type BusinessType = typeof BUSINESS_TABS[number]['key']

// 篷布车运输状态子标签
const CURTAIN_SIDE_STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'PENDING_REVIEW', label: '待审核' },
  { key: 'PENDING_ASSIGN', label: '待派单' },
  { key: 'IN_TRANSIT', label: '运输中' },
  { key: 'DELIVERED', label: '已到达' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'EXCEPTION', label: '异常' },
]

// 集装箱物流状态子标签
const CONTAINER_STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'WAITING_ARRANGE', label: '等待安排' },
  { key: 'FLEET_CONFIRMED', label: '车队已确认' },
  { key: 'IN_TRANSIT', label: '运输中' },
  { key: 'TRANSPORT_DONE', label: '运输完成' },
  { key: 'EXCEPTION', label: '异常' },
]

const PAGE_SIZE = 15

// ==================== 组件 ====================

export default function OrderManagement() {
  const navigate = useNavigate()

  // ---------- 状态 ----------
  // 业务类型 Tab
  const [businessType, setBusinessType] = useState<BusinessType>('CURTAIN_SIDE')
  // 状态筛选
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

  // 篷布车数据
  const [curtainSideOrders, setCurtainSideOrders] = useState<CurtainSideOrder[]>([])
  const [curtainSidePagination, setCurtainSidePagination] = useState<Pagination>({
    total: 0, page: 1, pageSize: PAGE_SIZE,
  })

  // 集装箱数据
  const [containerOrders, setContainerOrders] = useState<ContainerOrder[]>([])
  const [containerPagination, setContainerPagination] = useState<Pagination>({
    total: 0, page: 1, pageSize: PAGE_SIZE,
  })

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
      if (statusFilter) params.append('status', statusFilter)
      if (searchQuery) params.append('search', searchQuery)
      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo) params.append('dateTo', dateTo)

      const response = await api.get<ApiResponse<CurtainSideOrder[] | ContainerOrder[]>>(
        `/orders?${params.toString()}`
      )

      if (businessType === 'CURTAIN_SIDE') {
        setCurtainSideOrders((response.data || []) as CurtainSideOrder[])
        setCurtainSidePagination(
          response.pagination || { total: 0, page: currentPage, pageSize: PAGE_SIZE }
        )
      } else {
        setContainerOrders((response.data || []) as ContainerOrder[])
        setContainerPagination(
          response.pagination || { total: 0, page: currentPage, pageSize: PAGE_SIZE }
        )
      }
    } catch (error) {
      console.error('[OrderManagement] 获取订单列表失败:', error)
      // 请求失败时清空数据，避免残留旧数据
      if (businessType === 'CURTAIN_SIDE') {
        setCurtainSideOrders([])
        setCurtainSidePagination({ total: 0, page: 1, pageSize: PAGE_SIZE })
      } else {
        setContainerOrders([])
        setContainerPagination({ total: 0, page: 1, pageSize: PAGE_SIZE })
      }
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
    if (statusFilter) params.append('status', statusFilter)
    if (searchQuery) params.append('search', searchQuery)
    if (dateFrom) params.append('dateFrom', dateFrom)
    if (dateTo) params.append('dateTo', dateTo)
    // 通过打开新窗口触发下载
    window.open(`/api/v1/orders/export?${params.toString()}`, '_blank')
  }

  // ---------- 当前使用的数据 ----------
  const orders = businessType === 'CURTAIN_SIDE' ? curtainSideOrders : containerOrders
  const pagination = businessType === 'CURTAIN_SIDE' ? curtainSidePagination : containerPagination
  const totalPages = Math.max(1, Math.ceil(pagination.total / PAGE_SIZE))
  const statusTabs = businessType === 'CURTAIN_SIDE' ? CURTAIN_SIDE_STATUS_TABS : CONTAINER_STATUS_TABS

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
            <h1 className="text-xl font-bold text-slate-900">订单管理</h1>
            <p className="text-xs text-slate-500">管理篷布车运输和集装箱物流订单</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/orders/create')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          新建订单
        </button>
      </div>

      {/* ===== 业务类型 Tab ===== */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="border-b border-gray-100">
          <div className="flex">
            {BUSINESS_TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = businessType === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => handleBusinessTypeChange(tab.key)}
                  className={`
                    flex items-center gap-2 px-6 py-3.5 text-sm font-medium border-b-2 transition-all duration-200
                    ${isActive
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-gray-200'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ===== 搜索 & 操作栏 ===== */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3 flex-wrap">
            {/* 搜索框 */}
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder={
                  businessType === 'CURTAIN_SIDE'
                    ? '搜索订单号、客户、路线...'
                    : '搜索柜号、提单号、客户...'
                }
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
              筛选
            </button>

            {/* 导出按钮 */}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg text-slate-600 hover:bg-gray-50 transition-all duration-200"
            >
              <Download className="w-4 h-4" />
              导出
            </button>
          </div>

          {/* 日期范围筛选（展开时显示） */}
          {showFilter && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Calendar className="w-4 h-4" />
                {businessType === 'CURTAIN_SIDE' ? '创建日期：' : 'ETA 范围：'}
              </div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1) }}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
              <span className="text-slate-400 text-sm">至</span>
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
                  清除日期
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
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ===== 表格 ===== */}
        <div className="overflow-x-auto">
          {businessType === 'CURTAIN_SIDE'
            ? renderCurtainSideTable()
            : renderContainerTable()
          }
        </div>

        {/* ===== 分页 ===== */}
        {pagination.total > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              共 <span className="font-medium text-slate-700">{pagination.total}</span> 条记录，
              第 {currentPage} / {totalPages} 页
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
            <p className="text-sm">暂无订单数据</p>
            <p className="text-xs mt-1">
              {searchQuery || statusFilter ? '尝试调整筛选条件' : '点击右上角「新建订单」创建'}
            </p>
          </div>
        )}
      </div>
    </div>
  )

  // ==================== 篷布车运输表格 ====================
  function renderCurtainSideTable() {
    if (loading) return renderSkeletonRows(8)
    if (curtainSideOrders.length === 0) return null

    return (
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[12%]" />  {/* 订单号 */}
          <col className="w-[12%]" />  {/* 客户 */}
          <col className="w-[16%]" />  {/* 路线 */}
          <col className="w-[10%]" />  {/* 状态 */}
          <col className="w-[8%]" />   {/* 类型 */}
          <col className="w-[10%]" />  {/* 重量 */}
          <col className="w-[12%]" />  {/* 承运商 */}
          <col className="w-[10%]" />  {/* 报价 */}
          <col className="w-[10%]" />  {/* 操作 */}
        </colgroup>
        <thead>
          <tr className="bg-gray-50/80">
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              订单号
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              客户
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              路线
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              状态
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              类型
            </th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              重量(kg)
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              承运商
            </th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              报价(EUR)
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {curtainSideOrders.map((order) => (
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
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  order.transport_type === 'FTL'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-teal-100 text-teal-700'
                }`}>
                  {order.transport_type}
                </span>
              </td>
              {/* 重量 */}
              <td className="px-4 py-3 text-xs text-slate-700 text-right tabular-nums">
                {order.cargo_weight_kg != null ? order.cargo_weight_kg.toLocaleString() : '-'}
              </td>
              {/* 承运商 */}
              <td className="px-4 py-3 text-xs text-slate-600 truncate" title={order.carrier_name}>
                {order.carrier_name || '-'}
              </td>
              {/* 报价 */}
              <td className="px-4 py-3 text-xs text-slate-700 text-right tabular-nums font-medium">
                {order.client_price != null ? `€${order.client_price.toLocaleString('de-DE', { minimumFractionDigits: 2 })}` : '-'}
              </td>
              {/* 操作 */}
              <td className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all duration-200"
                    title="查看"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate(`/orders/${order.id}/edit`)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-all duration-200"
                    title="编辑"
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

  // ==================== 集装箱物流表格 ====================
  function renderContainerTable() {
    if (loading) return renderSkeletonRows(10)
    if (containerOrders.length === 0) return null

    return (
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[10%]" />  {/* 订单号 */}
          <col className="w-[10%]" />  {/* 客户 */}
          <col className="w-[10%]" />  {/* 船司 */}
          <col className="w-[11%]" />  {/* 柜号 */}
          <col className="w-[12%]" />  {/* 提单号 */}
          <col className="w-[10%]" />  {/* 目的地 */}
          <col className="w-[10%]" />  {/* 派送状态 */}
          <col className="w-[10%]" />  {/* 放单状态 */}
          <col className="w-[9%]" />   {/* ETA */}
          <col className="w-[8%]" />   {/* 操作 */}
        </colgroup>
        <thead>
          <tr className="bg-gray-50/80">
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              订单号
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              客户
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              船司
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              柜号
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              提单号
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              目的地
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              派送状态
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              放单状态
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              ETA
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {containerOrders.map((order) => (
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
              <td className="px-4 py-3 text-xs text-slate-600 truncate" title={order.shipping_line}>
                {order.shipping_line || '-'}
              </td>
              {/* 柜号 */}
              <td className="px-4 py-3 text-xs text-slate-700 font-mono truncate" title={order.container_no}>
                {order.container_no || '-'}
              </td>
              {/* 提单号 */}
              <td className="px-4 py-3 text-xs text-slate-700 font-mono truncate" title={order.bl_number}>
                {order.bl_number || '-'}
              </td>
              {/* 目的地 */}
              <td className="px-4 py-3 text-xs text-slate-600 truncate" title={order.delivery_city}>
                {order.delivery_city || '-'}
              </td>
              {/* 派送状态 */}
              <td className="px-4 py-3 text-center">
                <StatusBadge status={order.delivery_status} />
              </td>
              {/* 放单状态 */}
              <td className="px-4 py-3 text-center">
                <StatusBadge status={order.release_status} />
              </td>
              {/* ETA */}
              <td className="px-4 py-3 text-xs text-slate-600 text-center">
                {order.eta || '-'}
              </td>
              {/* 操作 */}
              <td className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all duration-200"
                    title="查看"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate(`/orders/${order.id}/edit`)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-all duration-200"
                    title="编辑"
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
