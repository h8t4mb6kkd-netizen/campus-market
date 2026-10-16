'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, type ReactNode } from 'react'
import { useSocket } from '@/hooks/useSocket'

/** 包一层：新消息 / 已读 / 新会话事件到达时，防抖刷新 RSC 列表 */
export function ConversationListLive({ children }: { children: ReactNode }) {
  const { socket } = useSocket()
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!socket) return
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => router.refresh(), 300)
    }
    socket.on('message:new', refresh)
    socket.on('message:read', refresh)
    socket.on('conversation:new', refresh)
    return () => {
      socket.off('message:new', refresh)
      socket.off('message:read', refresh)
      socket.off('conversation:new', refresh)
    }
  }, [socket, router])

  return <>{children}</>
}
