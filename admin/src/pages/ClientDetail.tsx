import { useState, useEffect, useCallback } from 'react'
import EntityAccountsPanel from '../components/EntityAccountsPanel'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Edit, Building2, Mail, Phone, Globe, MapPin,
  Calendar, CreditCard, FileText, DollarSign, ShieldCheck,
  TrendingUp, Clock, AlertTriangle, Star
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'
import ClientCreditPanel from '../components/ClientCreditPanel'
import { useAuth } from '../contexts/AuthContext'

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
  client_level: string
  credit_limit: number
  credit_exposure: number
  credit_level: string
  risk_category: string
  credit_blocked: boolean
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
function getCreditBadge(t: TFunction, level: string) {
  const map: Record<string, { bg: string; text: string }> = {
    A: { bg: 'bg-green-100', text: 'text-green-700' },
    B: { bg: 'bg-blue-100', text: 'text-blue-700' },
    C: { bg: 'bg-amber-100', text: 'text-amber-700' },
  }
  const style = map[level] || { bg: 'bg-gray-100', text: 'text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold ${style.bg} ${style.text}`}>
      {t('client.creditGrade', { level })}
    </span>
  )
}

// 商务等级徽章（P7：VIP / 普通，和上面的信用等级 A-D 是两套口径）
function getClientLevelBadge(t: TFunction, level: string) {
  const isVip = level === 'VIP'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
      isVip ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
    }`}>
      {isVip ? t('client.levelVip') : t('client.levelNormal')}
    </span>
  )
}

// ==================== Tab 定义 ====================

// credit Tab 需要 client:credit 权限，在组件里按权限过滤
const tabs = [
  { key: 'info', labelKey: 'tabs.basicInfo' },
  { key: 'credit', labelKey: 'tabs.creditRisk', permission: 'client:credit' },
  { key: 'contracts', labelKey: 'tabs.contracts' },
  { key: 'pricing', labelKey: 'tabs.pricing' },
  { key: 'orders', labelKey: 'tabs.orderHistory' },
  { key: 'finance', labelKey: 'tabs.financeOverview' },
  // 2026-08-03 新增：该客户公司下的登录账号（用户管理里仍有全量列表，两个入口并存）
  { key: 'accounts', labelKey: 'tabs.accounts', permission: 'system:user' },
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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const { hasPermission } = useAuth()

  const [loading, setLoading] = useState(true)
  const [client, setClient] = useState<ClientInfo | null>(null)
  const [activeTab, setActiveTab] = useState('info')

  const visibleTabs = tabs.filter(tab => !tab.permission || hasPermission(tab.permission))

  // 订单历史数据
  const [orders, setOrders] = useState<ClientOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  // 财务数据
  const [finance, setFinance] = useState<FinanceData | null>(null)
  const [financeLoading, setFinanceLoading] = useState(false)

  // 获取客户详情（信用面板释放/冻结后也要重新拉一次，所以抽成 useCallback）
  const fetchClient = useCallback(async () => {
    if (!id) return
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
  }, [id])

  useEffect(() => { fetchClient() }, [fetchClient])

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
          <h3 className="text-sm font-semibold text-slate-900 mb-4">{t('master.companyInfo')}</h3>
          <InfoRow icon={Building2} label={t('master.companyFullName')} value={client.company_name} />
          <InfoRow icon={FileText} label={t('master.vatNumber')} value={client.vat_number} />
          <InfoRow icon={Globe} label={t('common.country')} value={client.country} />
          <InfoRow icon={MapPin} label={t('common.city')} value={client.city} />
          <InfoRow icon={MapPin} label={t('field.addressDetail')} value={client.address} />
          <InfoRow icon={Calendar} label={t('client.registeredAt')} value={formatDate(client.created_at)} />
        </div>
        {/* 右列 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">{t('client.contactAndCredit')}</h3>
          <InfoRow icon={Phone} label={t('client.primaryContact')} value={client.contact_name} />
          <InfoRow icon={Mail} label={t('master.contactEmail')} value={client.contact_email} />
          <InfoRow icon={Phone} label={t('field.phone')} value={client.contact_phone} />
          <InfoRow icon={Mail} label={t('client.invoiceEmail')} value={client.invoice_email} />
          <InfoRow icon={Clock} label={t('client.paymentTerms')} value={client.payment_terms || '-'} />
          <InfoRow icon={Star} label={t('client.colLevel')} value={getClientLevelBadge(t, client.client_level)} />
          <InfoRow icon={ShieldCheck} label={t('client.colCreditLevel')} value={getCreditBadge(t, client.credit_level)} />
        </div>
      </div>
    )
  }

  // Tab: 信用风控（P7，只有 client:credit 能看到）
  const renderCredit = () => {
    if (!client) return null
    return (
      <ClientCreditPanel
        clientId={client.id}
        companyName={client.company_name}
        creditLimit={client.credit_limit}
        creditExposure={client.credit_exposure}
        riskCategory={client.risk_category}
        creditBlocked={client.credit_blocked}
        onChanged={fetchClient}
      />
    )
  }

  // Tab 1: 合同管理
  const renderContracts = () => (
    <div className="space-y-4">
      {/* 表头区域 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{t('client.contractList')}</h3>
        <button
          disabled
          className="flex items-center gap-2 px-4 py-2 bg-blue-600/50 text-white text-sm font-medium rounded-xl cursor-not-allowed transition-all duration-200"
        >
          <FileText className="w-4 h-4" />
          {t('client.addContractSoon')}
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
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('client.colContractNo')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.type')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('client.colValidFrom')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('client.colValidTo')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.status')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 mb-1">{t('client.noContracts')}</p>
                  <p className="text-xs text-slate-400">{t('client.noContractsHint')}</p>
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
        <h3 className="text-sm font-semibold text-slate-900">{t('client.pricingRules')}</h3>
        <button
          disabled
          className="flex items-center gap-2 px-4 py-2 bg-blue-600/50 text-white text-sm font-medium rounded-xl cursor-not-allowed transition-all duration-200"
        >
          <DollarSign className="w-4 h-4" />
          {t('client.addPricingSoon')}
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
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('common.route')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('field.businessType')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('field.transportType')}</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">{t('client.colUnitPriceEur')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('quotation.colValidity')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <CreditCard className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 mb-1">{t('client.noPricingRules')}</p>
                  <p className="text-xs text-slate-400">{t('client.noPricingRulesHint')}</p>
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
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('common.orderNo')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('common.route')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.status')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.type')}</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">{t('client.colQuote')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.date')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-sm text-slate-400 py-12">
                    {t('client.noOrders')}
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
            title={t('client.totalReceivable')}
            value={formatCurrency(stats.total_receivable)}
            icon={DollarSign}
            color="blue"
          />
          <StatCard
            title={t('client.received')}
            value={formatCurrency(stats.total_paid)}
            icon={TrendingUp}
            color="green"
          />
          <StatCard
            title={t('client.overdueAmount')}
            value={formatCurrency(stats.overdue_amount)}
            icon={AlertTriangle}
            color="red"
          />
        </div>

        {/* 最近财务记录表格 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">{t('client.recentFinance')}</h3>
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
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('common.type')}</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('finance.colDescription')}</th>
                  <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">{t('common.amount')}</th>
                  <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.status')}</th>
                  <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('finance.colDueDate')}</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-sm text-slate-400 py-12">
                      {t('client.noFinanceRecords')}
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
      case 'credit': return renderCredit()
      case 'contracts': return renderContracts()
      case 'pricing': return renderPricing()
      case 'orders': return renderOrders()
      case 'finance': return renderFinance()
      case 'accounts':
        return id ? <EntityAccountsPanel entityType="CLIENT" entityId={id} /> : null
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
          <h1 className="text-xl font-semibold text-slate-900">{t('client.notFound')}</h1>
        </div>
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-12 text-center">
          <p className="text-slate-500 text-sm">{t('client.notFoundHint')}</p>
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
              {getClientLevelBadge(t, client.client_level)}
              {getCreditBadge(t, client.credit_level)}
              {client.credit_blocked && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700">
                  {t('client.creditBlocked')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-slate-400">VAT: {client.vat_number || '-'}</span>
              <span className="text-xs text-slate-300">|</span>
              <span className="text-xs text-slate-400">{client.country || '-'}</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate(`/clients/${id}/edit`)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200"
        >
          <Edit className="w-4 h-4" />
          {t('common.edit')}
        </button>
      </div>

      {/* Tab 导航 */}
      <div className="flex gap-1 bg-white/80 backdrop-blur-md rounded-xl p-1 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-x-auto">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all duration-200 ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Tab 内容区 */}
      {renderTabContent()}
    </div>
  )
}
