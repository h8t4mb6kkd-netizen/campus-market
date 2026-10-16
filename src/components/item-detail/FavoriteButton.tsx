'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useApi } from '@/lib/client-api'

export function FavoriteButton({
  itemId,
  initialFavorited,
  initialCount,
  isLoggedIn,
}: {
  itemId: string
  initialFavorited: boolean
  initialCount: number
  isLoggedIn: boolean
}) {
  const router = useRouter()
  const { request } = useApi()
  const [favorited, setFavorited] = useState(initialFavorited)
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (!isLoggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/items/${itemId}`)}`)
      return
    }
    if (loading) return
    setLoading(true)
    const next = !favorited
    setFavorited(next) // 乐观
    setCount((c) => c + (next ? 1 : -1))
    const result = await request<{ favorited: boolean; favoriteCount: number }>(`/api/items/${itemId}/favorite`, {
      method: next ? 'PUT' : 'DELETE',
    })
    setLoading(false)
    if (result.ok) {
      setFavorited(result.data.favorited)
      setCount(result.data.favoriteCount)
    } else {
      setFavorited(!next) // 回滚
      setCount((c) => c + (next ? -1 : 1))
    }
  }

  return (
    <Button variant={favorited ? 'secondary' : 'secondary'} onClick={toggle} className="flex-1">
      <Icon name={favorited ? 'heartFilled' : 'heart'} size={15} className={favorited ? 'text-price' : ''} />
      {favorited ? '已收藏' : '想要'} {count}
    </Button>
  )
}
