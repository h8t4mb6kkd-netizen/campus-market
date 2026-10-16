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
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const instance = acquire()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 订阅外部系统（共享 Socket）必须在 effect 中建立；SSR 不执行 effect，StrictMode 下 acquire/release 严格配对
    setSocket(instance)
    setConnected(instance.connected)
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    instance.on('connect', onConnect)
    instance.on('disconnect', onDisconnect)
    return () => {
      instance.off('connect', onConnect)
      instance.off('disconnect', onDisconnect)
      setSocket(null)
      setConnected(false)
      release()
    }
  }, [enabled])

  return { socket, connected }
}
