import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ConversationListLive } from '@/components/chat/ConversationListLive'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { getSessionUser } from '@/lib/auth'
import { formatPrice, formatRelativeTime } from '@/lib/format'
import { queryConversationsForUser } from '@/lib/messages'

export default async function ChatListPage() {
  const user = await getSessionUser((await cookies()).toString())
  if (!user) redirect('/login?next=%2Fchat')

  const conversations = await queryConversationsForUser(user.id)

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-extrabold">消息</h1>
      {conversations.length === 0 ? (
        <EmptyState title="还没有会话" description="去商品页点「聊一聊」开始沟通" iconName="chat" />
      ) : (
        <ConversationListLive>
          <ul className="space-y-2">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  href={`/chat/${conversation.id}`}
                  className="flex items-center gap-3 rounded-card bg-surface p-3 shadow-card transition hover:shadow-[0_6px_20px_rgba(20,40,80,.13)]"
                >
                  <Avatar src={conversation.other.avatarUrl} name={conversation.other.username} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <span className="truncate">{conversation.other.username}</span>
                      {conversation.other.verifiedAt && <span className="shrink-0 text-xs font-medium text-brand">已认证</span>}
                      <span className="ml-auto shrink-0 text-xs font-normal text-muted">
                        {formatRelativeTime(conversation.lastMessageAt)}
                      </span>
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-sm text-muted">{conversation.lastMessagePreview || '开始聊天吧'}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                      {conversation.item.title} · {formatPrice(conversation.item.priceCents)}
                    </p>
                  </div>
                  {conversation.item.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={conversation.item.images[0].url} alt="" className="size-12 shrink-0 rounded-btn object-cover" />
                  )}
                  {conversation.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-price px-1.5 text-[11px] font-bold text-white">
                      {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </ConversationListLive>
      )}
    </div>
  )
}
