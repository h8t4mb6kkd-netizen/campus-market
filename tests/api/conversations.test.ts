import { beforeEach, describe, expect, it } from 'vitest'
import { POST as conversationPOST } from '@/app/api/conversations/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

async function seedItem(overrides: Record<string, unknown> = {}) {
  const seller = await createTestUser()
  const item = await prisma.item.create({
    data: {
      title: '宿舍小冰箱 45L', description: '九成新，制冷正常。', priceCents: 8000,
      category: 'DORM', condition: 'LIKE_NEW_90', location: '南区宿舍', sellerId: seller.id,
      ...overrides,
    },
  })
  return { seller, item }
}

const call = (token: string | null, body: unknown) =>
  conversationPOST(reqWithCookie('http://t/api/conversations', token, { method: 'POST', body: JSON.stringify(body) }))

describe('POST /api/conversations（find-or-create）', () => {
  beforeEach(resetDb)

  it('首次创建成功；再次调用返回同一会话', async () => {
    const { item } = await seedItem()
    const buyer = await createTestUser()
    const token = await createTestSession(buyer.id)
    const first = await (await call(token, { itemId: item.id })).json()
    const second = await (await call(token, { itemId: item.id })).json()
    expect(second.conversation.id).toBe(first.conversation.id)
    expect(await prisma.conversation.count()).toBe(1)
  })

  it('不能和自己的商品发起会话（400）', async () => {
    const { seller, item } = await seedItem()
    const token = await createTestSession(seller.id)
    expect((await call(token, { itemId: item.id })).status).toBe(400)
  })

  it('已售商品：没有历史会话不能新建（409）；已有会话则返回（Review Focus #2）', async () => {
    const { seller, item } = await seedItem({ status: 'SOLD', buyerId: null })
    const buyer = await createTestUser()
    const token = await createTestSession(buyer.id)
    expect((await call(token, { itemId: item.id })).status).toBe(409)

    const conversation = await prisma.conversation.create({
      data: { itemId: item.id, buyerId: buyer.id, sellerId: seller.id },
    })
    const res = await call(token, { itemId: item.id })
    expect(res.status).toBe(200)
    expect((await res.json()).conversation.id).toBe(conversation.id)
  })

  it('未登录 → 401', async () => {
    const { item } = await seedItem()
    expect((await call(null, { itemId: item.id })).status).toBe(401)
  })
})
