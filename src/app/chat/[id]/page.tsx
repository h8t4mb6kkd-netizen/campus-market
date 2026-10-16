import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { messageInclude, toMessageData } from '@/lib/messages'

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser((await cookies()).toString())
  if (!user) redirect(`/login?next=${encodeURIComponent(`/chat/${id}`)}`)

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      item: { select: { id: true, title: true, priceCents: true, images: { orderBy: { sort: 'asc' }, take: 1 } } },
      buyer: true,
      seller: true,
    },
  })
  if (!conversation) notFound()
  if (conversation.buyerId !== user.id && conversation.sellerId !== user.id) notFound()

  const rows = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: messageInclude,
  })
  const other = conversation.buyerId === user.id ? conversation.seller : conversation.buyer

  return (
    <ChatWindow
      conversationId={id}
      currentUserId={user.id}
      other={{
        id: other.id,
        username: other.username,
        avatarUrl: other.avatarUrl,
        verifiedAt: other.verifiedAt ? other.verifiedAt.toISOString() : null,
      }}
      item={{
        id: conversation.item.id,
        title: conversation.item.title,
        priceCents: conversation.item.priceCents,
        coverUrl: conversation.item.images[0]?.url ?? null,
      }}
      initialMessages={rows.reverse().map(toMessageData)}
    />
  )
}
