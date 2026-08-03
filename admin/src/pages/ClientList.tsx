import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Search, Plus, Eye, Edit, ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Download, Ban, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'

// ==================== 类型定义 ====================

interface Client {
  id: string
  company_name: string
  vat_number: string
  country: string
  order_count: number
  // ⚠️ 字段名必须和后端返回一致：后端返的是 credit_level / outstanding_amount，
  //    历史上写成 credit_rating / receivable_balance，导致信用等级永远显示 "-"、应收永远 0（踩坑 003）
  credit_level: string
  // 商务等级 VIP / NORMAL，和上面的信用等级 A-D 是两套口径（P7）
  client_level: string
  credit_blocked: boolean
  // outstanding_amount 来自 SUM(NUMERIC)，pg 驱动返回的是字符串（踩坑 002）
  outstanding_amount: string | number
  contact_name: string
  contact_email: string
  status: string
  void_reason?: string
}

interface ClientForm {
  companyName: string
  vatNumber: string
  country: string
  city: string
  address: string
  contactName: string
  contactEmail: string
  contactPhone: string
  invoiceEmail: string
  clientLevel: string
  creditLimit: string
  paymentTerms: string
}

const INITIAL_FORM: ClientForm = {
  companyName: '',
  vatNumber: '',
  country: '',
  city: '',
  address: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  invoiceEmail: '',
  clientLevel: 'NORMAL',
  creditLimit: '',
  paymentTerms: '',
}

// ==================== 格式化函数 ====================

// 金额可能是数据库 NUMERIC 返回的字符串，格式化前先转数字（踩坑 002）
function formatCurrency(amount: string | number | null | undefined): string {
  const value = Number(amount) || 0
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

// 信用等级 A-D 对应的配色：A 最好（绿），D 最差（红）
const CREDIT_LEVEL_STYLES: Record<string, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-amber-100 text-amber-700',
  D: 'bg-red-100 text-red-700',
}

// 商务等级（P7）：VIP 用琥珀色突出，普通客户保持低调
const CLIENT_LEVEL_STYLES: Record<string, string> = {
  VIP: 'bg-amber-100 text-amber-700',
  NORMAL: 'bg-gray-100 text-gray-600',
}
const CLIENT_LEVEL_LABEL_KEYS: Record<string, string> = {
  VIP: 'client.levelVipShort',
  NORMAL: 'client.levelNormalShort',
}

// ==================== 组件 ====================

export default function ClientList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'INACTIVE'>('all')
  const [levelFilter, setLevelFilter] = useState<'all' | 'VIP' | 'NORMAL'>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  // 添加客户弹窗状态
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState<ClientForm>(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // 作废/恢复确认
  const [confirmTarget, setConfirmTarget] = useState<Client | null>(null)

  // 获取客户列表
  const fetchClients = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (levelFilter !== 'all') params.set('clientLevel', levelFilter)
      const res = await api.get<ApiResponse<Client[]>>(`/clients?${params.toString()}`)
      if (res.code === 200) {
        setClients(res.data || [])
        setTotal(res.pagination?.total || 0)
      }
    } catch (err) {
      console.error('获取客户列表失败:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClients()
  }, [page, statusFilter, levelFilter])

  // 搜索（回车或点击按钮）
  const handleSearch = () => {
    setPage(1)
    fetchClients()
  }

  // Toast 自动消失
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  // 表单字段更新
  const updateField = (field: keyof ClientForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // 提交添加客户
  const handleAddClient = async () => {
    // 必填校验
    if (!form.companyName.trim()) { setToast({ type: 'error', message: t('master.errCompanyName') }); return }
    if (!form.country.trim()) { setToast({ type: 'error', message: t('master.errCountry') }); return }
    if (!form.contactName.trim()) { setToast({ type: 'error', message: t('master.errContactName') }); return }
    if (!form.contactEmail.trim()) { setToast({ type: 'error', message: t('master.errContactEmail') }); return }

    setSubmitting(true)
    try {
      const payload = {
        companyName: form.companyName.trim(),
        vatNumber: form.vatNumber.trim() || undefined,
        country: form.country.trim(),
        city: form.city.trim() || undefined,
        address: form.address.trim() || undefined,
        contactName: form.contactName.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim() || undefined,
        invoiceEmail: form.invoiceEmail.trim() || undefined,
        clientLevel: form.clientLevel,
        creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined,
        paymentTerms: form.paymentTerms ? Number(form.paymentTerms) : undefined,
      }
      await api.post<ApiResponse<unknown>>('/clients', payload)
      setToast({ type: 'success', message: t('client.added') })
      setShowAddModal(false)
      setForm(INITIAL_FORM)
      fetchClients()
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message || t('client.addFailed') })
    } finally {
      setSubmitting(false)
    }
  }

  // 作废/恢复提交
  const handleToggleStatus = async (reason?: string) => {
    if (!confirmTarget) return
    const res = await api.put<ApiResponse<{ status: string }>>(
      `/clients/${confirmTarget.id}/toggle-status`,
      { reason }
    )
    if (res.code === 200) {
      setToast({ type: 'success', message: res.message || t('common.operateSuccess') })
      setConfirmTarget(null)
      fetchClients()
    } else {
      throw new Error(res.message || t('common.operateFailed'))
    }
  }

  const totalPages = Math.ceil(total / pageSize)

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
        <div className="p-2 bg-blue-50 rounded-xl">
          <Users className="w-5 h-5 text-blue-600" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">{t('client.pageTitle')}</h1>
      </div>

      {/* 搜索栏 + 新建按钮 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={t('client.searchPlaceholder')}
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
            value={levelFilter}
            onChange={e => { setLevelFilter(e.target.value as any); setPage(1) }}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
          >
            <option value="all">{t('client.allLevels')}</option>
            <option value="VIP">{t('client.levelVip')}</option>
            <option value="NORMAL">{t('client.levelNormal')}</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open('/api/v1/clients/export', '_blank')}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-all duration-200"
          >
            <Download className="w-4 h-4" />
            {t('common.export')}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            {t('client.add')}
          </button>
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[15%]" />
              <col className="w-[17%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('master.companyName')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('master.vatNumber')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.country')}</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">{t('client.colOrderCount')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('client.colLevel')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('client.colCreditLevel')}</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">{t('client.colOutstanding')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // 加载骨架屏
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">{t('client.empty')}</p>
                  </td>
                </tr>
              ) : (
                clients.map(client => {
                  const isInactive = client.status === 'INACTIVE'
                  return (
                  <tr key={client.id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200 ${isInactive ? 'opacity-60 bg-slate-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/clients/${client.id}`)}
                          className={`text-sm font-medium hover:underline truncate block max-w-full text-left ${isInactive ? 'text-slate-500 line-through' : 'text-blue-600 hover:text-blue-700'}`}
                        >
                          {client.company_name}
                        </button>
                        {isInactive && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 border border-red-100 flex-shrink-0">
                            {t('master.statusVoided')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{client.vat_number || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 text-center">{client.country || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-900 font-medium text-right">{client.order_count ?? 0}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                          CLIENT_LEVEL_STYLES[client.client_level] || 'bg-gray-100 text-gray-600'
                        }`}>
                          {t(CLIENT_LEVEL_LABEL_KEYS[client.client_level] || 'client.levelNormalShort')}
                        </span>
                        {/* 信用被冻结的客户下不了单，列表里要一眼看得见 */}
                        {client.credit_blocked && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 border border-red-100">
                            {t('client.blocked')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                        CREDIT_LEVEL_STYLES[client.credit_level] || 'bg-gray-100 text-gray-600'
                      }`}>
                        {client.credit_level || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-900 font-medium text-right">
                      {formatCurrency(client.outstanding_amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => navigate(`/clients/${client.id}`)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                          title={t('common.view')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {!isInactive && (
                          <button
                            onClick={() => navigate(`/clients/${client.id}/edit`)}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200"
                            title={t('common.edit')}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmTarget(client)}
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
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">{t('common.totalCount', { count: total })}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-600">{page} / {totalPages || 1}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 添加客户弹窗 */}
      <Modal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setForm(INITIAL_FORM) }}
        title={t('client.add')}
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
              onClick={handleAddClient}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
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
              placeholder={t('master.errCompanyName')}
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

          {/* 城市 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('common.city')}</label>
            <input
              type="text"
              value={form.city}
              onChange={e => updateField('city', e.target.value)}
              placeholder={t('placeholder.cityEg')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 详细地址 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('field.addressDetail')}</label>
            <input
              type="text"
              value={form.address}
              onChange={e => updateField('address', e.target.value)}
              placeholder={t('placeholder.addressDetail')}
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

          {/* 发票邮箱 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('client.invoiceEmail')}</label>
            <input
              type="email"
              value={form.invoiceEmail}
              onChange={e => updateField('invoiceEmail', e.target.value)}
              placeholder="invoice@company.com"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 客户等级（商务分级，和信用等级 A-D 无关） */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('client.colLevel')}</label>
            <select
              value={form.clientLevel}
              onChange={e => updateField('clientLevel', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              <option value="NORMAL">{t('client.levelNormal')}</option>
              <option value="VIP">{t('client.levelVip')}</option>
            </select>
          </div>

          {/* 信用额度 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('client.creditLimitEur')}</label>
            <input
              type="number"
              value={form.creditLimit}
              onChange={e => updateField('creditLimit', e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>

          {/* 账期 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('client.paymentTermsDays')}</label>
            <input
              type="number"
              value={form.paymentTerms}
              onChange={e => updateField('paymentTerms', e.target.value)}
              placeholder={t('placeholder.paymentTermsEg')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            />
          </div>
        </div>
      </Modal>

      {/* 作废/恢复确认弹窗 */}
      <ConfirmDialog
        isOpen={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleToggleStatus}
        title={confirmTarget?.status === 'INACTIVE' ? t('client.restoreTitle') : t('client.voidTitle')}
        message={confirmTarget?.status === 'INACTIVE'
          ? t('client.restoreMessage')
          : t('client.voidMessage')
        }
        targetLabel={confirmTarget?.company_name}
        requireReason={confirmTarget?.status === 'ACTIVE'}
        reasonPlaceholder={t('client.voidReasonPlaceholder')}
        variant={confirmTarget?.status === 'INACTIVE' ? 'primary' : 'danger'}
        confirmText={confirmTarget?.status === 'INACTIVE' ? t('master.confirmRestore') : t('master.confirmVoid')}
        warningText={confirmTarget?.status === 'ACTIVE'
          ? t('client.voidWarning')
          : undefined}
      />
    </div>
  )
}
