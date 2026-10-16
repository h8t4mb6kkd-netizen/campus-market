import Link from 'next/link'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { ItemCard } from '@/components/item/ItemCard'
import { ReportButton } from '@/components/report/ReportButton'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatRelativeTime } from '@/lib/format'
import { queryItems, toItemCardData } from '@/lib/items'

const TABS = [
  { key: 'onsale', label: '在售' },
  { key: 'sold', label: '已售' },
  { key: 'reviews', label: '评价' },
] as const

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const user = await prisma.user.findUnique({ where: { id }, select: { username: true, status: true } })
  if (!user || user.status === 'BANNED') return { title: '用户不存在' }
  return { title: `${user.username} 的主页` }
}

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab: tabParam } = await searchParams
  const tab = TABS.find((t) => t.key === tabParam)?.key ?? 'onsale'

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user || user.status === 'BANNED') notFound()

  const sessionUser = await getSessionUser((await cookies()).toString())

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-5 flex items-center gap-4 rounded-card bg-surface p-5 shadow-card">
        <Avatar src={user.avatarUrl} name={user.username} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-lg font-extrabold">
            {user.username}
            {user.verifiedAt && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[#e6f6f1] px-2 py-0.5 text-xs font-semibold text-brand-deep">
                <Icon name="shield" size={11} />已认证
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {user.ratingCount > 0 ? (
              <span className="text-[#f5a623]">★ {user.ratingAvg.toFixed(1)}</span>
            ) : (
              '暂无评价'
            )}
            <span className="ml-3">成交 {user.soldCount} 单</span>
            {user.campus && <span className="ml-3">{user.campus}</span>}
            <span className="ml-3">{formatRelativeTime(user.createdAt)}加入</span>
          </p>
        </div>
        <ReportButton targetType="USER" targetId={user.id} isLoggedIn={Boolean(sessionUser)} />
      </header>

      <nav className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/users/${id}?tab=${t.key}`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t.key ? 'bg-brand text-white' : 'bg-white text-muted shadow-card hover:text-ink'}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'reviews' ? <ReviewsList userId={id} /> : <ItemsGrid userId={id} sold={tab === 'sold'} />}
    </div>
  )
}

async function ItemsGrid({ userId, sold }: { userId: string; sold: boolean }) {
  const { items } = await queryItems({
    sellerId: userId,
    statuses: sold ? ['SOLD'] : ['ON_SALE', 'RESERVED'],
    limit: 30,
  })
  if (items.length === 0) return <EmptyState title={sold ? '还没有成交记录' : '暂无在售商品'} />
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {items.map((item) => <ItemCard key={item.id} item={toItemCardData(item)} />)}
    </div>
  )
}

async function ReviewsList({ userId }: { userId: string }) {
  const reviews = await prisma.review.findMany({
    where: { targetId: userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      author: { select: { id: true, username: true, avatarUrl: true } },
      item: { select: { id: true, title: true } },
    },
  })
  if (reviews.length === 0) return <EmptyState title="还没有收到评价" />
  return (
    <ul className="space-y-3">
      {reviews.map((review) => (
        <li key={review.id} className="rounded-card bg-surface p-4 shadow-card">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Avatar src={review.author.avatarUrl} name={review.author.username} size={26} />
            {review.author.username}
            <span className="text-[#f5a623]">★ {review.rating}</span>
            <span className="ml-auto">{formatRelativeTime(review.createdAt)}</span>
          </div>
          {review.content && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{review.content}</p>}
          <Link href={`/items/${review.item.id}`} className="mt-2 block text-xs text-brand hover:underline">
            来自《{review.item.title}》的交易
          </Link>
        </li>
      ))}
    </ul>
  )
}
