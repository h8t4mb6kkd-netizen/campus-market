import { cn } from '@/lib/utils'

const COLORS = ['#0fa47f', '#ff7a59', '#6a4ce0', '#f5a623', '#3b82f6', '#ec4899']

function colorOf(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return COLORS[h % COLORS.length]
}

export function Avatar({ src, name, size = 32, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} width={size} height={size} className={cn('rounded-full object-cover', className)} />
  }
  return (
    <span
      aria-label={name}
      style={{ width: size, height: size, backgroundColor: colorOf(name), fontSize: size * 0.44 }}
      className={cn('inline-flex select-none items-center justify-center rounded-full font-semibold text-white', className)}
    >
      {Array.from(name)[0] ?? '?'}
    </span>
  )
}
