import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemStatusActions } from '@/components/me/ItemStatusActions'
import { LogoutButton } from '@/components/me/LogoutButton'
import { StatusBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { getSessionUser } from '@/lib/auth'
import type { ItemStatus } from '@/lib/constants'
import { prisma } from '@/lib/db'
import { formatPrice, formatRelativeTime } from '@/lib/format'
import { toItemCardData } from '@/lib/items'

const TABS = [
  { key: 'published', label: '我的发布' },
  { key: 'favorites', label: '我的收藏' },
  { key: 'history', label: '浏览历史' },
] as const

export default async function MePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams
  const tab = TABS.find((t) => t.key === tabParam)?.key ?? 'published'
  const user = await getSessionUser((await cookies()).toString())
  if (!user) redirect('/login?next=%2Fme')

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-extrabold">{user.username} 的个人中心</h1>
        <div className="flex items-center gap-3">
          <Link href="/me/verification" className="text-sm font-semibold text-brand hover:text-brand-deep">
            {user.verifiedAt ? '✓ 已认证' : '学生认证'}
          </Link>
          <LogoutButton />
        </div>
      </div>

      <nav className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/me?tab=${t.key}`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t.key ? 'bg-brand text-white' : 'bg-white text-muted shadow-card hover:text-ink'}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'published' && <PublishedTab userId={user.id} />}
      {tab === 'favorites' && <FavoritesTab userId={user.id} />}
      {tab === 'history' && <HistoryTab userId={user.id} />}
    </div>
  )
}

async function PublishedTab({ userId }: { userId: string }) {
  const items = await prisma.item.findMany({
    where: { sellerId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      images: { orderBy: { sort: 'asc' }, take: 1 },
      conversations: { include: { buyer: { select: { id: true, username: true } } } },
    },
  })
  if (items.length === 0) {
    return <EmptyState title="还没有发布过商品" description="去发布第一件闲置吧" action={<Link className="text-brand font-semibold" href="/publish">发布闲置</Link>} />
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 rounded-card bg-surface p-3 shadow-card">
          {item.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.images[0].url} alt="" className="size-16 rounded-btn object-cover" />
          ) : (
            <div className="size-16 rounded-btn bg-[#e8edf3]" />
          )}
          <div className="min-w-0 flex-1">
            <Link href={`/items/${item.id}`} className="line-clamp-1 text-sm font-semibold hover:text-brand">{item.title}</Link>
            <p className="mt-0.5 text-sm font-bold text-price">{formatPrice(item.priceCents)}</p>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <StatusBadge status={item.status as ItemStatus} />
              {formatRelativeTime(item.createdAt)}发布 · {item.viewCount} 次浏览
            </p>
          </div>
          <ItemStatusActions
            itemId={item.id}
            status={item.status as ItemStatus}
            buyers={item.conversations.map((c) => ({ id: c.buyer.id, username: c.buyer.username }))}
          />
        </li>
      ))}
    </ul>
  )
}

async function FavoritesTab({ userId }: { userId: string }) {
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { item: { include: { images: { orderBy: { sort: 'asc' }, take: 1 }, seller: { select: { id: true, username: true, avatarUrl: true, verifiedAt: true } } } } },
  })
  if (favorites.length === 0) return <EmptyState title="还没有收藏" description="看到心仪的就点「想要」" />
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {favorites.map((favorite) => <ItemCard key={favorite.id} item={toItemCardData(favorite.item)} />)}
    </div>
  )
}

async function HistoryTab({ userId }: { userId: string }) {
  const history = await prisma.viewHistory.findMany({
    where: { userId },
    orderBy: { viewedAt: 'desc' },
    take: 50,
    include: { item: { include: { images: { orderBy: { sort: 'asc' }, take: 1 }, seller: { select: { id: true, username: true, avatarUrl: true, verifiedAt: true } } } } },
  })
  if (history.length === 0) return <EmptyState title="还没有浏览记录" />
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {history.map((entry) => <ItemCard key={entry.id} item={toItemCardData(entry.item)} />)}
    </div>
  )
}
