import { useState, useEffect } from 'react'
import { Receipt, RefreshCw } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'

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
  created_at: string
}

const statusMap: Record<string, { label: string; style: string }> = {
  draft: { label: '草稿', style: 'bg-gray-100 text-gray-600' },
  unpaid: { label: '待付款', style: 'bg-amber-100 text-amber-700' },
  pending: { label: '待付款', style: 'bg-amber-100 text-amber-700' },
  partial: { label: '部分付款', style: 'bg-blue-100 text-blue-700' },
  paid: { label: '已付款', style: 'bg-green-100 text-green-700' },
  overdue: { label: '已逾期', style: 'bg-red-100 text-red-700' },
  voided: { label: '已作废', style: 'bg-gray-100 text-gray-500' },
  cancelled: { label: '已取消', style: 'bg-gray-100 text-gray-500' },
}

export default function Billing() {
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
          .filter((item: BillingItem) => {
            const s = (item.payment_status || '').toLowerCase()
            return s === 'unpaid' || s === 'overdue' || s === 'partial'
          })
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
            <span className="text-xs text-slate-500">待付总额</span>
            <div className="text-xl font-bold text-slate-900 mt-1">
              EUR {totalOwed.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <button onClick={loadBilling} className="h-8 px-2 text-slate-500 hover:bg-gray-100 rounded-lg transition-colors">
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
                <th className="text-left px-3 py-2.5 font-medium">发票号</th>
                <th className="text-left px-3 py-2.5 font-medium">订单号</th>
                <th className="text-left px-3 py-2.5 font-medium">描述</th>
                <th className="text-right px-3 py-2.5 font-medium">金额</th>
                <th className="text-center px-3 py-2.5 font-medium">状态</th>
                <th className="text-center px-3 py-2.5 font-medium">到期日</th>
                <th className="text-center px-3 py-2.5 font-medium">付款日</th>
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
                    <p className="text-sm text-slate-400">暂无账单记录</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const statusKey = (item.payment_status || '').toLowerCase()
                  const st = statusMap[statusKey] || { label: item.payment_status || '-', style: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="text-left px-3 py-2.5 text-xs font-medium text-slate-900">
                        {item.record_number || '-'}
                      </td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600">{item.order_number || '-'}</td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">
                        {item.counterparty_name || '-'}
                      </td>
                      <td className="text-right px-3 py-2.5 text-xs font-medium text-slate-900">
                        {item.currency || 'EUR'} {Number(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ${st.style}`}>{st.label}</span>
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                        {item.due_date ? new Date(item.due_date).toLocaleDateString('zh-CN') : '-'}
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                        {item.paid_date ? new Date(item.paid_date).toLocaleDateString('zh-CN') : '-'}
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
