'use client'

import { ItemCard } from '@/components/item/ItemCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { useInfiniteItems } from '@/hooks/useInfiniteItems'
import type { ItemCardData } from '@/lib/items'

export function WaterfallFeed({
  initial,
  query,
}: {
  initial: { items: ItemCardData[]; nextCursor: string | null }
  query: { category?: string; q?: string; sort?: string }
}) {
  const { columns, columnCount, sentinelRef, loading, hasMore } = useInfiniteItems(initial, query)
  return (
    <div>
      <div
        className="grid items-start gap-3"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {columns.map((column, index) => (
          <div key={index} className="flex flex-col gap-3">
            {column.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        ))}
      </div>
      {hasMore ? (
        <div ref={sentinelRef} className="flex justify-center py-6">
          {loading && <Skeleton className="h-8 w-40" />}
        </div>
      ) : (
        initial.items.length > 0 && <p className="py-6 text-center text-xs text-muted">没有更多啦</p>
      )}
    </div>
  )
}
