'use client'

import { useEffect, useState } from 'react'
import { useSocket } from '@/hooks/useSocket'

export function UnreadBadge({ initialCount }: { initialCount: number }) {
  const { socket } = useSocket()
  const [count, setCount] = useState(initialCount)
  const [syncedFrom, setSyncedFrom] = useState(initialCount)

  // RSC refresh 后同步（render 期调整，避免 effect 里 setState 造成级联渲染）
  if (initialCount !== syncedFrom) {
    setSyncedFrom(initialCount)
    setCount(initialCount)
  }

  useEffect(() => {
    if (!socket) return
    const refresh = async () => {
      const res = await fetch('/api/me/unread-count')
      if (res.ok) setCount((await res.json()).count)
    }
    socket.on('message:new', refresh)
    socket.on('message:read', refresh)
    return () => {
      socket.off('message:new', refresh)
      socket.off('message:read', refresh)
    }
  }, [socket])

  if (count <= 0) return null
  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-price px-1 text-[10px] font-bold text-white">
      {count > 99 ? '99+' : count}
    </span>
  )
}
