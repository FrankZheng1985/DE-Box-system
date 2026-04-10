import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Edit, Truck, Phone, Mail, MapPin, Globe,
  FileText, Shield, Calendar, CreditCard, Star,
  DollarSign, TrendingUp, Clock, CheckCircle,
  AlertTriangle, Plus, Gauge, Package
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'

// ==================== 类型定义 ====================

interface CarrierInfo {
  id: string
  company_name: string
  country: string
  contact_person: string
  phone: string
  email: string
  address: string
  transport_license: string
  license_expiry: string
  insurance_number: string
  insurance_expiry: string
  vat_number: string
  vehicle_count: number
  rating: number
  status: string
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
function getVehicleStatusBadge(status: string) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    in_transit: { label: '运输中', bg: 'bg-blue-100', text: 'text-blue-700' },
    idle: { label: '空闲', bg: 'bg-green-100', text: 'text-green-700' },
    maintenance: { label: '维修中', bg: 'bg-amber-100', text: 'text-amber-700' },
  }
  const style = map[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}

// GPS 状态标签
function getGpsBadge(hasGps: boolean) {
  return hasGps ? (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium bg-green-100 text-green-700">
      已安装
    </span>
  ) : (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600">
      未安装
    </span>
  )
}

// 状态标签
function getStatusBadge(status: string) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    active: { label: '启用', bg: 'bg-green-100', text: 'text-green-700' },
    inactive: { label: '停用', bg: 'bg-gray-100', text: 'text-gray-600' },
    suspended: { label: '暂停', bg: 'bg-red-100', text: 'text-red-700' },
  }
  const style = map[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
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
  { key: 'info', label: '基本信息' },
  { key: 'fleet', label: '车队管理' },
  { key: 'routes', label: '覆盖路线' },
  { key: 'performance', label: '绩效统计' },
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

export default function CarrierDetail() {
  const navigate = useNavigate()
  const { id } = useParams()

  const [loading, setLoading] = useState(true)
  const [carrier, setCarrier] = useState<CarrierInfo | null>(null)
  const [activeTab, setActiveTab] = useState('info')

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
          <h3 className="text-sm font-semibold text-slate-900 mb-4">公司信息</h3>
          <InfoRow icon={Truck} label="公司全称" value={carrier.company_name} />
          <InfoRow icon={Globe} label="国家" value={carrier.country} />
          <InfoRow icon={FileText} label="注册号" value="-" />
          <InfoRow icon={Shield} label="运输许可证号" value={carrier.transport_license || '-'} />
          <InfoRow icon={Calendar} label="许可证有效期" value={formatDate(carrier.license_expiry)} />
          <InfoRow icon={CreditCard} label="VAT税号" value={carrier.vat_number || '-'} />
        </div>
        {/* 右列 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">联系与保险</h3>
          <InfoRow icon={Shield} label="保险编号" value={carrier.insurance_number || '-'} />
          <InfoRow icon={Calendar} label="保险有效期" value={formatDate(carrier.insurance_expiry)} />
          <InfoRow icon={Phone} label="联系人" value={carrier.contact_person} />
          <InfoRow icon={Phone} label="联系电话" value={carrier.phone} />
          <InfoRow icon={Mail} label="联系邮箱" value={carrier.email} />
          <InfoRow icon={MapPin} label="地址" value={carrier.address || '-'} />
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
            添加车辆
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
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">车牌号</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">车型</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">司机</th>
                  <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">GPS设备</th>
                  <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">当前状态</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-sm text-slate-400 py-12">
                      暂无车辆数据
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
                        {getGpsBadge(vehicle.has_gps)}
                      </td>
                      <td className="text-center px-4 py-3">
                        {getVehicleStatusBadge(vehicle.status)}
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

  // Tab 2: 覆盖路线 (占位)
  const renderRoutes = () => (
    <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-12 text-center">
      <Globe className="w-12 h-12 text-slate-300 mx-auto mb-4" />
      <p className="text-slate-500 text-sm">覆盖路线功能开发中</p>
    </div>
  )

  // Tab 3: 绩效统计 (占位数据)
  const renderPerformance = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="准时率"
          value="--"
          subtitle="暂无数据"
          icon={Clock}
          color="blue"
        />
        <StatCard
          title="货损率"
          value="--"
          subtitle="暂无数据"
          icon={AlertTriangle}
          color="yellow"
        />
        <StatCard
          title="综合评分"
          value="--"
          subtitle="暂无数据"
          icon={Star}
          color="purple"
        />
        <StatCard
          title="完成订单"
          value="--"
          subtitle="暂无数据"
          icon={CheckCircle}
          color="green"
        />
      </div>

      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-12 text-center">
        <Gauge className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500 text-sm">绩效详细数据尚未接入，统计功能即将上线</p>
      </div>
    </div>
  )

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
            title="应付总额"
            value={formatCurrency(stats.total_payable)}
            icon={DollarSign}
            color="blue"
          />
          <StatCard
            title="已付总额"
            value={formatCurrency(stats.total_paid)}
            icon={TrendingUp}
            color="green"
          />
          <StatCard
            title="待付金额"
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
          <h1 className="text-xl font-semibold text-slate-900">承运商不存在</h1>
        </div>
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-12 text-center">
          <p className="text-slate-500 text-sm">未找到该承运商信息</p>
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
              {getStatusBadge(carrier.status)}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-slate-400">{carrier.country || '-'}</span>
              <span className="text-xs text-slate-300">|</span>
              <span className="text-xs text-slate-400">
                <Truck className="w-3 h-3 inline mr-1" />
                {carrier.vehicle_count ?? 0} 辆车
              </span>
              <span className="text-xs text-slate-300">|</span>
              <span className={`text-xs font-medium ${getScoreColor(carrier.rating || 0)}`}>
                <Star className="w-3 h-3 inline mr-0.5 fill-current" />
                {carrier.rating?.toFixed(1) || '-'}/10
              </span>
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
