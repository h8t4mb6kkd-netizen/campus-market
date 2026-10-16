import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { StatusBadge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { formatPrice } from '@/lib/format'
import type { ItemCardData } from '@/lib/items'

export function ItemCard({ item }: { item: ItemCardData }) {
  return (
    <Link
      href={`/items/${item.id}`}
      className="block overflow-hidden rounded-card bg-surface shadow-card transition hover:shadow-[0_6px_20px_rgba(20,40,80,.13)]"
    >
      <div
        data-testid="item-cover"
        className="relative w-full overflow-hidden bg-[#e8edf3]"
        style={{ aspectRatio: item.cover ? `${item.cover.width} / ${item.cover.height}` : '1 / 1' }}
      >
        {item.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.cover.url} alt={item.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {item.status !== 'ON_SALE' && <StatusBadge status={item.status} className="absolute left-2 top-2" />}
      </div>
      <div className="space-y-1 p-2.5">
        <p className="line-clamp-2 text-sm leading-snug">{item.title}</p>
        <p className="text-base font-extrabold text-price">
          {formatPrice(item.priceCents)}
          {item.negotiable && <span className="ml-1.5 text-xs font-medium text-muted">可小刀</span>}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Avatar src={item.seller.avatarUrl} name={item.seller.username} size={16} />
          <span className="max-w-20 truncate">{item.seller.username}</span>
          {item.seller.verifiedAt && <span className="shrink-0 font-medium text-brand">已认证</span>}
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            <Icon name="location" size={12} />
            {item.location}
          </span>
        </div>
      </div>
    </Link>
  )
}
