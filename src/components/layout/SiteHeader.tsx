import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'

interface HeaderUser { username: string; avatarUrl: string | null; unreadCount: number }

export function SiteHeader({ user }: { user: HeaderUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="shrink-0 text-lg font-extrabold text-brand">校园集市</Link>
        <form action="/" method="get" className="min-w-0 flex-1">
          <label className="flex items-center gap-2 rounded-full bg-[#eef2f7] px-3.5 py-1.5 text-sm text-muted focus-within:ring-2 focus-within:ring-brand/40">
            <Icon name="search" size={15} />
            <input name="q" placeholder="搜教材、单车、宿舍好物…" className="w-full bg-transparent text-ink outline-none placeholder:text-muted" />
          </label>
        </form>
        <Link href="/publish" className="inline-flex shrink-0 items-center gap-1 rounded-btn bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-deep">
          <Icon name="plus" size={15} />发布闲置
        </Link>
        {user ? (
          <Link href="/me" className="relative shrink-0" aria-label="个人中心">
            <Avatar src={user.avatarUrl} name={user.username} size={32} />
            {user.unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-price px-1 text-[10px] font-bold text-white">
                {user.unreadCount > 99 ? '99+' : user.unreadCount}
              </span>
            )}
          </Link>
        ) : (
          <div className="flex shrink-0 items-center gap-2 text-sm">
            <Link href="/login" className="font-semibold text-ink hover:text-brand">登录</Link>
            <Link href="/register" className="font-semibold text-brand hover:text-brand-deep">注册</Link>
          </div>
        )}
      </div>
    </header>
  )
}
