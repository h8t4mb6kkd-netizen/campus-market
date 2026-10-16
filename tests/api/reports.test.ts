import { beforeEach, describe, expect, it } from 'vitest'
import { POST as reportPOST } from '@/app/api/reports/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

const call = (token: string | null, body: unknown) =>
  reportPOST(reqWithCookie('http://t/api/reports', token, { method: 'POST', body: JSON.stringify(body) }))

describe('POST /api/reports', () => {
  beforeEach(resetDb)

  it('举报商品成功入库 PENDING', async () => {
    const seller = await createTestUser()
    const item = await prisma.item.create({
      data: {
        title: '违规商品', description: '这是个违规商品描述。', priceCents: 100,
        category: 'OTHER', condition: 'NEW', location: '东区', sellerId: seller.id,
      },
    })
    const reporter = await createTestUser()
    const res = await call(await createTestSession(reporter.id), {
      targetType: 'ITEM', targetId: item.id, reason: '疑似违禁物品',
    })
    expect(res.status).toBe(200)
    expect(await prisma.report.count({ where: { status: 'PENDING' } })).toBe(1)
  })

  it('24 小时内重复举报同一目标 → 409', async () => {
    const seller = await createTestUser()
    const reporter = await createTestUser()
    const token = await createTestSession(reporter.id)
    const body = { targetType: 'USER', targetId: seller.id, reason: '骚扰信息不断' }
    expect((await call(token, body)).status).toBe(200)
    expect((await call(token, body)).status).toBe(409)
    expect(await prisma.report.count()).toBe(1)
  })

  it('目标不存在 → 404；理由过短 → 400；未登录 → 401', async () => {
    const reporter = await createTestUser()
    const token = await createTestSession(reporter.id)
    expect((await call(token, { targetType: 'ITEM', targetId: 'nope', reason: '虚假商品信息' })).status).toBe(404)
    expect((await call(token, { targetType: 'ITEM', targetId: 'nope', reason: '短' })).status).toBe(400)
    expect((await call(null, { targetType: 'ITEM', targetId: 'nope', reason: '虚假商品信息' })).status).toBe(401)
  })
})
