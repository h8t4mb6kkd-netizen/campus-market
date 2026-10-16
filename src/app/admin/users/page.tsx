import { AdminActionButton } from '@/components/admin/AdminActionButton'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { prisma } from '@/lib/db'
import { formatRelativeTime } from '@/lib/format'

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const keyword = q?.trim()
  const users = await prisma.user.findMany({
    where: keyword
      ? { OR: [{ username: { contains: keyword } }, { email: { contains: keyword } }] }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold">用户管理</h1>
      <form method="get" className="mb-4">
        <input name="q" defaultValue={keyword} placeholder="按昵称或邮箱搜索"
          className="w-full max-w-sm rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand" />
      </form>
      {users.length === 0 ? (
        <EmptyState title="没有找到用户" />
      ) : (
        <ul className="space-y-2">
          {users.map((user) => (
            <li key={user.id} className="flex items-center gap-3 rounded-card bg-surface p-3 shadow-card">
              <Avatar src={user.avatarUrl} name={user.username} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {user.username}
                  {user.role === 'ADMIN' && <span className="ml-2 rounded-full bg-[#eef2f7] px-2 py-0.5 text-xs text-muted">管理员</span>}
                  {user.status === 'BANNED' && <span className="ml-2 rounded-full bg-[#ffe9e5] px-2 py-0.5 text-xs text-[#d94f3d]">已封禁</span>}
                </p>
                <p className="text-xs text-muted">{user.email} · {formatRelativeTime(user.createdAt)}加入</p>
              </div>
              {user.role !== 'ADMIN' && user.status === 'ACTIVE' && (
                <AdminActionButton label="封禁" variant="danger" url={`/api/admin/users/${user.id}`} body={{ action: 'BAN' }}
                  confirmText={`确认封禁 ${user.username}？其登录状态会立即失效。`} />
              )}
              {user.status === 'BANNED' && (
                <AdminActionButton label="解封" url={`/api/admin/users/${user.id}`} body={{ action: 'UNBAN' }} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
