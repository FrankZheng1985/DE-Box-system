import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Receipt, RefreshCw } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { formatMoney, formatDate } from '../utils/format'

interface BillingItem {
  id: string
  record_number: string
  order_number: string
  amount: number
  currency: string
  payment_status: string
  due_date: string
  paid_date: string
  counterparty_name: string
  remarks: string | null
  created_at: string
}

// 只留样式，文案走 receivableStatus.* 语言包。
// ⚠️ key 必须是 financial_records.payment_status 的真实取值（大写）：
//    UNPAID / PARTIAL / PAID / OVERDUE / VOID
//    原来这里混了 draft / pending / voided / cancelled 四个库里没有的值，
//    其中 VOID 被写成 voided，作废的账单会露出原始英文（踩坑 004 + 033）
const STATUS_STYLES: Record<string, string> = {
  UNPAID: 'bg-amber-100 text-amber-700',
  PARTIAL: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
  VOID: 'bg-gray-100 text-gray-500',
}

export default function Billing() {
  const { t } = useTranslation()
  const [items, setItems] = useState<BillingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [totalOwed, setTotalOwed] = useState(0)

  useEffect(() => {
    loadBilling()
  }, [])

  const loadBilling = async () => {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<any>>('/finance/receivables')
      if (res.code === 200) {
        const data = res.data || []
        // 如果返回的是数组直接用，如果是对象取 items
        const list = Array.isArray(data) ? data : (data.items || [])
        setItems(list)
        // 计算待付总额
        const owed = list
          // 待付 = 未付 + 部分付 + 逾期（已作废的不算）
          .filter((item: BillingItem) =>
            ['UNPAID', 'PARTIAL', 'OVERDUE'].includes((item.payment_status || '').toUpperCase())
          )
          .reduce((sum: number, item: BillingItem) => sum + (Number(item.amount) || 0), 0)
        setTotalOwed(owed)
      }
    } catch (err) {
      console.error('加载账单失败:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 待付总额 */}
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500">{t('billing.totalOwed')}</span>
            <div className="text-xl font-bold text-slate-900 mt-1">
              {formatMoney(totalOwed)}
            </div>
          </div>
          <button onClick={loadBilling} aria-label={t('common.refresh')} className="h-8 px-2 text-slate-500 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 账单列表 */}
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[700px]">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[20%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-slate-500 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 font-medium">{t('billing.recordNo')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('common.orderNo')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('common.description')}</th>
                <th className="text-right px-3 py-2.5 font-medium">{t('common.amount')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.status')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('billing.dueDate')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('billing.paidDate')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <Receipt className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">{t('billing.empty')}</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const statusKey = (item.payment_status || '').toUpperCase()
                  return (
                    <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="text-left px-3 py-2.5 text-xs font-medium text-slate-900">
                        {item.record_number || t('common.empty')}
                      </td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">{item.order_number || t('common.empty')}</td>
                      {/* 表头写的是「描述」，原来却显示 counterparty_name（对方公司名，
                          在客户门户里就是客户自己），改为真正的描述字段 remarks */}
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">
                        {item.remarks || t('common.empty')}
                      </td>
                      <td className="text-right px-3 py-2.5 text-xs font-medium text-slate-900">
                        {formatMoney(item.amount, item.currency || 'EUR')}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full whitespace-nowrap ${
                          STATUS_STYLES[statusKey] || 'bg-gray-100 text-gray-600'
                        }`}>
                          {t(`receivableStatus.${statusKey}`, { defaultValue: item.payment_status || t('common.empty') })}
                        </span>
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                        {formatDate(item.due_date)}
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                        {formatDate(item.paid_date)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
