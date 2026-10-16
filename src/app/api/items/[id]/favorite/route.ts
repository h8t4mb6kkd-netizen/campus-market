import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { ApiError, errorResponse } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'

async function ensureItemExists(id: string): Promise<void> {
  const item = await prisma.item.findUnique({ where: { id }, select: { id: true } })
  if (!item) throw new ApiError('NOT_FOUND', '商品不存在或已删除')
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const { id } = await ctx.params
    await ensureItemExists(id)

    try {
      await prisma.$transaction([
        prisma.favorite.create({ data: { userId: user.id, itemId: id } }),
        prisma.item.update({ where: { id }, data: { favoriteCount: { increment: 1 } } }),
      ])
    } catch (err) {
      // 已收藏（唯一约束冲突）→ 幂等成功，不加计数
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
    }

    const item = await prisma.item.findUniqueOrThrow({ where: { id }, select: { favoriteCount: true } })
    return NextResponse.json({ favorited: true, favoriteCount: item.favoriteCount })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const { id } = await ctx.params
    await ensureItemExists(id)

    await prisma.$transaction(async (tx) => {
      const deleted = await tx.favorite.deleteMany({ where: { userId: user.id, itemId: id } })
      if (deleted.count > 0) {
        await tx.item.update({ where: { id }, data: { favoriteCount: { decrement: 1 } } })
      }
    })

    const item = await prisma.item.findUniqueOrThrow({ where: { id }, select: { favoriteCount: true } })
    return NextResponse.json({ favorited: false, favoriteCount: item.favoriteCount })
  } catch (err) {
    return errorResponse(err)
  }
}
