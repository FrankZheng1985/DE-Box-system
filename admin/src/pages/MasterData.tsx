import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Database,
  Ship,
  Box,
  Banknote,
  Globe,
  Anchor,
  Truck,
  AlertTriangle,
  Plus,
  Search,
  Edit3,
  ToggleLeft,
  ToggleRight,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import type { MasterDataItem } from '../types'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'

// ==================== Tab 配置 ====================

interface ColumnDef {
  key: string
  labelKey: string
  width: string
  align: 'text-left' | 'text-center' | 'text-right'
}

interface FormFieldDef {
  key: string
  labelKey: string
  required: boolean
  type: 'text' | 'number' | 'select' | 'textarea'
  placeholderKey?: string
  options?: { value: string; labelKey: string }[]
}

interface TabConfig {
  key: string
  labelKey: string
  icon: typeof Ship
  columns: ColumnDef[]
  formFields: FormFieldDef[]
}

const TAB_CONFIGS: TabConfig[] = [
  {
    key: 'shipping-lines',
    labelKey: 'masterData.tabShippingLines',
    icon: Ship,
    columns: [
      { key: 'code', labelKey: 'masterData.colCode', width: 'w-[12%]', align: 'text-left' },
      { key: 'name_zh', labelKey: 'masterData.colNameZh', width: 'w-[18%]', align: 'text-left' },
      { key: 'name_en', labelKey: 'masterData.colNameEn', width: 'w-[20%]', align: 'text-left' },
      { key: 'country', labelKey: 'masterData.colCountry', width: 'w-[14%]', align: 'text-center' },
      { key: 'website', labelKey: 'masterData.colWebsite', width: 'w-[16%]', align: 'text-left' },
      { key: 'is_active', labelKey: 'common.status', width: 'w-[10%]', align: 'text-center' },
      { key: '_actions', labelKey: 'common.actions', width: 'w-[10%]', align: 'text-center' },
    ],
    formFields: [
      { key: 'code', labelKey: 'masterData.fieldShippingLineCode', required: true, type: 'text', placeholderKey: 'masterData.phShippingLineCode' },
      { key: 'name_zh', labelKey: 'masterData.fieldNameZh', required: true, type: 'text', placeholderKey: 'masterData.phShippingLineNameZh' },
      { key: 'name_en', labelKey: 'masterData.fieldNameEn', required: false, type: 'text', placeholderKey: 'masterData.phShippingLineNameEn' },
      { key: 'name_de', labelKey: 'masterData.fieldNameDe', required: false, type: 'text', placeholderKey: 'masterData.phNameDe' },
      { key: 'country', labelKey: 'masterData.colCountry', required: false, type: 'text', placeholderKey: 'masterData.phCountrySwitzerland' },
      { key: 'website', labelKey: 'masterData.fieldWebsite', required: false, type: 'text', placeholderKey: 'masterData.phWebsite' },
      { key: 'sort_order', labelKey: 'masterData.fieldSortOrder', required: false, type: 'number', placeholderKey: 'masterData.phSortOrder' },
    ],
  },
  {
    key: 'container-types',
    labelKey: 'masterData.tabContainerTypes',
    icon: Box,
    columns: [
      { key: 'code', labelKey: 'masterData.fieldContainerTypeCode', width: 'w-[15%]', align: 'text-left' },
      { key: 'name_zh', labelKey: 'masterData.colNameZh', width: 'w-[20%]', align: 'text-left' },
      { key: 'name_en', labelKey: 'masterData.colNameEn', width: 'w-[22%]', align: 'text-left' },
      { key: 'length_ft', labelKey: 'masterData.colLengthFt', width: 'w-[13%]', align: 'text-right' },
      { key: 'is_active', labelKey: 'common.status', width: 'w-[15%]', align: 'text-center' },
      { key: '_actions', labelKey: 'common.actions', width: 'w-[15%]', align: 'text-center' },
    ],
    formFields: [
      { key: 'code', labelKey: 'masterData.fieldContainerTypeCode', required: true, type: 'text', placeholderKey: 'masterData.phContainerTypeCode' },
      { key: 'name_zh', labelKey: 'masterData.fieldNameZh', required: true, type: 'text', placeholderKey: 'masterData.phContainerTypeNameZh' },
      { key: 'name_en', labelKey: 'masterData.fieldNameEn', required: false, type: 'text', placeholderKey: 'masterData.phContainerTypeNameEn' },
      { key: 'name_de', labelKey: 'masterData.fieldNameDe', required: false, type: 'text', placeholderKey: 'masterData.phNameDe' },
      { key: 'length_ft', labelKey: 'masterData.fieldLengthFt', required: false, type: 'number', placeholderKey: 'masterData.phLengthFt' },
      { key: 'sort_order', labelKey: 'masterData.fieldSortOrder', required: false, type: 'number', placeholderKey: 'masterData.phSortOrder' },
    ],
  },
  {
    key: 'currencies',
    labelKey: 'masterData.tabCurrencies',
    icon: Banknote,
    columns: [
      { key: 'code', labelKey: 'masterData.fieldCurrencyCode', width: 'w-[14%]', align: 'text-left' },
      { key: 'name_zh', labelKey: 'masterData.colNameZh', width: 'w-[18%]', align: 'text-left' },
      { key: 'name_en', labelKey: 'masterData.colNameEn', width: 'w-[22%]', align: 'text-left' },
      { key: 'symbol', labelKey: 'masterData.colSymbol', width: 'w-[12%]', align: 'text-center' },
      { key: 'is_active', labelKey: 'common.status', width: 'w-[16%]', align: 'text-center' },
      { key: '_actions', labelKey: 'common.actions', width: 'w-[18%]', align: 'text-center' },
    ],
    formFields: [
      { key: 'code', labelKey: 'masterData.fieldCurrencyCode', required: true, type: 'text', placeholderKey: 'masterData.phCurrencyCode' },
      { key: 'name_zh', labelKey: 'masterData.fieldNameZh', required: true, type: 'text', placeholderKey: 'masterData.phCurrencyNameZh' },
      { key: 'name_en', labelKey: 'masterData.fieldNameEn', required: false, type: 'text', placeholderKey: 'masterData.phCurrencyNameEn' },
      { key: 'name_de', labelKey: 'masterData.fieldNameDe', required: false, type: 'text', placeholderKey: 'masterData.phNameDe' },
      { key: 'symbol', labelKey: 'masterData.fieldSymbol', required: false, type: 'text', placeholderKey: 'masterData.phSymbol' },
      { key: 'sort_order', labelKey: 'masterData.fieldSortOrder', required: false, type: 'number', placeholderKey: 'masterData.phSortOrder' },
    ],
  },
  {
    key: 'countries',
    labelKey: 'masterData.tabCountries',
    icon: Globe,
    columns: [
      { key: 'code', labelKey: 'masterData.colCountryCode', width: 'w-[12%]', align: 'text-left' },
      { key: 'name_zh', labelKey: 'masterData.colNameZh', width: 'w-[16%]', align: 'text-left' },
      { key: 'name_en', labelKey: 'masterData.colNameEn', width: 'w-[20%]', align: 'text-left' },
      { key: 'region', labelKey: 'masterData.colRegion', width: 'w-[18%]', align: 'text-center' },
      { key: 'is_active', labelKey: 'common.status', width: 'w-[16%]', align: 'text-center' },
      { key: '_actions', labelKey: 'common.actions', width: 'w-[18%]', align: 'text-center' },
    ],
    formFields: [
      { key: 'code', labelKey: 'masterData.fieldCountryCodeIso', required: true, type: 'text', placeholderKey: 'masterData.phCountryCodeIso' },
      { key: 'name_zh', labelKey: 'masterData.fieldNameZh', required: true, type: 'text', placeholderKey: 'masterData.phCountryNameZh' },
      { key: 'name_en', labelKey: 'masterData.fieldNameEn', required: true, type: 'text', placeholderKey: 'placeholder.countryEg' },
      { key: 'name_de', labelKey: 'masterData.fieldNameDe', required: false, type: 'text', placeholderKey: 'masterData.phNameDe' },
      { key: 'region', labelKey: 'masterData.fieldRegion', required: false, type: 'text', placeholderKey: 'masterData.phRegion' },
      { key: 'sort_order', labelKey: 'masterData.fieldSortOrder', required: false, type: 'number', placeholderKey: 'masterData.phSortOrder' },
    ],
  },
  {
    key: 'ports',
    labelKey: 'masterData.tabPorts',
    icon: Anchor,
    columns: [
      { key: 'code', labelKey: 'masterData.fieldPortCode', width: 'w-[12%]', align: 'text-left' },
      { key: 'name_zh', labelKey: 'masterData.colNameZh', width: 'w-[16%]', align: 'text-left' },
      { key: 'name_en', labelKey: 'masterData.colNameEn', width: 'w-[16%]', align: 'text-left' },
      { key: 'country_code', labelKey: 'masterData.colCountry', width: 'w-[12%]', align: 'text-center' },
      { key: 'port_type', labelKey: 'common.type', width: 'w-[12%]', align: 'text-center' },
      { key: 'is_active', labelKey: 'common.status', width: 'w-[14%]', align: 'text-center' },
      { key: '_actions', labelKey: 'common.actions', width: 'w-[18%]', align: 'text-center' },
    ],
    formFields: [
      { key: 'code', labelKey: 'masterData.fieldPortCode', required: true, type: 'text', placeholderKey: 'masterData.phPortCode' },
      { key: 'name_zh', labelKey: 'masterData.fieldNameZh', required: true, type: 'text', placeholderKey: 'masterData.phPortNameZh' },
      { key: 'name_en', labelKey: 'masterData.fieldNameEn', required: true, type: 'text', placeholderKey: 'masterData.phPortNameEn' },
      { key: 'name_de', labelKey: 'masterData.fieldNameDe', required: false, type: 'text', placeholderKey: 'masterData.phNameDe' },
      { key: 'country_code', labelKey: 'masterData.fieldCountryCode', required: false, type: 'text', placeholderKey: 'masterData.phCountryCode' },
      {
        key: 'port_type', labelKey: 'masterData.fieldPortType', required: false, type: 'select',
        options: [
          { value: 'SEA', labelKey: 'portType.SEA' },
          { value: 'INLAND', labelKey: 'portType.INLAND' },
          { value: 'RAIL', labelKey: 'portType.RAIL' },
        ],
      },
      { key: 'sort_order', labelKey: 'masterData.fieldSortOrder', required: false, type: 'number', placeholderKey: 'masterData.phSortOrder' },
    ],
  },
  {
    key: 'vehicle-types',
    labelKey: 'masterData.tabVehicleTypes',
    icon: Truck,
    columns: [
      { key: 'code', labelKey: 'masterData.colCode', width: 'w-[14%]', align: 'text-left' },
      { key: 'name_zh', labelKey: 'masterData.colNameZh', width: 'w-[16%]', align: 'text-left' },
      { key: 'name_en', labelKey: 'masterData.colNameEn', width: 'w-[18%]', align: 'text-left' },
      { key: 'max_weight_kg', labelKey: 'masterData.colMaxWeightKg', width: 'w-[14%]', align: 'text-right' },
      { key: 'max_volume_m3', labelKey: 'masterData.colMaxVolumeM3', width: 'w-[14%]', align: 'text-right' },
      { key: 'is_active', labelKey: 'common.status', width: 'w-[12%]', align: 'text-center' },
      { key: '_actions', labelKey: 'common.actions', width: 'w-[12%]', align: 'text-center' },
    ],
    formFields: [
      { key: 'code', labelKey: 'masterData.fieldVehicleTypeCode', required: true, type: 'text', placeholderKey: 'masterData.phVehicleTypeCode' },
      { key: 'name_zh', labelKey: 'masterData.fieldNameZh', required: true, type: 'text', placeholderKey: 'masterData.phVehicleTypeNameZh' },
      { key: 'name_en', labelKey: 'masterData.fieldNameEn', required: false, type: 'text', placeholderKey: 'masterData.phVehicleTypeNameEn' },
      { key: 'name_de', labelKey: 'masterData.fieldNameDe', required: false, type: 'text', placeholderKey: 'masterData.phNameDe' },
      { key: 'max_weight_kg', labelKey: 'masterData.colMaxWeightKg', required: false, type: 'number', placeholderKey: 'masterData.phMaxWeight' },
      { key: 'max_volume_m3', labelKey: 'masterData.colMaxVolumeM3', required: false, type: 'number', placeholderKey: 'masterData.phMaxVolume' },
      { key: 'sort_order', labelKey: 'masterData.fieldSortOrder', required: false, type: 'number', placeholderKey: 'masterData.phSortOrder' },
    ],
  },
  {
    key: 'special-requirements',
    labelKey: 'masterData.tabSpecialRequirements',
    icon: AlertTriangle,
    columns: [
      { key: 'code', labelKey: 'masterData.colCode', width: 'w-[14%]', align: 'text-left' },
      { key: 'name_zh', labelKey: 'masterData.colNameZh', width: 'w-[18%]', align: 'text-left' },
      { key: 'name_en', labelKey: 'masterData.colNameEn', width: 'w-[20%]', align: 'text-left' },
      { key: 'description', labelKey: 'masterData.colDescription', width: 'w-[18%]', align: 'text-left' },
      { key: 'is_active', labelKey: 'common.status', width: 'w-[14%]', align: 'text-center' },
      { key: '_actions', labelKey: 'common.actions', width: 'w-[16%]', align: 'text-center' },
    ],
    formFields: [
      { key: 'code', labelKey: 'masterData.fieldRequirementCode', required: true, type: 'text', placeholderKey: 'masterData.phRequirementCode' },
      { key: 'name_zh', labelKey: 'masterData.fieldNameZh', required: true, type: 'text', placeholderKey: 'masterData.phRequirementNameZh' },
      { key: 'name_en', labelKey: 'masterData.fieldNameEn', required: false, type: 'text', placeholderKey: 'masterData.phRequirementNameEn' },
      { key: 'name_de', labelKey: 'masterData.fieldNameDe', required: false, type: 'text', placeholderKey: 'masterData.phNameDe' },
      { key: 'description', labelKey: 'masterData.fieldDescription', required: false, type: 'textarea', placeholderKey: 'masterData.phDescription' },
      { key: 'sort_order', labelKey: 'masterData.fieldSortOrder', required: false, type: 'number', placeholderKey: 'masterData.phSortOrder' },
    ],
  },
]

// ==================== 组件 ====================

export default function MasterData() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Tab 状态
  const [activeTab, setActiveTab] = useState('shipping-lines')
  const currentTabConfig = TAB_CONFIGS.find(t => t.key === activeTab)!

  // 列表状态
  const [items, setItems] = useState<MasterDataItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  // 弹窗状态
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<MasterDataItem | null>(null)
  const [form, setForm] = useState<Record<string, string | number>>({})
  const [submitting, setSubmitting] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // 启用/停用确认
  const [toggleTarget, setToggleTarget] = useState<MasterDataItem | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  // 获取列表
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await api.get<ApiResponse<MasterDataItem[]>>(
        `/system/master-data/${activeTab}?${params.toString()}`
      )
      if (res.code === 200) {
        setItems(res.data || [])
        setTotal(res.pagination?.total || 0)
      }
    } catch (err: any) {
      console.error('[MasterData] 获取列表失败:', err)
      setToast({ type: 'error', message: t('common.loadFailed') })
    } finally {
      setLoading(false)
    }
  }, [activeTab, page, search, statusFilter])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  // 切换 Tab 时重置
  const handleTabChange = (tabKey: string) => {
    setActiveTab(tabKey)
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }

  // 搜索
  const handleSearch = () => {
    setPage(1)
    fetchList()
  }

  // 打开新增弹窗
  const handleAdd = () => {
    setEditingItem(null)
    const initialForm: Record<string, string | number> = {}
    currentTabConfig.formFields.forEach(f => {
      initialForm[f.key] = f.type === 'number' ? 0 : ''
    })
    setForm(initialForm)
    setShowModal(true)
  }

  // 打开编辑弹窗
  const handleEdit = (item: MasterDataItem) => {
    setEditingItem(item)
    const editForm: Record<string, string | number> = {}
    currentTabConfig.formFields.forEach(f => {
      const val = item[f.key]
      if (val !== null && val !== undefined) {
        editForm[f.key] = typeof val === 'number' ? val : String(val)
      } else {
        editForm[f.key] = f.type === 'number' ? 0 : ''
      }
    })
    setForm(editForm)
    setShowModal(true)
  }

  // 关闭弹窗
  const handleCloseModal = () => {
    setShowModal(false)
    setEditingItem(null)
    setForm({})
  }

  // 提交表单（新增/编辑）
  const handleSubmit = async () => {
    // 必填验证
    for (const field of currentTabConfig.formFields) {
      if (field.required && !String(form[field.key] || '').trim()) {
        setToast({ type: 'error', message: t('masterData.errRequired', { field: t(field.labelKey) }) })
        return
      }
    }

    setSubmitting(true)
    try {
      // 构建提交数据，number类型转换
      const payload: Record<string, unknown> = {}
      currentTabConfig.formFields.forEach(f => {
        const val = form[f.key]
        if (f.type === 'number' && val !== '' && val !== undefined) {
          payload[f.key] = Number(val) || 0
        } else {
          payload[f.key] = val || null
        }
      })

      if (editingItem) {
        await api.put<ApiResponse<unknown>>(`/system/master-data/${activeTab}/${editingItem.id}`, payload)
        setToast({ type: 'success', message: t('masterData.updated') })
      } else {
        await api.post<ApiResponse<unknown>>(`/system/master-data/${activeTab}`, payload)
        setToast({ type: 'success', message: t('masterData.added') })
      }

      handleCloseModal()
      fetchList()
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message || t('common.operateFailed') })
    } finally {
      setSubmitting(false)
    }
  }

  // 启用/停用（先触发确认弹窗）
  const handleToggle = (item: MasterDataItem) => {
    setToggleTarget(item)
  }

  // 确认后真正执行
  const confirmToggle = async () => {
    if (!toggleTarget) return
    const res = await api.put<ApiResponse<{ is_active: boolean }>>(
      `/system/master-data/${activeTab}/${toggleTarget.id}/toggle`
    )
    if (res.code === 200) {
      setToast({ type: 'success', message: res.message })
      setToggleTarget(null)
      fetchList()
    } else {
      throw new Error(res.message || t('common.operateFailed'))
    }
  }

  // 渲染单元格内容
  const renderCell = (item: MasterDataItem, col: ColumnDef) => {
    if (col.key === 'is_active') {
      return item.is_active ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          {t('status.ACTIVE')}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          {t('status.INACTIVE')}
        </span>
      )
    }

    if (col.key === '_actions') {
      return (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => handleEdit(item)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all duration-200"
            title={t('common.edit')}
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleToggle(item)}
            className={`p-1.5 rounded-lg transition-all duration-200 ${
              item.is_active
                ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
            }`}
            title={item.is_active ? t('status.INACTIVE') : t('status.ACTIVE')}
          >
            {item.is_active ? (
              <ToggleRight className="w-3.5 h-3.5" />
            ) : (
              <ToggleLeft className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      )
    }

    // 数字类型格式化
    if (col.key === 'max_weight_kg' || col.key === 'max_volume_m3' || col.key === 'length_ft') {
      const val = item[col.key]
      return val ? Number(val).toLocaleString() : '-'
    }

    // 网站链接
    if (col.key === 'website' && item[col.key]) {
      return (
        <a
          href={String(item[col.key])}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-xs truncate block"
        >
          {String(item[col.key])}
        </a>
      )
    }

    const val = item[col.key]
    return val !== null && val !== undefined ? String(val) : '-'
  }


  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all duration-300 ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {toast.message}
        </div>
      )}

      {/* 页面标题 */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/settings')}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all duration-200"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow-[0_2px_8px_rgb(249,115,22,0.3)]">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t('masterData.pageTitle')}</h1>
            <p className="text-xs text-slate-500">{t('masterData.pageSubtitle')}</p>
          </div>
        </div>
      </div>

      {/* Tab 栏 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60">
        <div className="flex gap-1 px-4 pt-4 overflow-x-auto">
          {TAB_CONFIGS.map(tab => {
            const TabIcon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-xl border-b-2 transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? 'text-blue-600 border-blue-600 bg-blue-50/50'
                    : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <TabIcon className="w-4 h-4" />
                {t(tab.labelKey)}
              </button>
            )
          })}
        </div>

        {/* 搜索栏 + 操作 */}
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder={t('masterData.searchPlaceholder')}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              className="text-sm px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              <option value="all">{t('master.allStatus')}</option>
              <option value="active">{t('masterData.filterActive')}</option>
              <option value="inactive">{t('masterData.filterInactive')}</option>
            </select>
          </div>
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {t('common.add')}
          </button>
        </div>

        {/* 表格 */}
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              {currentTabConfig.columns.map(col => (
                <col key={col.key} className={col.width} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                {currentTabConfig.columns.map(col => (
                  <th
                    key={col.key}
                    className={`${col.align} text-xs font-medium text-slate-500 px-4 py-3`}
                  >
                    {t(col.labelKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // 骨架屏
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {currentTabConfig.columns.map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                // 空状态
                <tr>
                  <td colSpan={currentTabConfig.columns.length} className="px-4 py-16 text-center">
                    <Database className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">
                      {t('masterData.emptyOf', { name: t(currentTabConfig.labelKey) })}
                    </p>
                    <button
                      onClick={handleAdd}
                      className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + {t('masterData.addOf', { name: t(currentTabConfig.labelKey) })}
                    </button>
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200"
                  >
                    {currentTabConfig.columns.map(col => (
                      <td
                        key={col.key}
                        className={`${col.align} px-4 py-3 text-xs text-slate-700`}
                      >
                        {renderCell(item, col)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={
          editingItem
            ? t('masterData.editOf', { name: t(currentTabConfig.labelKey) })
            : t('masterData.addOf', { name: t(currentTabConfig.labelKey) })
        }
        size="md"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleCloseModal}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium rounded-xl hover:bg-slate-100 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? t('common.submitting') : editingItem ? t('orderForm.saveChanges') : t('master.confirmAdd')}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {currentTabConfig.formFields.map(field => (
            <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t(field.labelKey)}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              {field.type === 'select' ? (
                <select
                  value={form[field.key] || ''}
                  onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
                >
                  <option value="">{t('placeholder.pleaseSelect')}</option>
                  {field.options?.map(opt => (
                    <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  value={form[field.key] || ''}
                  onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholderKey ? t(field.placeholderKey) : ''}
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 resize-none"
                />
              ) : (
                <input
                  type={field.type}
                  value={form[field.key] ?? ''}
                  onChange={e => setForm(prev => ({
                    ...prev,
                    [field.key]: field.type === 'number' ? e.target.value : e.target.value,
                  }))}
                  placeholder={field.placeholderKey ? t(field.placeholderKey) : ''}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
                />
              )}
            </div>
          ))}
        </div>
      </Modal>

      {/* 启用/停用确认 */}
      <ConfirmDialog
        isOpen={toggleTarget !== null}
        onClose={() => setToggleTarget(null)}
        onConfirm={confirmToggle}
        title={
          toggleTarget?.is_active
            ? t('masterData.disableOf', { name: t(currentTabConfig.labelKey) })
            : t('masterData.enableOf', { name: t(currentTabConfig.labelKey) })
        }
        message={toggleTarget?.is_active
          ? t('masterData.disableMessage')
          : t('masterData.enableMessage')
        }
        targetLabel={toggleTarget ? `${toggleTarget.code} - ${toggleTarget.name_zh}` : undefined}
        variant={toggleTarget?.is_active ? 'warning' : 'primary'}
        confirmText={toggleTarget?.is_active ? t('masterData.confirmDisable') : t('masterData.confirmEnable')}
      />
    </div>
  )
}
