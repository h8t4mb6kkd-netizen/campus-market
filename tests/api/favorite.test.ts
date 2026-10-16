import { beforeEach, describe, expect, it } from 'vitest'
import { DELETE, PUT } from '@/app/api/items/[id]/favorite/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

async function seedItem() {
  const seller = await createTestUser()
  const item = await prisma.item.create({
    data: {
      title: '捷安特ATX通勤车', description: '八八成新，车况良好。', priceCents: 26000,
      category: 'TRANSPORT', condition: 'LIKE_NEW_80', location: '西区车棚', sellerId: seller.id,
    },
  })
  return item
}

const call = (method: 'PUT' | 'DELETE', id: string, token: string | null) =>
  (method === 'PUT' ? PUT : DELETE)(
    reqWithCookie(`http://t/api/items/${id}/favorite`, token, { method }),
    { params: Promise.resolve({ id }) },
  )

describe('收藏接口', () => {
  beforeEach(resetDb)

  it('PUT 收藏成功：返回 favorited 与 favoriteCount=1', async () => {
    const item = await seedItem()
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    const res = await call('PUT', item.id, token)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ favorited: true, favoriteCount: 1 })
    const fresh = await prisma.item.findUniqueOrThrow({ where: { id: item.id } })
    expect(fresh.favoriteCount).toBe(1)
  })

  it('重复 PUT 幂等：仍是 200，计数不重复加（Review Focus #1）', async () => {
    const item = await seedItem()
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    await call('PUT', item.id, token)
    const res = await call('PUT', item.id, token)
    expect(res.status).toBe(200)
    expect((await res.json()).favoriteCount).toBe(1)
    expect(await prisma.favorite.count()).toBe(1)
  })

  it('DELETE 取消收藏；重复 DELETE 幂等且计数不为负', async () => {
    const item = await seedItem()
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    await call('PUT', item.id, token)
    expect(await (await call('DELETE', item.id, token)).json()).toEqual({ favorited: false, favoriteCount: 0 })
    expect(await (await call('DELETE', item.id, token)).json()).toEqual({ favorited: false, favoriteCount: 0 })
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).favoriteCount).toBe(0)
  })

  it('未登录 → 401', async () => {
    const item = await seedItem()
    expect((await call('PUT', item.id, null)).status).toBe(401)
  })

  it('商品不存在 → 404', async () => {
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    expect((await call('PUT', 'nope', token)).status).toBe(404)
  })
})
