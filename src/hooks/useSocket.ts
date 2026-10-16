'use client'

import { useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

let sharedSocket: Socket | null = null
let refCount = 0

function acquire(): Socket {
  if (!sharedSocket) {
    sharedSocket = io({
      transports: ['websocket', 'polling'],
      reconnection: true, // 断线自动重连（Spec §5.2）
    })
  }
  refCount += 1
  return sharedSocket
}

function release(): void {
  refCount -= 1
  if (refCount <= 0 && sharedSocket) {
    sharedSocket.disconnect()
    sharedSocket = null
    refCount = 0
  }
}

/** 全标签页共享一条 Socket 连接；无登录态时用 enabled=false 关闭 */
export function useSocket(enabled = true): { socket: Socket | null; connected: boolean } {
  // 惰性初始化：首帧即拿到共享连接，避免 effect 内同步 setState 造成的级联渲染
  const [socket] = useState<Socket | null>(() => (enabled ? acquire() : null))
  const [connected, setConnected] = useState(() => socket?.connected ?? false)

  useEffect(() => {
    if (!enabled) return
    const instance = socket ?? acquire()
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    instance.on('connect', onConnect)
    instance.on('disconnect', onDisconnect)
    return () => {
      instance.off('connect', onConnect)
      instance.off('disconnect', onDisconnect)
      release()
    }
  }, [enabled, socket])

  return { socket, connected }
}
