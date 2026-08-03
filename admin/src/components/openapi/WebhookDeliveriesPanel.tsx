/**
 * 开放 API · Webhook 投递记录面板（P8）
 *
 * 每条状态推送的结果与重试情况。投递由后端 cron 每分钟扫描入队并发送，
 * 这里只读展示（联调测试事件不写入本表，见 webhook-service.sendTestEvent）。
 */
import { useState, useEffect, useCallback } from 'react'
import { RefreshCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../../utils/api'
import {
  type WebhookDeliveryRow, DELIVERY_BADGES, EVENT_LABELS, formatTime,
} from '../../types/openApi'

export default function WebhookDeliveriesPanel() {
  const { t } = useTranslation()
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRow[]>([])
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)
  const [deliveryStatus, setDeliveryStatus] = useState('')

  const fetchDeliveries = useCallback(async () => {
    setDeliveriesLoading(true)
    try {
      const params = new URLSearchParams({ pageSize: '30' })
      if (deliveryStatus) params.set('status', deliveryStatus)
      const res = await api.get<ApiResponse<WebhookDeliveryRow[]>>(`/open-api/webhook-deliveries?${params}`)
      if (res.code === 200) setDeliveries(res.data || [])
    } catch (err) {
      console.error('[OpenApi] 获取投递记录失败:', err)
    } finally {
      setDeliveriesLoading(false)
    }
  }, [deliveryStatus])

  useEffect(() => { fetchDeliveries() }, [fetchDeliveries])

  return (
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-100">
          <select
            value={deliveryStatus}
            onChange={(e) => setDeliveryStatus(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="">{t('master.allStatus')}</option>
            {Object.entries(DELIVERY_BADGES).map(([code, { labelKey }]) => (
              <option key={code} value={code}>{t(labelKey)}</option>
            ))}
          </select>
          <button
            onClick={fetchDeliveries}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all duration-200"
          >
            <RefreshCcw className="w-4 h-4" />
            {t('common.refresh')}
          </button>
          <span className="ml-auto text-xs text-slate-400">{t('openApi.pushScanHint')}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[960px]">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[15%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[27%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">{t('openApi.colTime')}</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">{t('openApi.colPartner')}</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">{t('openApi.colEvent')}</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">{t('openApi.colExternalNo')}</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">{t('common.status')}</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-right">{t('openApi.colAttempts')}</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">{t('openApi.colResultOrError')}</th>
              </tr>
            </thead>
            <tbody>
              {deliveriesLoading && (
                <tr><td colSpan={7} className="px-4 py-8"><div className="h-24 bg-slate-100 rounded-xl animate-pulse" /></td></tr>
              )}
              {!deliveriesLoading && deliveries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                    {t('openApi.noDeliveries')}
                  </td>
                </tr>
              )}
              {!deliveriesLoading && deliveries.map((d) => {
                const badge = DELIVERY_BADGES[d.status] || { labelKey: '', cls: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                    <td className="px-4 py-3 text-xs text-slate-500 text-center">{formatTime(d.created_at)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600">{d.partner_code}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{t(EVENT_LABELS[d.event_type] || '', { defaultValue: d.event_type })}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600 truncate" title={d.external_ref || ''}>
                      {d.external_ref || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${badge.cls}`}>{t(badge.labelKey, { defaultValue: d.status })}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 text-right">{d.attempts}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 truncate" title={d.last_error || ''}>
                      {d.status === 'SENT'
                        ? `HTTP ${d.last_status_code} · ${formatTime(d.sent_at)}`
                        : d.status === 'PENDING' && d.attempts > 0
                          ? t('openApi.willRetryAt', {
                              error: d.last_error || t('openApi.failed'),
                              time: formatTime(d.next_attempt_at),
                            })
                          : d.last_error || '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <span className="text-xs text-slate-500">{t('openApi.showingRecent', { count: deliveries.length })}</span>
        </div>
      </div>
  )
}
