import { AdminActionButton } from '@/components/admin/AdminActionButton'
import { StatusBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ItemStatus } from '@/lib/constants'
import { prisma } from '@/lib/db'
import { formatPrice, formatRelativeTime } from '@/lib/format'

export default async function AdminItemsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const keyword = q?.trim()
  const items = await prisma.item.findMany({
    where: keyword
      ? { OR: [{ title: { contains: keyword } }, { seller: { username: { contains: keyword } } }] }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { seller: { select: { username: true } }, images: { orderBy: { sort: 'asc' }, take: 1 } },
  })

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold">商品管理</h1>
      <form method="get" className="mb-4">
        <input name="q" defaultValue={keyword} placeholder="按标题或卖家昵称搜索"
          className="w-full max-w-sm rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand" />
      </form>
      {items.length === 0 ? (
        <EmptyState title="没有找到商品" />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-card bg-surface p-3 shadow-card">
              {item.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.images[0].url} alt="" className="size-12 rounded-btn object-cover" />
              ) : (
                <div className="size-12 rounded-btn bg-[#e8edf3]" />
              )}
              <div className="min-w-0 flex-1">
                <a href={`/items/${item.id}`} target="_blank" rel="noreferrer" className="line-clamp-1 text-sm font-semibold hover:text-brand">
                  {item.title}
                </a>
                <p className="text-xs text-muted">
                  {item.seller.username} · {formatPrice(item.priceCents)} · {formatRelativeTime(item.createdAt)}发布
                </p>
              </div>
              <StatusBadge status={item.status as ItemStatus} />
              {item.status !== 'SOLD' && item.status !== 'DELISTED' && (
                <AdminActionButton
                  label="下架"
                  variant="danger"
                  url={`/api/items/${item.id}/status`}
                  body={{ action: 'DELIST' }}
                  confirmText="确认下架该商品？管理员下架后卖家不能重新上架。"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
