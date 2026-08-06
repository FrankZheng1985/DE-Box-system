import { useState, useEffect } from 'react'
import {
  Bell,
  AlertTriangle,
  Package,
  FileText,
  DollarSign,
  Clock,
  ShieldAlert,
  Check,
  CheckCheck,
  Loader2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import Pagination from '../components/Pagination'

// ==================== 类型定义 ====================

interface Notification {
  id: string
  type: 'order' | 'cmr' | 'payment' | 'alert' | 'qualification' | 'system'
  title: string
  message: string
  is_read: boolean
  created_at: string
}

interface NotificationListData {
  list: Notification[]
  total: number
  unread_count: number
}

// ==================== 类型图标与样式 ====================

const typeConfig: Record<string, { icon: typeof Bell; bg: string; iconColor: string }> = {
  order: { icon: Package, bg: 'bg-blue-50', iconColor: 'text-blue-600' },
  cmr: { icon: FileText, bg: 'bg-green-50', iconColor: 'text-green-600' },
  payment: { icon: DollarSign, bg: 'bg-amber-50', iconColor: 'text-amber-600' },
  alert: { icon: AlertTriangle, bg: 'bg-red-50', iconColor: 'text-red-600' },
  qualification: { icon: ShieldAlert, bg: 'bg-purple-50', iconColor: 'text-purple-600' },
  system: { icon: Bell, bg: 'bg-slate-100', iconColor: 'text-slate-600' },
}

// ==================== 组件 ====================

export default function Notifications() {
  const { t } = useTranslation()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [total, setTotal] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20

  // 加载通知列表
  const fetchNotifications = async (currentPage: number) => {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<NotificationListData>>(
        `/notifications?page=${currentPage}&pageSize=${pageSize}`
      )
      if (res.code === 200 && res.data) {
        setNotifications(res.data.list || [])
        setTotal(res.data.total || 0)
        setUnreadCount(res.data.unread_count || 0)
      }
    } catch (err) {
      console.error('[Notifications] 加载通知失败:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications(page)
  }, [page])

  // 标记单条已读
  const handleMarkAsRead = async (notification: Notification) => {
    if (notification.is_read) return
    try {
      const res = await api.put<ApiResponse<null>>(`/notifications/${notification.id}/read`)
      if (res.code === 200) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
    } catch (err) {
      console.error('[Notifications] 标记已读失败:', err)
    }
  }

  // 全部已读
  const handleMarkAllRead = async () => {
    if (markingAllRead || unreadCount === 0) return
    setMarkingAllRead(true)
    try {
      const res = await api.put<ApiResponse<null>>('/notifications/read-all')
      if (res.code === 200) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
        setUnreadCount(0)
      }
    } catch (err) {
      console.error('[Notifications] 全部已读失败:', err)
    } finally {
      setMarkingAllRead(false)
    }
  }

  // 时间格式化
  const formatTime = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)

    if (minutes < 1) return t('notification.justNow')
    if (minutes < 60) return t('gps.minutesAgo', { count: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('gps.hoursAgo', { count: hours })
    const days = Math.floor(hours / 24)
    if (days < 7) return t('gps.daysAgo', { count: days })

    // 超过 7 天显示具体日期
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${min}`
  }

  // 分页信息

  return (
    <div className="p-4 lg:p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-purple-50 rounded-xl">
            <Bell className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{t('notification.pageTitle')}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('notification.summary', { total, unread: unreadCount })}
            </p>
          </div>
        </div>

        {/* 全部已读按钮 */}
        <button
          onClick={handleMarkAllRead}
          disabled={markingAllRead || unreadCount === 0}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 ease-in-out ${
            unreadCount === 0
              ? 'text-slate-400 bg-slate-50 cursor-not-allowed'
              : 'text-blue-600 bg-blue-50 hover:bg-blue-100'
          }`}
        >
          {markingAllRead ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCheck className="w-4 h-4" />
          )}
          {t('notification.markAllRead')}
        </button>
      </div>

      {/* 通知列表 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="w-10 h-10 bg-slate-200 rounded-xl flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-2/3 mb-1" />
                  <div className="h-3 bg-slate-100 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Bell className="w-12 h-12 mb-3" />
            <p className="text-sm">{t('notification.empty')}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => {
              const config = typeConfig[notification.type] || typeConfig.system
              const IconComp = config.icon
              return (
                <button
                  key={notification.id}
                  onClick={() => handleMarkAsRead(notification)}
                  className={`w-full text-left flex items-start gap-4 px-6 py-4 transition-all duration-200 ease-in-out hover:bg-slate-50 ${
                    notification.is_read ? 'bg-slate-50/50' : 'bg-white'
                  }`}
                >
                  {/* 图标 */}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.bg}`}
                  >
                    <IconComp className={`w-5 h-5 ${config.iconColor}`} />
                  </div>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-sm font-medium ${
                          notification.is_read ? 'text-slate-500' : 'text-slate-900'
                        }`}
                      >
                        {notification.title}
                      </span>
                      {!notification.is_read && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                      )}
                    </div>
                    <p
                      className={`text-xs leading-relaxed mb-1 ${
                        notification.is_read ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      {notification.message}
                    </p>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] text-slate-400">
                        {formatTime(notification.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* 已读标识 */}
                  <div className="flex-shrink-0 pt-1">
                    {notification.is_read ? (
                      <Check className="w-4 h-4 text-slate-300" />
                    ) : (
                      <div className="w-4 h-4" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* 分页 */}
        <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} />
      </div>
    </div>
  )
}
