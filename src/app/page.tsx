import { Suspense } from 'react'
import { CategoryChips } from '@/components/item/CategoryChips'
import { SortSelect } from '@/components/item/SortSelect'
import { WaterfallFeed } from '@/components/item/WaterfallFeed'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ItemSort } from '@/lib/items'
import { queryItems, toItemCardData } from '@/lib/items'

const PAGE_SIZE = 12

function parseSort(value?: string): ItemSort {
  return value === 'price_asc' || value === 'price_desc' ? value : 'latest'
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>
}) {
  const params = await searchParams
  const q = params.q?.trim() || undefined
  const sort = parseSort(params.sort)
  const { items, nextCursor } = await queryItems({ q, category: params.category, sort, limit: PAGE_SIZE })

  return (
    <div>
      <CategoryChips active={params.category} q={q} sort={sort} />
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          {q ? `「${q}」的搜索结果（${items.length}${nextCursor ? '+' : ''} 件）` : '同学们正在出闲置'}
        </p>
        <Suspense>
          <SortSelect value={sort} />
        </Suspense>
      </div>
      {items.length === 0 ? (
        <EmptyState
          title={q ? '没有找到相关商品' : '还没有商品'}
          description={q ? '换个关键词试试，或者去发布求购' : '去发布第一件闲置吧'}
        />
      ) : (
        <WaterfallFeed
          initial={{ items: items.map(toItemCardData), nextCursor }}
          query={{ q, category: params.category, sort }}
        />
      )}
    </div>
  )
}
