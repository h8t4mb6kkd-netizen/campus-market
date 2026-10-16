import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { ChatButton } from '@/components/item-detail/ChatButton'
import { CommentSection } from '@/components/item-detail/CommentSection'
import { FavoriteButton } from '@/components/item-detail/FavoriteButton'
import { ImageCarousel } from '@/components/item-detail/ImageCarousel'
import { ReviewSection } from '@/components/item-detail/ReviewSection'
import { SellerCard } from '@/components/item-detail/SellerCard'
import { ReportButton } from '@/components/report/ReportButton'
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
        buyer: true,
      },
    })
    .catch((err: unknown) => {
      // 仅“记录不存在”转 404，其余异常重抛给错误边界
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return null
      throw err
    })
  if (!item) notFound()

  if (user) {
    // 浏览历史：重复浏览只更新时间（fire-and-forget，不阻塞渲染）
    void prisma.viewHistory
      .upsert({
        where: { userId_itemId: { userId: user.id, itemId: item.id } },
        create: { userId: user.id, itemId: item.id },
        update: { viewedAt: new Date() },
      })
      .catch(() => {})
  }
  const favorited = user
    ? Boolean(await prisma.favorite.findUnique({ where: { userId_itemId: { userId: user.id, itemId: item.id } } }))
    : false

  const comments = await queryComments(item.id)
  const currentUser = user ? { id: user.id, username: user.username, avatarUrl: user.avatarUrl } : null

  const reviews = await prisma.review.findMany({
    where: { itemId: item.id },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, username: true, avatarUrl: true } } },
  })
  const reviewData = reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    content: review.content,
    createdAt: review.createdAt.toISOString(),
    author: review.author,
  }))
  const isParticipant = user && item.status === 'SOLD' && (user.id === item.sellerId || user.id === item.buyerId)
  const targetName = user && item.buyerId === user.id ? item.seller.username : item.buyer?.username ?? '买家' // 卖家视角评买家
  const myReview = user ? reviewData.find((review) => review.author.id === user.id) ?? null : null

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
            <FavoriteButton
              itemId={item.id}
              initialFavorited={favorited}
              initialCount={item.favoriteCount}
              isLoggedIn={Boolean(user)}
            />
            <ChatButton itemId={item.id} isLoggedIn={Boolean(user)} isOwner={user?.id === item.sellerId} />
          </div>
        </div>
        <SellerCard seller={item.seller} />
        <ReviewSection
          itemId={item.id}
          canReview={Boolean(isParticipant)}
          targetName={targetName}
          myReview={myReview}
          reviews={reviewData}
        />
        <div className="rounded-card bg-surface p-4 shadow-card">
          <h2 className="mb-2 text-sm font-bold">商品描述</h2>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink/90">{item.description}</p>
        </div>
        <div className="text-right">
          <ReportButton targetType="ITEM" targetId={item.id} isLoggedIn={Boolean(user)} />
        </div>
      </div>
    </div>
  )
}
