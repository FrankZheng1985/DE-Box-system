import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import EntityAccountsPanel from '../components/EntityAccountsPanel'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Edit, Truck, Phone, Mail, MapPin, Globe,
  FileText, Shield, Calendar, CreditCard, Star,
  DollarSign, TrendingUp, Clock, CheckCircle,
  AlertTriangle, Plus, Gauge, Package, Layers
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import api, { type ApiResponse } from '../utils/api'
import StatCard from '../components/StatCard'

// 承运商分类 / 类型展示映射（P7，值域见迁移 111）
const CARRIER_CATEGORY_LABEL_KEYS: Record<string, string> = {
  EXTERNAL: 'carrierCategory.EXTERNAL',
  OWN_FLEET: 'carrierCategory.OWN_FLEET',
}
const CARRIER_CATEGORY_STYLES: Record<string, string> = {
  EXTERNAL: 'bg-blue-100 text-blue-700',
  OWN_FLEET: 'bg-green-100 text-green-700',
}
const CARRIER_TYPE_LABEL_KEYS: Record<string, string> = {
  PLATFORM: 'carrierType.PLATFORM',
  FLEET: 'carrierType.FLEET',
  INDIVIDUAL: 'carrierType.INDIVIDUAL',
}

// ==================== 类型定义 ====================

interface CarrierInfo {
  id: string
  company_name: string
  country: string
  contact_name: string
  contact_phone: string
  contact_email: string
  address: string
  transport_license: string
  license_expiry: string
  insurance_number: string
  insurance_expiry: string
  vat_number: string
  vehicle_count: number
  performance_score: number | string | null
  status: string
  // P7 新增：分类 / 类型 / 备注
  carrier_category: string
  carrier_type: string | null
  remarks: string | null
}

interface Vehicle {
  id: string
  plate_number: string
  vehicle_type: string
  driver_name: string
  has_gps: boolean
  status: string
}

interface CarrierFinance {
  total_payable: number
  total_paid: number
  outstanding: number
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

// 车辆状态中文映射和样式
function getVehicleStatusBadge(t: TFunction, status: string) {
  const map: Record<string, { labelKey: string; bg: string; text: string }> = {
    in_transit: { labelKey: 'vehicleStatus.IN_TRANSIT', bg: 'bg-blue-100', text: 'text-blue-700' },
    idle: { labelKey: 'vehicleStatus.IDLE', bg: 'bg-green-100', text: 'text-green-700' },
    maintenance: { labelKey: 'vehicleStatus.MAINTENANCE', bg: 'bg-amber-100', text: 'text-amber-700' },
  }
  const style = map[status] || { labelKey: '', bg: 'bg-gray-100', text: 'text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium ${style.bg} ${style.text}`}>
      {t(style.labelKey, { defaultValue: status })}
    </span>
  )
}

// GPS 状态标签
function getGpsBadge(t: TFunction, hasGps: boolean) {
  return hasGps ? (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium bg-green-100 text-green-700">
      {t('carrier.gpsInstalled')}
    </span>
  ) : (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600">
      {t('carrier.gpsNotInstalled')}
    </span>
  )
}

// 状态标签
function getStatusBadge(t: TFunction, status: string) {
  const map: Record<string, { labelKey: string; bg: string; text: string }> = {
    active: { labelKey: 'status.ACTIVE', bg: 'bg-green-100', text: 'text-green-700' },
    inactive: { labelKey: 'status.INACTIVE', bg: 'bg-gray-100', text: 'text-gray-600' },
    suspended: { labelKey: 'carrier.statusSuspended', bg: 'bg-red-100', text: 'text-red-700' },
  }
  const style = map[status] || { labelKey: '', bg: 'bg-gray-100', text: 'text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium ${style.bg} ${style.text}`}>
      {t(style.labelKey, { defaultValue: status })}
    </span>
  )
}

// 绩效评分颜色
function getScoreColor(score: number): string {
  if (score >= 8) return 'text-green-600'
  if (score >= 6) return 'text-blue-600'
  if (score >= 4) return 'text-amber-600'
  return 'text-red-600'
}

// ==================== Tab 定义 ====================

const tabs = [
  { key: 'info', labelKey: 'tabs.basicInfo' },
  { key: 'fleet', labelKey: 'tabs.fleet' },
  { key: 'routes', labelKey: 'tabs.routes' },
  { key: 'performance', labelKey: 'tabs.performance' },
  { key: 'finance', labelKey: 'tabs.financeOverview' },
  // 2026-08-03 新增：该承运商公司下的登录账号
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

export default function CarrierDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()

  const [loading, setLoading] = useState(true)
  const [carrier, setCarrier] = useState<CarrierInfo | null>(null)
  const { hasPermission } = useAuth()
  const [activeTab, setActiveTab] = useState('info')

  // 只显示当前角色有权限的 tab（与 ClientDetail 保持一致）
  const visibleTabs = tabs.filter(tab => !tab.permission || hasPermission(tab.permission))

  // 车队数据
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehiclesLoading, setVehiclesLoading] = useState(false)

  // 财务数据
  const [finance, setFinance] = useState<CarrierFinance | null>(null)
  const [financeLoading, setFinanceLoading] = useState(false)

  // 获取承运商详情
  useEffect(() => {
    if (!id) return
    const fetchCarrier = async () => {
      setLoading(true)
      try {
        const res = await api.get<ApiResponse<CarrierInfo>>(`/carriers/${id}`)
        if (res.code === 200 && res.data) {
          setCarrier(res.data)
        }
      } catch (err) {
        console.error('获取承运商详情失败:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchCarrier()
  }, [id])

  // 切换到车队管理 Tab 时加载
  useEffect(() => {
    if (activeTab !== 'fleet' || !id) return
    const fetchVehicles = async () => {
      setVehiclesLoading(true)
      try {
        const res = await api.get<ApiResponse<Vehicle[]>>(`/carriers/${id}/vehicles`)
        if (res.code === 200 && res.data) {
          setVehicles(Array.isArray(res.data) ? res.data : [])
        }
      } catch (err) {
        console.error('获取车队数据失败:', err)
      } finally {
        setVehiclesLoading(false)
      }
    }
    fetchVehicles()
  }, [activeTab, id])

  // 切换到财务概览 Tab 时加载
  useEffect(() => {
    if (activeTab !== 'finance' || !id) return
    const fetchFinance = async () => {
      setFinanceLoading(true)
      try {
        const res = await api.get<ApiResponse<CarrierFinance>>(`/carriers/${id}/finance`)
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
    if (!carrier) return null
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左列 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">{t('master.companyInfo')}</h3>
          <InfoRow icon={Truck} label={t('master.companyFullName')} value={carrier.company_name} />
          <InfoRow icon={Globe} label={t('common.country')} value={carrier.country} />
          <InfoRow
            icon={Layers}
            label={t('carrier.colCategoryType')}
            value={
              <span className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium ${
                  CARRIER_CATEGORY_STYLES[carrier.carrier_category] || 'bg-gray-100 text-gray-600'
                }`}>
                  {t(CARRIER_CATEGORY_LABEL_KEYS[carrier.carrier_category] || 'carrierCategory.EXTERNAL')}
                </span>
                <span className="text-xs text-slate-500">
                  {carrier.carrier_type
                    ? t(CARRIER_TYPE_LABEL_KEYS[carrier.carrier_type] || '', { defaultValue: carrier.carrier_type })
                    : t('carrier.typeUncategorized')}
                </span>
              </span>
            }
          />
          <InfoRow icon={FileText} label={t('carrier.registrationNo')} value="-" />
          <InfoRow icon={Shield} label={t('carrier.transportLicense')} value={carrier.transport_license || '-'} />
          <InfoRow icon={Calendar} label={t('carrier.licenseExpiry')} value={formatDate(carrier.license_expiry)} />
          <InfoRow icon={CreditCard} label={t('master.vatNumber')} value={carrier.vat_number || '-'} />
        </div>
        {/* 右列 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">{t('carrier.contactAndInsurance')}</h3>
          <InfoRow icon={Shield} label={t('carrier.insuranceNumber')} value={carrier.insurance_number || '-'} />
          <InfoRow icon={Calendar} label={t('carrier.insuranceExpiry')} value={formatDate(carrier.insurance_expiry)} />
          <InfoRow icon={Phone} label={t('field.contact')} value={carrier.contact_name || '-'} />
          <InfoRow icon={Phone} label={t('field.phone')} value={carrier.contact_phone || '-'} />
          <InfoRow icon={Mail} label={t('master.contactEmail')} value={carrier.contact_email || '-'} />
          <InfoRow icon={MapPin} label={t('master.address')} value={carrier.address || '-'} />
        </div>

        {/* 备注单独占一行，内容可能很长 */}
        <div className="lg:col-span-2 bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('carrier.remarksLabel')}</h3>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">
            {carrier.remarks || t('carrier.noRemarks')}
          </p>
        </div>
      </div>
    )
  }

  // Tab 1: 车队管理
  const renderFleet = () => {
    if (vehiclesLoading) {
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
      <div className="space-y-4">
        {/* 操作栏 */}
        <div className="flex justify-end">
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200">
            <Plus className="w-4 h-4" />
            {t('carrier.addVehicle')}
          </button>
        </div>

        {/* 车辆表格 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[20%]" />
                <col className="w-[24%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('carrier.colPlateNo')}</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('carrier.colVehicleType')}</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('carrier.colDriver')}</th>
                  <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('carrier.colGpsDevice')}</th>
                  <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('quotationDetail.currentStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-sm text-slate-400 py-12">
                      {t('carrier.noVehicles')}
                    </td>
                  </tr>
                ) : (
                  vehicles.map((vehicle) => (
                    <tr key={vehicle.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                      <td className="text-left text-xs text-slate-900 font-medium px-4 py-3">
                        {vehicle.plate_number}
                      </td>
                      <td className="text-left text-xs text-slate-600 px-4 py-3">
                        {vehicle.vehicle_type || '-'}
                      </td>
                      <td className="text-left text-xs text-slate-600 px-4 py-3">
                        {vehicle.driver_name || '-'}
                      </td>
                      <td className="text-center px-4 py-3">
                        {getGpsBadge(t, vehicle.has_gps)}
                      </td>
                      <td className="text-center px-4 py-3">
                        {getVehicleStatusBadge(t, vehicle.status)}
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

  // Tab 2: 覆盖路线
  const renderRoutes = () => (
    <div className="space-y-4">
      {/* 表头区域 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{t('carrier.routeList')}</h3>
        <button
          disabled
          className="flex items-center gap-2 px-4 py-2 bg-blue-600/50 text-white text-sm font-medium rounded-xl cursor-not-allowed transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          {t('carrier.addRouteSoon')}
        </button>
      </div>

      {/* 表格结构 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('orderAssign.origin')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('orderAssign.destination')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('carrier.colVehiclePreference')}</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">{t('carrier.colCompletedOrders')}</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">{t('carrier.colAvgDays')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center">
                  <Globe className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 mb-1">{t('carrier.noRoutes')}</p>
                  <p className="text-xs text-slate-400">{t('carrier.noRoutesHint')}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  // Tab 3: 绩效统计
  const renderPerformance = () => {
    const performanceScore = carrier ? Number(carrier.performance_score || 0) : 0

    return (
      <div className="space-y-6">
        {/* 核心指标卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title={t('orderAssign.onTimeRateShort')}
            value="--%"
            subtitle={t('carrier.dataPending')}
            icon={Clock}
            color="blue"
          />
          <StatCard
            title={t('carrier.damageRate')}
            value="--%"
            subtitle={t('carrier.dataPending')}
            icon={AlertTriangle}
            color="yellow"
          />
          <StatCard
            title={t('orderAssign.overallScore')}
            value={performanceScore > 0 ? `${Number(performanceScore).toFixed(1)}/10` : '--'}
            subtitle={performanceScore > 0 ? t('carrier.basedOnHistory') : t('carrier.noScore')}
            icon={Star}
            color="purple"
          />
          <StatCard
            title={t('carrier.completedOrders')}
            value="--"
            subtitle={t('carrier.dataPending')}
            icon={CheckCircle}
            color="green"
          />
        </div>

        {/* 绩效详情 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">{t('carrier.performanceDetail')}</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* 准时交付 */}
              <div className="border border-slate-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium text-slate-900">{t('carrier.onTimeDelivery')}</span>
                </div>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-2xl font-semibold text-slate-300">--%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-slate-200 h-2 rounded-full" style={{ width: '0%' }} />
                </div>
                <p className="text-xs text-slate-400 mt-2">{t('carrier.onTimeCounts')}</p>
              </div>

              {/* 货物完好 */}
              <div className="border border-slate-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Package className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium text-slate-900">{t('carrier.cargoIntactRate')}</span>
                </div>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-2xl font-semibold text-slate-300">--%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-slate-200 h-2 rounded-full" style={{ width: '0%' }} />
                </div>
                <p className="text-xs text-slate-400 mt-2">{t('carrier.damageCounts')}</p>
              </div>

              {/* 响应速度 */}
              <div className="border border-slate-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Gauge className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-medium text-slate-900">{t('carrier.avgResponse')}</span>
                </div>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-2xl font-semibold text-slate-300">{t('carrier.hoursPlaceholder')}</span>
                </div>
                <p className="text-xs text-slate-400 mt-2">{t('carrier.avgResponseHint')}</p>
              </div>

              {/* 综合评价 */}
              <div className="border border-slate-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-medium text-slate-900">{t('carrier.overallRating')}</span>
                </div>
                <div className="flex items-end gap-2 mb-2">
                  <span className={`text-2xl font-semibold ${performanceScore > 0 ? getScoreColor(performanceScore) : 'text-slate-300'}`}>
                    {performanceScore > 0 ? Number(performanceScore).toFixed(1) : '--'}
                  </span>
                  <span className="text-sm text-slate-400 mb-0.5">/ 10</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      performanceScore >= 8 ? 'bg-green-500' :
                      performanceScore >= 6 ? 'bg-blue-500' :
                      performanceScore >= 4 ? 'bg-amber-500' : 'bg-slate-200'
                    }`}
                    style={{ width: performanceScore > 0 ? `${(performanceScore / 10) * 100}%` : '0%' }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2">{t('carrier.overallRatingHint')}</p>
              </div>
            </div>

            <p className="text-xs text-slate-400 text-center mt-6">
              {t('carrier.performanceSoon')}
            </p>
          </div>
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
        </div>
      )
    }

    const stats = finance || { total_payable: 0, total_paid: 0, outstanding: 0 }

    return (
      <div className="space-y-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title={t('carrier.totalPayable')}
            value={formatCurrency(stats.total_payable)}
            icon={DollarSign}
            color="blue"
          />
          <StatCard
            title={t('carrier.totalPaid')}
            value={formatCurrency(stats.total_paid)}
            icon={TrendingUp}
            color="green"
          />
          <StatCard
            title={t('carrier.pendingPayment')}
            value={formatCurrency(stats.outstanding)}
            icon={Package}
            color={stats.outstanding > 0 ? 'red' : 'blue'}
          />
        </div>
      </div>
    )
  }

  // Tab 内容渲染分发
  const renderTabContent = () => {
    switch (activeTab) {
      case 'info': return renderInfo()
      case 'fleet': return renderFleet()
      case 'routes': return renderRoutes()
      case 'performance': return renderPerformance()
      case 'finance': return renderFinance()
      case 'accounts':
        return id ? <EntityAccountsPanel entityType="CARRIER" entityId={id} /> : null
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

  if (!carrier) {
    return (
      <div className="p-4 lg:p-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/carriers')}
            className="p-2 rounded-xl hover:bg-slate-100 transition-all duration-200"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-xl font-semibold text-slate-900">{t('carrier.notFound')}</h1>
        </div>
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-12 text-center">
          <p className="text-slate-500 text-sm">{t('carrier.notFoundHint')}</p>
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
            onClick={() => navigate('/carriers')}
            className="p-2 rounded-xl hover:bg-slate-100 transition-all duration-200"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-900">{carrier.company_name}</h1>
              {getStatusBadge(t, carrier.status)}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-slate-400">{carrier.country || '-'}</span>
              <span className="text-xs text-slate-300">|</span>
              <span className="text-xs text-slate-400">
                <Truck className="w-3 h-3 inline mr-1" />
                {t('carrier.vehicleCountLabel', { count: carrier.vehicle_count ?? 0 })}
              </span>
              <span className="text-xs text-slate-300">|</span>
              <span className={`text-xs font-medium ${getScoreColor(Number(carrier.performance_score) || 0)}`}>
                <Star className="w-3 h-3 inline mr-0.5 fill-current" />
                {carrier.performance_score ? Number(carrier.performance_score).toFixed(1) : '-'}/10
              </span>
            </div>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200">
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
