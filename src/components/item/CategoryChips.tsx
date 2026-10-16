import Link from 'next/link'
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/constants'

export function CategoryChips({ active, q, sort }: { active?: string; q?: string; sort?: string }) {
  const href = (category?: string) => {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (q) params.set('q', q)
    if (sort && sort !== 'latest') params.set('sort', sort)
    const s = params.toString()
    return s ? `/?${s}` : '/'
  }
  const chipClass = (on: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
      on ? 'bg-brand text-white' : 'bg-white text-muted shadow-card hover:text-ink'
    }`
  return (
    <nav className="mb-4 flex flex-wrap gap-2">
      <Link href={href()} className={chipClass(!active)}>全部</Link>
      {CATEGORIES.map((category) => (
        <Link key={category} href={href(category)} className={chipClass(active === category)}>
          {CATEGORY_LABELS[category]}
        </Link>
      ))}
    </nav>
  )
}
