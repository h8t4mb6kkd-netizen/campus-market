import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { ApiError, errorResponse } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { messageInclude, toMessageData } from '@/lib/messages'
import { paginationSchema } from '@/lib/validators'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const url = new URL(req.url)

    const conversation = await prisma.conversation.findUnique({ where: { id } })
    // 非成员一律 404，不泄漏会话存在性
    if (!conversation || (conversation.buyerId !== user.id && conversation.sellerId !== user.id)) {
      throw new ApiError('NOT_FOUND', '会话不存在')
    }

    const after = url.searchParams.get('after')
    if (after) {
      const afterDate = new Date(after)
      if (Number.isNaN(afterDate.getTime())) {
        throw new ApiError('VALIDATION', 'after 参数不是合法时间')
      }
      const messages = await prisma.message.findMany({
        where: { conversationId: id, createdAt: { gt: afterDate } },
        orderBy: { createdAt: 'asc' },
        take: 200,
        include: messageInclude,
      })
      return NextResponse.json({ messages: messages.map(toMessageData), nextCursor: null })
    }

    const { cursor, limit } = paginationSchema.parse({
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    })

    let where: Prisma.MessageWhereInput = { conversationId: id }
    if (cursor) {
      const anchor = await prisma.message.findUnique({ where: { id: cursor }, select: { createdAt: true } })
      if (anchor) where = { ...where, createdAt: { lt: anchor.createdAt } }
    }

    const rows = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: messageInclude,
    })
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null

    return NextResponse.json({ messages: page.reverse().map(toMessageData), nextCursor })
  } catch (err) {
    return errorResponse(err)
  }
}
