import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { ApiError } from '@/lib/api'
import { prisma } from '@/lib/db'

export const SESSION_COOKIE = 'session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 天
const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000
const BCRYPT_COST = 10

export interface AuthUser {
  id: string
  username: string
  email: string
  avatarUrl: string | null
  role: string // USER | ADMIN
  verifiedAt: Date | null
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** 签发会话：明文 token 只在返回值里出现一次，库里只存哈希 */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } })
  return { token, expiresAt }
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
}

/** 校验 token：不存在/过期/用户被封禁 → null（过期与封禁顺手清理该用户的会话） */
export async function validateSessionToken(token: string): Promise<AuthUser | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { id: session.id } })
    return null
  }
  if (session.user.status === 'BANNED') {
    await prisma.session.deleteMany({ where: { userId: session.userId } })
    return null
  }
  const u = session.user
  return { id: u.id, username: u.username, email: u.email, avatarUrl: u.avatarUrl, role: u.role, verifiedAt: u.verifiedAt }
}

export function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!cookieHeader) return out
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

export function getSessionTokenFromCookieHeader(cookieHeader: string | null): string | null {
  return parseCookieHeader(cookieHeader)[SESSION_COOKIE] ?? null
}

/** Route Handler 用：从 Request 的 cookie 头取当前用户；RSC 页面传 cookies().toString() */
export async function getSessionUser(cookieHeader: string | null): Promise<AuthUser | null> {
  const token = getSessionTokenFromCookieHeader(cookieHeader)
  if (!token) return null
  return validateSessionToken(token)
}

export async function requireUser(req: Request): Promise<AuthUser> {
  const user = await getSessionUser(req.headers.get('cookie'))
  if (!user) throw new ApiError('UNAUTHENTICATED', '请先登录')
  return user
}

export async function requireAdmin(req: Request): Promise<AuthUser> {
  const user = await requireUser(req)
  if (user.role !== 'ADMIN') throw new ApiError('FORBIDDEN', '需要管理员权限')
  return user
}

export function buildSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`
}

export function buildClearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
}
