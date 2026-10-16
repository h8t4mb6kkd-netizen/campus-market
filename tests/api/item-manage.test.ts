import { beforeEach, describe, expect, it } from 'vitest'
import { PATCH as editPATCH } from '@/app/api/items/[id]/route'
import { PATCH as statusPATCH } from '@/app/api/items/[id]/status/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

const editBody = {
  title: '《数据结构》严蔚敏 九成新（已降价）',
  description: '东区当面交易，无笔记，封面完好无损。',
  priceYuan: 12,
  negotiable: false,
  category: 'BOOKS',
  condition: 'LIKE_NEW_90',
  location: '东区3号楼',
  images: [{ url: '/uploads/2026/new.webp', width: 400, height: 300 }],
}

async function seedItem(overrides: Record<string, unknown> = {}) {
  const seller = await createTestUser()
  const item = await prisma.item.create({
    data: {
      title: '《数据结构》九成新', description: '东区交易，无笔记。原价出。', priceCents: 1500,
      category: 'BOOKS', condition: 'LIKE_NEW_90', location: '东区3号楼', sellerId: seller.id,
      images: { create: [{ url: '/uploads/2026/a.webp', width: 800, height: 600, sort: 0 }] },
      ...overrides,
    },
  })
  return { seller, item }
}

const editCall = (id: string, token: string | null, body: unknown) =>
  editPATCH(reqWithCookie(`http://t/api/items/${id}`, token, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })

const statusCall = (id: string, token: string | null, body: unknown) =>
  statusPATCH(reqWithCookie(`http://t/api/items/${id}/status`, token, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })

describe('PATCH /api/items/[id]（编辑）', () => {
  beforeEach(resetDb)

  it('卖家编辑成功：字段更新、图片整体替换', async () => {
    const { seller, item } = await seedItem()
    const token = await createTestSession(seller.id)
    const res = await editCall(item.id, token, editBody)
    expect(res.status).toBe(200)
    const fresh = await prisma.item.findUniqueOrThrow({ where: { id: item.id }, include: { images: true } })
    expect(fresh.priceCents).toBe(1200)
    expect(fresh.images).toHaveLength(1)
    expect(fresh.images[0].url).toBe('/uploads/2026/new.webp')
  })

  it('已售出商品不可编辑 → 403（Review Focus #2）', async () => {
    const { seller, item } = await seedItem({ status: 'SOLD' })
    const token = await createTestSession(seller.id)
    expect((await editCall(item.id, token, editBody)).status).toBe(403)
  })

  it('非本人编辑 → 403', async () => {
    const { item } = await seedItem()
    const other = await createTestUser()
    const token = await createTestSession(other.id)
    expect((await editCall(item.id, token, editBody)).status).toBe(403)
  })
})

describe('PATCH /api/items/[id]/status（状态流转）', () => {
  beforeEach(resetDb)

  it('卖家预订 → RESERVED；路人预订 → 403', async () => {
    const { seller, item } = await seedItem()
    const token = await createTestSession(seller.id)
    expect((await statusCall(item.id, token, { action: 'RESERVE' })).status).toBe(200)
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('RESERVED')

    const other = await createTestUser()
    const otherToken = await createTestSession(other.id)
    expect((await statusCall(item.id, otherToken, { action: 'UNRESERVE' })).status).toBe(403)
  })

  it('卖家下架 → delistedBy=USER，可重新上架', async () => {
    const { seller, item } = await seedItem()
    const token = await createTestSession(seller.id)
    await statusCall(item.id, token, { action: 'DELIST' })
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).delistedBy).toBe('USER')
    expect((await statusCall(item.id, token, { action: 'RELIST' })).status).toBe(200)
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('ON_SALE')
  })

  it('管理员下架的商品卖家不能重新上架（Review Focus #2）', async () => {
    const { seller, item } = await seedItem({ status: 'DELISTED', delistedBy: 'ADMIN' })
    const token = await createTestSession(seller.id)
    const res = await statusCall(item.id, token, { action: 'RELIST' })
    expect(res.status).toBe(403)
  })

  it('标记已售：buyerId 必须来自该商品会话，成功后写 buyerId/soldAt 且卖家 soldCount+1', async () => {
    const { seller, item } = await seedItem()
    const buyer = await createTestUser()
    const token = await createTestSession(seller.id)

    // 没有会话时拒绝
    expect((await statusCall(item.id, token, { action: 'MARK_SOLD', buyerId: buyer.id })).status).toBe(400)

    await prisma.conversation.create({ data: { itemId: item.id, buyerId: buyer.id, sellerId: seller.id } })
    const res = await statusCall(item.id, token, { action: 'MARK_SOLD', buyerId: buyer.id })
    expect(res.status).toBe(200)
    const fresh = await prisma.item.findUniqueOrThrow({ where: { id: item.id } })
    expect(fresh.status).toBe('SOLD')
    expect(fresh.buyerId).toBe(buyer.id)
    expect(fresh.soldAt).not.toBeNull()
    expect((await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).soldCount).toBe(1)
  })

  it('SOLD 终态：任何操作都拒绝', async () => {
    const { seller, item } = await seedItem({ status: 'SOLD' })
    const token = await createTestSession(seller.id)
    expect((await statusCall(item.id, token, { action: 'DELIST' })).status).toBe(403)
    expect((await statusCall(item.id, token, { action: 'MARK_SOLD', buyerId: 'x' })).status).toBe(403)
  })
})
