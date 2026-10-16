'use client'

import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { useApi } from '@/lib/client-api'
import { formatRelativeTime } from '@/lib/format'

export interface ReviewData {
  id: string
  rating: number
  content: string | null
  createdAt: string
  author: { id: string; username: string; avatarUrl: string | null }
}

function Stars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} 星`} className="text-sm text-[#f5a623]">
      {'★'.repeat(value)}
      <span className="text-line">{'★'.repeat(5 - value)}</span>
    </span>
  )
}

export function ReviewSection({
  itemId,
  canReview,
  targetName,
  myReview,
  reviews,
}: {
  itemId: string
  canReview: boolean
  targetName: string
  myReview: ReviewData | null
  reviews: ReviewData[]
}) {
  const { request } = useApi()
  const [list, setList] = useState(reviews)
  const [mine, setMine] = useState(myReview)
  const [rating, setRating] = useState(5)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  if (!canReview && list.length === 0) return null

  async function submit() {
    setLoading(true)
    const result = await request<{ review: ReviewData }>(`/api/items/${itemId}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ rating, content: content.trim() || undefined }),
    })
    setLoading(false)
    if (result.ok) {
      setMine(result.data.review)
      setList((prev) => [result.data.review, ...prev])
    }
  }

  return (
    <section className="mt-6 rounded-card bg-surface p-4 shadow-card">
      <h2 className="mb-3 text-base font-bold">交易评价{list.length > 0 && `（${list.length}）`}</h2>
      {canReview && !mine && (
        <div className="mb-4 rounded-btn bg-bg p-3">
          <p className="mb-2 text-sm text-muted">给 {targetName} 打个分吧</p>
          <div className="mb-2 flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button key={star} type="button" aria-label={`${star} 星`} onClick={() => setRating(star)} className="text-xl">
                <span className={star <= rating ? 'text-[#f5a623]' : 'text-line'}>★</span>
              </button>
            ))}
          </div>
          <Textarea name="review" rows={2} maxLength={200} placeholder="说点什么（可选）"
            value={content} onChange={(e) => setContent(e.target.value)} />
          <div className="mt-2 flex justify-end">
            <Button onClick={submit} loading={loading}>提交评价</Button>
          </div>
        </div>
      )}
      {mine && !canReview === false && (
        <p className="mb-3 text-sm text-muted">你已评价：<Stars value={mine.rating} />{mine.content && ` ${mine.content}`}</p>
      )}
      <ul className="space-y-3">
        {list.map((review) => (
          <li key={review.id} className="flex gap-2.5">
            <Avatar src={review.author.avatarUrl} name={review.author.username} size={30} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">
                {review.author.username}<span className="ml-2">{formatRelativeTime(review.createdAt)}</span>
              </p>
              <Stars value={review.rating} />
              {review.content && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{review.content}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
