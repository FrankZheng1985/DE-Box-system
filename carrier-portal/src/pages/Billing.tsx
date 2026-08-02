import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Receipt, RefreshCw } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { formatMoney, formatDate } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'

// 字段名对齐后端 /finance/payables 返回的 financial_records 列（snake_case）。
// 原来写的 orderNo / status / dueDate / description 后端都不叫这名，
// 除金额外整张表都是空的（踩坑 003、033）
interface Payable {
  id: string
  order_number: string | null
  remarks: string | null
  amount: number | string
  currency: string
  payment_status: string
  due_date: string | null
  paid_date: string | null
}

// 只留样式，文案走 payableStatus.* 语言包。
// ⚠️ 取值必须是 financial_records.payment_status 的真实枚举：
//    UNPAID / PARTIAL / PAID / OVERDUE / VOID
//    原来写的 PENDING / APPROVED 数据库里根本不存在，导致汇总永远筛不到东西
const statusClassMap: Record<string, string> = {
  UNPAID: 'bg-amber-100 text-amber-700',
  PARTIAL: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
  VOID: 'bg-gray-100 text-gray-600',
}

export default function Billing() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [payables, setPayables] = useState<Payable[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPayables()
  }, [])

  const fetchPayables = async () => {
    setLoading(true)
    try {
      const params = user?.linkedEntityId ? `?carrierId=${user.linkedEntityId}` : ''
      const res = await api.get<ApiResponse<Payable[]>>(`/finance/payables${params}`)
      if (res.code === 200) {
        setPayables(Array.isArray(res.data) ? res.data : [])
      }
    } catch (error) {
      console.error('获取结算数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatus = (status: string) => ({
    label: t(`payableStatus.${status}`, { defaultValue: status }),
    className: statusClassMap[status] || 'bg-gray-100 text-gray-600',
  })

  // 后端 NUMERIC 返回的是字符串（踩坑 002），直接 sum + p.amount 会变成字符串拼接
  const sumAmount = (list: Payable[]) => list.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  // 待结算 = 未付 + 部分付 + 逾期（已作废的不算）
  const PENDING_STATUSES = ['UNPAID', 'PARTIAL', 'OVERDUE']
  const totalPending = sumAmount(payables.filter((p) => PENDING_STATUSES.includes(p.payment_status)))
  const totalPaid = sumAmount(payables.filter((p) => p.payment_status === 'PAID'))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{t('billing.title')}</h1>
        <button onClick={fetchPayables} aria-label={t('common.refresh')} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <Receipt className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">{t('billing.totalPending')}</p>
              <p className="text-xl font-bold text-slate-900">{formatMoney(totalPending)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
              <Receipt className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">{t('billing.totalPaid')}</p>
              <p className="text-xl font-bold text-slate-900">{formatMoney(totalPaid)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 结算明细表 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-x-auto">
        <table className="w-full table-fixed">
          {/* 列宽按最长的德语文案分配（如 "Teilweise bezahlt"、"Fälligkeitsdatum"） */}
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[22%]" />
            <col className="w-[14%]" />
            <col className="w-[16%]" />
            <col className="w-[17%]" />
            <col className="w-[17%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('common.orderNo')}</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('common.description')}</th>
              <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">{t('common.amount')}</th>
              <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.status')}</th>
              <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('billing.dueDate')}</th>
              <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('billing.paidDate')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-slate-400">{t('common.loading')}</td></tr>
            ) : payables.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-slate-400">{t('billing.empty')}</td></tr>
            ) : (
              payables.map((item) => {
                const s = getStatus(item.payment_status)
                return (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="text-left text-xs text-slate-900 px-4 py-3 font-medium truncate">{item.order_number || t('common.empty')}</td>
                    <td className="text-left text-xs text-slate-600 px-4 py-3 truncate">{item.remarks || t('common.empty')}</td>
                    <td className="text-right text-xs text-slate-900 px-4 py-3 font-medium">{formatMoney(item.amount, item.currency || 'EUR')}</td>
                    <td className="text-center px-4 py-3">
                      <span className={`inline-block text-xs px-2 py-1 rounded-lg whitespace-nowrap ${s.className}`}>{s.label}</span>
                    </td>
                    <td className="text-center text-xs text-slate-600 px-4 py-3">{formatDate(item.due_date)}</td>
                    <td className="text-center text-xs text-slate-600 px-4 py-3">{formatDate(item.paid_date)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
