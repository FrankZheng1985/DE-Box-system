import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Receipt, RefreshCw } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { formatMoney, formatDate } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'

interface Payable {
  id: string
  orderNo: string
  description: string
  amount: number
  currency: string
  status: string
  dueDate: string
  paidDate: string | null
}

// 只留样式，文案走 payableStatus.* 语言包
const statusClassMap: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
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
  const totalPending = sumAmount(payables.filter((p) => p.status === 'PENDING' || p.status === 'APPROVED'))
  const totalPaid = sumAmount(payables.filter((p) => p.status === 'PAID'))

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
          <colgroup>
            <col className="w-[15%]" />
            <col className="w-[25%]" />
            <col className="w-[15%]" />
            <col className="w-[12%]" />
            <col className="w-[15%]" />
            <col className="w-[18%]" />
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
                const s = getStatus(item.status)
                return (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="text-left text-xs text-slate-900 px-4 py-3 font-medium">{item.orderNo}</td>
                    <td className="text-left text-xs text-slate-600 px-4 py-3 truncate">{item.description || t('common.empty')}</td>
                    <td className="text-right text-xs text-slate-900 px-4 py-3 font-medium">{formatMoney(item.amount)}</td>
                    <td className="text-center px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-lg ${s.className}`}>{s.label}</span>
                    </td>
                    <td className="text-center text-xs text-slate-600 px-4 py-3">{formatDate(item.dueDate)}</td>
                    <td className="text-center text-xs text-slate-600 px-4 py-3">{formatDate(item.paidDate)}</td>
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
