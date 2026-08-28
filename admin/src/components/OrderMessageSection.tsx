/**
 * 订单履约沟通区块（运营端订单详情页用，飞书开发意见 #14）
 *
 * 运营在这里写一条要传达给客户的履约信息 → 客户门户订单详情里能看到、能标记已读、能回复。
 * 已读回执和客户回复都回显在这里，交付过程一条线看完，不用再翻微信群。
 *
 * 单独成文件是因为 OrderDetail.tsx 已经 1274 行，这块自成一体，不该再往里塞。
 */

import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Send, CornerDownRight, Check, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { formatDateTime } from '../utils/format'

// ==================== 类型定义 ====================

/** 字段名与后端 GET /orders/:id/messages 返回的 JSON key 一致（snake_case，踩坑 003 / 066） */
interface MessageRead {
  user_id: string
  user_name: string | null
  read_at: string
}

interface OrderMessage {
  id: string
  parent_id: string | null
  sender_type: 'OPERATOR' | 'CLIENT'
  sender_id: string
  sender_name: string | null
  content: string
  created_at: string
  reads: MessageRead[]
  replies?: OrderMessage[]
}

interface OrderMessageSectionProps {
  orderId: string
  /** 订单当前状态：尚未确认/已取消时不允许发起沟通，与后端守卫同口径 */
  status: string
  onToast: (message: string, type: 'success' | 'error') => void
}

/**
 * 还不能开始履约沟通的状态
 * 与 server/modules/order/message-routes.js 的 NOT_YET_CONFIRMED 一致；
 * 前端这份只用来给出禁用提示，真正的守卫在后端
 */
const NOT_YET_CONFIRMED = ['PENDING_REVIEW', 'PENDING_QUOTE', 'CANCELLED']

const MAX_CONTENT_LENGTH = 2000

export default function OrderMessageSection({ orderId, status, onToast }: OrderMessageSectionProps) {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()

  const [messages, setMessages] = useState<OrderMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)
  // 正在回复哪一条（null = 没在回复）
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [replying, setReplying] = useState(false)

  const canPost = hasPermission('order:message') && !NOT_YET_CONFIRMED.includes(status)

  const fetchMessages = useCallback(async () => {
    try {
      const response = await api.get<ApiResponse<OrderMessage[]>>(`/orders/${orderId}/messages`)
      if (response.code === 200) setMessages(response.data || [])
    } catch (err) {
      console.error('获取订单沟通记录失败:', err)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  const handlePost = async () => {
    const text = content.trim()
    if (!text || posting) return
    setPosting(true)
    try {
      const response = await api.post<ApiResponse<null>>(`/orders/${orderId}/messages`, { content: text })
      if (response.code === 200) {
        setContent('')
        onToast(t('orderMessages.posted'), 'success')
        await fetchMessages()
      } else {
        onToast(response.message || t('orderMessages.postFailed'), 'error')
      }
    } catch (err: any) {
      onToast(err.message || t('orderMessages.postFailed'), 'error')
    } finally {
      setPosting(false)
    }
  }

  const handleReply = async (parentId: string) => {
    const text = replyContent.trim()
    if (!text || replying) return
    setReplying(true)
    try {
      const response = await api.post<ApiResponse<null>>(
        `/orders/${orderId}/messages/${parentId}/replies`, { content: text }
      )
      if (response.code === 200) {
        setReplyContent('')
        setReplyTo(null)
        await fetchMessages()
      } else {
        onToast(response.message || t('orderMessages.postFailed'), 'error')
      }
    } catch (err: any) {
      onToast(err.message || t('orderMessages.postFailed'), 'error')
    } finally {
      setReplying(false)
    }
  }

  /** 一条消息的署名行：谁、什么时候、哪一方 */
  const senderLine = (msg: OrderMessage) => (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm font-medium text-slate-900">{msg.sender_name || '-'}</span>
      <span className={`px-2 py-0.5 text-[10px] rounded-full ${
        msg.sender_type === 'OPERATOR' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
      }`}>
        {t(msg.sender_type === 'OPERATOR' ? 'orderMessages.fromUs' : 'orderMessages.fromClient')}
      </span>
      <span className="text-xs text-slate-400">{formatDateTime(msg.created_at)}</span>
    </div>
  )

  return (
    <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-blue-600" />
        {t('orderMessages.title')}
      </h2>
      <p className="text-xs text-slate-400 mb-6">{t('orderMessages.hint')}</p>

      {/* ---------- 发布新信息 ---------- */}
      {canPost ? (
        <div className="mb-6">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT_LENGTH))}
            rows={3}
            placeholder={t('orderMessages.placeholder')}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none
                       focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300
                       transition-all duration-200 ease-in-out"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-slate-400">{content.length}/{MAX_CONTENT_LENGTH}</span>
            <button
              onClick={handlePost}
              disabled={!content.trim() || posting}
              className="h-9 px-4 flex items-center gap-2 text-sm text-white bg-blue-600 rounded-xl
                         hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed
                         transition-all duration-200 ease-in-out"
            >
              {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {t('orderMessages.send')}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2 mb-6">
          {hasPermission('order:message')
            ? t('orderMessages.notConfirmed')
            : t('orderMessages.noPermission')}
        </p>
      )}

      {/* ---------- 沟通记录 ---------- */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">{t('orderMessages.empty')}</p>
      ) : (
        <div className="space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className="border border-slate-100 rounded-xl p-4">
              {senderLine(msg)}
              <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap break-words">{msg.content}</p>

              {/* 已读回执：客户点了「标记已读」才会有 */}
              {msg.reads.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <Check className="w-3.5 h-3.5 text-green-600" />
                  {msg.reads.map((r) => (
                    <span key={r.user_id} className="text-[11px] text-green-700">
                      {t('orderMessages.readBy', {
                        name: r.user_name || '-',
                        time: formatDateTime(r.read_at),
                      })}
                    </span>
                  ))}
                </div>
              )}

              {/* 回复串 */}
              {(msg.replies || []).map((reply) => (
                <div key={reply.id} className="flex gap-2 mt-3 pl-3 border-l-2 border-slate-100">
                  <CornerDownRight className="w-3.5 h-3.5 text-slate-300 mt-1 flex-shrink-0" />
                  <div className="flex-1">
                    {senderLine(reply)}
                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap break-words">{reply.content}</p>
                  </div>
                </div>
              ))}

              {/* 运营接着回 */}
              {canPost && (
                replyTo === msg.id ? (
                  <div className="mt-3">
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value.slice(0, MAX_CONTENT_LENGTH))}
                      rows={2}
                      placeholder={t('orderMessages.replyPlaceholder')}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none
                                 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300
                                 transition-all duration-200 ease-in-out"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => handleReply(msg.id)}
                        disabled={!replyContent.trim() || replying}
                        className="h-8 px-3 flex items-center gap-1.5 text-xs text-white bg-blue-600 rounded-lg
                                   hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed
                                   transition-all duration-200 ease-in-out"
                      >
                        {replying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        {t('orderMessages.replySend')}
                      </button>
                      <button
                        onClick={() => { setReplyTo(null); setReplyContent('') }}
                        className="h-8 px-3 text-xs text-slate-500 hover:bg-slate-50 rounded-lg
                                   transition-all duration-200 ease-in-out"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setReplyTo(msg.id); setReplyContent('') }}
                    className="mt-3 h-7 px-2 flex items-center gap-1 text-[11px] text-slate-500
                               hover:bg-slate-50 rounded-lg transition-all duration-200 ease-in-out"
                  >
                    <CornerDownRight className="w-3.5 h-3.5" />
                    {t('orderMessages.reply')}
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
