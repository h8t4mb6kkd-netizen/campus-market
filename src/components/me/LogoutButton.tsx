'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useApi } from '@/lib/client-api'

export function LogoutButton() {
  const router = useRouter()
  const { request } = useApi()
  return (
    <Button variant="ghost" onClick={async () => {
      await request('/api/auth/logout', { method: 'POST' })
      router.push('/')
      router.refresh()
    }}>
      退出登录
    </Button>
  )
}
