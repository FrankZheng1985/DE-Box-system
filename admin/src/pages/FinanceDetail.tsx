import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, DollarSign, Calendar, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api from '../utils/api'
import StatusBadge from '../components/StatusBadge'

function fmt(v: any) {
  const n = parseFloat(v) || 0
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function fmtDate(d: string) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('zh-CN')
}

export default function FinanceDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [record, setRecord] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        // 没有单独的详情 API，从列表里查
        const arRes = await api.get<any>('/finance/receivables?pageSize=100')
        const apRes = await api.get<any>('/finance/payables?pageSize=100')
        const allRecords = [...(Array.isArray(arRes.data) ? arRes.data : []), ...(Array.isArray(apRes.data) ? apRes.data : [])]
        const found = allRecords.find((r: any) => r.id === id)
        if (found) setRecord(found)
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    })()
  }, [id])

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <div className="h-8 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (!record) {
    return (
      <div className="p-4 lg:p-6">
        <button onClick={() => navigate('/finance')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> {t('financeDetail.backToList')}
        </button>
        <div className="text-center py-16 text-slate-400">{t('financeDetail.notFound')}</div>
      </div>
    )
  }

  const isAR = record.type === 'RECEIVABLE'
  const outstanding = (parseFloat(record.amount) || 0) - (parseFloat(record.paid_amount) || 0)

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* 头部 */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/finance')} className="p-2 rounded-xl hover:bg-slate-100 transition-all duration-200">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">{record.record_number}</h1>
            <StatusBadge status={record.payment_status} type="payment" />
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isAR ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
              {isAR ? t('finance.arShort') : t('finance.apShort')}
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">{t('orderDetail.createdAt', { time: fmtDate(record.created_at) })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：详细信息 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 基本信息 */}
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" /> {t('financeDetail.billInfo')}
            </h2>
            <div className="grid grid-cols-2 gap-y-4 gap-x-8">
              <div>
                <p className="text-xs text-slate-400 mb-1">{t('finance.colBillNo')}</p>
                <p className="text-sm font-medium text-slate-900">{record.record_number}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">{t('common.type')}</p>
                <p className="text-sm font-medium text-slate-900">{isAR ? t('finance.receivable') : t('finance.payable')}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">{isAR ? t('common.client') : t('common.carrier')}</p>
                <p className="text-sm font-medium text-slate-900">{record.counterparty_name || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">{t('common.relatedOrder')}</p>
                <p className="text-sm font-medium text-blue-600 cursor-pointer hover:underline"
                   onClick={() => record.order_id && navigate(`/orders/${record.order_id}`)}>
                  {record.order_number || '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">{t('common.currency')}</p>
                <p className="text-sm font-medium text-slate-900">{record.currency || 'EUR'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">{t('finance.colDueDate')}</p>
                <p className="text-sm font-medium text-slate-900">{fmtDate(record.due_date)}</p>
              </div>
              {record.auto_generated && (
                <div className="col-span-2">
                  <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                    <CheckCircle className="w-3 h-3" /> {t('financeDetail.autoGenerated')}
                  </span>
                </div>
              )}
              {record.remarks && (
                <div className="col-span-2">
                  <p className="text-xs text-slate-400 mb-1">{t('common.remark')}</p>
                  <p className="text-sm text-slate-600">{record.remarks}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：金额卡片 */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-500" /> {t('financeDetail.amountBreakdown')}
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">{t('financeDetail.billAmount')}</span>
                <span className="text-lg font-bold text-slate-900">{fmt(record.amount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">{t('financeDetail.paidAmount')}</span>
                <span className="text-sm font-medium text-green-600">{fmt(record.paid_amount)}</span>
              </div>
              <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700">{t('financeDetail.outstanding')}</span>
                <span className={`text-lg font-bold ${outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {fmt(outstanding)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-500" /> {t('financeDetail.timeInfo')}
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('common.createdAt')}</span>
                <span className="text-slate-700">{fmtDate(record.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('finance.colDueDate')}</span>
                <span className="text-slate-700">{fmtDate(record.due_date)}</span>
              </div>
              {record.paid_date && (
                <div className="flex justify-between">
                  <span className="text-slate-500">{t('financeDetail.paidDate')}</span>
                  <span className="text-green-600">{fmtDate(record.paid_date)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
