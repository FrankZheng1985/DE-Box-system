import { useEffect } from 'react'
import { CheckCircle, AlertCircle } from 'lucide-react'

// ==================== 类型定义 ====================

export type ToastType = 'success' | 'error'

interface ToastProps {
  /** 提示文字（调用方自己翻译好再传进来） */
  message: string
  /** 成功还是失败，默认成功 */
  type?: ToastType
  /** 自动消失后回调，页面在这里把 toast state 清空 */
  onClose: () => void
  /** 自动消失时长（毫秒），默认 3 秒 */
  duration?: number
}

// ==================== 组件 ====================

/**
 * 全局轻提示
 *
 * 统一了原来散在 8 个页面里各写一份的 Toast（样式和签名当时都不一致：
 * 有的顶部居中不带图标只能报成功，有的右上角带图标能区分成败）。
 * 现在统一成右上角带图标这一种，失败态才有地方显示。
 */
export default function Toast({ message, type = 'success', onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [onClose, duration])

  const isSuccess = type === 'success'

  return (
    <div className="fixed top-6 right-6 z-[100] animate-[slideIn_300ms_ease-out]">
      <div
        role="status"
        className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
          isSuccess ? 'bg-green-600' : 'bg-red-600'
        }`}
      >
        {isSuccess ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
        {message}
      </div>
    </div>
  )
}
