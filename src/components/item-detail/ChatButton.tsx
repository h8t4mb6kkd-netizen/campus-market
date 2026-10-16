'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useApi } from '@/lib/client-api'

export function ChatButton({ itemId, isLoggedIn, isOwner }: { itemId: string; isLoggedIn: boolean; isOwner: boolean }) {
  const router = useRouter()
  const { request } = useApi()
  const [loading, setLoading] = useState(false)

  async function open() {
    if (!isLoggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/items/${itemId}`)}`)
      return
    }
    setLoading(true)
    const result = await request<{ conversation: { id: string } }>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ itemId }),
    })
    setLoading(false)
    if (result.ok) router.push(`/chat/${result.data.conversation.id}`)
  }

  return (
    <Button onClick={open} loading={loading} disabled={isOwner} className="flex-1" title={isOwner ? '这是你自己的商品' : undefined}>
      <Icon name="chat" size={15} />
      聊一聊
    </Button>
  )
}
