import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'

interface SellerCardProps {
  seller: {
    id: string
    username: string
    avatarUrl: string | null
    verifiedAt: Date | string | null
    ratingAvg: number
    ratingCount: number
    soldCount: number
  }
}

export function SellerCard({ seller }: SellerCardProps) {
  return (
    <Link href={`/users/${seller.id}`} className="flex items-center gap-3 rounded-card bg-surface p-3 shadow-card transition hover:shadow-[0_6px_20px_rgba(20,40,80,.13)]">
      <Avatar src={seller.avatarUrl} name={seller.username} size={44} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">{seller.username}</span>
          {seller.verifiedAt && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#e6f6f1] px-1.5 py-0.5 text-[10px] font-semibold text-brand-deep">
              <Icon name="shield" size={10} />已认证
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {seller.ratingCount > 0 ? (
            <span className="text-[#f5a623]">
              {'★'.repeat(Math.round(seller.ratingAvg))} {seller.ratingAvg.toFixed(1)}
            </span>
          ) : (
            '暂无评价'
          )}
          <span className="ml-2">成交 {seller.soldCount} 单</span>
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted">主页 ›</span>
    </Link>
  )
}
