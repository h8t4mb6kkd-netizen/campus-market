'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { useSocket } from '@/hooks/useSocket'
import { formatPrice, formatRelativeTime } from '@/lib/format'
import type { MessageData } from '@/lib/messages'

type LocalMessage = MessageData & { pending?: boolean; failed?: boolean }

interface ChatWindowProps {
  conversationId: string
  currentUserId: string
  other: { id: string; username: string; avatarUrl: string | null; verifiedAt: string | null }
  item: { id: string; title: string; priceCents: number; coverUrl: string | null }
  initialMessages: MessageData[]
}

export function ChatWindow({ conversationId, currentUserId, other, item, initialMessages }: ChatWindowProps) {
  const { socket, connected } = useSocket()
  const [messages, setMessages] = useState<LocalMessage[]>(initialMessages)
  const [input, setInput] = useState('')
  const [otherTyping, setOtherTyping] = useState(false)
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSentAt = useRef(0)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // 进入会话：join + 标记已读（断线重连后自动重放）
  useEffect(() => {
    if (!socket) return
    const join = () => {
      socket.emit('conversation:join', { conversationId }, (res: { ok: boolean }) => {
        if (res?.ok) socket.emit('message:read', { conversationId })
      })
    }
    if (socket.connected) join()
    socket.on('connect', join)
    return () => {
      socket.off('connect', join)
      socket.emit('conversation:leave', { conversationId })
    }
  }, [socket, conversationId])

  // 实时事件
  useEffect(() => {
    if (!socket) return
    const onNew = (payload: { message: MessageData }) => {
      const message = payload.message
      if (message.conversationId !== conversationId) return
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev
        // 自己的乐观消息用 clientId 对上号后替换
        if (message.clientId && prev.some((m) => m.clientId === message.clientId)) {
          return prev.map((m) => (m.clientId === message.clientId ? message : m))
        }
        return [...prev, message]
      })
      if (message.sender.id !== currentUserId) socket.emit('message:read', { conversationId })
    }
    const onRead = (payload: { conversationId: string; readAt: string }) => {
      if (payload.conversationId !== conversationId) return
      setMessages((prev) =>
        prev.map((m) => (m.sender.id === currentUserId && !m.readAt ? { ...m, readAt: payload.readAt } : m)),
      )
    }
    const onTyping = (payload: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (payload.conversationId !== conversationId || payload.userId === currentUserId) return
      setOtherTyping(payload.isTyping)
    }
    socket.on('message:new', onNew)
    socket.on('message:read', onRead)
    socket.on('typing', onTyping)
    return () => {
      socket.off('message:new', onNew)
      socket.off('message:read', onRead)
      socket.off('typing', onTyping)
    }
  }, [socket, conversationId, currentUserId])

  // 新消息/对方输入 → 滚到底
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, otherTyping])

  const send = useCallback(
    (type: 'TEXT' | 'IMAGE', content: string) => {
      if (!socket || !content) return
      const clientId = crypto.randomUUID()
      const optimistic: LocalMessage = {
        id: `local-${clientId}`,
        conversationId,
        type,
        content,
        clientId,
        readAt: null,
        createdAt: new Date().toISOString(),
        sender: { id: currentUserId, username: '我', avatarUrl: null, verifiedAt: null },
        pending: true,
      }
      setMessages((prev) => [...prev, optimistic])
      socket.emit(
        'message:send',
        { conversationId, type, content, clientId },
        (res: { ok: boolean; message?: MessageData }) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.clientId !== clientId) return m
              return res.ok && res.message ? res.message : { ...m, pending: false, failed: true }
            }),
          )
        },
      )
    },
    [socket, conversationId, currentUserId],
  )

  function onInputChange(value: string) {
    setInput(value)
    if (!socket) return
    const now = Date.now()
    if (now - lastTypingSentAt.current > 2000) {
      lastTypingSentAt.current = now
      socket.emit('typing', { conversationId, isTyping: true })
    }
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current)
    typingStopTimer.current = setTimeout(() => {
      socket.emit('typing', { conversationId, isTyping: false })
    }, 2500)
  }

  function retry(message: LocalMessage) {
    setMessages((prev) => prev.filter((m) => m.id !== message.id))
    if (message.clientId) send(message.type, message.content)
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col rounded-card bg-surface shadow-card">
      <Link href={`/items/${item.id}`} className="flex items-center gap-3 border-b border-line p-3 transition hover:bg-bg">
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.coverUrl} alt="" className="size-11 rounded-btn object-cover" />
        ) : (
          <div className="size-11 rounded-btn bg-[#e8edf3]" />
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-semibold">{item.title}</p>
          <p className="text-xs font-bold text-price">{formatPrice(item.priceCents)}</p>
        </div>
        <span className={`shrink-0 text-xs ${connected ? 'text-brand' : 'text-muted'}`}>
          {connected ? '● 在线' : '○ 连接中…'}
        </span>
      </Link>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message, index) => {
          const mine = message.sender.id === currentUserId
          const prev = messages[index - 1]
          const showTime = !prev || new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60_000
          const isLastMine = mine && index === messages.length - 1
          return (
            <div key={message.id}>
              {showTime && <p className="mb-2 text-center text-xs text-muted">{formatRelativeTime(message.createdAt)}</p>}
              <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                <Avatar src={mine ? null : message.sender.avatarUrl} name={mine ? '我' : message.sender.username} size={28} />
                <div className="max-w-[70%]">
                  <div
                    className={`whitespace-pre-wrap break-words rounded-card px-3 py-2 text-sm ${
                      mine ? 'bg-brand text-white' : 'bg-bg text-ink'
                    } ${message.pending ? 'opacity-60' : ''} ${message.failed ? 'ring-1 ring-[#d94f3d]' : ''}`}
                  >
                    {message.type === 'IMAGE' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={message.content} alt="图片消息" className="max-h-56 rounded-btn" />
                    ) : (
                      message.content
                    )}
                  </div>
                  {mine && isLastMine && (
                    <p className="mt-1 text-right text-xs text-muted">
                      {message.failed ? (
                        <button type="button" className="text-[#d94f3d]" onClick={() => retry(message)}>
                          发送失败，点击重发
                        </button>
                      ) : message.pending ? (
                        '发送中…'
                      ) : message.readAt ? (
                        '已读'
                      ) : (
                        '未读'
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {otherTyping && <p className="text-xs text-muted">{other.username} 正在输入…</p>}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-line p-3">
        <label className="cursor-pointer rounded-btn p-2 text-muted transition hover:bg-bg hover:text-brand" aria-label="发送图片">
          <Icon name="image" size={20} />
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              const form = new FormData()
              form.append('file', file)
              const res = await fetch('/api/upload', { method: 'POST', body: form })
              if (!res.ok) return
              const stored: { url: string } = await res.json()
              send('IMAGE', stored.url)
            }}
          />
        </label>
        <textarea
          rows={1}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              const text = input.trim()
              if (text) {
                send('TEXT', text)
                setInput('')
              }
            }
          }}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-btn border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          type="button"
          aria-label="发送"
          disabled={!input.trim()}
          onClick={() => {
            const text = input.trim()
            if (text) {
              send('TEXT', text)
              setInput('')
            }
          }}
          className="rounded-btn bg-brand p-2.5 text-white transition disabled:opacity-40"
        >
          <Icon name="send" size={18} />
        </button>
      </div>
    </div>
  )
}
