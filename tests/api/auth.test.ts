import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as loginPOST } from '@/app/api/auth/login/route'
import { POST as logoutPOST } from '@/app/api/auth/logout/route'
import { POST as registerPOST } from '@/app/api/auth/register/route'
import { parseCookieHeader, requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestUser } from '../helpers/factory'

function jsonReq(url: string, body: unknown, token?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.cookie = `session=${token}`
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) })
}

function tokenFrom(res: Response): string {
  const setCookie = res.headers.get('set-cookie') ?? ''
  return parseCookieHeader(setCookie.replace(/;\s*/g, '; '))['session'] ?? ''
}

describe('POST /api/auth/register', () => {
  beforeEach(resetDb)

  it('注册成功：200 + HttpOnly Cookie + 用户入库', async () => {
    const res = await registerPOST(jsonReq('http://t/api/auth/register', {
      username: '小鹿', email: 'lu@campus.dev', password: 'password123',
    }))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('HttpOnly')
    const token = tokenFrom(res)
    expect(token).not.toBe('')
    expect(await requireUser(jsonReq('http://t/x', {}, token))).toMatchObject({ username: '小鹿' })
  })

  it('邮箱重复 → 409 且 fields.email 有值', async () => {
    await registerPOST(jsonReq('http://t/api/auth/register', { username: '甲甲', email: 'a@campus.dev', password: 'password123' }))
    const res = await registerPOST(jsonReq('http://t/api/auth/register', { username: '乙乙', email: 'a@campus.dev', password: 'password123' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.fields.email).toBeTruthy()
  })

  it('密码 7 位 → 400 VALIDATION 且字段级错误', async () => {
    const res = await registerPOST(jsonReq('http://t/api/auth/register', { username: '丙', email: 'c@campus.dev', password: '1234567' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.password).toBeTruthy()
  })

  it('跨源 Origin 注册被拒绝（403）', async () => {
    const res = await registerPOST(new Request('http://t/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.com', host: 'localhost:3000' },
      body: JSON.stringify({ username: '跨源', email: 'evil@campus.dev', password: 'password123' }),
    }))
    expect(res.status).toBe(403)
  })

  it('并发窗口内的唯一约束冲突（P2002）→ 409 而非 500', async () => {
    const u = await createTestUser()
    // 模拟两个并发请求都通过了 findUnique 检查的竞态窗口
    const spy = vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null)
    const res = await registerPOST(jsonReq('http://t/api/auth/register', {
      username: '新昵称', email: u.email, password: 'password123',
    }))
    spy.mockRestore()
    expect(res.status).toBe(409)
    expect((await res.json()).error.fields).toBeTruthy()
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(resetDb)

  async function seedUser() {
    await registerPOST(jsonReq('http://t/api/auth/register', { username: '小鹿', email: 'lu@campus.dev', password: 'password123' }))
  }

  it('登录成功返回 Cookie', async () => {
    await seedUser()
    const res = await loginPOST(jsonReq('http://t/api/auth/login', { email: 'lu@campus.dev', password: 'password123' }))
    expect(res.status).toBe(200)
    expect(tokenFrom(res)).not.toBe('')
  })

  it('密码错误与邮箱不存在返回同一文案（防枚举）', async () => {
    await seedUser()
    const r1 = await loginPOST(jsonReq('http://t/api/auth/login', { email: 'lu@campus.dev', password: 'wrong-pass' }))
    const r2 = await loginPOST(jsonReq('http://t/api/auth/login', { email: 'nobody@campus.dev', password: 'password123' }))
    expect(r1.status).toBe(401)
    expect(r2.status).toBe(401)
    expect((await r1.json()).error.message).toBe((await r2.json()).error.message)
  })

  it('封禁用户无法登录（403）', async () => {
    await seedUser()
    await prisma.user.updateMany({ data: { status: 'BANNED' } })
    const res = await loginPOST(jsonReq('http://t/api/auth/login', { email: 'lu@campus.dev', password: 'password123' }))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/auth/logout', () => {
  beforeEach(resetDb)

  it('登出销毁会话并清 Cookie', async () => {
    const reg = await registerPOST(jsonReq('http://t/api/auth/register', { username: '小鹿', email: 'lu@campus.dev', password: 'password123' }))
    const token = tokenFrom(reg)
    const res = await logoutPOST(jsonReq('http://t/api/auth/logout', {}, token))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(await prisma.session.count()).toBe(0)
  })
})
