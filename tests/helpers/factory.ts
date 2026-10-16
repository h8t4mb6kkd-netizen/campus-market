import { createSession, hashPassword } from '@/lib/auth'
import { prisma } from '@/lib/db'

let seq = 0

export async function createTestUser(overrides: {
  username?: string
  email?: string
  role?: string
  status?: string
  verifiedAt?: Date | null
  campus?: string
} = {}) {
  seq += 1
  return prisma.user.create({
    data: {
      username: overrides.username ?? `用户${seq}`,
      email: overrides.email ?? `user${seq}@campus.dev`,
      passwordHash: await hashPassword('password123'),
      role: overrides.role ?? 'USER',
      status: overrides.status ?? 'ACTIVE',
      verifiedAt: overrides.verifiedAt ?? null,
      campus: overrides.campus ?? null,
    },
  })
}

export async function createTestSession(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return token
}

/** 构造带（或不带）session cookie 的 Request，供 Route Handler 直调测试 */
export function reqWithCookie(url: string, token: string | null, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  if (token) headers.set('cookie', `session=${token}`)
  return new Request(url, { ...init, headers })
}
