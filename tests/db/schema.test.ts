import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'

describe('数据层冒烟', () => {
  beforeEach(resetDb)

  it('创建用户与商品并关联，默认状态为 ON_SALE', async () => {
    const u = await prisma.user.create({
      data: { username: '小鹿', email: 'lu@campus.dev', passwordHash: 'h' },
    })
    const item = await prisma.item.create({
      data: {
        title: '《数据结构》严蔚敏',
        description: '九成新，无笔记',
        priceCents: 1500,
        category: 'BOOKS',
        condition: 'LIKE_NEW_90',
        location: '东区3号楼',
        sellerId: u.id,
      },
    })
    const found = await prisma.item.findUnique({ where: { id: item.id }, include: { seller: true } })
    expect(found?.seller.username).toBe('小鹿')
    expect(found?.status).toBe('ON_SALE')
  })

  it('会话唯一约束 (itemId, buyerId) 生效', async () => {
    const seller = await prisma.user.create({ data: { username: 's', email: 's@a.com', passwordHash: 'h' } })
    const buyer = await prisma.user.create({ data: { username: 'b', email: 'b@a.com', passwordHash: 'h' } })
    const item = await prisma.item.create({
      data: { title: 't', description: 'd', priceCents: 100, category: 'DIGITAL', condition: 'LIKE_NEW_99', location: 'L', sellerId: seller.id },
    })
    await prisma.conversation.create({ data: { itemId: item.id, buyerId: buyer.id, sellerId: seller.id } })
    await expect(
      prisma.conversation.create({ data: { itemId: item.id, buyerId: buyer.id, sellerId: seller.id } }),
    ).rejects.toThrow()
  })
})
