import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ArrowLeft, Lock, Unlock, CheckCircle, Loader2 } from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'

// ==================== 类型定义 ====================

interface PostingPeriod {
  id: string
  period_month: number
  is_open: boolean
  opened_by: string | null
  opened_at: string | null
  closed_by: string | null
  closed_at: string | null
}

// ==================== 组件 ====================

export default function PostingPeriods() {
  const navigate = useNavigate()
  const [periods, setPeriods] = useState<PostingPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // 获取过账期间数据
  async function fetchPeriods() {
    try {
      const res = await api.get<ApiResponse<PostingPeriod[]>>('/system/posting-periods?companyCode=DE01&fiscalYear=2026')
      if (res.code === 200 && res.data) {
        setPeriods(res.data)
      }
    } catch (err: any) {
      console.error('[PostingPeriods] 获取数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPeriods()
  }, [])

  const handleToggle = async (period: PostingPeriod) => {
    setToggling(period.id)
    try {
      const res = await api.put<ApiResponse<null>>(`/system/posting-periods/${period.id}/toggle`)
      if (res.code === 200) {
        showToast(res.message || '操作成功')
        // 刷新数据
        await fetchPeriods()
      } else {
        showToast(res.message || '操作失败')
      }
    } catch (err: any) {
      console.error('[PostingPeriods] 切换失败:', err)
      showToast('操作失败，请稍后重试')
    } finally {
      setToggling(null)
    }
  }

  // 骨架屏
  if (loading) {
    return (
      <div className="p-4 lg:p-6 animate-pulse">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-10 h-10 bg-slate-200 rounded-xl" />
          <div className="h-7 w-40 bg-slate-200 rounded-lg" />
        </div>
        <div className="bg-white/80 rounded-2xl p-6 h-96" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6">
      {/* 页面标题 */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="p-2 hover:bg-slate-100 rounded-xl transition-all duration-200"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="p-2 bg-blue-50 rounded-xl">
          <CalendarDays className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">过账期间管理</h1>
          <p className="text-xs text-slate-500 mt-0.5">管理 2026 财年各月过账期间的开放与关闭</p>
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">月份</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">状态</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">开放人</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">开放时间</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">关闭人</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">关闭时间</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200"
                >
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    2026年{Number(p.period_month)}月
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.is_open ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                        <Unlock className="w-3 h-3" /> 开放
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                        <Lock className="w-3 h-3" /> 关闭
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{p.opened_by || '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 text-center">
                    {p.opened_at ? new Date(p.opened_at).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{p.closed_by || '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 text-center">
                    {p.closed_at ? new Date(p.closed_at).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggle(p)}
                      disabled={toggling === p.id}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 disabled:opacity-50 ${
                        p.is_open
                          ? 'text-red-700 bg-red-50 hover:bg-red-100'
                          : 'text-green-700 bg-green-50 hover:bg-green-100'
                      }`}
                    >
                      {toggling === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : p.is_open ? (
                        <><Lock className="w-3.5 h-3.5" /> 关闭期间</>
                      ) : (
                        <><Unlock className="w-3.5 h-3.5" /> 开放期间</>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 z-50 animate-slide-in">
          <CheckCircle className="w-5 h-5 text-amber-400" />
          {toast}
        </div>
      )}
    </div>
  )
}
