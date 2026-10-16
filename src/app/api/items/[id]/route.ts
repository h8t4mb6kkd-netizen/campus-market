import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { parseItemInput } from '@/lib/validators'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const { id } = await ctx.params
    const item = await prisma.item.findUnique({ where: { id }, select: { sellerId: true, status: true } })
    if (!item) throw new ApiError('NOT_FOUND', '商品不存在或已删除')
    if (item.sellerId !== user.id) throw new ApiError('FORBIDDEN', '只能编辑自己的商品')
    if (item.status !== 'ON_SALE' && item.status !== 'RESERVED') {
      throw new ApiError('FORBIDDEN', '只有「在售」或「已预订」的商品可以编辑')
    }

    const input = parseItemInput(await readJson(req))
    await prisma.$transaction([
      prisma.item.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          priceCents: input.priceCents,
          negotiable: input.negotiable,
          category: input.category,
          condition: input.condition,
          location: input.location,
        },
      }),
      prisma.itemImage.deleteMany({ where: { itemId: id } }),
      prisma.itemImage.createMany({
        data: input.images.map((img, index) => ({ itemId: id, url: img.url, width: img.width, height: img.height, sort: index })),
      }),
    ])
    return NextResponse.json({ item: { id } })
  } catch (err) {
    return errorResponse(err)
  }
}
