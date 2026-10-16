import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import {
  buildClearSessionCookie, buildSessionCookie, createSession, destroySession,
  hashPassword, requireAdmin, requireUser, validateSessionToken, verifyPassword,
} from '@/lib/auth'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

describe('密码哈希', () => {
  it('哈希可验证、错误密码拒绝、明文不出现在哈希里', async () => {
    const hash = await hashPassword('password123')
    expect(hash).not.toContain('password123')
    expect(await verifyPassword('password123', hash)).toBe(true)
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
  })
})

describe('会话', () => {
  beforeEach(resetDb)

  it('签发后库里只有哈希，明文 token 可校验', async () => {
    const u = await createTestUser()
    const { token } = await createSession(u.id)
    const stored = await prisma.session.findFirst({ where: { userId: u.id } })
    expect(stored?.tokenHash).not.toBe(token)
    expect(await validateSessionToken(token)).toMatchObject({ id: u.id, username: u.username })
  })

  it('过期会话返回 null 并被清除', async () => {
    const u = await createTestUser()
    const { token } = await createSession(u.id)
    await prisma.session.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect(await validateSessionToken(token)).toBeNull()
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0)
  })

  it('封禁用户的会话立即失效并被清理', async () => {
    const u = await createTestUser()
    const { token } = await createSession(u.id)
    await prisma.user.update({ where: { id: u.id }, data: { status: 'BANNED' } })
    expect(await validateSessionToken(token)).toBeNull()
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0)
  })

  it('登出后 token 失效', async () => {
    const u = await createTestUser()
    const { token } = await createSession(u.id)
    await destroySession(token)
    expect(await validateSessionToken(token)).toBeNull()
  })
})

describe('requireUser / requireAdmin', () => {
  beforeEach(resetDb)

  it('无 cookie → UNAUTHENTICATED', async () => {
    await expect(requireUser(reqWithCookie('http://t/api', null))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('普通用户被 requireAdmin 拒绝（FORBIDDEN）', async () => {
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    await expect(requireAdmin(reqWithCookie('http://t/api', token))).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('管理员通过 requireAdmin', async () => {
    const u = await createTestUser({ role: 'ADMIN' })
    const token = await createTestSession(u.id)
    expect((await requireAdmin(reqWithCookie('http://t/api', token))).role).toBe('ADMIN')
  })
})

describe('Cookie 构造', () => {
  it('会话 Cookie 带 HttpOnly / SameSite=Lax / Max-Age=2592000', () => {
    const c = buildSessionCookie('tok')
    expect(c).toContain('session=tok')
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Lax')
    expect(c).toContain('Max-Age=2592000')
  })
  it('清除 Cookie Max-Age=0', () => {
    expect(buildClearSessionCookie()).toContain('Max-Age=0')
  })
})
