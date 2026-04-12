/**
 * 报价详情页面
 * 左右布局：左侧报价信息 + 右侧状态/版本
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  FileText,
  MapPin,
  User,
  Calendar,
  Banknote,
  Clock,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import StatusBadge from '../components/StatusBadge'

// ==================== 类型定义 ====================

interface PricingItem {
  name: string
  amount: number
  currency: string
}

interface Quotation {
  id: string
  quotation_number: string
  client_name: string
  status: string
  business_type: string
  transport_type: string
  route_from: string
  route_to: string
  base_freight: number
  surcharge: number
  insurance_fee: number
  total_price: number
  currency: string
  valid_until: string
  version: number
  remarks: string
  pricingItems?: PricingItem[]
  created_at?: string
  updated_at?: string
}

// ==================== 骨架屏 ====================

function DetailSkeleton() {
  return (
    <div className="p-4 lg:p-6 animate-pulse">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-10 h-10 bg-slate-200 rounded-xl" />
        <div className="h-7 w-48 bg-slate-200 rounded-lg" />
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 lg:w-[70%] space-y-6">
          <div className="bg-white/80 rounded-2xl p-6 h-48" />
          <div className="bg-white/80 rounded-2xl p-6 h-32" />
          <div className="bg-white/80 rounded-2xl p-6 h-40" />
        </div>
        <div className="lg:w-[30%]">
          <div className="bg-white/80 rounded-2xl p-6 h-48" />
        </div>
      </div>
    </div>
  )
}

// ==================== 信息行组件 ====================

function InfoRow({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-right max-w-[60%]">
        {value || '-'}
      </span>
    </div>
  )
}

// ==================== 主组件 ====================

export default function QuotationDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function fetchDetail() {
      setLoading(true)
      try {
        const res = await api.get<ApiResponse<Quotation>>(`/quotations/${id}`)
        if (cancelled) return
        if (res.code === 200 && res.data) {
          setQuotation(res.data)
        } else {
          setError(res.message || '获取报价详情失败')
        }
      } catch (err: any) {
        if (cancelled) return
        console.error('[QuotationDetail] 获取详情失败:', err)
        setError(err.message || '请求失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchDetail()
    return () => { cancelled = true }
  }, [id])

  if (loading) return <DetailSkeleton />

  if (error || !quotation) {
    return (
      <div className="p-4 lg:p-6">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100 transition-all duration-200">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-xl font-semibold text-slate-900">报价详情</h1>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl text-sm">
          {error || '报价不存在'}
        </div>
      </div>
    )
  }

  const currencySymbol = quotation.currency === 'GBP' ? '£' : quotation.currency === 'PLN' ? 'zł' : '€'

  return (
    <div className="p-4 lg:p-6">
      {/* 头部 */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100 transition-all duration-200">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-blue-600" />
          <h1 className="text-xl font-semibold text-slate-900">{quotation.quotation_number}</h1>
          <StatusBadge status={quotation.status} type="quotation" />
        </div>
      </div>

      {/* 主体：左侧信息 + 右侧状态 */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* 左侧 70% */}
        <div className="flex-1 lg:w-[70%] space-y-6">
          {/* 基本信息 */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              基本信息
            </h2>
            <div className="space-y-0">
              <InfoRow label="客户" value={quotation.client_name} />
              <InfoRow label="业务类型" value={quotation.business_type} />
              <InfoRow label="运输类型" value={quotation.transport_type} />
              <InfoRow label="有效期至" value={quotation.valid_until} />
              <InfoRow label="版本" value={`V${quotation.version || 1}`} />
            </div>
          </div>

          {/* 路线信息 */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              路线信息
            </h2>
            <div className="flex items-center gap-4">
              <div className="flex-1 bg-green-50 rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-green-600 mb-1">起点</p>
                <p className="text-sm font-medium text-slate-800">{quotation.route_from || '-'}</p>
              </div>
              <span className="text-slate-300 text-lg">&rarr;</span>
              <div className="flex-1 bg-red-50 rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-red-500 mb-1">终点</p>
                <p className="text-sm font-medium text-slate-800">{quotation.route_to || '-'}</p>
              </div>
            </div>
          </div>

          {/* 价格明细 */}
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Banknote className="w-5 h-5 text-blue-600" />
              价格明细
            </h2>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-500">基础运费</span>
                <span className="text-sm text-slate-700">{currencySymbol} {(quotation.base_freight || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-500">附加费</span>
                <span className="text-sm text-slate-700">{currencySymbol} {(quotation.surcharge || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-500">保险费</span>
                <span className="text-sm text-slate-700">{currencySymbol} {(quotation.insurance_fee || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
              </div>
              {/* 自定义定价项 */}
              {quotation.pricingItems?.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-2">
                  <span className="text-sm text-slate-500">{item.name}</span>
                  <span className="text-sm text-slate-700">{currencySymbol} {(item.amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">合计</span>
                <span className="text-lg font-bold text-blue-600">{currencySymbol} {(quotation.total_price || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* 备注 */}
          {quotation.remarks && (
            <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                备注
              </h2>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{quotation.remarks}</p>
            </div>
          )}
        </div>

        {/* 右侧 30% */}
        <div className="lg:w-[30%]">
          <div className="lg:sticky lg:top-6 space-y-6">
            {/* 状态卡片 */}
            <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
              <h2 className="text-sm font-semibold text-slate-900 mb-4">状态信息</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-400">当前状态</p>
                  <div className="mt-1">
                    <StatusBadge status={quotation.status} type="quotation" />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-400">币种</p>
                  <p className="text-sm text-slate-800 mt-1">{quotation.currency}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">有效期</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-sm text-slate-700">{quotation.valid_until || '-'}</span>
                  </div>
                </div>
                {quotation.created_at && (
                  <div>
                    <p className="text-xs text-slate-400">创建时间</p>
                    <p className="text-sm text-slate-700 mt-1">{quotation.created_at}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 版本历史（占位） */}
            <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
              <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                版本历史
              </h2>
              <div className="text-sm text-slate-400 text-center py-4">
                当前版本: V{quotation.version || 1}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
