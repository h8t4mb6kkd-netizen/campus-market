'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useApi } from '@/lib/client-api'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { request } = useApi()
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setFieldErrors({})
    const form = new FormData(e.currentTarget)
    const result = await request<{ user: { id: string; username: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    })
    setLoading(false)
    if (result.ok) {
      router.push(searchParams.get('next') ?? '/')
      router.refresh()
      return
    }
    if (result.fields) setFieldErrors(result.fields)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input label="邮箱" name="email" type="email" autoComplete="email" required error={fieldErrors.email} />
      <Input label="密码" name="password" type="password" autoComplete="current-password" required error={fieldErrors.password} />
      <Button type="submit" loading={loading} className="w-full">登录</Button>
      <p className="text-center text-sm text-muted">
        还没有账号？<Link href="/register" className="font-semibold text-brand">注册一个</Link>
      </p>
    </form>
  )
}
