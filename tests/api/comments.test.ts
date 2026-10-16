import { beforeEach, describe, expect, it } from 'vitest'
import { POST as commentPOST } from '@/app/api/items/[id]/comments/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

async function seedItem() {
  const seller = await createTestUser()
  const item = await prisma.item.create({
    data: {
      title: '《数据结构》九成新', description: '东区交易，无笔记。', priceCents: 1500,
      category: 'BOOKS', condition: 'LIKE_NEW_90', location: '东区3号楼', sellerId: seller.id,
    },
  })
  return { seller, item }
}

const call = (id: string, token: string | null, body: unknown) =>
  commentPOST(
    reqWithCookie(`http://t/api/items/${id}/comments`, token, { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  )

describe('POST /api/items/[id]/comments', () => {
  beforeEach(resetDb)

  it('登录用户留言成功并返回作者信息', async () => {
    const { item } = await seedItem()
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    const res = await call(item.id, token, { content: '同学，还在吗？' })
    expect(res.status).toBe(200)
    const { comment } = await res.json()
    expect(comment.content).toBe('同学，还在吗？')
    expect(comment.author.username).toBe(u.username)
    expect(await prisma.comment.count({ where: { itemId: item.id } })).toBe(1)
  })

  it('未登录 → 401；空内容 → 400', async () => {
    const { item } = await seedItem()
    expect((await call(item.id, null, { content: 'hi' })).status).toBe(401)
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    expect((await call(item.id, token, { content: '   ' })).status).toBe(400)
  })

  it('商品不存在 → 404', async () => {
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    expect((await call('no-such-id', token, { content: '你好呀' })).status).toBe(404)
  })

  it('HTML 原样入库（渲染端负责转义，不在这里做清洗）', async () => {
    const { item } = await seedItem()
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    const evil = '<img src=x onerror="alert(1)">'
    await call(item.id, token, { content: evil })
    const row = await prisma.comment.findFirstOrThrow({ where: { itemId: item.id } })
    expect(row.content).toBe(evil)
  })
})
