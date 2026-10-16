import { beforeEach, describe, expect, it } from 'vitest'
import { GET as messagesGET } from '@/app/api/conversations/[id]/messages/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

async function seedConversationWithMessages(count: number) {
  const seller = await createTestUser()
  const buyer = await createTestUser()
  const item = await prisma.item.create({
    data: {
      title: '雅马哈F310', description: '带琴包，音色很好。', priceCents: 35000,
      category: 'INSTRUMENTS', condition: 'LIKE_NEW_90', location: '南区宿舍', sellerId: seller.id,
    },
  })
  const conversation = await prisma.conversation.create({
    data: { itemId: item.id, buyerId: buyer.id, sellerId: seller.id },
  })
  for (let i = 1; i <= count; i += 1) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: buyer.id,
        type: 'TEXT',
        content: `消息${i}`,
        clientId: `c${i}`,
        createdAt: new Date(Date.UTC(2026, 9, 16, 10, i, 0)), // 每条晚 1 分钟，顺序稳定
        readAt: i < count ? new Date() : null,
      },
    })
  }
  return { seller, buyer, conversation }
}

const call = (id: string, token: string | null, query = '') =>
  messagesGET(reqWithCookie(`http://t/api/conversations/${id}/messages?${query}`, token), { params: Promise.resolve({ id }) })

describe('GET /api/conversations/[id]/messages', () => {
  beforeEach(resetDb)

  it('默认返回最近一页（升序）并给出 nextCursor', async () => {
    const { buyer, conversation } = await seedConversationWithMessages(5)
    const token = await createTestSession(buyer.id)
    const res = await call(conversation.id, token, 'limit=2')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.messages.map((m: { content: string }) => m.content)).toEqual(['消息4', '消息5'])
    expect(data.nextCursor).toBeTruthy()
  })

  it('用 cursor 翻更早，两页无重叠', async () => {
    const { buyer, conversation } = await seedConversationWithMessages(5)
    const token = await createTestSession(buyer.id)
    const p1 = await (await call(conversation.id, token, 'limit=2')).json()
    const p2 = await (await call(conversation.id, token, `limit=2&cursor=${p1.nextCursor}`)).json()
    expect(p2.messages.map((m: { content: string }) => m.content)).toEqual(['消息2', '消息3'])
    const p3 = await (await call(conversation.id, token, `limit=2&cursor=${p2.nextCursor}`)).json()
    expect(p3.messages.map((m: { content: string }) => m.content)).toEqual(['消息1'])
    expect(p3.nextCursor).toBeNull()
  })

  it('after 参数返回增量（断线重连用）', async () => {
    const { buyer, conversation } = await seedConversationWithMessages(3)
    const token = await createTestSession(buyer.id)
    const after = encodeURIComponent(new Date(Date.UTC(2026, 9, 16, 10, 1, 0)).toISOString())
    const data = await (await call(conversation.id, token, `after=${after}`)).json()
    expect(data.messages.map((m: { content: string }) => m.content)).toEqual(['消息2', '消息3'])
  })

  it('非会话成员 → 404；未登录 → 401', async () => {
    const { conversation } = await seedConversationWithMessages(1)
    const stranger = await createTestUser()
    expect((await call(conversation.id, await createTestSession(stranger.id))).status).toBe(404)
    expect((await call(conversation.id, null)).status).toBe(401)
  })
})
