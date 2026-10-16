import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { verificationReviewSchema } from '@/lib/validators'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const admin = await requireAdmin(req)
    const { id } = await ctx.params
    const input = verificationReviewSchema.parse(await readJson(req))

    const request = await prisma.verificationRequest.findUnique({ where: { id } })
    if (!request) throw new ApiError('NOT_FOUND', '申请不存在')
    if (request.userId === admin.id) throw new ApiError('FORBIDDEN', '不能审核自己的认证申请')
    if (request.status !== 'PENDING') throw new ApiError('CONFLICT', '该申请已处理过')

    if (input.action === 'APPROVE') {
      await prisma.$transaction([
        prisma.verificationRequest.update({
          where: { id },
          data: { status: 'APPROVED', reviewedAt: new Date() },
        }),
        prisma.user.update({ where: { id: request.userId }, data: { verifiedAt: new Date() } }),
      ])
    } else {
      await prisma.verificationRequest.update({
        where: { id },
        data: { status: 'REJECTED', rejectReason: input.reason, reviewedAt: new Date() },
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
