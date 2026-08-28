/**
 * 客户门户 · 订单日志（履约沟通，开发意见 #14）
 *
 * 我司在后台发布的履约信息会出现在这里。客户可以：
 *   1. 点「标记已读」——回执回传后台，运营那边能看到谁什么时候读的
 *   2. 在某条信息下面直接回复处理意见——回复回传后台并通知全体运营
 *
 * 目的是替代线下微信群：一张订单从确认到结束说过的话都留在订单上。
 */

import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Send, CornerDownRight, Check, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { ApiResponse } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { formatDateTime } from '../utils/format'
import { Section } from './DetailPanels'

// ==================== 类型定义 ====================

/** 逐字对齐后端 GET /orders/:id/messages 的返回（snake_case，踩坑 066） */
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

const MAX_CONTENT_LENGTH = 2000

export default function OrderMessagePanel({ orderId }: { orderId: string }) {
  const { t } = useTranslation()
  const { user, hasPermission } = useAuth()

  const [messages, setMessages] = useState<OrderMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const canReply = hasPermission('portal:order_message')

  const fetchMessages = useCallback(async () => {
    try {
      const response = await api.get<ApiResponse<OrderMessage[]>>(`/orders/${orderId}/messages`)
      if (response.code === 200) setMessages(response.data || [])
    } catch (err) {
      console.error('获取订单日志失败:', err)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  /** 当前登录人读没读过这条 */
  const readByMe = (msg: OrderMessage) => msg.reads.some((r) => r.user_id === user?.id)

  const handleMarkRead = async (messageId: string) => {
    if (busyId) return
    setBusyId(messageId)
    try {
      await api.post<ApiResponse<null>>(`/orders/${orderId}/messages/${messageId}/read`, {})
      await fetchMessages()
    } catch (err) {
      console.error('标记已读失败:', err)
    } finally {
      setBusyId(null)
    }
  }

  const handleReply = async (parentId: string) => {
    const text = replyContent.trim()
    if (!text || busyId) return
    setBusyId(parentId)
    try {
      const response = await api.post<ApiResponse<null>>(
        `/orders/${orderId}/messages/${parentId}/replies`, { content: text }
      )
      if (response.code === 200) {
        setReplyContent('')
        setReplyTo(null)
        await fetchMessages()
      }
    } catch (err) {
      console.error('回复失败:', err)
    } finally {
      setBusyId(null)
    }
  }

  /** 署名行：谁、哪一方、什么时候 */
  const senderLine = (msg: OrderMessage) => (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm font-medium text-slate-900">{msg.sender_name || '-'}</span>
      <span className={`px-2 py-0.5 text-[10px] rounded-full ${
        msg.sender_type === 'OPERATOR' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
      }`}>
        {t(msg.sender_type === 'OPERATOR' ? 'orderMessages.fromUs' : 'orderMessages.fromMe')}
      </span>
      <span className="text-xs text-slate-400">{formatDateTime(msg.created_at)}</span>
    </div>
  )

  return (
    <Section icon={MessageSquare} title={t('orderMessages.title')}>
      <p className="text-xs text-slate-400 mb-4">{t('orderMessages.hint')}</p>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <p className="text-sm text-slate-400 py-2">{t('orderMessages.empty')}</p>
      ) : (
        <div className="space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className="border border-gray-100 rounded-xl p-4">
              {senderLine(msg)}
              <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap break-words">{msg.content}</p>

              {/* 已读回执：本人读过就显示状态，没读过给按钮 */}
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {msg.reads.length > 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-green-700">
                    <Check className="w-3.5 h-3.5" />
                    {msg.reads
                      .map((r) => t('orderMessages.readBy', {
                        name: r.user_name || '-',
                        time: formatDateTime(r.read_at),
                      }))
                      .join('；')}
                  </span>
                )}
                {msg.sender_type === 'OPERATOR' && !readByMe(msg) && canReply && (
                  <button
                    onClick={() => handleMarkRead(msg.id)}
                    disabled={busyId === msg.id}
                    className="h-7 px-2 flex items-center gap-1 text-[11px] text-green-700 hover:bg-green-50
                               rounded-lg disabled:opacity-40 transition-all duration-200 ease-in-out"
                  >
                    {busyId === msg.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Check className="w-3.5 h-3.5" />}
                    {t('orderMessages.markRead')}
                  </button>
                )}
              </div>

              {/* 回复串 */}
              {(msg.replies || []).map((reply) => (
                <div key={reply.id} className="flex gap-2 mt-3 pl-3 border-l-2 border-gray-100">
                  <CornerDownRight className="w-3.5 h-3.5 text-slate-300 mt-1 shrink-0" />
                  <div className="min-w-0 flex-1">
                    {senderLine(reply)}
                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap break-words">{reply.content}</p>
                  </div>
                </div>
              ))}

              {/* 回复处理意见 */}
              {canReply && (
                replyTo === msg.id ? (
                  <div className="mt-3">
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value.slice(0, MAX_CONTENT_LENGTH))}
                      rows={2}
                      placeholder={t('orderMessages.replyPlaceholder')}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none
                                 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300
                                 transition-all duration-200 ease-in-out"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => handleReply(msg.id)}
                        disabled={!replyContent.trim() || busyId === msg.id}
                        className="h-8 px-3 flex items-center gap-1.5 text-xs text-white bg-primary-600 rounded-lg
                                   hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed
                                   transition-all duration-200 ease-in-out"
                      >
                        {busyId === msg.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Send className="w-3.5 h-3.5" />}
                        {t('orderMessages.replySend')}
                      </button>
                      <button
                        onClick={() => { setReplyTo(null); setReplyContent('') }}
                        className="h-8 px-3 text-xs text-slate-500 hover:bg-gray-50 rounded-lg
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
                               hover:bg-gray-50 rounded-lg transition-all duration-200 ease-in-out"
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
    </Section>
  )
}
