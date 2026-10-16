import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { reviewSchema } from '@/lib/validators'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const { id } = await ctx.params

    const item = await prisma.item.findUnique({ where: { id } })
    if (!item) throw new ApiError('NOT_FOUND', '商品不存在或已删除')
    if (item.status !== 'SOLD' || !item.buyerId) throw new ApiError('FORBIDDEN', '商品尚未成交，不能评价')
    const isSeller = item.sellerId === user.id
    const isBuyer = item.buyerId === user.id
    if (!isSeller && !isBuyer) throw new ApiError('FORBIDDEN', '只有交易双方能评价')
    const targetId = isSeller ? item.buyerId : item.sellerId

    const { rating, content } = reviewSchema.parse(await readJson(req))

    try {
      await prisma.$transaction(async (tx) => {
        await tx.review.create({
          data: { itemId: id, authorId: user.id, targetId, rating, content: content ?? null },
        })
        // 信誉分以聚合重算，杜绝增量漂移
        const agg = await tx.review.aggregate({
          where: { targetId },
          _avg: { rating: true },
          _count: { _all: true },
        })
        await tx.user.update({
          where: { id: targetId },
          data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count._all },
        })
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError('CONFLICT', '你已经评价过这笔交易了')
      }
      throw err
    }

    const review = await prisma.review.findUniqueOrThrow({
      where: { itemId_authorId: { itemId: id, authorId: user.id } },
      include: { author: { select: { id: true, username: true, avatarUrl: true } } },
    })
    return NextResponse.json({
      review: {
        id: review.id,
        rating: review.rating,
        content: review.content,
        createdAt: review.createdAt.toISOString(),
        author: review.author,
      },
    })
  } catch (err) {
    return errorResponse(err)
  }
}
