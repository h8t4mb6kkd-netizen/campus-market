import type { Server as SocketIOServer } from 'socket.io'

/** 挂载实时层。签名冻结：Task 18 只改内部实现，不改此签名。 */
export function attachRealtime(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    console.log('[realtime] connected:', socket.id)
    socket.on('disconnect', (reason) => {
      console.log('[realtime] disconnected:', socket.id, reason)
    })
  })
}
