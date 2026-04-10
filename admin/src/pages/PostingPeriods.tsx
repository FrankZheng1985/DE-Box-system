import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ArrowLeft, Lock, Unlock, CheckCircle } from 'lucide-react'

// ==================== 过账期间数据 ====================

interface PostingPeriod {
  month: number
  label: string
  isOpen: boolean
  openedBy: string | null
  openedAt: string | null
  closedBy: string | null
  closedAt: string | null
}

const INITIAL_PERIODS: PostingPeriod[] = Array.from({ length: 12 }, (_, i) => ({
  month: i + 1,
  label: `2026年${i + 1}月`,
  isOpen: i + 1 === 4, // 仅四月开放
  openedBy: i + 1 <= 3 ? '系统管理员' : i + 1 === 4 ? '系统管理员' : null,
  openedAt: i + 1 <= 3 ? '2026-01-01 00:00' : i + 1 === 4 ? '2026-04-01 00:00' : null,
  closedBy: i + 1 <= 3 ? '系统管理员' : null,
  closedAt: i + 1 === 1 ? '2026-02-01 00:00' : i + 1 === 2 ? '2026-03-01 00:00' : i + 1 === 3 ? '2026-04-01 00:00' : null,
}))

// ==================== 组件 ====================

export default function PostingPeriods() {
  const navigate = useNavigate()
  const [periods] = useState<PostingPeriod[]>(INITIAL_PERIODS)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleToggle = (_month: number) => {
    showToast('功能对接中，暂不可操作')
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
                  key={p.month}
                  className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200"
                >
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{p.label}</td>
                  <td className="px-4 py-3 text-center">
                    {p.isOpen ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                        <Unlock className="w-3 h-3" /> 开放
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                        <Lock className="w-3 h-3" /> 关闭
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{p.openedBy || '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 text-center">{p.openedAt || '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{p.closedBy || '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 text-center">{p.closedAt || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggle(p.month)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                        p.isOpen
                          ? 'text-red-700 bg-red-50 hover:bg-red-100'
                          : 'text-green-700 bg-green-50 hover:bg-green-100'
                      }`}
                    >
                      {p.isOpen ? (
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
