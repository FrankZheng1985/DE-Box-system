import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Hash, ArrowLeft, RotateCcw, CheckCircle } from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'

// ==================== 类型定义 ====================

interface NumberRange {
  id: string
  object_type: string
  object_label: string
  prefix: string
  current_number: number
  range_start: number
  range_end: number
  format_pattern: string
}

// ==================== 组件 ====================

export default function NumberRanges() {
  const navigate = useNavigate()
  const [ranges, setRanges] = useState<NumberRange[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // 获取编号范围数据
  useEffect(() => {
    let cancelled = false

    async function fetchRanges() {
      try {
        const res = await api.get<ApiResponse<NumberRange[]>>('/system/number-ranges?companyCode=DE01')
        if (cancelled) return
        if (res.code === 200 && res.data) {
          setRanges(res.data)
        }
      } catch (err: any) {
        if (cancelled) return
        console.error('[NumberRanges] 获取编号范围失败:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchRanges()
    return () => { cancelled = true }
  }, [])

  const handleReset = (label: string) => {
    showToast(`${label} 编号重置功能对接中`)
  }

  // 骨架屏
  if (loading) {
    return (
      <div className="p-4 lg:p-6 animate-pulse">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-10 h-10 bg-slate-200 rounded-xl" />
          <div className="h-7 w-36 bg-slate-200 rounded-lg" />
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
        <div className="p-2 bg-purple-50 rounded-xl">
          <Hash className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">编号范围管理</h1>
          <p className="text-xs text-slate-500 mt-0.5">管理各业务对象的自动编号规则（公司代码 DE01 / 财年 2026）</p>
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[28%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">对象类型</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">前缀</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-right">当前编号</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-right">起始</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-right">结束</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">编号格式</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {ranges.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{r.object_label}</p>
                      <p className="text-xs text-slate-400 font-mono">{r.object_type}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 text-xs font-mono font-medium bg-slate-100 text-slate-700 rounded">
                      {r.prefix}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900 text-right">
                    {Number(r.current_number).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 text-right">
                    {Number(r.range_start).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 text-right">
                    {Number(r.range_end).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded font-mono">
                      {r.format_pattern}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleReset(r.object_label)}
                      disabled
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-50 rounded-lg cursor-not-allowed"
                      title="重置功能暂未开放"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      重置
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 底部统计 */}
        <div className="px-4 py-3 border-t border-slate-100">
          <span className="text-xs text-slate-500">共 {ranges.length} 个编号范围</span>
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
