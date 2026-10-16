import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'

const NAV = [
  { href: '/admin', label: '仪表盘' },
  { href: '/admin/verifications', label: '认证审核' },
  { href: '/admin/items', label: '商品管理' },
  { href: '/admin/users', label: '用户管理' },
  { href: '/admin/reports', label: '举报处理' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser((await cookies()).toString())
  if (!user) redirect('/login?next=%2Fadmin')
  if (user.role !== 'ADMIN') redirect('/')

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav className="flex shrink-0 gap-2 lg:w-40 lg:flex-col">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-btn px-3 py-2 text-sm font-medium text-muted transition hover:bg-white hover:text-ink"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
