import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2, X } from 'lucide-react'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason?: string) => void | Promise<void>
  title: string
  message: string
  /** 是否需要填写原因（作废、删除等不可逆操作应设为 true） */
  requireReason?: boolean
  /** 原因输入框的占位文本 */
  reasonPlaceholder?: string
  /** 确认按钮文本，默认"确认" */
  confirmText?: string
  /** 确认按钮样式：danger(红色) / warning(橙色) / primary(蓝色) */
  variant?: 'danger' | 'warning' | 'primary'
  /** 操作目标名称，如"客户 BMW AG"，会在标题下展示 */
  targetLabel?: string
  /** 附加警告提示（例如"此操作不可撤销"） */
  warningText?: string
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  requireReason = false,
  reasonPlaceholder,
  confirmText,
  variant = 'danger',
  targetLabel,
  warningText,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // 打开时重置状态
  useEffect(() => {
    if (isOpen) {
      setReason('')
      setError('')
      setSubmitting(false)
    }
  }, [isOpen])

  // ESC 关闭 + 锁定滚动
  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', handleEsc)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = prev
    }
  }, [isOpen, submitting, onClose])

  if (!isOpen) return null

  const handleConfirm = async () => {
    if (requireReason && !reason.trim()) {
      setError(t('confirmDialog.errorReasonRequired'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onConfirm(requireReason ? reason.trim() : undefined)
    } catch (err: any) {
      setError(err?.message || t('common.operateFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const variantStyles = {
    danger: {
      icon: 'bg-red-100 text-red-600',
      button: 'bg-red-600 hover:bg-red-700',
    },
    warning: {
      icon: 'bg-amber-100 text-amber-600',
      button: 'bg-amber-600 hover:bg-amber-700',
    },
    primary: {
      icon: 'bg-blue-100 text-blue-600',
      button: 'bg-blue-600 hover:bg-blue-700',
    },
  }[variant]

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-start gap-3 p-5 pb-4">
          <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center ${variantStyles.icon}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {targetLabel && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">{targetLabel}</p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all duration-200 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-5 pb-4 space-y-3">
          <p className="text-sm text-slate-700 leading-relaxed">{message}</p>

          {warningText && (
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">{warningText}</p>
            </div>
          )}

          {requireReason && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('confirmDialog.reasonLabel')} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  if (error) setError('')
                }}
                placeholder={reasonPlaceholder || t('confirmDialog.reasonPlaceholder')}
                rows={3}
                autoFocus
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 resize-none"
              />
            </div>
          )}

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* 按钮 */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 bg-slate-50 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-all duration-200 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-xl transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles.button}`}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? t('confirmDialog.processing') : (confirmText || t('common.confirm'))}
          </button>
        </div>
      </div>
    </div>
  )
}
