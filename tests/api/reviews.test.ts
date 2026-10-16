import { beforeEach, describe, expect, it } from 'vitest'
import { POST as reviewPOST } from '@/app/api/items/[id]/reviews/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

async function seedSoldItem() {
  const seller = await createTestUser()
  const buyer = await createTestUser()
  const item = await prisma.item.create({
    data: {
      title: '雅马哈F310 民谣吉他', description: '带琴包，音色很好。', priceCents: 35000,
      category: 'INSTRUMENTS', condition: 'LIKE_NEW_90', location: '南区宿舍',
      sellerId: seller.id, buyerId: buyer.id, status: 'SOLD', soldAt: new Date(),
    },
  })
  return { seller, buyer, item }
}

const call = (id: string, token: string | null, body: unknown) =>
  reviewPOST(reqWithCookie(`http://t/api/items/${id}/reviews`, token, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })

describe('POST /api/items/[id]/reviews', () => {
  beforeEach(resetDb)

  it('买家评价卖家：成功且信誉分重算', async () => {
    const { seller, buyer, item } = await seedSoldItem()
    const token = await createTestSession(buyer.id)
    const res = await call(item.id, token, { rating: 5, content: '发货快，成色和描述一致' })
    expect(res.status).toBe(200)
    const freshSeller = await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })
    expect(freshSeller.ratingAvg).toBe(5)
    expect(freshSeller.ratingCount).toBe(1)
    const review = await prisma.review.findFirstOrThrow()
    expect(review.authorId).toBe(buyer.id)
    expect(review.targetId).toBe(seller.id)
  })

  it('重复评价 → 409（Review Focus #1）', async () => {
    const { buyer, item } = await seedSoldItem()
    const token = await createTestSession(buyer.id)
    await call(item.id, token, { rating: 5 })
    const res = await call(item.id, token, { rating: 1 })
    expect(res.status).toBe(409)
    expect(await prisma.review.count()).toBe(1)
  })

  it('双方互评后信誉分取平均', async () => {
    const { seller, buyer, item } = await seedSoldItem()
    await call(item.id, await createTestSession(buyer.id), { rating: 5 })
    await call(item.id, await createTestSession(seller.id), { rating: 3 })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).ratingAvg).toBe(5)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).ratingAvg).toBe(3)
  })

  it('非交易双方 → 403；未成交商品 → 403', async () => {
    const { seller, buyer, item } = await seedSoldItem()
    const stranger = await createTestUser()
    expect((await call(item.id, await createTestSession(stranger.id), { rating: 5 })).status).toBe(403)

    const unsoldItem = await prisma.item.create({
      data: {
        title: '还没卖出去的商品', description: '在售中，尚未成交。', priceCents: 1000,
        category: 'OTHER', condition: 'NEW', location: '东区', sellerId: seller.id,
      },
    })
    expect((await call(unsoldItem.id, await createTestSession(buyer.id), { rating: 5 })).status).toBe(403)
  })
})
