import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { reportSchema } from '@/lib/validators'

const DAY_MS = 24 * 60 * 60 * 1000

export async function POST(req: Request): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const input = reportSchema.parse(await readJson(req))

    const target =
      input.targetType === 'ITEM'
        ? await prisma.item.findUnique({ where: { id: input.targetId }, select: { id: true } })
        : await prisma.user.findUnique({ where: { id: input.targetId }, select: { id: true } })
    if (!target) throw new ApiError('NOT_FOUND', '举报目标不存在')

    const recent = await prisma.report.findFirst({
      where: {
        reporterId: user.id,
        targetType: input.targetType,
        targetId: input.targetId,
        createdAt: { gt: new Date(Date.now() - DAY_MS) },
      },
    })
    if (recent) throw new ApiError('CONFLICT', '你已举报过该对象，管理员会尽快处理')

    await prisma.report.create({
      data: { reporterId: user.id, targetType: input.targetType, targetId: input.targetId, reason: input.reason },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
