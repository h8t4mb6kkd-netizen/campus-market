import type { Prisma } from '@prisma/client'
import type { ItemStatus } from '@/lib/constants'
import { prisma } from '@/lib/db'

export type ItemSort = 'latest' | 'price_asc' | 'price_desc'

export const PUBLIC_STATUSES: ItemStatus[] = ['ON_SALE', 'RESERVED']

export interface ItemCardData {
  id: string
  title: string
  priceCents: number
  negotiable: boolean
  location: string
  status: ItemStatus
  cover: { url: string; width: number; height: number } | null
  seller: { id: string; username: string; avatarUrl: string | null; verifiedAt: string | null }
}

const cardInclude = {
  images: { orderBy: { sort: 'asc' }, take: 1 },
  seller: { select: { id: true, username: true, avatarUrl: true, verifiedAt: true } },
} satisfies Prisma.ItemInclude

export async function queryItems(params: {
  category?: string
  q?: string
  sort?: ItemSort
  cursor?: string | null
  limit: number
  sellerId?: string
  statuses?: ItemStatus[]
}) {
  const sort: ItemSort = params.sort ?? 'latest'
  const where: Prisma.ItemWhereInput = { status: { in: params.statuses ?? PUBLIC_STATUSES } }
  if (params.category) where.category = params.category
  if (params.sellerId) where.sellerId = params.sellerId
  if (params.q) {
    where.OR = [{ title: { contains: params.q } }, { description: { contains: params.q } }]
  }

  const cursor = params.cursor ? decodeCursor(params.cursor) : null
  const cursorFilter: Prisma.ItemWhereInput | undefined = cursor
    ? sort === 'latest'
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.v as string) } },
            { createdAt: new Date(cursor.v as string), id: { lt: cursor.id } },
          ],
        }
      : sort === 'price_asc'
        ? {
            OR: [
              { priceCents: { gt: Number(cursor.v) } },
              { priceCents: Number(cursor.v), id: { lt: cursor.id } },
            ],
          }
        : {
            OR: [
              { priceCents: { lt: Number(cursor.v) } },
              { priceCents: Number(cursor.v), id: { lt: cursor.id } },
            ],
          }
    : undefined

  const rows = await prisma.item.findMany({
    where: cursorFilter ? { AND: [where, cursorFilter] } : where,
    orderBy:
      sort === 'latest'
        ? [{ createdAt: 'desc' }, { id: 'desc' }]
        : sort === 'price_asc'
          ? [{ priceCents: 'asc' }, { id: 'desc' }]
          : [{ priceCents: 'desc' }, { id: 'desc' }],
    take: params.limit + 1,
    include: cardInclude,
  })

  const hasMore = rows.length > params.limit
  const items = hasMore ? rows.slice(0, params.limit) : rows
  const last = items.at(-1)
  const nextCursor =
    hasMore && last
      ? encodeCursor(
          sort === 'latest'
            ? { v: last.createdAt.toISOString(), id: last.id }
            : { v: last.priceCents, id: last.id },
        )
      : null

  return { items, nextCursor }
}

interface CursorPayload {
  v: string | number
  id: string
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as CursorPayload
    if (parsed && typeof parsed.id === 'string' && (typeof parsed.v === 'string' || typeof parsed.v === 'number')) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

type ItemRowWithCard = Prisma.ItemGetPayload<{ include: typeof cardInclude }>

export function toItemCardData(row: ItemRowWithCard): ItemCardData {
  const image = row.images[0]
  return {
    id: row.id,
    title: row.title,
    priceCents: row.priceCents,
    negotiable: row.negotiable,
    location: row.location,
    status: row.status as ItemStatus,
    cover: image ? { url: image.url, width: image.width, height: image.height } : null,
    seller: {
      id: row.seller.id,
      username: row.seller.username,
      avatarUrl: row.seller.avatarUrl,
      verifiedAt: row.seller.verifiedAt ? row.seller.verifiedAt.toISOString() : null,
    },
  }
}
