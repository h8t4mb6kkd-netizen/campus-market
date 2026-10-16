import { beforeEach, describe, expect, it } from 'vitest'
import { POST as verificationPOST } from '@/app/api/verifications/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

const validBody = { studentNo: '2023010101', proofImageUrl: '/uploads/2026/card.webp' }

const call = (token: string | null, body: unknown) =>
  verificationPOST(reqWithCookie('http://t/api/verifications', token, { method: 'POST', body: JSON.stringify(body) }))

describe('POST /api/verifications', () => {
  beforeEach(resetDb)

  it('提交成功：PENDING 入库', async () => {
    const user = await createTestUser()
    const res = await call(await createTestSession(user.id), validBody)
    expect(res.status).toBe(200)
    expect((await res.json()).request.status).toBe('PENDING')
    expect(await prisma.verificationRequest.count({ where: { userId: user.id } })).toBe(1)
  })

  it('已有待审核申请时重复提交 → 409（Review Focus #1）', async () => {
    const user = await createTestUser()
    const token = await createTestSession(user.id)
    await call(token, validBody)
    expect((await call(token, validBody)).status).toBe(409)
    expect(await prisma.verificationRequest.count()).toBe(1)
  })

  it('已认证用户再提交 → 409', async () => {
    const user = await createTestUser({ verifiedAt: new Date() })
    expect((await call(await createTestSession(user.id), validBody)).status).toBe(409)
  })

  it('被驳回后可以重新提交', async () => {
    const user = await createTestUser()
    const token = await createTestSession(user.id)
    await prisma.verificationRequest.create({
      data: { userId: user.id, studentNo: '1', proofImageUrl: '/uploads/x.webp', status: 'REJECTED', rejectReason: '照片不清晰' },
    })
    expect((await call(token, validBody)).status).toBe(200)
  })

  it('学号过短 → 400；未登录 → 401', async () => {
    const user = await createTestUser()
    const token = await createTestSession(user.id)
    expect((await call(token, { ...validBody, studentNo: '1' })).status).toBe(400)
    expect((await call(null, validBody)).status).toBe(401)
  })
})
