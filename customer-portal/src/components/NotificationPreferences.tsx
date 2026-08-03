/**
 * 通知偏好设置（需求 8）
 *
 * 两个维度：
 *   我的通知   —— 只影响当前账号
 *   公司默认   —— 影响本公司所有没单独设过的账号，仅 client_admin 可见可改
 *
 * ⚠️ 事件清单从后端 GET /notifications/event-types 拉，不在前端硬编码。
 *    历史上前端自造了 5 个小写 key，和后端 11 个大写常量一个都对不上，
 *    存进去的偏好永远匹配不到实际通知（踩坑 011 形态二）。
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, Loader2, Bell, Building2, User as UserIcon } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'

type Scope = 'USER' | 'CLIENT'

interface EventType {
  event_type: string
  label: string
}

/** 后端返回的偏好行（snake_case，与 API 一致 —— 踩坑 003） */
interface PreferenceRow {
  event_type: string
  channel_email: boolean
  channel_system: boolean
}

interface PrefState {
  [eventType: string]: { email: boolean; system: boolean }
}

/** 没设过时的默认：只发站内信，和后端 _resolveChannel 的兜底一致 */
const DEFAULT_ROW = { email: false, system: true }

export default function NotificationPreferences() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isClientAdmin = user?.roleCode === 'client_admin'

  const [scope, setScope] = useState<Scope>('USER')
  const [events, setEvents] = useState<EventType[]>([])
  const [prefs, setPrefs] = useState<PrefState>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  // 事件清单只用拉一次
  useEffect(() => {
    ;(async () => {
      try {
        const res = await api.get<ApiResponse<EventType[]>>('/notifications/event-types')
        if (res.code === 200) setEvents(res.data || [])
      } catch (err) {
        console.error('获取通知事件清单失败:', err)
      }
    })()
  }, [])

  const loadPrefs = useCallback(async () => {
    setLoading(true)
    setMessage({ type: '', text: '' })
    try {
      const res = await api.get<ApiResponse<PreferenceRow[]>>(`/notifications/preferences?scope=${scope}`)
      if (res.code === 200) {
        const map: PrefState = {}
        for (const row of res.data || []) {
          map[row.event_type] = { email: row.channel_email, system: row.channel_system }
        }
        setPrefs(map)
      } else {
        setMessage({ type: 'error', text: res.message || t('notification.loadFailed') })
      }
    } catch (err) {
      console.error('获取通知设置失败:', err)
      setMessage({ type: 'error', text: t('notification.loadFailed') })
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => { loadPrefs() }, [loadPrefs])

  const rowOf = (eventType: string) => prefs[eventType] || DEFAULT_ROW

  const toggle = (eventType: string, channel: 'email' | 'system') => {
    setPrefs((prev) => {
      const cur = prev[eventType] || DEFAULT_ROW
      return { ...prev, [eventType]: { ...cur, [channel]: !cur[channel] } }
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage({ type: '', text: '' })
    try {
      const preferences = events.map((e) => ({
        eventType: e.event_type,
        channelEmail: rowOf(e.event_type).email,
        channelSystem: rowOf(e.event_type).system,
      }))
      const res = await api.put<ApiResponse<null>>('/notifications/preferences', { scope, preferences })
      if (res.code === 200) {
        setMessage({ type: 'success', text: scope === 'CLIENT' ? t('notification.savedCompany') : t('notification.savedUser') })
      } else {
        // else 分支必须显示后端 message，否则失败会被伪装成成功（踩坑 011）
        setMessage({ type: 'error', text: res.message || t('notification.saveFailed') })
      }
    } catch (err) {
      console.error('保存通知设置失败:', err)
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('notification.saveFailed') })
    } finally {
      setSaving(false)
    }
  }

  const Toggle = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`relative rounded-full flex-shrink-0 transition-all duration-200 ease-in-out ${on ? 'bg-primary-600' : 'bg-gray-300'}`}
      style={{ width: 38, height: 21 }}
    >
      <span
        className={`absolute top-0.5 w-[17px] h-[17px] bg-white rounded-full shadow-sm transition-all duration-200 ease-in-out ${on ? 'left-[19px]' : 'left-0.5'}`}
      />
    </button>
  )

  return (
    <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
      <div className="flex items-center gap-2 mb-1">
        <Bell className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-900">{t('notification.title')}</h2>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        {t('notification.subtitle')}
      </p>

      {/* 维度切换：只有客户管理员才有「公司默认」 */}
      {isClientAdmin && (
        <div className="inline-flex items-center gap-1 p-1 bg-gray-100 rounded-lg mb-4">
          {([
            { key: 'USER' as Scope, label: t('notification.scopeUser'), icon: UserIcon },
            { key: 'CLIENT' as Scope, label: t('notification.scopeCompany'), icon: Building2 },
          ]).map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setScope(t.key)}
                className={`flex items-center gap-1.5 px-3 h-7 rounded-md text-xs font-medium transition-all duration-200 ease-in-out ${
                  scope === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      {scope === 'CLIENT' && (
        <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-slate-600 mb-4">
          {t('notification.companyHint')}
        </div>
      )}

      {message.text && (
        <div className={`px-4 py-2 rounded-lg text-xs mb-4 ${
          message.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-600'
            : 'bg-red-50 border border-red-200 text-red-600'
        }`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-11 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-end gap-6 px-3 pb-2 text-[11px] text-slate-400">
            <span className="w-[38px] text-center">{t('notification.channelEmail')}</span>
            <span className="w-[38px] text-center">{t('notification.channelSystem')}</span>
          </div>
          <div className="space-y-1.5">
            {events.map((e) => {
              const row = rowOf(e.event_type)
              return (
                <div
                  key={e.event_type}
                  className="flex items-center justify-between gap-4 py-2.5 px-3 bg-gray-50/60 rounded-lg hover:bg-gray-50 transition-all duration-200 ease-in-out"
                >
                  {/* 事件名走前端语言包，后端返回的中文 label 只作兜底（后端 i18n 是 P9 第 4 批） */}
                  <span className="text-xs text-slate-700 min-w-0">{t(`notificationEvent.${e.event_type}`, { defaultValue: e.label })}</span>
                  <div className="flex items-center gap-6 flex-shrink-0">
                    <Toggle on={row.email} onClick={() => toggle(e.event_type, 'email')} label={`${t(`notificationEvent.${e.event_type}`, { defaultValue: e.label })} ${t('notification.channelEmail')}`} />
                    <Toggle on={row.system} onClick={() => toggle(e.event_type, 'system')} label={`${t(`notificationEvent.${e.event_type}`, { defaultValue: e.label })} ${t('notification.channelSystem')}`} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading || events.length === 0}
          className="h-9 px-4 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1 transition-all duration-200 ease-in-out"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('notification.save')}
        </button>
      </div>
    </div>
  )
}
