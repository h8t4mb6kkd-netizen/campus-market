'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useApi } from '@/lib/client-api'
import type { ItemStatus } from '@/lib/constants'
import { useRouter } from 'next/navigation'

export interface StatusActionBuyer { id: string; username: string }

export function ItemStatusActions({
  itemId,
  status,
  buyers,
}: {
  itemId: string
  status: ItemStatus
  buyers: StatusActionBuyer[]
}) {
  const router = useRouter()
  const { request } = useApi()
  const [loading, setLoading] = useState(false)
  const [showSoldPanel, setShowSoldPanel] = useState(false)
  const [buyerId, setBuyerId] = useState(buyers[0]?.id ?? '')

  async function act(body: Record<string, unknown>) {
    setLoading(true)
    const result = await request(`/api/items/${itemId}/status`, { method: 'PATCH', body: JSON.stringify(body) })
    setLoading(false)
    if (result.ok) {
      setShowSoldPanel(false)
      router.refresh()
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Link href={`/items/${itemId}/edit`} className="text-muted hover:text-brand">编辑</Link>
      {status === 'ON_SALE' && <Button variant="secondary" onClick={() => act({ action: 'RESERVE' })} loading={loading}>标记已预订</Button>}
      {status === 'RESERVED' && <Button variant="secondary" onClick={() => act({ action: 'UNRESERVE' })} loading={loading}>取消预订</Button>}
      {(status === 'ON_SALE' || status === 'RESERVED') && (
        <>
          <Button variant="secondary" onClick={() => act({ action: 'DELIST' })} loading={loading}>下架</Button>
          {showSoldPanel ? (
            <span className="flex items-center gap-2">
              <select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}
                className="rounded-btn border border-line bg-white px-2 py-1.5 text-sm">
                {buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.username}</option>)}
              </select>
              <Button loading={loading} disabled={!buyerId} onClick={() => act({ action: 'MARK_SOLD', buyerId })}>确认售出</Button>
            </span>
          ) : (
            <Button onClick={() => setShowSoldPanel(true)} disabled={buyers.length === 0}
              title={buyers.length === 0 ? '还没有买家与你聊天，无法选择买家' : undefined}>
              标记已售
            </Button>
          )}
        </>
      )}
      {status === 'DELISTED' && <Button variant="secondary" onClick={() => act({ action: 'RELIST' })} loading={loading}>重新上架</Button>}
      {status === 'SOLD' && <span className="text-muted">已成交</span>}
    </div>
  )
}
