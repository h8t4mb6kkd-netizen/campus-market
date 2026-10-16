import { beforeEach, describe, expect, it } from 'vitest'
import { POST as createItemPOST } from '@/app/api/items/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

const validBody = {
  title: '《数据结构》严蔚敏 九成新',
  description: '东区当面交易，无笔记，封面完好无损。',
  priceYuan: 15,
  negotiable: true,
  category: 'BOOKS',
  condition: 'LIKE_NEW_90',
  location: '东区3号楼',
  images: [{ url: '/uploads/2026/a.webp', width: 800, height: 600 }],
}

describe('POST /api/items', () => {
  beforeEach(resetDb)

  it('发布成功：商品与图片入库、图片顺序保留', async () => {
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    const res = await createItemPOST(reqWithCookie('http://t/api/items', token, {
      method: 'POST',
      body: JSON.stringify({
        ...validBody,
        images: [
          { url: '/uploads/2026/a.webp', width: 800, height: 600 },
          { url: '/uploads/2026/b.webp', width: 600, height: 800 },
        ],
      }),
    }))
    expect(res.status).toBe(200)
    const item = await prisma.item.findFirstOrThrow({ include: { images: { orderBy: { sort: 'asc' } } } })
    expect(item.priceCents).toBe(1500)
    expect(item.status).toBe('ON_SALE')
    expect(item.images.map((i) => i.url)).toEqual(['/uploads/2026/a.webp', '/uploads/2026/b.webp'])
  })

  it('未登录 → 401', async () => {
    const res = await createItemPOST(reqWithCookie('http://t/api/items', null, {
      method: 'POST', body: JSON.stringify(validBody),
    }))
    expect(res.status).toBe(401)
  })

  it('校验失败（价格超上限）→ 400 字段级错误', async () => {
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    const res = await createItemPOST(reqWithCookie('http://t/api/items', token, {
      method: 'POST', body: JSON.stringify({ ...validBody, priceYuan: 100000 }),
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.priceYuan).toBeTruthy()
  })
})
