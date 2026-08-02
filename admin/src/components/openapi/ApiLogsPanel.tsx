/**
 * 开放 API · 请求日志面板（P8）
 *
 * 合作方每次推送/回查（含被拒绝的）都留痕，按合作方、结果、对方单号筛选。
 */
import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import api, { type ApiResponse } from '../../utils/api'
import { type ApiKeyRow, type ApiLogRow, RESULT_BADGES, formatTime } from '../../types/openApi'

const LOG_PAGE_SIZE = 20

interface ApiLogsPanelProps {
  /** 用于渲染合作方下拉，由壳统一持有避免重复请求 */
  keys: ApiKeyRow[]
}

export default function ApiLogsPanel({ keys }: ApiLogsPanelProps) {
  const [logs, setLogs] = useState<ApiLogRow[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logTotal, setLogTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [logFilter, setLogFilter] = useState({ partnerCode: '', result: '', externalRef: '' })

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(logPage))
      params.set('pageSize', String(LOG_PAGE_SIZE))
      if (logFilter.partnerCode) params.set('partnerCode', logFilter.partnerCode)
      if (logFilter.result) params.set('result', logFilter.result)
      if (logFilter.externalRef) params.set('externalRef', logFilter.externalRef)
      const res = await api.get<ApiResponse<ApiLogRow[]>>(`/open-api/logs?${params.toString()}`)
      if (res.code === 200) {
        setLogs(res.data || [])
        setLogTotal(res.pagination?.total ?? 0)
      }
    } catch (err) {
      console.error('[OpenApi] 获取日志失败:', err)
    } finally {
      setLogsLoading(false)
    }
  }, [logPage, logFilter])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const totalPages = Math.max(1, Math.ceil(logTotal / LOG_PAGE_SIZE))

  return (
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        {/* 筛选行 */}
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-100">
          <select
            value={logFilter.partnerCode}
            onChange={(e) => { setLogFilter((f) => ({ ...f, partnerCode: e.target.value })); setLogPage(1) }}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="">全部合作方</option>
            {keys.map((k) => (
              <option key={k.id} value={k.partner_code}>{k.partner_name}（{k.partner_code}）</option>
            ))}
          </select>
          <select
            value={logFilter.result}
            onChange={(e) => { setLogFilter((f) => ({ ...f, result: e.target.value })); setLogPage(1) }}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="">全部结果</option>
            {Object.entries(RESULT_BADGES).map(([code, { label }]) => (
              <option key={code} value={code}>{label}（{code}）</option>
            ))}
          </select>
          <input
            value={logFilter.externalRef}
            onChange={(e) => { setLogFilter((f) => ({ ...f, externalRef: e.target.value })); setLogPage(1) }}
            placeholder="按对方单号搜索"
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white min-w-[180px] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[1000px]">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[10%]" />
              <col className="w-[20%]" />
              <col className="w-[13%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
              <col className="w-[10%]" />
              <col className="w-[17%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">时间</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">合作方</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">请求</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">对方单号</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">结果</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-right">耗时</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">来源 IP</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">错误信息</th>
              </tr>
            </thead>
            <tbody>
              {logsLoading && (
                <tr><td colSpan={8} className="px-4 py-8"><div className="h-24 bg-slate-100 rounded-xl animate-pulse" /></td></tr>
              )}
              {!logsLoading && logs.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">没有符合条件的请求记录</td></tr>
              )}
              {!logsLoading && logs.map((l) => {
                const badge = RESULT_BADGES[l.result] || { label: l.result, cls: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                    <td className="px-4 py-3 text-xs text-slate-500 text-center">{formatTime(l.created_at)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600">{l.partner_code || '-'}</td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-700 font-mono truncate" title={`${l.method} ${l.path}`}>
                        <span className="font-semibold">{l.method}</span> {l.path}
                      </p>
                      <p className="text-xs text-slate-400">HTTP {l.status_code}</p>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600 truncate" title={l.external_ref || ''}>
                      {l.external_ref || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 text-right">{l.duration_ms} ms</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500 truncate" title={l.ip}>{l.ip}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 truncate" title={l.error_message || ''}>
                      {l.error_message || '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          <span className="text-xs text-slate-500">共 {logTotal} 条 · 第 {logPage}/{totalPages} 页</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setLogPage((p) => Math.max(1, p - 1))}
              disabled={logPage <= 1}
              className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLogPage((p) => Math.min(totalPages, p + 1))}
              disabled={logPage >= totalPages}
              className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
  )
}
