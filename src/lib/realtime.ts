import type { Server as SocketIOServer, Socket } from 'socket.io'
import { z } from 'zod'
import { SESSION_COOKIE, parseCookieHeader, validateSessionToken, type AuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { messageInclude, toMessageData } from '@/lib/messages'
import { messageSendSchema } from '@/lib/validators'

interface AuthedSocketData {
  user: AuthUser
}

type AuthedSocket = Socket & { data: AuthedSocketData }

const userRoom = (userId: string) => `user:${userId}`
const conversationRoom = (conversationId: string) => `conv:${conversationId}`

const sendPayloadSchema = z.intersection(messageSendSchema, z.object({ conversationId: z.string().min(1) }))

/** 挂载实时层：握手复用 HTTP 的 session 鉴权，消息先落库再广播 */
export function attachRealtime(io: SocketIOServer): void {
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie ?? null
      const token = parseCookieHeader(cookieHeader)[SESSION_COOKIE]
      const user = token ? await validateSessionToken(token) : null
      if (!user) return next(new Error('UNAUTHENTICATED'))
      ;(socket as AuthedSocket).data.user = user
      next()
    } catch (err) {
      next(err instanceof Error ? err : new Error('INTERNAL'))
    }
  })

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as AuthedSocket
    const user = socket.data.user
    void socket.join(userRoom(user.id))

    socket.on('conversation:join', async (payload: unknown, ack?: (res: unknown) => void) => {
      const conversationId = readConversationId(payload)
      const conversation = conversationId
        ? await prisma.conversation.findUnique({ where: { id: conversationId } })
        : null
      if (!conversation || (conversation.buyerId !== user.id && conversation.sellerId !== user.id)) {
        return ack?.({ ok: false, error: { code: 'FORBIDDEN', message: '无权访问该会话' } })
      }
      void socket.join(conversationRoom(conversationId!))
      ack?.({ ok: true })
    })

    socket.on('conversation:leave', async (payload: unknown) => {
      const conversationId = readConversationId(payload)
      if (conversationId) void socket.leave(conversationRoom(conversationId))
    })

    socket.on('message:send', async (payload: unknown, ack?: (res: unknown) => void) => {
      try {
        const parsed = sendPayloadSchema.safeParse(payload)
        if (!parsed.success) {
          return ack?.({ ok: false, error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? '消息不合法' } })
        }
        const { conversationId, type, content, clientId } = parsed.data

        const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } })
        if (!conversation || (conversation.buyerId !== user.id && conversation.sellerId !== user.id)) {
          return ack?.({ ok: false, error: { code: 'FORBIDDEN', message: '无权在该会话发言' } })
        }

        // 幂等：断线重试携带相同 clientId → 直接返回已存消息
        const existing = await prisma.message.findUnique({
          where: { conversationId_clientId: { conversationId, clientId } },
          include: messageInclude,
        })
        if (existing) return ack?.({ ok: true, message: toMessageData(existing) })

        const message = await prisma.$transaction(async (tx) => {
          const created = await tx.message.create({
            data: { conversationId, senderId: user.id, type, content, clientId },
            include: messageInclude,
          })
          await tx.conversation.update({
            where: { id: conversationId },
            data: {
              lastMessageAt: new Date(),
              lastMessagePreview: type === 'IMAGE' ? '[图片]' : content.slice(0, 60),
            },
          })
          return created
        })

        const payloadOut = { message: toMessageData(message) }
        const recipientId = conversation.buyerId === user.id ? conversation.sellerId : conversation.buyerId
        io.to(userRoom(recipientId)).emit('message:new', payloadOut)
        const isFirstMessage = (await prisma.message.count({ where: { conversationId } })) === 1
        if (isFirstMessage) {
          io.to(userRoom(recipientId)).emit('conversation:new', {
            conversation: { id: conversationId, itemId: conversation.itemId },
          })
        }
        socket.to(conversationRoom(conversationId)).emit('message:new', payloadOut)
        ack?.({ ok: true, message: payloadOut.message })
      } catch {
        ack?.({ ok: false, error: { code: 'INTERNAL', message: '发送失败，请重试' } })
      }
    })

    socket.on('message:read', async (payload: unknown, ack?: (res: unknown) => void) => {
      try {
        const conversationId = readConversationId(payload)
        const conversation = conversationId
          ? await prisma.conversation.findUnique({ where: { id: conversationId } })
          : null
        if (!conversation || (conversation.buyerId !== user.id && conversation.sellerId !== user.id)) {
          return ack?.({ ok: false, error: { code: 'FORBIDDEN', message: '无权访问该会话' } })
        }
        const readAt = new Date()
        await prisma.message.updateMany({
          where: { conversationId: conversation.id, senderId: { not: user.id }, readAt: null },
          data: { readAt },
        })
        const recipientId = conversation.buyerId === user.id ? conversation.sellerId : conversation.buyerId
        io.to(userRoom(recipientId)).emit('message:read', { conversationId: conversation.id, readAt: readAt.toISOString() })
        io.to(userRoom(user.id)).emit('unread:changed', { conversationId: conversation.id })
        ack?.({ ok: true })
      } catch {
        ack?.({ ok: false, error: { code: 'INTERNAL', message: '操作失败' } })
      }
    })

    socket.on('typing', (payload: unknown) => {
      const conversationId = readConversationId(payload)
      if (!conversationId) return
      if (!socket.rooms.has(conversationRoom(conversationId))) return // 必须先 join（已校验参与者）
      const isTyping = Boolean((payload as { isTyping?: unknown })?.isTyping)
      socket.to(conversationRoom(conversationId)).emit('typing', { conversationId, userId: user.id, isTyping })
    })
  })
}

function readConversationId(payload: unknown): string | null {
  const value = (payload as { conversationId?: unknown })?.conversationId
  return typeof value === 'string' && value.length > 0 ? value : null
}
