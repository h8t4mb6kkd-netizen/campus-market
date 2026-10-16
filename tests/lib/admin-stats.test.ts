import { beforeEach, describe, expect, it } from 'vitest'
import { queryDashboardStats } from '@/lib/admin'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestUser } from '../helpers/factory'

describe('queryDashboardStats', () => {
  beforeEach(resetDb)

  it('计数正确、7 天序列长度为 7 且包含今天的增量', async () => {
    const user = await createTestUser()
    await prisma.item.create({
      data: {
        title: '在售商品', description: '这是一个在售商品。', priceCents: 100,
        category: 'OTHER', condition: 'NEW', location: '东区', sellerId: user.id,
      },
    })
    await prisma.item.create({
      data: {
        title: '已售商品', description: '这是一个已售商品。', priceCents: 100,
        category: 'OTHER', condition: 'NEW', location: '东区', sellerId: user.id, status: 'SOLD',
      },
    })
    await prisma.verificationRequest.create({
      data: { userId: user.id, studentNo: '1', proofImageUrl: '/uploads/x.webp' },
    })

    const stats = await queryDashboardStats()
    expect(stats.userCount).toBe(1)
    expect(stats.onSaleCount).toBe(1)
    expect(stats.pendingVerifications).toBe(1)
    expect(stats.pendingReports).toBe(0)
    expect(stats.newItemsByDay).toHaveLength(7)
    expect(stats.newUsersByDay).toHaveLength(7)
    expect(stats.newItemsByDay.at(-1)?.value).toBe(2) // 今天新增 2 件
    expect(stats.newUsersByDay.at(-1)?.value).toBe(1)
  })
})
