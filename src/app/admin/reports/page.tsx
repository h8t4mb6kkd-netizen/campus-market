import { AdminActionButton } from '@/components/admin/AdminActionButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { prisma } from '@/lib/db'
import { formatRelativeTime } from '@/lib/format'

export default async function AdminReportsPage() {
  const reports = await prisma.report.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 50,
    include: { reporter: { select: { username: true } } },
  })
  const pending = reports.filter((r) => r.status === 'PENDING')

  const targetInfo = async (report: (typeof reports)[number]) => {
    if (report.targetType === 'ITEM') {
      const item = await prisma.item.findUnique({ where: { id: report.targetId }, select: { title: true } })
      return { label: item ? `商品《${item.title}》` : '商品（已删除）', href: `/items/${report.targetId}` }
    }
    const user = await prisma.user.findUnique({ where: { id: report.targetId }, select: { username: true } })
    return { label: user ? `用户 ${user.username}` : '用户（已删除）', href: `/users/${report.targetId}` }
  }

  const rows = await Promise.all(pending.map(async (report) => ({ report, target: await targetInfo(report) })))

  return (
    <div>
      <h1 className="mb-5 text-xl font-extrabold">举报处理</h1>
      {rows.length === 0 ? (
        <EmptyState title="没有待处理的举报" />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ report, target }) => (
            <li key={report.id} className="rounded-card bg-surface p-4 shadow-card">
              <p className="text-sm">
                <span className="text-muted">{report.reporter.username} 举报</span>{' '}
                <a href={target.href} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
                  {target.label}
                </a>
                <span className="ml-2 text-xs text-muted">{formatRelativeTime(report.createdAt)}</span>
              </p>
              <p className="mt-1 text-sm text-ink/90">{report.reason}</p>
              <div className="mt-2 flex gap-2">
                <AdminActionButton label="受理" url={`/api/admin/reports/${report.id}`} body={{ action: 'RESOLVE' }} />
                <AdminActionButton label="驳回" variant="ghost" url={`/api/admin/reports/${report.id}`} body={{ action: 'DISMISS' }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
