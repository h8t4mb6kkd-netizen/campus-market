import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { CommentSection } from '@/components/item-detail/CommentSection'
import { ImageCarousel } from '@/components/item-detail/ImageCarousel'
import { SellerCard } from '@/components/item-detail/SellerCard'
import { StatusBadge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { getSessionUser } from '@/lib/auth'
import { queryComments, toCommentData } from '@/lib/comments'
import { CATEGORY_LABELS, CONDITION_LABELS, type Category, type Condition, type ItemStatus } from '@/lib/constants'
import { prisma } from '@/lib/db'
import { formatPrice, formatRelativeTime } from '@/lib/format'

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser((await cookies()).toString())

  const item = await prisma.item
    .update({
      where: { id },
      data: { viewCount: { increment: 1 } }, // 浏览量 +1（含本次返回）
      include: {
        images: { orderBy: { sort: 'asc' } },
        seller: true,
      },
    })
    .catch(() => null)
  if (!item) notFound()

  const comments = await queryComments(item.id)
  const currentUser = user ? { id: user.id, username: user.username, avatarUrl: user.avatarUrl } : null

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <ImageCarousel images={item.images.map(({ url, width, height }) => ({ url, width, height }))} />
        <CommentSection itemId={item.id} initialComments={comments.map(toCommentData)} currentUser={currentUser} />
      </div>
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-card bg-surface p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-bold leading-snug">{item.title}</h1>
            <StatusBadge status={item.status as ItemStatus} />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-price">
            {formatPrice(item.priceCents)}
            {item.negotiable && <span className="ml-2 text-xs font-medium text-muted">可小刀</span>}
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-muted">
            <li>成色：{CONDITION_LABELS[item.condition as Condition]}</li>
            <li>分类：{CATEGORY_LABELS[item.category as Category]}</li>
            <li className="flex items-center gap-1"><Icon name="location" size={13} />{item.location}</li>
            <li className="flex items-center gap-1"><Icon name="eye" size={13} />{item.viewCount} 次浏览 · {formatRelativeTime(item.createdAt)}发布</li>
          </ul>
          <div className="mt-4 flex gap-2">
            <button type="button" disabled className="flex-1 rounded-btn border border-line bg-white px-3 py-2 text-sm font-semibold text-muted opacity-60">
              <Icon name="heart" size={15} className="mr-1 inline" />收藏
            </button>
            <button type="button" disabled className="flex-1 rounded-btn bg-brand px-3 py-2 text-sm font-semibold text-white opacity-60">
              <Icon name="chat" size={15} className="mr-1 inline" />聊一聊
            </button>
          </div>
        </div>
        <SellerCard seller={item.seller} />
        <div className="rounded-card bg-surface p-4 shadow-card">
          <h2 className="mb-2 text-sm font-bold">商品描述</h2>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink/90">{item.description}</p>
        </div>
      </div>
    </div>
  )
}
