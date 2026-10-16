import { z } from 'zod'
import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'

const adminReportActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('RESOLVE') }),
  z.object({ action: z.literal('DISMISS') }),
])

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    await requireAdmin(req)
    const { id } = await ctx.params
    const input = adminReportActionSchema.parse(await readJson(req))

    const report = await prisma.report.findUnique({ where: { id } })
    if (!report) throw new ApiError('NOT_FOUND', '举报不存在')
    if (report.status !== 'PENDING') throw new ApiError('CONFLICT', '该举报已处理过')

    await prisma.report.update({
      where: { id },
      data: { status: input.action === 'RESOLVE' ? 'RESOLVED' : 'DISMISSED', handledAt: new Date() },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
