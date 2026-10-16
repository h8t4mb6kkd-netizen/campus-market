import { beforeEach, describe, expect, it } from 'vitest'
import { PATCH as reportPATCH } from '@/app/api/admin/reports/[id]/route'
import { PATCH as userPATCH } from '@/app/api/admin/users/[id]/route'
import { PATCH as verificationPATCH } from '@/app/api/admin/verifications/[id]/route'
import { createSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

const patch = (route: typeof verificationPATCH, url: string, token: string | null, body: unknown, id: string) =>
  route(reqWithCookie(url, token, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })

describe('认证审核', () => {
  beforeEach(resetDb)

  it('通过：申请 APPROVED 且用户 verifiedAt 置位', async () => {
    const admin = await createTestUser({ role: 'ADMIN' })
    const applicant = await createTestUser()
    const request = await prisma.verificationRequest.create({
      data: { userId: applicant.id, studentNo: '2023010101', proofImageUrl: '/uploads/card.webp' },
    })
    const res = await patch(verificationPATCH, `http://t/api/admin/verifications/${request.id}`, await createTestSession(admin.id), { action: 'APPROVE' }, request.id)
    expect(res.status).toBe(200)
    expect((await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe('APPROVED')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: applicant.id } })).verifiedAt).not.toBeNull()
  })

  it('驳回必须带理由；管理员不能审核自己的申请（Review Focus #5）', async () => {
    const admin = await createTestUser({ role: 'ADMIN' })
    const token = await createTestSession(admin.id)
    const own = await prisma.verificationRequest.create({
      data: { userId: admin.id, studentNo: 'x', proofImageUrl: '/uploads/x.webp' },
    })
    expect((await patch(verificationPATCH, 'http://t/x', token, { action: 'APPROVE' }, own.id)).status).toBe(403)

    const applicant = await createTestUser()
    const request = await prisma.verificationRequest.create({
      data: { userId: applicant.id, studentNo: 'y', proofImageUrl: '/uploads/y.webp' },
    })
    expect((await patch(verificationPATCH, 'http://t/x', token, { action: 'REJECT' }, request.id)).status).toBe(400)
    const rejected = await patch(verificationPATCH, 'http://t/x', token, { action: 'REJECT', reason: '照片不清晰' }, request.id)
    expect(rejected.status).toBe(200)
    const fresh = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } })
    expect(fresh.status).toBe('REJECTED')
    expect(fresh.rejectReason).toBe('照片不清晰')
  })

  it('非管理员 → 403', async () => {
    const user = await createTestUser()
    expect((await patch(verificationPATCH, 'http://t/x', await createTestSession(user.id), { action: 'APPROVE' }, 'any')).status).toBe(403)
  })
})

describe('用户封禁', () => {
  beforeEach(resetDb)

  it('封禁普通用户：状态 BANNED 且 Session 全清', async () => {
    const admin = await createTestUser({ role: 'ADMIN' })
    const target = await createTestUser()
    await createSession(target.id)
    const res = await patch(userPATCH, 'http://t/x', await createTestSession(admin.id), { action: 'BAN' }, target.id)
    expect(res.status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe('BANNED')
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0)
  })

  it('不能封禁管理员（含自己）→ 403（Review Focus #5）', async () => {
    const admin = await createTestUser({ role: 'ADMIN' })
    const anotherAdmin = await createTestUser({ role: 'ADMIN' })
    const token = await createTestSession(admin.id)
    expect((await patch(userPATCH, 'http://t/x', token, { action: 'BAN' }, admin.id)).status).toBe(403)
    expect((await patch(userPATCH, 'http://t/x', token, { action: 'BAN' }, anotherAdmin.id)).status).toBe(403)
  })

  it('解封恢复 ACTIVE', async () => {
    const admin = await createTestUser({ role: 'ADMIN' })
    const target = await createTestUser({ status: 'BANNED' })
    const res = await patch(userPATCH, 'http://t/x', await createTestSession(admin.id), { action: 'UNBAN' }, target.id)
    expect(res.status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe('ACTIVE')
  })
})

describe('举报处理', () => {
  beforeEach(resetDb)

  it('受理与驳回都写 handledAt', async () => {
    const admin = await createTestUser({ role: 'ADMIN' })
    const reporter = await createTestUser()
    const target = await createTestUser()
    const token = await createTestSession(admin.id)
    const report = await prisma.report.create({
      data: { reporterId: reporter.id, targetType: 'USER', targetId: target.id, reason: '骚扰信息' },
    })
    expect((await patch(reportPATCH, 'http://t/x', token, { action: 'RESOLVE' }, report.id)).status).toBe(200)
    const fresh = await prisma.report.findUniqueOrThrow({ where: { id: report.id } })
    expect(fresh.status).toBe('RESOLVED')
    expect(fresh.handledAt).not.toBeNull()
  })
})
