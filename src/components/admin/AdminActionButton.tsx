'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useApi } from '@/lib/client-api'

export function AdminActionButton({
  label,
  url,
  body,
  variant = 'secondary',
  confirmText,
}: {
  label: string
  url: string
  body: Record<string, unknown>
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  confirmText?: string
}) {
  const router = useRouter()
  const { request } = useApi()
  const [loading, setLoading] = useState(false)

  return (
    <Button
      variant={variant}
      loading={loading}
      onClick={async () => {
        if (confirmText && !window.confirm(confirmText)) return
        setLoading(true)
        const result = await request(url, { method: 'PATCH', body: JSON.stringify(body) })
        setLoading(false)
        if (result.ok) router.refresh()
      }}
    >
      {label}
    </Button>
  )
}
