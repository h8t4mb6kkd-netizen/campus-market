import { beforeEach, describe, expect, it } from 'vitest'
import { GET as itemsGET } from '@/app/api/items/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestUser } from '../helpers/factory'

async function seedItems() {
  const seller = await createTestUser()
  const mk = (title: string, priceCents: number, createdAt: string, overrides: Record<string, unknown> = {}) =>
    prisma.item.create({
      data: {
        title, description: `${title} 的描述文字够长了吧`, priceCents,
        category: 'BOOKS', condition: 'LIKE_NEW_90', location: '东区',
        sellerId: seller.id, createdAt: new Date(createdAt),
        images: { create: [{ url: '/uploads/2026/a.webp', width: 800, height: 600, sort: 0 }] },
        ...overrides,
      },
    })
  await mk('教材甲', 1000, '2026-10-01T10:00:00Z')
  await mk('教材乙', 3000, '2026-10-02T10:00:00Z')
  await mk('数码丙', 2000, '2026-10-03T10:00:00Z')
  await mk('教材丁已售', 500, '2026-10-04T10:00:00Z', { status: 'SOLD' })
  await mk('教材戊下架', 600, '2026-10-05T10:00:00Z', { status: 'DELISTED' })
  return seller
}

function get(query: string): Promise<Response> {
  return itemsGET(new Request(`http://t/api/items?${query}`))
}

describe('GET /api/items', () => {
  beforeEach(resetDb)

  it('默认按最新排序、排除已售/已下架、包含 cover 与 seller', async () => {
    await seedItems()
    const res = await get('')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.items.map((i: { title: string }) => i.title)).toEqual(['数码丙', '教材乙', '教材甲'])
    expect(data.items[0].cover).toMatchObject({ url: '/uploads/2026/a.webp', width: 800, height: 600 })
    expect(data.items[0].seller.username).toBeTruthy()
  })

  it('游标分页：两页无重叠且顺序连续', async () => {
    await seedItems()
    const p1 = await (await get('limit=2')).json()
    expect(p1.items).toHaveLength(2)
    expect(p1.nextCursor).toBeTruthy()
    const p2 = await (await get(`limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`)).json()
    expect(p2.items).toHaveLength(1)
    expect(p2.nextCursor).toBeNull()
    const titles = [...p1.items, ...p2.items].map((i: { title: string }) => i.title)
    expect(new Set(titles).size).toBe(3)
  })

  it('价格升序排序 + 游标翻页', async () => {
    await seedItems()
    const p1 = await (await get('sort=price_asc&limit=2')).json()
    expect(p1.items.map((i: { priceCents: number }) => i.priceCents)).toEqual([1000, 2000])
    const p2 = await (await get(`sort=price_asc&limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`)).json()
    expect(p2.items.map((i: { priceCents: number }) => i.priceCents)).toEqual([3000])
  })

  it('搜索命中标题或描述', async () => {
    await seedItems()
    const byTitle = await (await get('q=' + encodeURIComponent('数码'))).json()
    expect(byTitle.items.map((i: { title: string }) => i.title)).toEqual(['数码丙'])
    const byDesc = await (await get('q=' + encodeURIComponent('的描述文字'))).json()
    expect(byDesc.items).toHaveLength(3)
  })

  it('分类过滤；非法分类 400', async () => {
    await seedItems()
    expect((await (await get('category=BOOKS')).json()).items).toHaveLength(3)
    expect((await get('category=HACK')).status).toBe(400)
  })
})
