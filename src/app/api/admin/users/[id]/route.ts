import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { userBanSchema } from '@/lib/validators'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    await requireAdmin(req)
    const { id } = await ctx.params
    const input = userBanSchema.parse(await readJson(req))

    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) throw new ApiError('NOT_FOUND', '用户不存在')

    if (input.action === 'BAN') {
      if (target.role === 'ADMIN') throw new ApiError('FORBIDDEN', '不能封禁管理员账号') // 防自锁（Review Focus #5）
      await prisma.$transaction([
        prisma.user.update({ where: { id }, data: { status: 'BANNED' } }),
        prisma.session.deleteMany({ where: { userId: id } }), // 现有登录态立即失效
      ])
    } else {
      await prisma.user.update({ where: { id }, data: { status: 'ACTIVE' } })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
