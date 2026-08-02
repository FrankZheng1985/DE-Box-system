/**
 * 客户编辑页面
 * 获取现有客户数据 -> 填充表单 -> 提交修改
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  Users,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'

// ==================== 类型定义 ====================

interface ClientFormData {
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
  creditLimit: number
  creditLevel: string
  riskCategory: string
  paymentTerms: string
}

const INITIAL_FORM: ClientFormData = {
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
  creditLimit: 0,
  creditLevel: '',
  riskCategory: 'MEDIUM',
  paymentTerms: '',
}

// ==================== 骨架屏 ====================

function FormSkeleton() {
  return (
    <div className="p-4 lg:p-6 animate-pulse">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-10 h-10 bg-slate-200 rounded-xl" />
        <div className="h-7 w-40 bg-slate-200 rounded-lg" />
      </div>
      <div className="bg-white/80 rounded-2xl p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-slate-100 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

export default function ClientEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [form, setForm] = useState<ClientFormData>({ ...INITIAL_FORM })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // 获取客户数据
  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function fetchClient() {
      setLoading(true)
      try {
        const res = await api.get<ApiResponse<any>>(`/clients/${id}`)
        if (cancelled) return
        if (res.code === 200 && res.data) {
          const d = res.data
          setForm({
            companyName: d.company_name || d.companyName || '',
            vatNumber: d.vat_number || d.vatNumber || '',
            country: d.country || '',
            city: d.city || '',
            address: d.address || '',
            contactName: d.contact_name || d.contactName || '',
            contactEmail: d.contact_email || d.contactEmail || '',
            contactPhone: d.contact_phone || d.contactPhone || '',
            invoiceEmail: d.invoice_email || d.invoiceEmail || '',
            clientLevel: d.client_level || d.clientLevel || 'NORMAL',
            creditLimit: d.credit_limit || d.creditLimit || 0,
            creditLevel: d.credit_level || d.creditLevel || '',
            riskCategory: d.risk_category || d.riskCategory || 'MEDIUM',
            // payment_terms 是 INTEGER（天数），0 表示预付，不能用 || 兜底会把 0 吞掉
            paymentTerms: String(d.payment_terms ?? d.paymentTerms ?? ''),
          })
        } else {
          setError(res.message || '获取客户信息失败')
        }
      } catch (err: any) {
        if (cancelled) return
        console.error('[ClientEdit] 获取客户失败:', err)
        setError(err.message || '请求失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchClient()
    return () => { cancelled = true }
  }, [id])

  // 更新表单字段
  function updateField(field: keyof ClientFormData, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // 提交
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.companyName.trim()) {
      setError('公司名称不能为空')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const payload = {
        ...form,
        // 账期是 INTEGER，没选就不提交这个字段（保持库里原值）
        paymentTerms: form.paymentTerms === '' ? undefined : Number(form.paymentTerms),
      }
      const res = await api.put<ApiResponse<any>>(`/clients/${id}`, payload)
      if (res.code === 200) {
        setSuccessMsg('客户信息已更新')
        setTimeout(() => navigate(`/clients/${id}`), 1200)
      } else {
        setError(res.message || '更新失败')
      }
    } catch (err: any) {
      console.error('[ClientEdit] 提交失败:', err)
      setError(err.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200'

  if (loading) return <FormSkeleton />

  return (
    <div className="p-4 lg:p-6">
      {/* 成功提示 */}
      {successMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-green-50 border border-green-200 text-green-700 px-5 py-3 rounded-xl shadow-lg">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-sm font-medium">{successMsg}</span>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-5 py-3 rounded-xl shadow-lg">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {/* 头部 */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100 transition-all duration-200">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          <h1 className="text-xl font-semibold text-slate-900">编辑客户</h1>
        </div>
      </div>

      {/* 表单 */}
      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
        {/* 公司信息 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">公司信息</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                公司名称 <span className="text-red-500">*</span>
              </label>
              <input type="text" value={form.companyName} onChange={(e) => updateField('companyName', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">VAT 税号</label>
              <input type="text" value={form.vatNumber} onChange={(e) => updateField('vatNumber', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">国家</label>
              <input type="text" value={form.country} onChange={(e) => updateField('country', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">城市</label>
              <input type="text" value={form.city} onChange={(e) => updateField('city', e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">地址</label>
              <input type="text" value={form.address} onChange={(e) => updateField('address', e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        {/* 联系人信息 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">联系人信息</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">联系人</label>
              <input type="text" value={form.contactName} onChange={(e) => updateField('contactName', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">联系邮箱</label>
              <input type="email" value={form.contactEmail} onChange={(e) => updateField('contactEmail', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">联系电话</label>
              <input type="text" value={form.contactPhone} onChange={(e) => updateField('contactPhone', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">发票邮箱</label>
              <input type="email" value={form.invoiceEmail} onChange={(e) => updateField('invoiceEmail', e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        {/* 商务等级（P7：和下面的财务风险评级刻意分开两块，避免口径混淆） */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">商务等级</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">客户等级</label>
              <select value={form.clientLevel} onChange={(e) => updateField('clientLevel', e.target.value)} className={inputClass}>
                <option value="NORMAL">普通客户</option>
                <option value="VIP">VIP 客户</option>
              </select>
              <p className="mt-1.5 text-xs text-slate-500">按销售关系和货量定，和下面的信用评级无关</p>
            </div>
          </div>
        </div>

        {/* 信用信息 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">信用与付款</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">信用额度 (EUR)</label>
              <input type="number" min="0" value={form.creditLimit || ''} onChange={(e) => updateField('creditLimit', parseFloat(e.target.value) || 0)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">信用等级</label>
              <select value={form.creditLevel} onChange={(e) => updateField('creditLevel', e.target.value)} className={inputClass}>
                <option value="">请选择</option>
                <option value="A">A - 优质</option>
                <option value="B">B - 良好</option>
                <option value="C">C - 一般</option>
                <option value="D">D - 较差</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">风险类别</label>
              {/* 风险类别决定信用敞口怎么算（core/credit-manager.js）：
                  LOW 只算未清应收；MEDIUM 加上在途订单；HIGH 再加未确认订单 */}
              <select value={form.riskCategory} onChange={(e) => updateField('riskCategory', e.target.value)} className={inputClass}>
                <option value="LOW">低风险 - 只算未清应收</option>
                <option value="MEDIUM">中风险 - 含在途订单</option>
                <option value="HIGH">高风险 - 含未确认订单</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">付款条件（账期天数）</label>
              {/* ⚠️ clients.payment_terms 是 INTEGER（天数），value 必须是数字字符串。
                  原来存的是 net_30 这种字符串，保存时 PostgreSQL 直接报类型错误 */}
              <select value={form.paymentTerms} onChange={(e) => updateField('paymentTerms', e.target.value)} className={inputClass}>
                <option value="">请选择</option>
                <option value="0">预付（0 天）</option>
                <option value="7">Net 7（7 天）</option>
                <option value="14">Net 14（14 天）</option>
                <option value="30">Net 30（30 天）</option>
                <option value="60">Net 60（60 天）</option>
                <option value="90">Net 90（90 天）</option>
              </select>
            </div>
          </div>
        </div>

        {/* 提交按钮 */}
        <div className="flex items-center gap-3 pb-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-6 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-all duration-200"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all duration-200 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存修改
          </button>
        </div>
      </form>
    </div>
  )
}
