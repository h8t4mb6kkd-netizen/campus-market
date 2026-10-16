import { AdminActionButton } from '@/components/admin/AdminActionButton'
import { RejectReasonButton } from '@/components/admin/RejectReasonButton'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { prisma } from '@/lib/db'
import { formatRelativeTime } from '@/lib/format'

export default async function AdminVerificationsPage() {
  const requests = await prisma.verificationRequest.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // PENDING 排前
    take: 50,
    include: { user: { select: { id: true, username: true, avatarUrl: true, verifiedAt: true } } },
  })
  const pending = requests.filter((r) => r.status === 'PENDING')
  const handled = requests.filter((r) => r.status !== 'PENDING')

  return (
    <div>
      <h1 className="mb-5 text-xl font-extrabold">认证审核</h1>
      {pending.length === 0 ? (
        <EmptyState title="没有待审核的申请" description="新的申请会出现在这里" />
      ) : (
        <ul className="space-y-3">
          {pending.map((request) => (
            <li key={request.id} className="flex flex-wrap items-center gap-4 rounded-card bg-surface p-4 shadow-card">
              <Avatar src={request.user.avatarUrl} name={request.user.username} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{request.user.username}</p>
                <p className="text-xs text-muted">学号 {request.studentNo} · {formatRelativeTime(request.createdAt)}提交</p>
              </div>
              <a href={request.proofImageUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={request.proofImageUrl} alt="学生证" className="h-14 rounded-btn object-cover" />
              </a>
              <div className="flex items-center gap-2">
                <AdminActionButton label="通过" url={`/api/admin/verifications/${request.id}`} body={{ action: 'APPROVE' }} />
                <RejectReasonButton url={`/api/admin/verifications/${request.id}`} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {handled.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-bold text-muted">最近处理</h2>
          <ul className="space-y-2 text-sm text-muted">
            {handled.slice(0, 10).map((request) => (
              <li key={request.id} className="rounded-card bg-surface px-4 py-2 shadow-card">
                {request.user.username} · {request.status === 'APPROVED' ? '已通过' : `已驳回（${request.rejectReason}）`}
                · {request.reviewedAt ? formatRelativeTime(request.reviewedAt) : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
