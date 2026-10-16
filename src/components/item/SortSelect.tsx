'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function SortSelect({ value }: { value: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return (
    <select
      aria-label="排序方式"
      value={value}
      onChange={(event) => {
        const params = new URLSearchParams(searchParams)
        if (event.target.value === 'latest') params.delete('sort')
        else params.set('sort', event.target.value)
        const s = params.toString()
        router.push(s ? `${pathname}?${s}` : pathname)
      }}
      className="rounded-btn border border-line bg-white px-2.5 py-1.5 text-sm text-muted outline-none focus:border-brand"
    >
      <option value="latest">最新发布</option>
      <option value="price_asc">价格从低到高</option>
      <option value="price_desc">价格从高到低</option>
    </select>
  )
}
