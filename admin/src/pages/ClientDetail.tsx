import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Edit, Building2, Mail, Phone, Globe, MapPin,
  Calendar, CreditCard, FileText, DollarSign, ShieldCheck,
  Package, TrendingUp, Clock, AlertTriangle
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'

// ==================== 类型定义 ====================

interface ClientInfo {
  id: string
  client_code: string
  company_name: string
  vat_number: string
  country: string
  city: string
  address: string
  contact_name: string
  contact_email: string
  contact_phone: string
  invoice_email: string
  credit_limit: number
  credit_level: string
  risk_category: string
  payment_terms: string
  status: string
  created_at: string
}

interface ClientOrder {
  id: string
  order_number: string
  origin: string
  destination: string
  status: string
  type: string
  quoted_price: number
  created_at: string
}

interface FinanceRecord {
  id: string
  type: string
  amount: number
  status: string
  due_date: string
  created_at: string
  description: string
}

interface FinanceData {
  stats: {
    total_receivable: number
    total_paid: number
    overdue_amount: number
  }
  records: FinanceRecord[]
}

// ==================== 工具函数 ====================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

// 信用等级样式
function getCreditBadge(level: string) {
  const map: Record<string, { bg: string; text: string }> = {
    A: { bg: 'bg-green-100', text: 'text-green-700' },
    B: { bg: 'bg-blue-100', text: 'text-blue-700' },
    C: { bg: 'bg-amber-100', text: 'text-amber-700' },
  }
  const style = map[level] || { bg: 'bg-gray-100', text: 'text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold ${style.bg} ${style.text}`}>
      {level} 级
    </span>
  )
}

// ==================== Tab 定义 ====================

const tabs = [
  { key: 'info', label: '基本信息' },
  { key: 'contracts', label: '合同管理' },
  { key: 'pricing', label: '价格体系' },
  { key: 'orders', label: '订单历史' },
  { key: 'finance', label: '财务概览' },
]

// ==================== 骨架屏 ====================

function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-16 bg-slate-100 rounded-2xl" />
      <div className="h-10 bg-slate-100 rounded-xl w-1/2" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-6 bg-slate-100 rounded-lg" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-6 bg-slate-100 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}

// ==================== 信息行组件 ====================

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        <p className="text-sm text-slate-900 break-all">{value || '-'}</p>
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

export default function ClientDetail() {
  const navigate = useNavigate()
  const { id } = useParams()

  const [loading, setLoading] = useState(true)
  const [client, setClient] = useState<ClientInfo | null>(null)
  const [activeTab, setActiveTab] = useState('info')

  // 订单历史数据
  const [orders, setOrders] = useState<ClientOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  // 财务数据
  const [finance, setFinance] = useState<FinanceData | null>(null)
  const [financeLoading, setFinanceLoading] = useState(false)

  // 获取客户详情
  useEffect(() => {
    if (!id) return
    const fetchClient = async () => {
      setLoading(true)
      try {
        const res = await api.get<ApiResponse<ClientInfo>>(`/clients/${id}`)
        if (res.code === 200 && res.data) {
          setClient(res.data)
        }
      } catch (err) {
        console.error('获取客户详情失败:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchClient()
  }, [id])

  // 切换到订单历史 Tab 时加载
  useEffect(() => {
    if (activeTab !== 'orders' || !id) return
    const fetchOrders = async () => {
      setOrdersLoading(true)
      try {
        const res = await api.get<ApiResponse<ClientOrder[]>>(`/clients/${id}/orders`)
        if (res.code === 200 && res.data) {
          setOrders(Array.isArray(res.data) ? res.data : [])
        }
      } catch (err) {
        console.error('获取订单历史失败:', err)
      } finally {
        setOrdersLoading(false)
      }
    }
    fetchOrders()
  }, [activeTab, id])

  // 切换到财务概览 Tab 时加载
  useEffect(() => {
    if (activeTab !== 'finance' || !id) return
    const fetchFinance = async () => {
      setFinanceLoading(true)
      try {
        const res = await api.get<ApiResponse<FinanceData>>(`/clients/${id}/finance`)
        if (res.code === 200 && res.data) {
          setFinance(res.data)
        }
      } catch (err) {
        console.error('获取财务数据失败:', err)
      } finally {
        setFinanceLoading(false)
      }
    }
    fetchFinance()
  }, [activeTab, id])

  // ==================== 渲染各 Tab 内容 ====================

  // Tab 0: 基本信息
  const renderInfo = () => {
    if (!client) return null
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左列 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">公司信息</h3>
          <InfoRow icon={Building2} label="公司全称" value={client.company_name} />
          <InfoRow icon={FileText} label="VAT税号" value={client.vat_number} />
          <InfoRow icon={Globe} label="国家" value={client.country} />
          <InfoRow icon={MapPin} label="城市" value={client.city} />
          <InfoRow icon={MapPin} label="详细地址" value={client.address} />
          <InfoRow icon={Calendar} label="注册日期" value={formatDate(client.created_at)} />
        </div>
        {/* 右列 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">联系与信用</h3>
          <InfoRow icon={Phone} label="主联系人" value={client.contact_name} />
          <InfoRow icon={Mail} label="联系邮箱" value={client.contact_email} />
          <InfoRow icon={Phone} label="联系电话" value={client.contact_phone} />
          <InfoRow icon={Mail} label="发票邮箱" value={client.invoice_email} />
          <InfoRow icon={Clock} label="账期" value={client.payment_terms || '-'} />
          <InfoRow icon={ShieldCheck} label="信用等级" value={getCreditBadge(client.credit_level)} />
        </div>
      </div>
    )
  }

  // Tab 1: 合同管理
  const renderContracts = () => (
    <div className="space-y-4">
      {/* 表头区域 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">合同列表</h3>
        <button
          disabled
          className="flex items-center gap-2 px-4 py-2 bg-blue-600/50 text-white text-sm font-medium rounded-xl cursor-not-allowed transition-all duration-200"
        >
          <FileText className="w-4 h-4" />
          新增合同（功能即将上线）
        </button>
      </div>

      {/* 表格结构 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">合同编号</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">类型</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">有效期开始</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">有效期结束</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">状态</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 mb-1">暂无合同数据</p>
                  <p className="text-xs text-slate-400">合同管理功能即将上线，届时可录入框架合同与临时合同</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  // Tab 2: 价格体系
  const renderPricing = () => (
    <div className="space-y-4">
      {/* 表头区域 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">价格规则</h3>
        <button
          disabled
          className="flex items-center gap-2 px-4 py-2 bg-blue-600/50 text-white text-sm font-medium rounded-xl cursor-not-allowed transition-all duration-200"
        >
          <DollarSign className="w-4 h-4" />
          新增价格规则（功能即将上线）
        </button>
      </div>

      {/* 表格结构 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">路线</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">业务类型</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">运输类型</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">单价 (EUR)</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">有效期</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <CreditCard className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 mb-1">暂无价格规则</p>
                  <p className="text-xs text-slate-400">价格体系功能即将上线，届时可为该客户配置按路线、业务类型的定价规则</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  // Tab 3: 订单历史
  const renderOrders = () => {
    if (ordersLoading) {
      return (
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded-lg" />
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[22%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[16%]" />
              <col className="w-[20%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">订单号</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">路线</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">状态</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">类型</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">报价</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">日期</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-sm text-slate-400 py-12">
                    暂无订单记录
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200 cursor-pointer"
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <td className="text-left text-xs text-slate-900 font-medium px-4 py-3">
                      {order.order_number}
                    </td>
                    <td className="text-left text-xs text-slate-600 px-4 py-3 truncate">
                      {order.origin} → {order.destination}
                    </td>
                    <td className="text-center px-4 py-3">
                      <StatusBadge status={order.status} type="order" />
                    </td>
                    <td className="text-center text-xs text-slate-600 px-4 py-3">
                      {order.type || '-'}
                    </td>
                    <td className="text-right text-xs text-slate-900 font-medium px-4 py-3">
                      {order.quoted_price ? formatCurrency(order.quoted_price) : '-'}
                    </td>
                    <td className="text-center text-xs text-slate-500 px-4 py-3">
                      {formatDate(order.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Tab 4: 财务概览
  const renderFinance = () => {
    if (financeLoading) {
      return (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 bg-slate-100 rounded-xl" />
            ))}
          </div>
          <div className="h-48 bg-slate-100 rounded-2xl" />
        </div>
      )
    }

    const stats = finance?.stats || { total_receivable: 0, total_paid: 0, overdue_amount: 0 }
    const records = finance?.records || []

    return (
      <div className="space-y-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="总应收"
            value={formatCurrency(stats.total_receivable)}
            icon={DollarSign}
            color="blue"
          />
          <StatCard
            title="已收款"
            value={formatCurrency(stats.total_paid)}
            icon={TrendingUp}
            color="green"
          />
          <StatCard
            title="逾期金额"
            value={formatCurrency(stats.overdue_amount)}
            icon={AlertTriangle}
            color="red"
          />
        </div>

        {/* 最近财务记录表格 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">最近财务记录</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[15%]" />
                <col className="w-[30%]" />
                <col className="w-[18%]" />
                <col className="w-[15%]" />
                <col className="w-[22%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">类型</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">描述</th>
                  <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">金额</th>
                  <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">状态</th>
                  <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">到期日</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-sm text-slate-400 py-12">
                      暂无财务记录
                    </td>
                  </tr>
                ) : (
                  records.map((record) => (
                    <tr key={record.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                      <td className="text-left text-xs text-slate-600 px-4 py-3">{record.type}</td>
                      <td className="text-left text-xs text-slate-900 px-4 py-3 truncate">{record.description || '-'}</td>
                      <td className="text-right text-xs text-slate-900 font-medium px-4 py-3">
                        {formatCurrency(record.amount)}
                      </td>
                      <td className="text-center px-4 py-3">
                        <StatusBadge status={record.status} type="payment" />
                      </td>
                      <td className="text-center text-xs text-slate-500 px-4 py-3">
                        {formatDate(record.due_date)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // Tab 内容渲染分发
  const renderTabContent = () => {
    switch (activeTab) {
      case 'info': return renderInfo()
      case 'contracts': return renderContracts()
      case 'pricing': return renderPricing()
      case 'orders': return renderOrders()
      case 'finance': return renderFinance()
      default: return null
    }
  }

  // ==================== 主渲染 ====================

  if (loading) {
    return (
      <div className="p-4 lg:p-6">
        <DetailSkeleton />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="p-4 lg:p-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/clients')}
            className="p-2 rounded-xl hover:bg-slate-100 transition-all duration-200"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-xl font-semibold text-slate-900">客户不存在</h1>
        </div>
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-12 text-center">
          <p className="text-slate-500 text-sm">未找到该客户信息</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/clients')}
            className="p-2 rounded-xl hover:bg-slate-100 transition-all duration-200"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-900">{client.company_name}</h1>
              {getCreditBadge(client.credit_level)}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-slate-400">VAT: {client.vat_number || '-'}</span>
              <span className="text-xs text-slate-300">|</span>
              <span className="text-xs text-slate-400">{client.country || '-'}</span>
            </div>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200">
          <Edit className="w-4 h-4" />
          编辑
        </button>
      </div>

      {/* Tab 导航 */}
      <div className="flex gap-1 bg-white/80 backdrop-blur-md rounded-xl p-1 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all duration-200 ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容区 */}
      {renderTabContent()}
    </div>
  )
}
