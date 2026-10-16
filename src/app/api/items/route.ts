import { NextResponse } from 'next/server'
import { errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { parseItemInput } from '@/lib/validators'

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
