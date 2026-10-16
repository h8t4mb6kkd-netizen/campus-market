import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { buildSessionCookie, createSession, hashPassword } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { registerSchema } from '@/lib/validators'

export async function POST(req: Request): Promise<Response> {
  try {
    const input = registerSchema.parse(await readJson(req))
    const emailTaken = await prisma.user.findUnique({ where: { email: input.email } })
    if (emailTaken) throw new ApiError('CONFLICT', '该邮箱已注册', { email: '该邮箱已注册' })
    const usernameTaken = await prisma.user.findUnique({ where: { username: input.username } })
    if (usernameTaken) throw new ApiError('CONFLICT', '该昵称已被使用', { username: '该昵称已被使用' })

    const user = await prisma.user.create({
      data: { username: input.username, email: input.email, passwordHash: await hashPassword(input.password) },
    })
    const { token } = await createSession(user.id)
    const res = NextResponse.json({ user: { id: user.id, username: user.username } })
    res.headers.set('Set-Cookie', buildSessionCookie(token))
    return res
  } catch (err) {
    return errorResponse(err)
  }
}
