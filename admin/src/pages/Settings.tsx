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
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreference[]>([
    {
      key: 'order_status',
      label: '订单状态变更',
      icon: Package,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      email: true,
      system: true,
    },
    {
      key: 'cmr_upload',
      label: 'CMR 上传通知',
      icon: FileText,
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600',
      email: true,
      system: true,
    },
    {
      key: 'payment_reminder',
      label: '付款提醒',
      icon: DollarSign,
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      email: true,
      system: true,
    },
    {
      key: 'alert_warning',
      label: '异常预警',
      icon: AlertTriangle,
      iconBg: 'bg-red-50',
      iconColor: 'text-red-600',
      email: true,
      system: true,
    },
    {
      key: 'qualification_expiry',
      label: '资质到期',
      icon: ShieldAlert,
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600',
      email: false,
      system: true,
    },
  ])

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

            {/* 保存通知偏好按钮 */}
            <div className="flex justify-end pt-4">
              <button
                onClick={handleSaveNotifications}
                disabled={savingNotifications}
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
