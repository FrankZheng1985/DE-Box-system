import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, Search, Plus, Eye, Edit, Star, CheckCircle, AlertCircle, Download, Ban, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import { useMasterDataOptions } from '../hooks/useMasterDataOptions'

// ==================== 类型定义 ====================

interface Carrier {
  id: string
  company_name: string
  country: string
  // ⚠️ 后端返回的是 performance_score（carriers 表里就叫这个，默认 5.0）。
  //    原来这里写的是 rating，后端根本没这字段，评分列长期恒显示 0.0（踩坑 033）
  performance_score: number | string | null
  vehicle_count: number
  service_countries: string[]
  status: string
  contact_name: string
  contact_phone: string
  // P7 新增：分类 EXTERNAL/OWN_FLEET，类型 PLATFORM/FLEET/INDIVIDUAL（可空）
  carrier_category: string
  carrier_type: string | null
  remarks: string | null
}

// 注：/carriers 列表接口返回的是 { code, message, data: Carrier[], pagination }，
// 不是 { items }。原来这里声明了一个 CarrierListResponse { items, pagination }，
// 全文件零引用且和实际契约不符，留着只会误导人，已删除。

interface CarrierForm {
  companyName: string
  vatNumber: string
  country: string
  transportLicense: string
  licenseExpiry: string
  insuranceNumber: string
  insuranceExpiry: string
  contactName: string
  contactEmail: string
  contactPhone: string
  /** 询价邮箱，逗号分隔的多个地址（提交时拆成数组） */
  inquiryEmails: string
  address: string
  serviceCountries: string
  vehicleTypes: string[]
  carrierCategory: string
  carrierType: string
  remarks: string
}

const INITIAL_FORM: CarrierForm = {
  companyName: '',
  vatNumber: '',
  country: '',
  transportLicense: '',
  licenseExpiry: '',
  insuranceNumber: '',
  insuranceExpiry: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  inquiryEmails: '',
  address: '',
  serviceCountries: '',
  vehicleTypes: [],
  carrierCategory: 'EXTERNAL',
  carrierType: '',
  remarks: '',
}

// 车型选项**不再写死在这里**，改为读基础数据（md_vehicle_types），见组件内的
// useMasterDataOptions('vehicle-types')。
//
// 原来这里是 ['Curtain Side', 'Container Chassis', ...]，存进库的是**英文名**，
// 而基础数据用的是**代号**（CURTAIN_SIDE 等）——同一个概念两套词表，后果：
//   1. 派单页按车型筛选永远匹配不上：'Curtain Side' 归一后是 'CURTAIN SIDE'（空格），
//      代号是 'CURTAIN_SIDE'（下划线），差一个字符就永不相等
//   2. 在基础数据里新增车型，这个表单看不到（它不读基础数据）
//   3. 英文名写死，中德文界面下也只能显示英文

// 承运商分类 / 类型（P7，值域与迁移 111 的 CHECK 约束一致）
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  EXTERNAL: 'carrierCategory.EXTERNAL',
  OWN_FLEET: 'carrierCategory.OWN_FLEET',
}
const CATEGORY_STYLES: Record<string, string> = {
  EXTERNAL: 'bg-blue-100 text-blue-700',
  OWN_FLEET: 'bg-green-100 text-green-700',
}
const TYPE_LABEL_KEYS: Record<string, string> = {
  PLATFORM: 'carrierType.PLATFORM',
  FLEET: 'carrierType.FLEET',
  INDIVIDUAL: 'carrierType.INDIVIDUAL',
}

// ==================== 组件 ====================

// 评分星标
function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i < rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`}
        />
      ))}
      <span className="ml-1 text-xs text-slate-500">{Number(rating).toFixed(1)}</span>
    </div>
  )
}

export default function CarrierList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'INACTIVE'>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'EXTERNAL' | 'OWN_FLEET'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'PLATFORM' | 'FLEET' | 'INDIVIDUAL'>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [confirmTarget, setConfirmTarget] = useState<Carrier | null>(null)
  const pageSize = 20

  // 添加承运商弹窗状态
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState<CarrierForm>(INITIAL_FORM)
  // 车型选项来自基础数据：value 是代号（CURTAIN_SIDE），label 是当前语言的名称。
  // 存进库的是**代号**，界面显示的是**本地化名称**，两者分开。
  const { options: vehicleTypeOptions } = useMasterDataOptions('vehicle-types')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // 获取承运商列表
  const fetchCarriers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (categoryFilter !== 'all') params.set('carrierCategory', categoryFilter)
      if (typeFilter !== 'all') params.set('carrierType', typeFilter)
      const res = await api.get<ApiResponse<Carrier[]>>(`/carriers?${params.toString()}`)
      if (res.code === 200) {
        const list = Array.isArray(res.data) ? res.data : ((res.data as any)?.items || [])
        setCarriers(list)
        setTotal(res.pagination?.total || (res.data as any)?.pagination?.total || 0)
      }
    } catch (err) {
      console.error('获取承运商列表失败:', err)
    } finally {
      setLoading(false)
    }
  }

  // 作废/恢复承运商
  const handleToggleStatus = async (reason?: string) => {
    if (!confirmTarget) return
    const res = await api.put<ApiResponse<{ status: string }>>(
      `/carriers/${confirmTarget.id}/toggle-status`,
      { reason }
    )
    if (res.code === 200) {
      setToast({ type: 'success', message: res.message || t('common.operateSuccess') })
      setConfirmTarget(null)
      fetchCarriers()
    } else {
      throw new Error(res.message || t('common.operateFailed'))
    }
  }

  useEffect(() => {
    fetchCarriers()
  }, [page, statusFilter, categoryFilter, typeFilter])

  const handleSearch = () => {
    setPage(1)
    fetchCarriers()
  }

  // Toast 自动消失
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  // 表单字段更新
  const updateField = (field: keyof CarrierForm, value: string | string[]) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // 切换车辆类型复选框
  const toggleVehicleType = (type: string) => {
    setForm(prev => {
      const current = prev.vehicleTypes
      if (current.includes(type)) {
        return { ...prev, vehicleTypes: current.filter(t => t !== type) }
      }
      return { ...prev, vehicleTypes: [...current, type] }
    })
  }

  // 提交添加承运商
  const handleAddCarrier = async () => {
    // 必填校验
    if (!form.companyName.trim()) { setToast({ type: 'error', message: t('master.errCompanyName') }); return }
    if (!form.country.trim()) { setToast({ type: 'error', message: t('master.errCountry') }); return }
    if (!form.contactName.trim()) { setToast({ type: 'error', message: t('master.errContactName') }); return }
    if (!form.contactEmail.trim()) { setToast({ type: 'error', message: t('master.errContactEmail') }); return }

    setSubmitting(true)
    try {
      // 将逗号分隔的服务国家转成数组
      const serviceCountriesArr = form.serviceCountries
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const payload = {
        companyName: form.companyName.trim(),
        vatNumber: form.vatNumber.trim() || undefined,
        country: form.country.trim(),
        transportLicense: form.transportLicense.trim() || undefined,
        licenseExpiry: form.licenseExpiry || undefined,
        insuranceNumber: form.insuranceNumber.trim() || undefined,
        insuranceExpiry: form.insuranceExpiry || undefined,
        contactName: form.contactName.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim() || undefined,
        // 询价邮箱：逗号分隔的字符串拆成数组，后端存 JSONB
        inquiryEmails: form.inquiryEmails
          .split(/[,;，；]/)
          .map(s => s.trim())
          .filter(Boolean),
        address: form.address.trim() || undefined,
        serviceCountries: serviceCountriesArr.length > 0 ? serviceCountriesArr : undefined,
        vehicleTypes: form.vehicleTypes.length > 0 ? form.vehicleTypes : undefined,
        carrierCategory: form.carrierCategory,
        // 类型没选就不传，库里留 NULL（"未分类"），别硬塞默认值
        carrierType: form.carrierType || undefined,
        remarks: form.remarks.trim() || undefined,
      }
      await api.post<ApiResponse<unknown>>('/carriers', payload)
      setToast({ type: 'success', message: t('carrier.added') })
      setShowAddModal(false)
      setForm(INITIAL_FORM)
      fetchCarriers()
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message || t('carrier.addFailed') })
    } finally {
      setSubmitting(false)
    }
  }


  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Toast 通知 */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-[slideInFromRight_300ms_ease-out] ${
          toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* 页面标题 */}
      <div className="flex items-center gap-4">
        <div className="p-2 bg-orange-50 rounded-xl">
          <Truck className="w-5 h-5 text-orange-600" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">{t('carrier.pageTitle')}</h1>
      </div>

      {/* 搜索栏 + 新建按钮 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={t('carrier.searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as any); setPage(1) }}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
          >
            <option value="all">{t('master.allStatus')}</option>
            <option value="ACTIVE">{t('master.statusActive')}</option>
            <option value="INACTIVE">{t('master.statusVoided')}</option>
          </select>
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value as any); setPage(1) }}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
          >
            <option value="all">{t('carrier.allCategories')}</option>
            <option value="EXTERNAL">{t('carrierCategory.EXTERNAL')}</option>
            <option value="OWN_FLEET">{t('carrierCategory.OWN_FLEET')}</option>
          </select>
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value as any); setPage(1) }}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
          >
            <option value="all">{t('carrier.allTypes')}</option>
            <option value="PLATFORM">{t('carrierType.PLATFORM')}</option>
            <option value="FLEET">{t('carrierType.FLEET')}</option>
            <option value="INDIVIDUAL">{t('carrierType.INDIVIDUAL')}</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open('/api/v1/carriers/export', '_blank')}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-all duration-200"
          >
            <Download className="w-4 h-4" />
            {t('common.export')}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 text-white text-sm font-medium rounded-xl hover:bg-orange-700 transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            {t('carrier.add')}
          </button>
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[8%]" />
              <col className="w-[13%]" />
              <col className="w-[7%]" />
              <col className="w-[17%]" />
              <col className="w-[10%]" />
              <col className="w-[13%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('master.companyName')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('carrier.colCategoryType')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.country')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('carrier.colScore')}</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">{t('carrier.colVehicleCount')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('orderAssign.coveredRoutes')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.status')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : carriers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <Truck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">{t('carrier.empty')}</p>
                  </td>
                </tr>
              ) : (
                carriers.map(carrier => {
                  const isInactive = carrier.status === 'INACTIVE'
                  return (
                  <tr key={carrier.id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200 ${isInactive ? 'opacity-60 bg-slate-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/carriers/${carrier.id}`)}
                          className={`text-sm font-medium hover:underline truncate block max-w-full text-left ${isInactive ? 'text-slate-500 line-through' : 'text-orange-600 hover:text-orange-700'}`}
                        >
                          {carrier.company_name}
                        </button>
                        {isInactive && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 border border-red-100 flex-shrink-0">
                            {t('master.statusVoided')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium ${
                          CATEGORY_STYLES[carrier.carrier_category] || 'bg-gray-100 text-gray-600'
                        }`}>
                          {t(CATEGORY_LABEL_KEYS[carrier.carrier_category] || 'carrierCategory.EXTERNAL')}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {carrier.carrier_type
                            ? t(TYPE_LABEL_KEYS[carrier.carrier_type] || '', { defaultValue: carrier.carrier_type })
                            : t('carrier.uncategorized')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 text-center">{carrier.country || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <RatingStars rating={Number(carrier.performance_score) || 0} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-900 font-medium text-right">{carrier.vehicle_count ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(carrier.service_countries || []).slice(0, 3).map(c => (
                          <span key={c} className="inline-flex px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{c}</span>
                        ))}
                        {(carrier.service_countries || []).length > 3 && (
                          <span className="inline-flex px-2 py-0.5 bg-slate-100 text-slate-400 rounded text-xs">
                            +{carrier.service_countries.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={carrier.status || 'draft'} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => navigate(`/carriers/${carrier.id}`)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                          title={t('common.view')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {!isInactive && (
                          <button
                            onClick={() => navigate(`/carriers/${carrier.id}/edit`)}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200"
                            title={t('common.edit')}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmTarget(carrier)}
                          className={`p-1.5 rounded-lg transition-all duration-200 ${isInactive ? 'text-slate-400 hover:text-green-600 hover:bg-green-50' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}
                          title={isInactive ? t('master.restore') : t('master.void')}
                        >
                          {isInactive ? <RotateCcw className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} />
      </div>

      {/* 添加运输公司弹窗 */}
      <Modal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setForm(INITIAL_FORM) }}
        title={t('carrier.add')}
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => { setShowAddModal(false); setForm(INITIAL_FORM) }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleAddCarrier}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-xl hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {submitting ? t('common.submitting') : t('master.confirmAdd')}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* 公司名称 */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('master.companyName')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.companyName}
              onChange={e => updateField('companyName', e.target.value)}
              placeholder={t('placeholder.carrierName')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* VAT税号 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('master.vatNumber')}</label>
            <input
              type="text"
              value={form.vatNumber}
              onChange={e => updateField('vatNumber', e.target.value)}
              placeholder={t('placeholder.vatEg')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 国家 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('common.country')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.country}
              onChange={e => updateField('country', e.target.value)}
              placeholder={t('placeholder.countryEg')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 运输许可证号 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('carrier.transportLicense')}</label>
            <input
              type="text"
              value={form.transportLicense}
              onChange={e => updateField('transportLicense', e.target.value)}
              placeholder={t('placeholder.licenseNo')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 许可证有效期 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('carrier.licenseExpiry')}</label>
            <input
              type="date"
              value={form.licenseExpiry}
              onChange={e => updateField('licenseExpiry', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 保险编号 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('carrier.insuranceNumber')}</label>
            <input
              type="text"
              value={form.insuranceNumber}
              onChange={e => updateField('insuranceNumber', e.target.value)}
              placeholder={t('carrier.insuranceNumber')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 保险有效期 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('carrier.insuranceExpiry')}</label>
            <input
              type="date"
              value={form.insuranceExpiry}
              onChange={e => updateField('insuranceExpiry', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 联系人 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('field.contact')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.contactName}
              onChange={e => updateField('contactName', e.target.value)}
              placeholder={t('placeholder.contactName')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 联系邮箱 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('master.contactEmail')} <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={e => updateField('contactEmail', e.target.value)}
              placeholder="name@company.com"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 联系电话 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('field.phone')}</label>
            <input
              type="tel"
              value={form.contactPhone}
              onChange={e => updateField('contactPhone', e.target.value)}
              placeholder="+49 xxx xxxx"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 询价邮箱（可多个，逗号分隔） */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('master.inquiryEmails')}</label>
            <input
              type="text"
              value={form.inquiryEmails}
              onChange={e => updateField('inquiryEmails', e.target.value)}
              placeholder={t('master.inquiryEmailsPlaceholder')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
            <p className="text-xs text-slate-400 mt-1">{t('master.inquiryEmailsHint')}</p>
          </div>

          {/* 地址 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('master.address')}</label>
            <input
              type="text"
              value={form.address}
              onChange={e => updateField('address', e.target.value)}
              placeholder={t('placeholder.address')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 分类（P7）：是自己人还是外部服务商 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('carrier.category')}</label>
            <select
              value={form.carrierCategory}
              onChange={e => updateField('carrierCategory', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              <option value="EXTERNAL">{t('carrierCategory.EXTERNAL')}</option>
              <option value="OWN_FLEET">{t('carrierCategory.OWN_FLEET')}</option>
            </select>
          </div>

          {/* 类型（P7）：组织形态，可以先不填 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('common.type')}</label>
            <select
              value={form.carrierType}
              onChange={e => updateField('carrierType', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              <option value="">{t('carrier.typeUnknown')}</option>
              <option value="PLATFORM">{t('carrierType.PLATFORM_LONG')}</option>
              <option value="FLEET">{t('carrierType.FLEET')}</option>
              <option value="INDIVIDUAL">{t('carrierType.INDIVIDUAL')}</option>
            </select>
          </div>

          {/* 服务国家 */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('carrier.serviceCountries')}</label>
            <input
              type="text"
              value={form.serviceCountries}
              onChange={e => updateField('serviceCountries', e.target.value)}
              placeholder={t('placeholder.serviceCountries')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
            <p className="text-xs text-slate-400 mt-1">{t('carrier.serviceCountriesHint')}</p>
          </div>

          {/* 车辆类型 */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('carrier.vehicleTypes')}</label>
            <div className="flex flex-wrap gap-4">
              {vehicleTypeOptions.length === 0 ? (
                // 基础数据一条都没有时说清楚，别只给一片空白让人以为页面坏了
                <span className="text-sm text-slate-400">{t('carrier.vehicleTypesEmpty')}</span>
              ) : (
                vehicleTypeOptions.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      // 勾选状态和提交值都用**代号**，显示才用本地化名称
                      checked={form.vehicleTypes.includes(opt.value)}
                      onChange={() => toggleVehicleType(opt.value)}
                    />
                    <span className="text-sm text-slate-700">{opt.label}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* 备注（P7）：特点/优势/短板，调度选车时看 */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('carrier.remarksLabel')}</label>
            <textarea
              value={form.remarks}
              onChange={e => updateField('remarks', e.target.value)}
              rows={3}
              placeholder={t('carrier.remarksPlaceholder')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* 作废/恢复确认弹窗 */}
      <ConfirmDialog
        isOpen={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleToggleStatus}
        title={confirmTarget?.status === 'INACTIVE' ? t('carrier.restoreTitle') : t('carrier.voidTitle')}
        message={confirmTarget?.status === 'INACTIVE'
          ? t('carrier.restoreMessage')
          : t('carrier.voidMessage')
        }
        targetLabel={confirmTarget?.company_name}
        requireReason={confirmTarget?.status === 'ACTIVE'}
        reasonPlaceholder={t('carrier.voidReasonPlaceholder')}
        variant={confirmTarget?.status === 'INACTIVE' ? 'primary' : 'danger'}
        confirmText={confirmTarget?.status === 'INACTIVE' ? t('master.confirmRestore') : t('master.confirmVoid')}
        warningText={confirmTarget?.status === 'ACTIVE'
          ? t('carrier.voidWarning')
          : undefined}
      />
    </div>
  )
}
