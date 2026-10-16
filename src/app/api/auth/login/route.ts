import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { buildSessionCookie, createSession, verifyPassword } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { loginSchema } from '@/lib/validators'

export async function POST(req: Request): Promise<Response> {
  try {
    const input = loginSchema.parse(await readJson(req))
    const user = await prisma.user.findUnique({ where: { email: input.email } })
    // 统一文案：邮箱不存在与密码错误不区分（防枚举）
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new ApiError('UNAUTHENTICATED', '邮箱或密码错误')
    }
    if (user.status === 'BANNED') {
      throw new ApiError('FORBIDDEN', '账号已被封禁，如有疑问请联系管理员')
    }
    const { token } = await createSession(user.id)
    const res = NextResponse.json({ user: { id: user.id, username: user.username } })
    res.headers.set('Set-Cookie', buildSessionCookie(token))
    return res
  } catch (err) {
    return errorResponse(err)
  }
}
