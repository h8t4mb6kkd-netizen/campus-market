import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { CATEGORIES, type Category } from '@/lib/constants'
import { prisma } from '@/lib/db'
import { queryItems, toItemCardData, type ItemSort } from '@/lib/items'
import { ensureSameOrigin } from '@/lib/origin'
import { paginationSchema, parseItemInput } from '@/lib/validators'

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const { cursor, limit } = paginationSchema.parse({
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    })
    const category = url.searchParams.get('category') ?? undefined
    if (category && !CATEGORIES.includes(category as Category)) {
      throw new ApiError('VALIDATION', '分类不存在')
    }
    const sortParam = url.searchParams.get('sort')
    const sort: ItemSort =
      sortParam === 'price_asc' || sortParam === 'price_desc' ? sortParam : 'latest'
    const q = url.searchParams.get('q')?.trim() || undefined

    const { items, nextCursor } = await queryItems({ category, q, sort, cursor, limit })
    return NextResponse.json({ items: items.map(toItemCardData), nextCursor })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const input = parseItemInput(await readJson(req))
    const item = await prisma.item.create({
      data: {
        title: input.title,
        description: input.description,
        priceCents: input.priceCents,
        negotiable: input.negotiable,
        category: input.category,
        condition: input.condition,
        location: input.location,
        sellerId: user.id,
        images: {
          create: input.images.map((img, index) => ({ url: img.url, width: img.width, height: img.height, sort: index })),
        },
      },
    })
    return NextResponse.json({ item: { id: item.id } })
  } catch (err) {
    return errorResponse(err)
  }
}
