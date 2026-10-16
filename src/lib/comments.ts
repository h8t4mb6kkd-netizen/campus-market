import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export const commentInclude = {
  author: { select: { id: true, username: true, avatarUrl: true, verifiedAt: true } },
} satisfies Prisma.CommentInclude

export interface CommentData {
  id: string
  content: string
  createdAt: string
  author: { id: string; username: string; avatarUrl: string | null; verifiedAt: string | null }
}

type CommentRow = Prisma.CommentGetPayload<{ include: typeof commentInclude }>

export function toCommentData(row: CommentRow): CommentData {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    author: {
      id: row.author.id,
      username: row.author.username,
      avatarUrl: row.author.avatarUrl,
      verifiedAt: row.author.verifiedAt ? row.author.verifiedAt.toISOString() : null,
    },
  }
}

export async function queryComments(itemId: string, take = 50) {
  return prisma.comment.findMany({
    where: { itemId },
    orderBy: { createdAt: 'desc' },
    take,
    include: commentInclude,
  })
}
