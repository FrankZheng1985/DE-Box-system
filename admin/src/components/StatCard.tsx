import { isValidElement } from 'react'

// color -> 颜色映射
const colorStyles: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'rgba(59,130,246,0.1)', text: '#3B82F6' },
  green: { bg: 'rgba(16,185,129,0.1)', text: '#10B981' },
  yellow: { bg: 'rgba(245,158,11,0.1)', text: '#F59E0B' },
  red: { bg: 'rgba(239,68,68,0.1)', text: '#EF4444' },
  purple: { bg: 'rgba(139,92,246,0.1)', text: '#8B5CF6' },
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: any
  iconColor?: string
  iconBg?: string
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple'
  trend?: { value: string; positive: boolean }
}

export default function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  iconBg,
  color,
  trend,
}: StatCardProps) {
  // 如果传了 color 但没传 iconColor/iconBg，用 color 映射
  const cs = color ? colorStyles[color] : null
  const finalBg = iconBg || cs?.bg || 'rgba(68,114,196,0.1)'
  const finalColor = iconColor || cs?.text || '#4472C4'
  // 渲染图标：如果已经是 JSX 元素直接用，否则当作组件渲染
  let iconElement: React.ReactNode
  if (isValidElement(Icon)) {
    iconElement = Icon
  } else if (Icon) {
    iconElement = <Icon className="w-5 h-5" />
  } else {
    iconElement = null
  }

  return (
    <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-200 ease-in-out">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <span className={`text-xs font-medium ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
                {trend.positive ? '+' : ''}{trend.value}
              </span>
            </div>
          )}
          {subtitle && !trend && (
            <p className="text-xs text-slate-400 mt-2">{subtitle}</p>
          )}
        </div>

        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: finalBg, color: finalColor }}
        >
          {iconElement}
        </div>
      </div>
    </div>
  )
}
