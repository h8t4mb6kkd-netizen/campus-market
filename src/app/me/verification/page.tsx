import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { VerificationForm } from '@/components/me/VerificationForm'
import { Icon } from '@/components/ui/Icon'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatRelativeTime } from '@/lib/format'

export default async function VerificationPage() {
  const user = await getSessionUser((await cookies()).toString())
  if (!user) redirect('/login?next=%2Fme%2Fverification')

  const latest = await prisma.verificationRequest.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="mx-auto max-w-md">
      <Link href="/me" className="text-sm text-muted hover:text-brand">‹ 返回个人中心</Link>
      <h1 className="mb-5 mt-2 text-xl font-extrabold">学生认证</h1>

      {user.verifiedAt ? (
        <div className="rounded-card bg-surface p-5 text-center shadow-card">
          <span className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-[#e6f6f1] text-brand">
            <Icon name="shield" size={28} />
          </span>
          <p className="font-semibold">已通过学生认证</p>
          <p className="mt-1 text-sm text-muted">{formatRelativeTime(user.verifiedAt)}认证成功，认证徽章已亮起</p>
        </div>
      ) : latest?.status === 'PENDING' ? (
        <div className="rounded-card bg-surface p-5 text-center shadow-card">
          <p className="font-semibold">申请审核中</p>
          <p className="mt-1 text-sm text-muted">{formatRelativeTime(latest.createdAt)}提交，请耐心等待管理员审核</p>
        </div>
      ) : (
        <>
          {latest?.status === 'REJECTED' && (
            <div className="mb-4 rounded-card bg-[#fdf3e0] p-3 text-sm text-[#b07407]">
              上次申请被驳回：{latest.rejectReason ?? '资料不清晰'}。修改后可重新提交。
            </div>
          )}
          <p className="mb-4 text-sm text-muted">认证后商品与主页会显示「已认证」徽章，更容易获得信任。</p>
          <VerificationForm />
        </>
      )}
    </div>
  )
}
