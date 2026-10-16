'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { ItemCardData } from '@/lib/items'
import { ratioOf, waterfallAppend, type WaterfallState } from '@/lib/waterfall'

interface FeedQuery {
  category?: string
  q?: string
  sort?: string
}

function toEntries(items: ItemCardData[]) {
  return items.map((item) => ({ item, ratio: ratioOf(item.cover ?? undefined) }))
}

export function useInfiniteItems(
  initial: { items: ItemCardData[]; nextCursor: string | null },
  query: FeedQuery,
  pageSize = 12,
) {
  const toast = useToast()
  const allItemsRef = useRef<ItemCardData[]>(initial.items)
  const [columnCount, setColumnCount] = useState(3)
  const columnCountRef = useRef(3)
  const [state, setState] = useState<WaterfallState<ItemCardData>>(() =>
    waterfallAppend(null, toEntries(initial.items), 3),
  )
  const [nextCursor, setNextCursor] = useState(initial.nextCursor)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // 首帧绘制前按屏幕宽度重排（SSR 默认 3 列；<1024 换 2 列，不闪动）
  useLayoutEffect(() => {
    const count = window.innerWidth >= 1024 ? 3 : 2
    if (count !== columnCountRef.current) {
      columnCountRef.current = count
      setColumnCount(count)
      setState(waterfallAppend(null, toEntries(allItemsRef.current), count))
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (loading || !nextCursor) return
    setLoading(true)
    try {
      const search = new URLSearchParams({ cursor: nextCursor, limit: String(pageSize) })
      if (query.q) search.set('q', query.q)
      if (query.category) search.set('category', query.category)
      if (query.sort) search.set('sort', query.sort)
      const res = await fetch(`/api/items?${search.toString()}`)
      if (!res.ok) throw new Error('load failed')
      const data: { items: ItemCardData[]; nextCursor: string | null } = await res.json()
      allItemsRef.current = [...allItemsRef.current, ...data.items]
      setState((prev) => waterfallAppend(prev, toEntries(data.items), columnCountRef.current))
      setNextCursor(data.nextCursor)
    } catch {
      toast.error('加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [loading, nextCursor, query.q, query.category, query.sort, pageSize, toast])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !nextCursor) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore()
      },
      { rootMargin: '400px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, nextCursor])

  return { columns: state.columns, columnCount, sentinelRef, loading, hasMore: nextCursor !== null }
}
