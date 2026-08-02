import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings as SettingsIcon,
  Building,
  Mail,
  Phone,
  MapPin,
  Save,
  Bell,
  Package,
  FileText,
  DollarSign,
  AlertTriangle,
  ShieldAlert,
  CheckCircle,
  Loader2,
  CalendarDays,
  BookOpen,
  Hash,
  ChevronRight,
  Database,
  Truck,
  PackageCheck,
  RefreshCw,
  Ship,
  Stamp,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'

// ==================== 类型定义 ====================

interface AccountInfo {
  company_name: string
  email: string
  phone: string
  address: string
}

interface NotificationPreference {
  key: string
  label: string
  icon: typeof Bell
  iconBg: string
  iconColor: string
  email: boolean
  system: boolean
}

// 后端返回的通知偏好行（snake_case，和 API 一致）
interface NotificationPreferenceRow {
  event_type: string
  channel_email: boolean
  channel_system: boolean
}

/**
 * 通知事件清单
 * ⚠️ key 必须与后端 core/notification-engine.js 的 NOTIFICATION_TYPES 完全一致（全大写），
 *    否则存进库的偏好匹配不到任何实际通知（踩坑 004）
 */
const NOTIFICATION_EVENTS: Omit<NotificationPreference, 'email' | 'system'>[] = [
  { key: 'ORDER_CONFIRMED', label: '订单已确认', icon: CheckCircle, iconBg: 'bg-green-50', iconColor: 'text-green-600' },
  { key: 'CARRIER_ACCEPTED', label: '承运商接单', icon: Truck, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
  { key: 'PICKED_UP', label: '货物已提货', icon: Package, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
  { key: 'STATUS_UPDATE', label: '订单状态变更', icon: RefreshCw, iconBg: 'bg-slate-100', iconColor: 'text-slate-600' },
  { key: 'DELIVERED', label: '货物已送达', icon: PackageCheck, iconBg: 'bg-green-50', iconColor: 'text-green-600' },
  { key: 'CMR_UPLOADED', label: 'CMR 单据上传', icon: FileText, iconBg: 'bg-green-50', iconColor: 'text-green-600' },
  { key: 'EXCEPTION', label: '订单异常预警', icon: AlertTriangle, iconBg: 'bg-red-50', iconColor: 'text-red-600' },
  { key: 'CLEARANCE_RELEASED', label: '清关放行', icon: Stamp, iconBg: 'bg-purple-50', iconColor: 'text-purple-600' },
  { key: 'RELEASE_STATUS_CHANGED', label: '船司放单状态变更', icon: Ship, iconBg: 'bg-purple-50', iconColor: 'text-purple-600' },
  { key: 'QUALIFICATION_EXPIRING', label: '承运商资质到期', icon: ShieldAlert, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
  { key: 'INVOICE_DUE', label: '账单到期 / 逾期', icon: DollarSign, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
  { key: 'CREDIT_ALERT', label: '客户信用超额预警', icon: ShieldAlert, iconBg: 'bg-red-50', iconColor: 'text-red-600' },
]

/** 提醒配置，key 必须与 system_settings 的 setting_key 完全一致 */
interface ReminderConfig {
  quotation_email_enabled: boolean
  quotation_token_valid_days: number
  payment_reminder_enabled: boolean
  payment_reminder_days_before: number
  overdue_reminder_enabled: boolean
  overdue_auto_flag_enabled: boolean
}

// 后端取不到时的兜底，与迁移 108 seed 的值一致
const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  quotation_email_enabled: true,
  quotation_token_valid_days: 14,
  payment_reminder_enabled: true,
  payment_reminder_days_before: 7,
  overdue_reminder_enabled: true,
  overdue_auto_flag_enabled: true,
}

// 没有存过偏好时的默认值（和后端 _resolveChannel 的默认行为保持一致：只发站内信）
const DEFAULT_PREFS: NotificationPreference[] = NOTIFICATION_EVENTS.map((event) => ({
  ...event,
  email: false,
  system: true,
}))

// ==================== 组件 ====================

// ==================== ERP 管理入口 ====================

const ERP_ADMIN_LINKS = [
  {
    icon: CalendarDays,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    title: '过账期间管理',
    description: '管理财年各月过账期间的开放与关闭状态',
    path: '/settings/posting-periods',
  },
  {
    icon: BookOpen,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-600',
    title: '会计科目表',
    description: '查看公司科目层级结构与类型配置',
    path: '/settings/chart-of-accounts',
  },
  {
    icon: Hash,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    title: '编号范围管理',
    description: '管理各业务对象的自动编号规则',
    path: '/settings/number-ranges',
  },
  {
    icon: Database,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-600',
    title: '基础数据维护',
    description: '管理船司、箱型、币种、国家、港口、车型等基础配置数据',
    path: '/settings/master-data',
  },
]

/** 提醒配置里的开关行 */
function ReminderToggleRow({ label, hint, checked, onChange }: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 px-4 bg-slate-50/50 rounded-xl hover:bg-slate-50 transition-all duration-200 ease-in-out">
      <div className="min-w-0">
        <p className="text-sm text-slate-700">{label}</p>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-label={label}
        className={`relative rounded-full flex-shrink-0 transition-all duration-200 ease-in-out ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
        style={{ width: 40, height: 22 }}
      >
        <span
          className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all duration-200 ease-in-out ${checked ? 'left-[20px]' : 'left-0.5'}`}
        />
      </button>
    </div>
  )
}

/** 提醒配置里的数字行 */
function ReminderNumberRow({ label, hint, value, min, max, unit, onChange }: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 px-4 bg-slate-50/50 rounded-xl hover:bg-slate-50 transition-all duration-200 ease-in-out">
      <div className="min-w-0">
        <p className="text-sm text-slate-700">{label}</p>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          // 清空输入框时 valueAsNumber 是 NaN，直接塞进 state 会让受控组件炸掉
          onChange={(e) => {
            const n = e.target.valueAsNumber
            onChange(Number.isFinite(n) ? n : min)
          }}
          className="w-20 px-3 py-2 text-sm text-right bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
        />
        <span className="text-xs text-slate-500">{unit}</span>
      </div>
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()

  // 基本信息
  const [accountInfo, setAccountInfo] = useState<AccountInfo>({
    company_name: '',
    email: '',
    phone: '',
    address: '',
  })
  const [loadingAccount, setLoadingAccount] = useState(true)
  const [savingAccount, setSavingAccount] = useState(false)

  // 通知偏好
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreference[]>(DEFAULT_PREFS)
  const [loadingPrefs, setLoadingPrefs] = useState(true)

  // Toast
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const showToastMessage = (message: string) => {
    setToastMessage(message)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  // 加载账户信息
  useEffect(() => {
    const fetchAccount = async () => {
      setLoadingAccount(true)
      try {
        const res = await api.get<ApiResponse<AccountInfo>>('/system/settings/account')
        if (res.code === 200 && res.data) {
          setAccountInfo(res.data)
        }
      } catch (err) {
        console.error('[Settings] 加载账户信息失败:', err)
      } finally {
        setLoadingAccount(false)
      }
    }
    fetchAccount()
  }, [])

  // 加载已保存的通知偏好（库里没存过的事件用默认值）
  useEffect(() => {
    const fetchPreferences = async () => {
      setLoadingPrefs(true)
      try {
        const res = await api.get<ApiResponse<NotificationPreferenceRow[]>>('/notifications/preferences')
        if (res.code === 200 && Array.isArray(res.data)) {
          const saved = new Map(res.data.map((row) => [row.event_type, row]))
          setNotificationPrefs(
            NOTIFICATION_EVENTS.map((event) => {
              const row = saved.get(event.key)
              return {
                ...event,
                email: row ? Boolean(row.channel_email) : false,
                system: row ? Boolean(row.channel_system) : true,
              }
            })
          )
        }
      } catch (err) {
        console.error('[Settings] 加载通知偏好失败:', err)
      } finally {
        setLoadingPrefs(false)
      }
    }
    fetchPreferences()
  }, [])

  // 保存账户信息
  const handleSaveAccount = async () => {
    if (!accountInfo.company_name.trim()) {
      showToastMessage('请填写公司名称')
      return
    }
    setSavingAccount(true)
    try {
      const res = await api.put<ApiResponse<null>>('/system/settings/account', accountInfo)
      if (res.code === 200) {
        showToastMessage('保存成功')
      }
    } catch (err) {
      console.error('[Settings] 保存失败:', err)
      showToastMessage('保存失败，请重试')
    } finally {
      setSavingAccount(false)
    }
  }

  // 切换通知偏好
  const togglePref = (key: string, channel: 'email' | 'system') => {
    setNotificationPrefs((prev) =>
      prev.map((pref) =>
        pref.key === key ? { ...pref, [channel]: !pref[channel] } : pref
      )
    )
  }

  // 保存通知偏好
  // ==================== 提醒配置（system_settings） ====================
  // 需求 8：提醒天数/开关不写死在代码里，放 system_settings 让运营自己改。
  // 后端 GET /system/settings 已按 setting_type 转好类型，这里直接用。
  const [reminderCfg, setReminderCfg] = useState<ReminderConfig>(DEFAULT_REMINDER_CONFIG)
  const [loadingReminder, setLoadingReminder] = useState(true)
  const [savingReminder, setSavingReminder] = useState(false)

  useEffect(() => {
    const fetchReminderCfg = async () => {
      try {
        const res = await api.get<ApiResponse<Record<string, { value: unknown }>>>('/system/settings')
        if (res.code === 200 && res.data) {
          const pick = (k: keyof ReminderConfig, fallback: boolean | number) => {
            const raw = res.data[k]?.value
            return raw === undefined || raw === null ? fallback : raw
          }
          setReminderCfg({
            quotation_email_enabled: Boolean(pick('quotation_email_enabled', true)),
            quotation_token_valid_days: Number(pick('quotation_token_valid_days', 14)),
            payment_reminder_enabled: Boolean(pick('payment_reminder_enabled', true)),
            payment_reminder_days_before: Number(pick('payment_reminder_days_before', 7)),
            overdue_reminder_enabled: Boolean(pick('overdue_reminder_enabled', true)),
            overdue_auto_flag_enabled: Boolean(pick('overdue_auto_flag_enabled', true)),
          })
        }
      } catch (err) {
        console.error('[Settings] 获取提醒配置失败:', err)
      } finally {
        setLoadingReminder(false)
      }
    }
    fetchReminderCfg()
  }, [])

  const handleSaveReminder = async () => {
    // 天数是给 SQL 做日期加法用的，负数/小数会算出莫名其妙的区间，先卡住
    const days = Number(reminderCfg.payment_reminder_days_before)
    const validDays = Number(reminderCfg.quotation_token_valid_days)
    if (!Number.isInteger(days) || days < 0 || days > 90) {
      showToastMessage('提前提醒天数必须是 0-90 之间的整数')
      return
    }
    if (!Number.isInteger(validDays) || validDays < 1 || validDays > 90) {
      showToastMessage('报价链接有效天数必须是 1-90 之间的整数')
      return
    }

    setSavingReminder(true)
    try {
      const res = await api.put<ApiResponse<null>>('/system/settings', reminderCfg)
      if (res.code === 200) {
        showToastMessage('提醒配置已保存')
      } else {
        showToastMessage(res.message || '保存失败，请重试')
      }
    } catch (err) {
      console.error('[Settings] 保存提醒配置失败:', err)
      showToastMessage('保存失败，请重试')
    } finally {
      setSavingReminder(false)
    }
  }

  const [savingNotifications, setSavingNotifications] = useState(false)
  const handleSaveNotifications = async () => {
    setSavingNotifications(true)
    try {
      const preferences = notificationPrefs.map((pref) => ({
        eventType: pref.key,
        channelEmail: pref.email,
        channelSystem: pref.system,
      }))
      const res = await api.put<ApiResponse<null>>('/notifications/preferences', { preferences })
      if (res.code === 200) {
        showToastMessage('通知偏好已保存')
      } else {
        showToastMessage(res.message || '保存失败，请重试')
      }
    } catch (err) {
      console.error('[Settings] 保存通知偏好失败:', err)
      showToastMessage('保存失败，请重试')
    } finally {
      setSavingNotifications(false)
    }
  }

  return (
    <div className="p-4 lg:p-6">
      {/* 页面标题 */}
      <div className="flex items-center gap-4 mb-6">
        <div className="p-2 bg-slate-100 rounded-xl">
          <SettingsIcon className="w-5 h-5 text-slate-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">系统设置</h1>
          <p className="text-xs text-slate-500 mt-0.5">管理账户信息和通知偏好</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* ==================== 基本信息 ==================== */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900">基本信息</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">公司基础资料设置</p>
          </div>

          <div className="p-6">
            {loadingAccount ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-3 bg-slate-200 rounded w-20 mb-2" />
                    <div className="h-10 bg-slate-100 rounded-xl" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 公司名称 */}
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5">
                    <Building className="w-3.5 h-3.5 text-slate-400" />
                    公司名称
                  </label>
                  <input
                    type="text"
                    value={accountInfo.company_name}
                    onChange={(e) =>
                      setAccountInfo((prev) => ({ ...prev, company_name: e.target.value }))
                    }
                    placeholder="请输入公司名称"
                    className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
                  />
                </div>

                {/* 邮箱 */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    邮箱
                  </label>
                  <input
                    type="email"
                    value={accountInfo.email}
                    onChange={(e) =>
                      setAccountInfo((prev) => ({ ...prev, email: e.target.value }))
                    }
                    placeholder="company@example.com"
                    className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
                  />
                </div>

                {/* 电话 */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    电话
                  </label>
                  <input
                    type="tel"
                    value={accountInfo.phone}
                    onChange={(e) =>
                      setAccountInfo((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    placeholder="+49 xxx xxxx xxxx"
                    className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
                  />
                </div>

                {/* 地址 */}
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    地址
                  </label>
                  <input
                    type="text"
                    value={accountInfo.address}
                    onChange={(e) =>
                      setAccountInfo((prev) => ({ ...prev, address: e.target.value }))
                    }
                    placeholder="请输入公司地址"
                    className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
                  />
                </div>

                {/* 保存按钮 */}
                <div className="sm:col-span-2 flex justify-end pt-2">
                  <button
                    onClick={handleSaveAccount}
                    disabled={savingAccount}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-all duration-200 ease-in-out"
                  >
                    {savingAccount ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    保存设置
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ==================== 提醒配置 ==================== */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900">报价与账单提醒</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">控制发给客户的报价确认邮件和账单提醒</p>
          </div>

          <div className="p-6">
            {loadingReminder ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <ReminderToggleRow
                  label="发送报价时给客户发确认邮件"
                  hint="邮件内含同意 / 待定 / 拒绝三个一次性确认链接"
                  checked={reminderCfg.quotation_email_enabled}
                  onChange={(v) => setReminderCfg((c) => ({ ...c, quotation_email_enabled: v }))}
                />
                <ReminderNumberRow
                  label="报价确认链接有效天数"
                  hint="报价本身填了有效期时以有效期为准"
                  value={reminderCfg.quotation_token_valid_days}
                  min={1}
                  max={90}
                  unit="天"
                  onChange={(v) => setReminderCfg((c) => ({ ...c, quotation_token_valid_days: v }))}
                />
                <ReminderToggleRow
                  label="账单到期前提醒客户"
                  checked={reminderCfg.payment_reminder_enabled}
                  onChange={(v) => setReminderCfg((c) => ({ ...c, payment_reminder_enabled: v }))}
                />
                <ReminderNumberRow
                  label="提前几天提醒"
                  hint="每天 9:00 检查一次"
                  value={reminderCfg.payment_reminder_days_before}
                  min={0}
                  max={90}
                  unit="天"
                  onChange={(v) => setReminderCfg((c) => ({ ...c, payment_reminder_days_before: v }))}
                />
                <ReminderToggleRow
                  label="逾期后向客户催款"
                  checked={reminderCfg.overdue_reminder_enabled}
                  onChange={(v) => setReminderCfg((c) => ({ ...c, overdue_reminder_enabled: v }))}
                />
                <ReminderToggleRow
                  label="自动把逾期账单标记为「已逾期」"
                  hint="关闭后逾期账单会一直显示为未付款"
                  checked={reminderCfg.overdue_auto_flag_enabled}
                  onChange={(v) => setReminderCfg((c) => ({ ...c, overdue_auto_flag_enabled: v }))}
                />
              </div>
            )}

            <div className="flex justify-end pt-4">
              <button
                onClick={handleSaveReminder}
                disabled={savingReminder || loadingReminder}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-all duration-200 ease-in-out"
              >
                {savingReminder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                保存提醒配置
              </button>
            </div>
          </div>
        </div>

        {/* ==================== 通知偏好 ==================== */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900">通知偏好</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">选择接收通知的方式</p>
          </div>

          <div className="p-6">
            {/* 表头 */}
            <div className="flex items-center justify-end gap-8 mb-4 pr-1">
              <div className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-medium text-slate-500">邮件</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-medium text-slate-500">系统</span>
              </div>
            </div>

            {/* 通知项列表 */}
            {loadingPrefs ? (
              <div className="space-y-2 animate-pulse">
                {NOTIFICATION_EVENTS.map((event) => (
                  <div key={event.key} className="h-14 bg-slate-100 rounded-xl" />
                ))}
              </div>
            ) : (
            <div className="space-y-2">
              {notificationPrefs.map((pref) => {
                const IconComp = pref.icon
                return (
                  <div
                    key={pref.key}
                    className="flex items-center justify-between py-3 px-4 bg-slate-50/50 rounded-xl hover:bg-slate-50 transition-all duration-200 ease-in-out"
                  >
                    {/* 左侧：图标 + 名称 */}
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${pref.iconBg}`}
                      >
                        <IconComp className={`w-4 h-4 ${pref.iconColor}`} />
                      </div>
                      <span className="text-sm text-slate-700">{pref.label}</span>
                    </div>

                    {/* 右侧：两个开关 */}
                    <div className="flex items-center gap-8">
                      {/* 邮件开关 */}
                      <button
                        onClick={() => togglePref(pref.key, 'email')}
                        className={`relative w-10 h-5.5 rounded-full transition-all duration-200 ease-in-out ${
                          pref.email ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                        style={{ width: 40, height: 22 }}
                      >
                        <span
                          className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all duration-200 ease-in-out ${
                            pref.email ? 'left-[20px]' : 'left-0.5'
                          }`}
                        />
                      </button>

                      {/* 系统开关 */}
                      <button
                        onClick={() => togglePref(pref.key, 'system')}
                        className={`relative rounded-full transition-all duration-200 ease-in-out ${
                          pref.system ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                        style={{ width: 40, height: 22 }}
                      >
                        <span
                          className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all duration-200 ease-in-out ${
                            pref.system ? 'left-[20px]' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            )}

            {/* 保存通知偏好按钮 */}
            <div className="flex justify-end pt-4">
              <button
                onClick={handleSaveNotifications}
                disabled={savingNotifications || loadingPrefs}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-all duration-200 ease-in-out"
              >
                {savingNotifications ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                保存通知设置
              </button>
            </div>
          </div>
        </div>

        {/* ==================== ERP 管理 ==================== */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <SettingsIcon className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900">ERP 管理</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">系统核心配置与财务管理设置</p>
          </div>

          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ERP_ADMIN_LINKS.map((link) => {
              const IconComp = link.icon
              return (
                <button
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  className="flex items-start gap-4 p-4 bg-slate-50/50 rounded-xl hover:bg-slate-100/80 transition-all duration-200 text-left group"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${link.iconBg}`}>
                    <IconComp className={`w-5 h-5 ${link.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium text-slate-900">{link.title}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{link.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Toast 提示 */}
      {showToast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 z-50 animate-slide-in">
          <CheckCircle className="w-5 h-5 text-green-400" />
          {toastMessage}
        </div>
      )}
    </div>
  )
}
