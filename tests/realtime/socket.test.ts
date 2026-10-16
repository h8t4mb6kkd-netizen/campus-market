import { io, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser } from '../helpers/factory'
import { startTestServer, TEST_BASE_URL } from '../helpers/server'

let server: { stop: () => Promise<void> }

function connect(token: string | null): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(TEST_BASE_URL, {
      transports: ['websocket'],
      extraHeaders: token ? { cookie: `session=${token}` } : {},
      reconnection: false,
    })
    socket.on('connect', () => resolve(socket))
    socket.on('connect_error', (err) => reject(err))
  })
}

function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => socket.emit(event, payload, resolve))
}

async function seedConversation() {
  const seller = await createTestUser()
  const buyer = await createTestUser()
  const item = await prisma.item.create({
    data: {
      title: 'iPad 9代 64G', description: '自用一年，成色很好。', priceCents: 125000,
      category: 'DIGITAL', condition: 'LIKE_NEW_90', location: '东区', sellerId: seller.id,
    },
  })
  const conversation = await prisma.conversation.create({
    data: { itemId: item.id, buyerId: buyer.id, sellerId: seller.id },
  })
  return { seller, buyer, item, conversation }
}

beforeAll(async () => {
  server = await startTestServer()
}, 150_000)

afterAll(async () => {
  await server.stop()
})

describe('Socket.IO 实时层', () => {
  beforeEach(resetDb)

  it('无 cookie 连接被拒绝（UNAUTHENTICATED）', async () => {
    await expect(connect(null)).rejects.toThrow(/UNAUTHENTICATED/)
  })

  it('带会话连接成功；非参与者 join 被拒；参与者 join 成功', async () => {
    const { buyer, conversation } = await seedConversation()
    const stranger = await createTestUser()

    const buyerSocket = await connect(await createTestSession(buyer.id))
    const strangerSocket = await connect(await createTestSession(stranger.id))

    const denied = await emitAck<{ ok: boolean; error?: { code: string } }>(strangerSocket, 'conversation:join', { conversationId: conversation.id })
    expect(denied.ok).toBe(false)
    expect(denied.error?.code).toBe('FORBIDDEN')

    expect((await emitAck<{ ok: boolean }>(buyerSocket, 'conversation:join', { conversationId: conversation.id })).ok).toBe(true)

    buyerSocket.disconnect()
    strangerSocket.disconnect()
  })

  it('发送消息：ack 返回消息、落库、对方实时收到 message:new、会话预览更新', async () => {
    const { seller, buyer, conversation } = await seedConversation()
    const buyerSocket = await connect(await createTestSession(buyer.id))
    const sellerSocket = await connect(await createTestSession(seller.id))
    await emitAck(buyerSocket, 'conversation:join', { conversationId: conversation.id })

    const received = new Promise<{ message: { content: string } }>((resolve) => {
      sellerSocket.on('message:new', resolve)
    })

    const ack = await emitAck<{ ok: boolean; message: { id: string; content: string } }>(buyerSocket, 'message:send', {
      conversationId: conversation.id, type: 'TEXT', content: '同学，还在吗？', clientId: 'client-1',
    })
    expect(ack.ok).toBe(true)
    expect(ack.message.content).toBe('同学，还在吗？')

    const pushed = await received
    expect(pushed.message.content).toBe('同学，还在吗？')

    const stored = await prisma.message.findFirstOrThrow()
    expect(stored.content).toBe('同学，还在吗？')
    const freshConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })
    expect(freshConversation.lastMessagePreview).toBe('同学，还在吗？')

    buyerSocket.disconnect()
    sellerSocket.disconnect()
  })

  it('会话首条消息：对方同时收到 conversation:new', async () => {
    const { seller, buyer, conversation } = await seedConversation()
    const buyerSocket = await connect(await createTestSession(buyer.id))
    const sellerSocket = await connect(await createTestSession(seller.id))
    await emitAck(buyerSocket, 'conversation:join', { conversationId: conversation.id })

    const newConversation = new Promise<{ conversation: { id: string } }>((resolve) => {
      sellerSocket.on('conversation:new', resolve)
    })
    await emitAck(buyerSocket, 'message:send', {
      conversationId: conversation.id, type: 'TEXT', content: '第一条消息', clientId: 'first-1',
    })
    const event = await newConversation
    expect(event.conversation.id).toBe(conversation.id)

    buyerSocket.disconnect()
    sellerSocket.disconnect()
  })

  it('相同 clientId 重发幂等：不产生第二条消息', async () => {
    const { buyer, conversation } = await seedConversation()
    const buyerSocket = await connect(await createTestSession(buyer.id))
    await emitAck(buyerSocket, 'conversation:join', { conversationId: conversation.id })

    const payload = { conversationId: conversation.id, type: 'TEXT', content: '你好', clientId: 'dup-1' }
    const first = await emitAck<{ message: { id: string } }>(buyerSocket, 'message:send', payload)
    const second = await emitAck<{ message: { id: string } }>(buyerSocket, 'message:send', payload)
    expect(second.message.id).toBe(first.message.id)
    expect(await prisma.message.count()).toBe(1)

    buyerSocket.disconnect()
  })

  it('已读回执：对方收到 message:read 且未读清零', async () => {
    const { seller, buyer, conversation } = await seedConversation()
    const buyerSocket = await connect(await createTestSession(buyer.id))
    const sellerSocket = await connect(await createTestSession(seller.id))
    await emitAck(buyerSocket, 'conversation:join', { conversationId: conversation.id })
    await emitAck(sellerSocket, 'conversation:join', { conversationId: conversation.id })

    await emitAck(buyerSocket, 'message:send', { conversationId: conversation.id, type: 'TEXT', content: '在吗', clientId: 'm1' })

    const readEvent = new Promise<{ conversationId: string }>((resolve) => {
      buyerSocket.on('message:read', resolve)
    })
    const unreadEvent = new Promise<{ conversationId: string }>((resolve) => {
      sellerSocket.on('unread:changed', resolve)
    })
    await emitAck(sellerSocket, 'message:read', { conversationId: conversation.id })
    const event = await readEvent
    expect(event.conversationId).toBe(conversation.id)
    const ownEvent = await unreadEvent
    expect(ownEvent.conversationId).toBe(conversation.id)
    expect(await prisma.message.count({ where: { readAt: null } })).toBe(0)

    buyerSocket.disconnect()
    sellerSocket.disconnect()
  })

  it('typing 转发：未 join 会话房间的 socket 不会收到', async () => {
    const { seller, buyer, conversation } = await seedConversation()
    const buyerSocket = await connect(await createTestSession(buyer.id))
    const sellerSocket = await connect(await createTestSession(seller.id))
    await emitAck(buyerSocket, 'conversation:join', { conversationId: conversation.id })

    const typingEvents: unknown[] = []
    sellerSocket.on('typing', (payload) => typingEvents.push(payload))
    buyerSocket.emit('typing', { conversationId: conversation.id, isTyping: true })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(typingEvents).toHaveLength(0) // seller 未 join → 收不到

    await emitAck(sellerSocket, 'conversation:join', { conversationId: conversation.id })
    buyerSocket.emit('typing', { conversationId: conversation.id, isTyping: true })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(typingEvents).toHaveLength(1)

    buyerSocket.disconnect()
    sellerSocket.disconnect()
  })
})
