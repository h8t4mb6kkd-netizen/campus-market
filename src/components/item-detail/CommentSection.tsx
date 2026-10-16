'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { useApi } from '@/lib/client-api'
import type { CommentData } from '@/lib/comments'
import { formatRelativeTime } from '@/lib/format'

export function CommentSection({
  itemId,
  initialComments,
  currentUser,
}: {
  itemId: string
  initialComments: CommentData[]
  currentUser: { id: string; username: string; avatarUrl: string | null } | null
}) {
  const { request } = useApi()
  const [comments, setComments] = useState(initialComments)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!content.trim() || loading) return
    setLoading(true)
    const result = await request<{ comment: CommentData }>(`/api/items/${itemId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
    setLoading(false)
    if (result.ok) {
      setComments((prev) => [result.data.comment, ...prev])
      setContent('')
    }
  }

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-bold">留言（{comments.length}）</h2>
      {currentUser ? (
        <div className="mb-4">
          <Textarea
            name="comment"
            rows={3}
            maxLength={500}
            placeholder="问点什么，比如「还在吗」「能便宜点吗」"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <Button onClick={submit} loading={loading} disabled={!content.trim()}>发布留言</Button>
          </div>
        </div>
      ) : (
        <p className="mb-4 rounded-card bg-surface p-3 text-sm text-muted shadow-card">
          <Link href="/login" className="font-semibold text-brand">登录</Link>后可留言
        </p>
      )}
      <ul className="space-y-3">
        {comments.map((comment) => (
          <li key={comment.id} className="flex gap-2.5 rounded-card bg-surface p-3 shadow-card">
            <Avatar src={comment.author.avatarUrl} name={comment.author.username} size={30} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">
                {comment.author.username}
                {comment.author.verifiedAt && <span className="ml-1 font-medium text-brand">已认证</span>}
                <span className="ml-2">{formatRelativeTime(comment.createdAt)}</span>
              </p>
              {/* 纯文本渲染：React 默认转义，禁止 dangerouslySetInnerHTML */}
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{comment.content}</p>
            </div>
          </li>
        ))}
      </ul>
      {comments.length === 0 && <p className="text-sm text-muted">还没有留言，来问第一句吧。</p>}
    </section>
  )
}
