import { useState, useEffect } from 'react'
import { Receipt, RefreshCw } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
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

const statusMap: Record<string, { label: string; className: string }> = {
  PENDING: { label: '待结算', className: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: '已审批', className: 'bg-blue-100 text-blue-700' },
  PAID: { label: '已付款', className: 'bg-green-100 text-green-700' },
  OVERDUE: { label: '逾期', className: 'bg-red-100 text-red-700' },
}

export default function Billing() {
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

  const getStatus = (status: string) => statusMap[status] || { label: status, className: 'bg-gray-100 text-gray-600' }

  const totalPending = payables.filter((p) => p.status === 'PENDING' || p.status === 'APPROVED').reduce((sum, p) => sum + p.amount, 0)
  const totalPaid = payables.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + p.amount, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">费用结算</h1>
        <button onClick={fetchPayables} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
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
              <p className="text-sm text-slate-500">待结算金额</p>
              <p className="text-xl font-bold text-slate-900">{'\u20AC'}{totalPending.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
              <Receipt className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">已结算金额</p>
              <p className="text-xl font-bold text-slate-900">{'\u20AC'}{totalPaid.toLocaleString()}</p>
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
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">订单号</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">描述</th>
              <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">金额</th>
              <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">状态</th>
              <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">到期日</th>
              <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">付款日</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-slate-400">加载中...</td></tr>
            ) : payables.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-slate-400">暂无结算数据</td></tr>
            ) : (
              payables.map((item) => {
                const s = getStatus(item.status)
                return (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="text-left text-xs text-slate-900 px-4 py-3 font-medium">{item.orderNo}</td>
                    <td className="text-left text-xs text-slate-600 px-4 py-3 truncate">{item.description || '-'}</td>
                    <td className="text-right text-xs text-slate-900 px-4 py-3 font-medium">{'\u20AC'}{item.amount.toLocaleString()}</td>
                    <td className="text-center px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-lg ${s.className}`}>{s.label}</span>
                    </td>
                    <td className="text-center text-xs text-slate-600 px-4 py-3">{item.dueDate || '-'}</td>
                    <td className="text-center text-xs text-slate-600 px-4 py-3">{item.paidDate || '-'}</td>
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
