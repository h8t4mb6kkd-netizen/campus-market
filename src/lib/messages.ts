import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export const senderSelect = { id: true, username: true, avatarUrl: true, verifiedAt: true } as const

export const messageInclude = { sender: { select: senderSelect } } satisfies Prisma.MessageInclude

export interface MessageData {
  id: string
  conversationId: string
  type: 'TEXT' | 'IMAGE'
  content: string
  clientId: string | null
  readAt: string | null
  createdAt: string
  sender: { id: string; username: string; avatarUrl: string | null; verifiedAt: string | null }
}

type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>

export function toMessageData(row: MessageRow): MessageData {
  return {
    id: row.id,
    conversationId: row.conversationId,
    type: row.type as MessageData['type'],
    content: row.content,
    clientId: row.clientId,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    sender: {
      id: row.sender.id,
      username: row.sender.username,
      avatarUrl: row.sender.avatarUrl,
      verifiedAt: row.sender.verifiedAt ? row.sender.verifiedAt.toISOString() : null,
    },
  }
}

/** 会话列表（T20 用）：含商品摘要、对方用户、未读数 */
export async function queryConversationsForUser(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
    include: {
      item: { select: { id: true, title: true, priceCents: true, status: true, images: { orderBy: { sort: 'asc' }, take: 1 } } },
      buyer: { select: senderSelect },
      seller: { select: senderSelect },
      _count: { select: { messages: { where: { senderId: { not: userId }, readAt: null } } } },
    },
  })
  return conversations.map((conversation) => ({
    id: conversation.id,
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    lastMessagePreview: conversation.lastMessagePreview,
    unreadCount: conversation._count.messages,
    item: conversation.item,
    other: conversation.buyerId === userId ? conversation.seller : conversation.buyer,
  }))
}

/** 全站未读计数（顶栏红点，T20 用） */
export async function countUnreadMessages(userId: string): Promise<number> {
  return prisma.message.count({
    where: {
      readAt: null,
      senderId: { not: userId },
      conversation: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    },
  })
}
