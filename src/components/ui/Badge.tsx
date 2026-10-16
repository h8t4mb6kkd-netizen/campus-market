import { ITEM_STATUS_LABELS, type ItemStatus } from '@/lib/constants'
import { cn } from '@/lib/utils'

const STATUS_CLASSES: Record<ItemStatus, string> = {
  ON_SALE: 'bg-[#e6f6f1] text-[#0b7d60]',
  RESERVED: 'bg-[#fdf3e0] text-[#b07407]',
  SOLD: 'bg-[#eef1f5] text-[#6b7686]',
  DELISTED: 'bg-[#f3f5f7] text-[#98a2b1]',
}

export function StatusBadge({ status, className }: { status: ItemStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLASSES[status], className)}>
      {ITEM_STATUS_LABELS[status]}
    </span>
  )
}

export function Chip({ children, tone = 'brand', className }: { children: React.ReactNode; tone?: 'brand' | 'price' | 'muted'; className?: string }) {
  const TONES = { brand: 'bg-[#e6f6f1] text-[#0b7d60]', price: 'bg-[#ffefe9] text-[#d6431f]', muted: 'bg-[#eef1f5] text-[#6b7686]' }
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>{children}</span>
}
