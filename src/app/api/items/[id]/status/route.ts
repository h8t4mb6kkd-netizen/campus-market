import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import type { ItemStatus } from '@/lib/constants'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { applyTransition, canTransition } from '@/lib/state-machine'
import { statusActionSchema } from '@/lib/validators'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const { id } = await ctx.params
    const input = statusActionSchema.parse(await readJson(req))

    const item = await prisma.item.findUnique({ where: { id }, include: { conversations: true } })
    if (!item) throw new ApiError('NOT_FOUND', '商品不存在或已删除')

    const isSeller = item.sellerId === user.id
    const actor = isSeller ? 'SELLER' : user.role === 'ADMIN' ? 'ADMIN' : 'OTHER'
    const status = item.status as ItemStatus
    const reason = canTransition(status, input.action, { actor, delistedBy: item.delistedBy })
    if (reason) throw new ApiError('FORBIDDEN', reason)

    if (input.action === 'MARK_SOLD') {
      const conversation = item.conversations.find((c) => c.buyerId === input.buyerId)
      if (!conversation) throw new ApiError('VALIDATION', '买家必须来自该商品的聊天会话', { buyerId: '没有与该买家的会话' })
      await prisma.$transaction([
        prisma.item.update({
          where: { id },
          data: { status: 'SOLD', buyerId: input.buyerId, soldAt: new Date() },
        }),
        prisma.user.update({ where: { id: item.sellerId }, data: { soldCount: { increment: 1 } } }),
      ])
      return NextResponse.json({ item: { id, status: 'SOLD' } })
    }

    const data: Prisma.ItemUpdateInput = { status: applyTransition(status, input.action) }
    if (input.action === 'DELIST') data.delistedBy = isSeller ? 'USER' : 'ADMIN'
    if (input.action === 'RELIST') data.delistedBy = null
    await prisma.item.update({ where: { id }, data })
    return NextResponse.json({ item: { id, status: data.status } })
  } catch (err) {
    return errorResponse(err)
  }
}
