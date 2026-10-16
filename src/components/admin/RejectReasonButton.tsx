'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useApi } from '@/lib/client-api'

export function RejectReasonButton({ url }: { url: string }) {
  const router = useRouter()
  const { request } = useApi()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) {
    return <Button variant="ghost" onClick={() => setOpen(true)}>驳回</Button>
  }
  return (
    <span className="flex items-center gap-2">
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="驳回理由（必填）"
        className="rounded-btn border border-line px-2 py-1.5 text-sm outline-none focus:border-brand"
      />
      <Button
        variant="danger"
        loading={loading}
        disabled={reason.trim().length < 2}
        onClick={async () => {
          setLoading(true)
          const result = await request(url, { method: 'PATCH', body: JSON.stringify({ action: 'REJECT', reason }) })
          setLoading(false)
          if (result.ok) router.refresh()
        }}
      >
        确认驳回
      </Button>
    </span>
  )
}
