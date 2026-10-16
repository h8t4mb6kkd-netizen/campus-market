'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { useApi } from '@/lib/client-api'

export function ReportButton({
  targetType,
  targetId,
  isLoggedIn,
}: {
  targetType: 'ITEM' | 'USER'
  targetId: string
  isLoggedIn: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const { request } = useApi()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        className="text-xs text-muted underline-offset-2 hover:text-[#d94f3d] hover:underline"
        onClick={() => {
          if (!isLoggedIn) {
            router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`)
            return
          }
          setOpen(true)
        }}
      >
        举报
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-btn bg-bg p-3">
      <Textarea name="report-reason" rows={2} maxLength={500} placeholder="请描述举报理由（5–500 字）"
        value={reason} onChange={(event) => setReason(event.target.value)} />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
        <Button
          variant="danger"
          loading={loading}
          disabled={reason.trim().length < 5}
          onClick={async () => {
            setLoading(true)
            const result = await request('/api/reports', {
              method: 'POST',
              body: JSON.stringify({ targetType, targetId, reason }),
            })
            setLoading(false)
            if (result.ok) {
              toast.success('已提交举报，管理员会尽快处理')
              setOpen(false)
              setReason('')
            }
          }}
        >
          提交举报
        </Button>
      </div>
    </div>
  )
}
