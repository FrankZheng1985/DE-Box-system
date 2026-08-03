import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MessageSquare, Tag } from 'lucide-react'

/**
 * 询价 / 报价 的模块内切换
 *
 * 需求 5.1 要求两者联动。侧边栏只有一个「询价报价」入口，
 * 进来之后靠这个切换在两张列表之间走，保持"一个模块两个视图"的感觉。
 */
const TABS = [
  { path: '/inquiries', labelKey: 'inquiry.tabTitle', icon: MessageSquare },
  { path: '/quotes', labelKey: 'quotation.tabTitle', icon: Tag },
]

export default function InquiryQuotationTabs() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()

  return (
    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
      {TABS.map((tab) => {
        const active = location.pathname.startsWith(tab.path)
        const Icon = tab.icon
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={`flex items-center gap-1.5 px-4 h-8 rounded-lg text-sm font-medium transition-all duration-200 ease-in-out ${
              active
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {t(tab.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
