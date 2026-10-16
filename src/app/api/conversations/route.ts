import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { createConversationSchema } from '@/lib/validators'

export async function POST(req: Request): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const { itemId } = createConversationSchema.parse(await readJson(req))

    const item = await prisma.item.findUnique({ where: { id: itemId } })
    if (!item) throw new ApiError('NOT_FOUND', '商品不存在或已删除')
    if (item.sellerId === user.id) throw new ApiError('VALIDATION', '不能和自己的商品发起会话')

    const existing = await prisma.conversation.findUnique({
      where: { itemId_buyerId: { itemId, buyerId: user.id } },
    })
    if (item.status === 'SOLD' || item.status === 'DELISTED') {
      if (!existing) throw new ApiError('CONFLICT', '该商品已售出或已下架，不能再发起新会话')
      return NextResponse.json({ conversation: { id: existing.id } })
    }

    const conversation = await prisma.conversation.upsert({
      where: { itemId_buyerId: { itemId, buyerId: user.id } },
      create: { itemId, buyerId: user.id, sellerId: item.sellerId },
      update: {},
    })
    return NextResponse.json({ conversation: { id: conversation.id } })
  } catch (err) {
    return errorResponse(err)
  }
}
